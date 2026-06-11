/**
 * 许可证 SQLite 访问层（见 initSchema.js 表说明）。
 * 时间字段均为毫秒时间戳（INTEGER）。
 */
const { getDb } = require('../db/getDb')
const { nowMs } = require('../utils/licenseCrypto')

// --- 试用 ---

function getTrialActivationByEmailHash(emailHash) {
  return getDb()
    .prepare('SELECT id, email_hash, started_at, trial_expires_at, created_at FROM trial_activations WHERE email_hash = ?')
    .get(emailHash)
}

function insertTrialActivation({ id, emailHash, startedAt, trialExpiresAt }) {
  getDb().prepare(
    `INSERT INTO trial_activations (id, email_hash, started_at, trial_expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, emailHash, startedAt, trialExpiresAt, nowMs())
}

// --- 试用邮件验证码（6 位，非 Pro 激活码）---

function deleteVerificationCodesForEmail(emailHash) {
  getDb().prepare('DELETE FROM license_email_verification_codes WHERE email_hash = ?').run(emailHash)
}

function insertVerificationCode({ emailHash, codeHash, expiresAt }) {
  deleteVerificationCodesForEmail(emailHash)
  getDb().prepare(
    `INSERT INTO license_email_verification_codes (email_hash, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(emailHash, codeHash, expiresAt, nowMs())
}

function getLatestVerificationCode(emailHash) {
  return getDb()
    .prepare(
      `SELECT email_hash, code_hash, expires_at, created_at
       FROM license_email_verification_codes
       WHERE email_hash = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(emailHash)
}

function getVerificationCodeCreatedWithin(emailHash, sinceMs) {
  return getDb()
    .prepare(
      `SELECT created_at FROM license_email_verification_codes
       WHERE email_hash = ? AND created_at >= ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(emailHash, sinceMs)
}

// --- 授权主记录（edition / 设备列表；与签名 license 的 license_id 对应）---

function upsertLicenseRecord({ licenseId, emailHash, edition, deviceIds }) {
  const now = nowMs()
  const deviceIdsJson = JSON.stringify(deviceIds)
  const existing = getDb().prepare('SELECT license_id FROM license_records WHERE license_id = ?').get(licenseId)
  if (existing) {
    getDb().prepare(
      `UPDATE license_records
       SET email_hash = ?, edition = ?, device_ids_json = ?, updated_at = ?
       WHERE license_id = ?`,
    ).run(emailHash, edition, deviceIdsJson, now, licenseId)
    return
  }
  getDb().prepare(
    `INSERT INTO license_records (license_id, email_hash, edition, device_ids_json, revoked, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run(licenseId, emailHash, edition, deviceIdsJson, now, now)
}

function getLicenseRecord(licenseId) {
  const row = getDb()
    .prepare(
      `SELECT license_id, email_hash, edition, device_ids_json, revoked, created_at, updated_at
       FROM license_records WHERE license_id = ?`,
    )
    .get(licenseId)
  if (!row) return null
  return {
    ...row,
    device_ids: JSON.parse(row.device_ids_json || '[]'),
    revoked: row.revoked === 1
  }
}

// --- Pro 激活码池：unused → fulfilled → redeemed ---

function getProCode(code) {
  return getDb()
    .prepare(
      `SELECT code, email_hash, status, fulfilled_at, redeemed_at, license_id, note, created_at
       FROM pro_activation_codes WHERE code = ?`,
    )
    .get(code)
}

function insertProCodes(codes) {
  const stmt = getDb().prepare(
    `INSERT INTO pro_activation_codes (code, email_hash, status, fulfilled_at, redeemed_at, license_id, note, created_at)
     VALUES (?, NULL, 'unused', NULL, NULL, NULL, NULL, ?)`,
  )
  const createdAt = nowMs()
  const insertMany = getDb().transaction((items) => {
    for (const code of items) stmt.run(code, createdAt)
  })
  insertMany(codes)
}

function countUnusedProCodes() {
  return getDb().prepare("SELECT COUNT(*) AS count FROM pro_activation_codes WHERE status = 'unused'").get().count
}

function takeUnusedProCode() {
  return getDb()
    .prepare(
      `SELECT code FROM pro_activation_codes
       WHERE status = 'unused'
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get()
}

function markProCodeFulfilled({ code, emailHash, note }) {
  getDb().prepare(
    `UPDATE pro_activation_codes
     SET email_hash = ?, status = 'fulfilled', fulfilled_at = ?, note = ?
     WHERE code = ? AND status = 'unused'`,
  ).run(emailHash, nowMs(), note || null, code)
}

function markProCodeRedeemed({ code, licenseId }) {
  getDb().prepare(
    `UPDATE pro_activation_codes
     SET status = 'redeemed', redeemed_at = ?, license_id = ?
     WHERE code = ?`,
  ).run(nowMs(), licenseId, code)
}

function getFulfilledProCodeForEmail(emailHash) {
  return getDb()
    .prepare(
      `SELECT code, email_hash, status, fulfilled_at, redeemed_at, license_id
       FROM pro_activation_codes
       WHERE email_hash = ? AND status IN ('fulfilled', 'redeemed')
       ORDER BY fulfilled_at DESC
       LIMIT 1`,
    )
    .get(emailHash)
}

// --- 发码/付款台账（含明文 email，便于对账）---

function getLatestFulfillmentForEmail(emailHash) {
  return getDb()
    .prepare(
      `SELECT id, email, email_hash, activation_code, amount_cents, payment_note, fulfilled_at, redeemed_at, created_at
       FROM order_fulfillments
       WHERE email_hash = ?
       ORDER BY fulfilled_at DESC
       LIMIT 1`,
    )
    .get(emailHash)
}

function insertOrderFulfillment({ id, email, emailHash, activationCode, amountCents, paymentNote }) {
  const now = nowMs()
  getDb().prepare(
    `INSERT INTO order_fulfillments
      (id, email, email_hash, activation_code, amount_cents, payment_note, fulfilled_at, redeemed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(id, email, emailHash, activationCode, amountCents, paymentNote || null, now, now)
}

function markFulfillmentRedeemed(emailHash, activationCode) {
  getDb().prepare(
    `UPDATE order_fulfillments SET redeemed_at = ?
     WHERE email_hash = ? AND activation_code = ? AND redeemed_at IS NULL`,
  ).run(nowMs(), emailHash, activationCode)
}

function getActiveLicenseRecordForEmail(emailHash) {
  return getDb()
    .prepare(
      `SELECT license_id, email_hash, edition, device_ids_json, revoked, created_at, updated_at
       FROM license_records
       WHERE email_hash = ? AND revoked = 0
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(emailHash)
}

module.exports = {
  getTrialActivationByEmailHash,
  insertTrialActivation,
  deleteVerificationCodesForEmail,
  insertVerificationCode,
  getLatestVerificationCode,
  getVerificationCodeCreatedWithin,
  upsertLicenseRecord,
  getLicenseRecord,
  getProCode,
  insertProCodes,
  countUnusedProCodes,
  takeUnusedProCode,
  markProCodeFulfilled,
  markProCodeRedeemed,
  getFulfilledProCodeForEmail,
  getLatestFulfillmentForEmail,
  insertOrderFulfillment,
  markFulfillmentRedeemed,
  getActiveLicenseRecordForEmail
}
