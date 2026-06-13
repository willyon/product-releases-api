/**
 * Bearer JWT 鉴权工厂。typ 指定时期望 payload.typ 一致（统计页 / 许可证运维页）。
 */
const jwt = require('jsonwebtoken')
const CustomError = require('../errors/customError')
const { ERROR_CODES: EC } = require('../constants/messageCodes')

function createJwtAuthMiddleware({ typ } = {}) {
  return (req, _res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new CustomError({ httpStatus: 401, messageCode: EC.UNAUTHORIZED }))
    }

    const secret = process.env.STATS_JWT_SECRET
    if (!secret || String(secret).trim().length < 16) {
      return next(new CustomError({ httpStatus: 500, messageCode: EC.JWT_SECRET_NOT_CONFIGURED }))
    }

    try {
      const payload = jwt.verify(authHeader.split(' ')[1], secret)
      if (typ && payload?.typ !== typ) {
        return next(new CustomError({ httpStatus: 401, messageCode: EC.UNAUTHORIZED }))
      }
      req.user = payload
      next()
    } catch {
      next(new CustomError({ httpStatus: 401, messageCode: EC.UNAUTHORIZED }))
    }
  }
}

module.exports = createJwtAuthMiddleware
