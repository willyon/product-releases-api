/**
 * 统计页 JWT 鉴权（Authorization: Bearer）。
 * 与 license 的 X-Admin-Key 是两套凭据，勿混用。
 */
const jwt = require('jsonwebtoken')
const { createApiError } = require('../utils/apiError')

function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(createApiError('未登录或令牌缺失', 401))
  }
  const secret = process.env.STATS_JWT_SECRET
  if (!secret || String(secret).trim().length < 16) {
    return next(createApiError('服务端未正确配置 STATS_JWT_SECRET', 500))
  }
  const token = authHeader.split(' ')[1]
  try {
    req.user = jwt.verify(token, secret)
    next()
  } catch {
    next(createApiError('登录已过期或令牌无效', 401))
  }
}

module.exports = authMiddleware
