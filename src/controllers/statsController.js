const statsService = require('../services/statsService')

function readProductKey(req) {
  const raw = req.body?.productKey ?? req.query?.productKey
  if (raw === undefined || raw === null || raw === '') {
    const e = new Error('productKey 必填')
    e.httpStatus = 400
    throw e
  }
  const value = String(raw).trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) {
    const e = new Error('productKey 格式非法，仅支持字母数字下划线横杠，长度 1-64')
    e.httpStatus = 400
    throw e
  }
  return value
}

function recordPageView(req, res) {
  const data = statsService.incrementPageView(readProductKey(req))
  res.sendResponse({ data })
}

function recordDownload(req, res) {
  const data = statsService.incrementDownload(readProductKey(req))
  res.sendResponse({ data })
}

function getStats(req, res) {
  const data = statsService.getCounts(readProductKey(req))
  res.sendResponse({ data })
}

function getAllStats(_req, res) {
  const data = statsService.getAllCounts()
  res.sendResponse({ data })
}

module.exports = {
  recordPageView,
  recordDownload,
  getStats,
  getAllStats
}
