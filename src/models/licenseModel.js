/**
 * 许可证 SQLite 访问层（见 initSchema.js 表说明）。
 */
const { getDb } = require('../db/getDb')
const { nowMs } = require('../utils/licenseCrypto')

function parseDeviceIdsJson(row) {
  if (!row) return null
  return {
    ...row,
    device_ids: JSON.parse(row.device_ids_json || '[]')
  }
}

const PRO_CODE_COLUMNS =
  'code, status, fulfilled_email, fulfilled_at, redeemed_at, license_id, created_at'

// --- 试用 ---

function getTrialActivationByDeviceId(deviceId) {
  return getDb()
    .prepare('SELECT id, device_id, started_at, trial_expires_at FROM trial_activations WHERE device_id = ?')
    .get(deviceId)
}

function getTrialActivationById(licenseId) {
  return getDb()
    .prepare('SELECT id, device_id, started_at, trial_expires_at FROM trial_activations WHERE id = ?')
    .get(licenseId)
}

function insertTrialActivation({ id, deviceId, startedAt, trialExpiresAt }) {
  getDb().prepare(
    `INSERT INTO trial_activations (id, device_id, started_at, trial_expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, deviceId, startedAt, trialExpiresAt)
}

function listTrialActivationsForAdmin() {
  return getDb()
    .prepare(
      `SELECT id, device_id, started_at, trial_expires_at
       FROM trial_activations
       ORDER BY started_at DESC`,
    )
    .all()
}

// --- 授权主记录 ---

function upsertLicenseRecord({ licenseId, edition, deviceIds, deviceLimitOverride = null }) {
  const now = nowMs()
  const deviceIdsJson = JSON.stringify(deviceIds)
  const existing = getDb().prepare('SELECT license_id FROM license_records WHERE license_id = ?').get(licenseId)
  if (existing) {
    getDb().prepare(
      `UPDATE license_records
       SET edition = ?, device_ids_json = ?, device_limit_override = ?, updated_at = ?
       WHERE license_id = ?`,
    ).run(edition, deviceIdsJson, deviceLimitOverride, now, licenseId)
    return
  }
  getDb().prepare(
    `INSERT INTO license_records (license_id, edition, device_ids_json, device_limit_override, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(licenseId, edition, deviceIdsJson, deviceLimitOverride, now, now)
}

function getLicenseRecord(licenseId) {
  const row = getDb()
    .prepare(
      `SELECT license_id, edition, device_ids_json, device_limit_override, created_at, updated_at, revoked_at
       FROM license_records WHERE license_id = ?`,
    )
    .get(licenseId)
  return parseDeviceIdsJson(row)
}

function setLicenseRecordDeviceLimitOverride({ licenseId, deviceLimitOverride }) {
  getDb().prepare(
    `UPDATE license_records
     SET device_limit_override = ?, updated_at = ?
     WHERE license_id = ?`,
  ).run(deviceLimitOverride, nowMs(), licenseId)
}

// --- 激活码池 ---

function getProCode(code) {
  return getDb()
    .prepare(`SELECT ${PRO_CODE_COLUMNS} FROM pro_activation_codes WHERE code = ?`)
    .get(code)
}

function insertProCodes(codes) {
  const stmt = getDb().prepare(
    `INSERT INTO pro_activation_codes (code, status, fulfilled_email, fulfilled_at, redeemed_at, license_id, created_at)
     VALUES (?, 'unused', NULL, NULL, NULL, NULL, ?)`,
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

function markProCodeFulfilled({ code, fulfilledEmail, licenseId }) {
  getDb().prepare(
    `UPDATE pro_activation_codes
     SET fulfilled_email = ?, status = 'fulfilled', fulfilled_at = ?, license_id = ?
     WHERE code = ? AND status = 'unused'`,
  ).run(fulfilledEmail, nowMs(), licenseId, code)
}

function markProCodeRedeemed({ code, licenseId }) {
  getDb().prepare(
    `UPDATE pro_activation_codes
     SET status = 'redeemed', redeemed_at = ?, license_id = ?
     WHERE code = ?`,
  ).run(nowMs(), licenseId, code)
}

function markProCodeRevoked({ code }) {
  getDb().prepare(
    `UPDATE pro_activation_codes
     SET status = 'revoked'
     WHERE code = ? AND status = 'redeemed'`,
  ).run(code)
}

function markProCodeRestored({ code }) {
  getDb().prepare(
    `UPDATE pro_activation_codes
     SET status = 'redeemed'
     WHERE code = ? AND status = 'revoked'`,
  ).run(code)
}

function revokeLicenseRecord(licenseId) {
  getDb().prepare(
    `UPDATE license_records
     SET revoked_at = ?, updated_at = ?
     WHERE license_id = ? AND edition = 'pro' AND revoked_at IS NULL`,
  ).run(nowMs(), nowMs(), licenseId)
}

function restoreLicenseRecord(licenseId) {
  getDb().prepare(
    `UPDATE license_records
     SET revoked_at = NULL, updated_at = ?
     WHERE license_id = ? AND edition = 'pro' AND revoked_at IS NOT NULL`,
  ).run(nowMs(), licenseId)
}

function getPendingFulfilledProCodeForEmail(email) {
  return getDb()
    .prepare(
      `SELECT ${PRO_CODE_COLUMNS}
       FROM pro_activation_codes
       WHERE fulfilled_email = ? AND status = 'fulfilled'
       ORDER BY fulfilled_at DESC
       LIMIT 1`,
    )
    .get(email)
}

function listProCodesForAdmin() {
  return getDb()
    .prepare(
      `SELECT ${PRO_CODE_COLUMNS}
       FROM pro_activation_codes
       WHERE status IN ('fulfilled', 'redeemed', 'revoked')
       ORDER BY COALESCE(redeemed_at, fulfilled_at, created_at) DESC`,
    )
    .all()
}

module.exports = {
  getTrialActivationByDeviceId,
  getTrialActivationById,
  insertTrialActivation,
  listTrialActivationsForAdmin,
  upsertLicenseRecord,
  getLicenseRecord,
  setLicenseRecordDeviceLimitOverride,
  getProCode,
  insertProCodes,
  countUnusedProCodes,
  takeUnusedProCode,
  markProCodeFulfilled,
  markProCodeRedeemed,
  markProCodeRevoked,
  markProCodeRestored,
  revokeLicenseRecord,
  restoreLicenseRecord,
  getPendingFulfilledProCodeForEmail,
  listProCodesForAdmin
}
