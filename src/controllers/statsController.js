/**
 * 下载站统计：HTTP 入参校验 + 调 statsService。
 * 统计页管理员登录（createStatsSession）也放这里，与 /api/stats/admin/* 对应。
 */
const statsService = require('../services/statsService')
const authService = require('../services/authService')
const { createApiError } = require('../utils/apiError')

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

/** 统计页 /stats 登录；成功返回 jwtToken，前端存 sessionStorage */
function createStatsSession(req, res, next) {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return next(createApiError('请填写用户名和密码', 400))
  }
  if (!authService.isAuthConfigured()) {
    return next(createApiError('服务端未配置 STATS_ADMIN_USERNAME / STATS_ADMIN_PASSWORD / STATS_JWT_SECRET', 503))
  }
  if (!authService.validateCredentials(username, password)) {
    return next(createApiError('用户名或密码错误', 401))
  }
  res.sendResponse({ data: { jwtToken: authService.signSessionToken() } })
}

module.exports = {
  recordPageView,
  recordDownload,
  getStats,
  getAllStats,
  createStatsSession
}
