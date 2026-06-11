/**
 * 下载站计数：按 productKey 维度累计 page_views / download_clicks。
 * 表 counters(product_key, name)；时间戳毫秒，与 license 表一致。
 */
const { getDb } = require('../db/getDb')
const { createApiError } = require('../utils/apiError')

const COUNTER_PAGE = 'page_views'
const COUNTER_DOWNLOAD = 'download_clicks'

/** 多产品扩展时前端/上报方在 body 或 query 传 productKey */
function parseProductKey(raw) {
  if (raw === undefined || raw === null || raw === '') {
    throw createApiError('productKey 必填', 400)
  }
  const value = String(raw).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) {
    throw createApiError('productKey 格式非法，仅支持字母数字下划线横杠，长度 1-64', 400)
  }
  return value
}

function incrementStmt(productKey, key) {
  const db = getDb()
  const now = Date.now()
  const pkey = parseProductKey(productKey)
  const stmt = db.prepare(
    `UPDATE counters SET value = value + 1, updated_at = ? WHERE product_key = ? AND name = ?`,
  )
  const result = stmt.run(now, pkey, key)
  // 首次计数时行可能不存在，INSERT OR IGNORE 后再 UPDATE
  if (result.changes !== 1) {
    db.prepare(
      `INSERT OR IGNORE INTO counters (product_key, name, value, updated_at) VALUES (?, ?, 0, NULL)`,
    ).run(pkey, key)
    const retry = stmt.run(now, pkey, key)
    if (retry.changes !== 1) {
      throw createApiError(`counter not found: ${key}`, 500)
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
  const pkey = parseProductKey(productKey)
  const rows = db
    .prepare(
      `SELECT name, value, updated_at FROM counters WHERE product_key = ? AND name IN ('page_views', 'download_clicks')`,
    )
    .all(pkey)
  const map = Object.fromEntries(
    rows.map((r) => [r.name, { value: r.value, updated_at: r.updated_at ?? null }]),
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
       ORDER BY product_key ASC`,
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
  parseProductKey,
  incrementPageView,
  incrementDownload,
  getCounts,
  getAllCounts
}
