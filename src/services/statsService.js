const { getDb } = require('../db/getDb')

const COUNTER_PAGE = 'page_views'
const COUNTER_DOWNLOAD = 'download_clicks'

function normalizeProductKey(productKey) {
  const raw = String(productKey ?? '').trim()
  if (!raw) {
    const e = new Error('productKey 不能为空')
    e.httpStatus = 400
    throw e
  }
  return raw
}

function incrementStmt(productKey, key) {
  const db = getDb()
  const now = Date.now()
  const pkey = normalizeProductKey(productKey)
  const stmt = db.prepare(`UPDATE counters SET value = value + 1, updated_at = ? WHERE product_key = ? AND name = ?`)
  const result = stmt.run(now, pkey, key)
  if (result.changes !== 1) {
    db.prepare(`INSERT OR IGNORE INTO counters (product_key, name, value, updated_at) VALUES (?, ?, 0, NULL)`).run(
      pkey,
      key
    )
    const retry = stmt.run(now, pkey, key)
    if (retry.changes !== 1) {
      throw new Error(`counter not found: ${key}`)
    }
  }
  return getCounts(pkey)
}

function incrementPageView(productKey) {
  return incrementStmt(productKey, COUNTER_PAGE)
}

function incrementDownload(productKey) {
  return incrementStmt(productKey, COUNTER_DOWNLOAD)
}

function getCounts(productKey) {
  const db = getDb()
  const pkey = normalizeProductKey(productKey)
  const rows = db
    .prepare(
      `SELECT name, value, updated_at FROM counters WHERE product_key = ? AND name IN ('page_views', 'download_clicks')`
    )
    .all(pkey)
  const map = Object.fromEntries(
    rows.map((r) => [r.name, { value: r.value, updated_at: r.updated_at ?? null }])
  )
  const pv = map.page_views
  const dl = map.download_clicks
  return {
    productKey: pkey,
    pageViews: pv?.value ?? 0,
    downloadClicks: dl?.value ?? 0,
    lastPageViewAt: pv?.updated_at ?? null,
    lastDownloadAt: dl?.updated_at ?? null
  }
}

function getAllCounts() {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT product_key, name, value, updated_at
       FROM counters
       WHERE name IN ('page_views', 'download_clicks')
       ORDER BY product_key ASC`
    )
    .all()

  const byProduct = new Map()
  for (const row of rows) {
    const key = row.product_key
    if (!byProduct.has(key)) {
      byProduct.set(key, {
        productKey: key,
        pageViews: 0,
        downloadClicks: 0,
        lastPageViewAt: null,
        lastDownloadAt: null
      })
    }
    const item = byProduct.get(key)
    if (row.name === COUNTER_PAGE) {
      item.pageViews = row.value ?? 0
      item.lastPageViewAt = row.updated_at ?? null
    } else if (row.name === COUNTER_DOWNLOAD) {
      item.downloadClicks = row.value ?? 0
      item.lastDownloadAt = row.updated_at ?? null
    }
  }
  return Array.from(byProduct.values())
}

module.exports = {
  incrementPageView,
  incrementDownload,
  getCounts,
  getAllCounts
}
