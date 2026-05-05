const jwt = require('jsonwebtoken')

/**
 * Bearer JWT 鉴权（用于查看统计等受保护接口）
 * @param {import('express').Request} req
 * @param {import('express').Response} _res
 * @param {import('express').NextFunction} next
 */
function authMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const e = new Error('未登录或令牌缺失')
    e.httpStatus = 401
    return next(e)
  }
  const secret = process.env.STATS_JWT_SECRET
  if (!secret || String(secret).trim().length < 16) {
    const e = new Error('服务端未正确配置 STATS_JWT_SECRET')
    e.httpStatus = 500
    return next(e)
  }
  const token = authHeader.split(' ')[1]
  try {
    req.user = jwt.verify(token, secret)
    next()
  } catch {
    const e = new Error('登录已过期或令牌无效')
    e.httpStatus = 401
    next(e)
  }
}

module.exports = authMiddleware
