/**
 * 许可证相关：邮箱/验证码 hash、设备 ID 校验、激活码生成、时间工具。
 *
 * 数据库时间字段用毫秒（nowMs）；签名 payload 内时间用 ISO8601（msToIso）。
 */
const crypto = require('crypto')

// 带版本前缀，避免与其它系统的 hash 撞车
const EMAIL_HASH_PREFIX = 'xiaoxiao-license-email-v1:'
const CODE_HASH_PREFIX = 'xiaoxiao-license-code-v1:'

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase()
}

/** 邮箱不落库明文，统一存 hash */
function hashEmail(email) {
  return crypto.createHash('sha256').update(`${EMAIL_HASH_PREFIX}${normalizeEmail(email)}`).digest('hex')
}

/** 试用 6 位验证码 hash 入库；pepper 见 LICENSE_CODE_PEPPER */
function hashVerificationCode(code) {
  const pepper = process.env.LICENSE_CODE_PEPPER || 'xiaoxiao-license-code-pepper'
  return crypto.createHash('sha256').update(`${CODE_HASH_PREFIX}${pepper}:${String(code).trim()}`).digest('hex')
}

/** Electron 主进程 hash 后的 64 位 hex；格式不对由 service 层转成 400 */
function assertDeviceId(deviceId) {
  const value = String(deviceId || '').trim()
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error('INVALID_DEVICE_ID')
  }
  return value.toLowerCase()
}

function generateNumericCode(length = 6) {
  let code = ''
  for (let i = 0; i < length; i += 1) {
    code += crypto.randomInt(0, 10).toString()
  }
  return code
}

// 去掉易混淆字符 I/O/0/1
const ACTIVATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateActivationCodeSegment(length = 4) {
  let segment = ''
  for (let i = 0; i < length; i += 1) {
    segment += ACTIVATION_ALPHABET[crypto.randomInt(0, ACTIVATION_ALPHABET.length)]
  }
  return segment
}

/** Pro 激活码格式：XXXX-XXXX-XXXX */
function generateActivationCode() {
  return `${generateActivationCodeSegment()}-${generateActivationCodeSegment()}-${generateActivationCodeSegment()}`
}

function normalizeActivationCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
}

function newLicenseId() {
  return crypto.randomUUID()
}

function nowMs() {
  return Date.now()
}

function addDaysMs(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000
}

/** 签名 license payload 内时间字段仍用 ISO8601（给 Electron 读 trial_expires_at 等） */
function msToIso(ms) {
  return new Date(ms).toISOString()
}

module.exports = {
  normalizeEmail,
  hashEmail,
  hashVerificationCode,
  assertDeviceId,
  generateNumericCode,
  generateActivationCode,
  normalizeActivationCode,
  newLicenseId,
  nowMs,
  addDaysMs,
  msToIso
}
