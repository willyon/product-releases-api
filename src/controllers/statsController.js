/**
 * 下载站统计：HTTP 入参校验 + 调 statsService。
 */
const statsService = require('../services/statsService')
const authService = require('../services/authService')
const { SUCCESS_CODES: SC } = require('../constants/messageCodes')

function readProductKey(req) {
  return statsService.parseProductKey(req.body?.productKey ?? req.query?.productKey)
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

function createStatsSession(req, res) {
  const jwtToken = authService.loginStatsAdmin(req)
  res.sendResponse({ messageCode: SC.ADMIN_LOGIN_SUCCESS, data: { jwtToken } })
}

module.exports = {
  recordPageView,
  recordDownload,
  getStats,
  getAllStats,
  createStatsSession
}
