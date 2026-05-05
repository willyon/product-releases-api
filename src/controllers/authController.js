const authService = require('../services/authService')

function createSession(req, res, next) {
  const { username, password } = req.body || {}
  if (!username || !password) {
    const e = new Error('请填写用户名和密码')
    e.httpStatus = 400
    return next(e)
  }
  if (!authService.isAuthConfigured()) {
    const e = new Error('服务端未配置 STATS_ADMIN_USERNAME / STATS_ADMIN_PASSWORD / STATS_JWT_SECRET')
    e.httpStatus = 503
    return next(e)
  }
  if (!authService.validateCredentials(username, password)) {
    const e = new Error('用户名或密码错误')
    e.httpStatus = 401
    return next(e)
  }
  const jwtToken = authService.signSessionToken()
  res.sendResponse({ data: { jwtToken } })
}

module.exports = {
  createSession
}
