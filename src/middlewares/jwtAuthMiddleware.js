/**
 * Bearer JWT 鉴权工厂。typ 指定时期望 payload.typ 一致（统计页 / 许可证运维页）。
 */
const jwt = require('jsonwebtoken')
const { createApiError } = require('../utils/apiError')

function createJwtAuthMiddleware({ typ, unauthMessage = '未授权' } = {}) {
  return (req, _res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return next(createApiError(unauthMessage, 401))
    }

    const secret = process.env.STATS_JWT_SECRET
    if (!secret || String(secret).trim().length < 16) {
      return next(createApiError('服务端未正确配置 STATS_JWT_SECRET', 500))
    }

    try {
      const payload = jwt.verify(authHeader.split(' ')[1], secret)
      if (typ && payload?.typ !== typ) {
        return next(createApiError(unauthMessage, 401))
      }
      req.user = payload
      next()
    } catch {
      next(createApiError(unauthMessage, 401))
    }
  }
}

module.exports = createJwtAuthMiddleware
