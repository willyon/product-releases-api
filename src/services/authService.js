const crypto = require('crypto')
const jwt = require('jsonwebtoken')

/**
 * 常量时间比较字符串，降低旁路猜测风险（单账号场景足够）。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8')
  const bufB = Buffer.from(String(b ?? ''), 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * 是否已配置管理员与 JWT 密钥（缺一不可才能登录）
 * @returns {boolean}
 */
function isAuthConfigured() {
  const u = process.env.STATS_ADMIN_USERNAME
  const p = process.env.STATS_ADMIN_PASSWORD
  const s = process.env.STATS_JWT_SECRET
  return Boolean(
    typeof u === 'string' &&
      u.trim() &&
      typeof p === 'string' &&
      p.length > 0 &&
      typeof s === 'string' &&
      s.trim().length >= 16
  )
}

/**
 * @param {string} username
 * @param {string} password
 * @returns {boolean}
 */
function validateCredentials(username, password) {
  if (!isAuthConfigured()) return false
  const okUser = timingSafeEqualString(username?.trim(), process.env.STATS_ADMIN_USERNAME.trim())
  const okPass = timingSafeEqualString(password ?? '', process.env.STATS_ADMIN_PASSWORD)
  return okUser && okPass
}

/**
 * 签发访问令牌（与 xiaoxiao-album-api 一样使用 jwtToken 字段名对接前端）
 * @returns {string}
 */
function signSessionToken() {
  const secret = process.env.STATS_JWT_SECRET
  const expiresIn = process.env.STATS_JWT_EXPIRES_IN || '8h'
  return jwt.sign(
    { sub: 'stats-admin', typ: 'product-releases-stats' },
    secret,
    { expiresIn }
  )
}

module.exports = {
  isAuthConfigured,
  validateCredentials,
  signSessionToken
}
