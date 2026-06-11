/**
 * 统计页管理员登录：单账号 + JWT（与 xiaoxiao-album 用户体系无关）。
 * 凭据来自 .env：STATS_ADMIN_USERNAME / STATS_ADMIN_PASSWORD / STATS_JWT_SECRET
 */
const crypto = require('crypto')
const jwt = require('jsonwebtoken')

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8')
  const bufB = Buffer.from(String(b ?? ''), 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

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

function validateCredentials(username, password) {
  if (!isAuthConfigured()) return false
  const okUser = timingSafeEqualString(username?.trim(), process.env.STATS_ADMIN_USERNAME.trim())
  const okPass = timingSafeEqualString(password ?? '', process.env.STATS_ADMIN_PASSWORD)
  return okUser && okPass
}

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
