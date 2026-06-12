/**
 * 后台登录：统计页与许可证运维页各一套账号（.env），JWT 共用 STATS_JWT_SECRET 签发。
 */
const crypto = require('crypto')
const jwt = require('jsonwebtoken')

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8')
  const bufB = Buffer.from(String(b ?? ''), 'utf8')
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function isJwtSigningConfigured() {
  const s = process.env.STATS_JWT_SECRET
  return typeof s === 'string' && s.trim().length >= 16
}

function isCredentialsConfigured(usernameKey, passwordKey) {
  const u = process.env[usernameKey]
  const p = process.env[passwordKey]
  return Boolean(
    typeof u === 'string' &&
      u.trim() &&
      typeof p === 'string' &&
      p.length > 0 &&
      isJwtSigningConfigured(),
  )
}

function validateCredentials(username, password, usernameKey, passwordKey) {
  if (!isCredentialsConfigured(usernameKey, passwordKey)) return false
  return (
    timingSafeEqualString(username?.trim(), process.env[usernameKey].trim()) &&
    timingSafeEqualString(password ?? '', process.env[passwordKey])
  )
}

function signToken(sub, typ) {
  return jwt.sign({ sub, typ }, process.env.STATS_JWT_SECRET, {
    expiresIn: process.env.STATS_JWT_EXPIRES_IN || '8h'
  })
}

module.exports = {
  isAuthConfigured: () => isCredentialsConfigured('STATS_ADMIN_USERNAME', 'STATS_ADMIN_PASSWORD'),
  isLicenseAdminAuthConfigured: () =>
    isCredentialsConfigured('LICENSE_ADMIN_USERNAME', 'LICENSE_ADMIN_PASSWORD'),
  validateCredentials: (username, password) =>
    validateCredentials(username, password, 'STATS_ADMIN_USERNAME', 'STATS_ADMIN_PASSWORD'),
  validateLicenseAdminCredentials: (username, password) =>
    validateCredentials(username, password, 'LICENSE_ADMIN_USERNAME', 'LICENSE_ADMIN_PASSWORD'),
  signSessionToken: () => signToken('stats-admin', 'product-releases-stats'),
  signLicenseAdminToken: () => signToken('license-admin', 'product-releases-license-admin')
}
