/**
 * 许可证核心业务。
 *
 * 试用：sendTrialCode → activateTrial（写 trial_activations + 签名 license）
 * Pro：码池 unused → fulfill 绑邮箱 → redeemPro（可同码追加第二台设备）
 */
const CustomError = require('../errors/customError')
const { ERROR_CODES: EC } = require('../constants/messageCodes')
const { buildTrialPayload, buildProPayload, signLicensePayload } = require('../utils/licenseSigning')
const { verifyLicenseFile } = require('../utils/licenseVerify')
const licenseModel = require('../models/licenseModel')
const licenseEmailService = require('./licenseEmailService')
const {
  normalizeEmail,
  hashEmail,
  hashVerificationCode,
  assertDeviceId,
  generateNumericCode,
  generateActivationCode,
  normalizeActivationCode,
  newLicenseId,
  nowMs,
  addDaysMs
} = require('../utils/licenseCrypto')
const {
  TRIAL_DAYS,
  DEVICE_LIMIT,
  SEND_CODE_COOLDOWN_SECONDS,
  VERIFICATION_TTL_MINUTES
} = require('../config/licenseConfig')

function licenseError(code, httpStatus, publicFields) {
  return new CustomError({
    httpStatus,
    messageCode: code,
    messageType: 'error',
    public: publicFields
  })
}

function requireLicenseEmail(raw) {
  const email = normalizeEmail(raw)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw licenseError(EC.INVALID_EMAIL, 400, { field: 'email' })
  }
  return { email, emailHash: hashEmail(email) }
}

/** device_limit_override: null=全局默认，0=不限，正整数=自定义 */
function effectiveDeviceLimit(override) {
  if (override === null || override === undefined) return DEVICE_LIMIT
  if (override === 0) return null
  return override
}

function parseDeviceLimitOverride(raw) {
  if (raw === null || raw === undefined) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 9999) {
    throw licenseError(EC.INVALID_DEVICE_LIMIT_OVERRIDE, 400)
  }
  return n
}

function mergeDeviceIds(existingDeviceIds, deviceId, deviceLimit) {
  const merged = [...new Set([...(existingDeviceIds || []), deviceId])]
  if (deviceLimit != null && merged.length > deviceLimit) {
    throw licenseError(EC.DEVICE_LIMIT_REACHED, 403, {
      field: 'email',
      device_limit: deviceLimit
    })
  }
  return merged
}

function requireDeviceId(deviceId) {
  try {
    return assertDeviceId(deviceId)
  } catch {
    throw licenseError(EC.INVALID_DEVICE_ID, 400)
  }
}

/** 单邮箱在运维列表中的快照（contact 来自 listAllLicenseContacts 或刚更新的 override） */
function buildRecipientSnapshot(emailHash, email, contact = {}) {
  const trial = licenseModel.getTrialActivationByEmailHash(emailHash)
  const proCode = licenseModel.getLatestProCodeForEmail(emailHash)
  const activeRecord = licenseModel.getActiveLicenseRecordForEmail(emailHash)
  const proRecord = proCode?.license_id ? licenseModel.getLicenseRecord(proCode.license_id) : null
  const deviceLimitOverride = contact.device_limit_override ?? null
  const deviceLimit = effectiveDeviceLimit(deviceLimitOverride)

  let deviceCount = 0
  let deviceIds = []
  if (proRecord) {
    deviceIds = proRecord.device_ids || []
    deviceCount = deviceIds.length
  }

  const proRevoked = Boolean(proRecord?.revoked_at)

  return {
    email,
    trial_used: Boolean(trial),
    trial_started_at: trial?.started_at ?? null,
    trial_expires_at: trial?.trial_expires_at ?? null,
    fulfilled: Boolean(proCode),
    can_fulfill: !proCode && Boolean(trial),
    activation_code: proCode?.code ?? null,
    code_status: proCode?.status ?? null,
    active_edition: activeRecord?.edition ?? null,
    fulfilled_at: proCode?.fulfilled_at ?? null,
    redeemed_at: proCode?.redeemed_at ?? null,
    pro_revoked_at: proRecord?.revoked_at ?? null,
    can_revoke_pro:
      proCode?.status === 'redeemed' && proRecord?.edition === 'pro' && !proRevoked,
    can_restore_pro:
      proCode?.status === 'revoked' && proRecord?.edition === 'pro' && proRevoked,
    device_count: deviceCount,
    device_limit: deviceLimit,
    device_limit_override: deviceLimitOverride,
    device_ids: deviceIds
  }
}

async function sendTrialCode({ email }) {
  const { email: normalizedEmail, emailHash } = requireLicenseEmail(email)

  if (licenseModel.getTrialActivationByEmailHash(emailHash)) {
    throw licenseError(EC.TRIAL_EMAIL_ALREADY_USED, 409, { field: 'email' })
  }

  const sinceMs = nowMs() - SEND_CODE_COOLDOWN_SECONDS * 1000
  if (licenseModel.getVerificationCodeCreatedWithin(emailHash, sinceMs)) {
    throw licenseError(EC.SEND_CODE_TOO_FREQUENT, 429)
  }

  const code = generateNumericCode(6)
  licenseModel.insertVerificationCode({
    emailHash,
    codeHash: hashVerificationCode(code),
    expiresAt: nowMs() + VERIFICATION_TTL_MINUTES * 60 * 1000
  })

  licenseModel.upsertLicenseContact({ email: normalizedEmail, emailHash })

  await licenseEmailService.sendTrialVerificationEmail({ email: normalizedEmail, code })
}

function activateTrial({ email, code, deviceId }) {
  const { email: normalizedEmail, emailHash } = requireLicenseEmail(email)
  const normalizedDeviceId = requireDeviceId(deviceId)

  if (licenseModel.getTrialActivationByEmailHash(emailHash)) {
    throw licenseError(EC.TRIAL_EMAIL_ALREADY_USED, 409, { field: 'email' })
  }

  const stored = licenseModel.getLatestVerificationCode(emailHash)
  if (!stored || stored.expires_at < nowMs()) {
    throw licenseError(EC.TRIAL_CODE_INVALID, 400, { field: 'code' })
  }

  if (stored.code_hash !== hashVerificationCode(String(code || '').trim())) {
    throw licenseError(EC.TRIAL_CODE_INVALID, 400, { field: 'code' })
  }

  const startedAtMs = nowMs()
  const trialExpiresAtMs = addDaysMs(TRIAL_DAYS)
  const licenseId = newLicenseId()
  const license = signLicensePayload(
    buildTrialPayload({
      emailHash,
      deviceIds: [normalizedDeviceId],
      trialExpiresAtMs,
      licenseId
    }),
  )

  licenseModel.upsertLicenseContact({ email: normalizedEmail, emailHash })
  licenseModel.insertTrialActivation({
    id: licenseId,
    emailHash,
    startedAt: startedAtMs,
    trialExpiresAt: trialExpiresAtMs
  })
  licenseModel.upsertLicenseRecord({
    licenseId,
    emailHash,
    edition: 'trial',
    deviceIds: [normalizedDeviceId]
  })
  licenseModel.deleteVerificationCodesForEmail(emailHash)

  return {
    license,
    edition: 'trial',
    trial_expires_at: trialExpiresAtMs
  }
}

function redeemPro({ email, activationCode, deviceId }) {
  const { email: normalizedEmail, emailHash } = requireLicenseEmail(email)
  const normalizedDeviceId = requireDeviceId(deviceId)
  const code = normalizeActivationCode(activationCode)
  const contact = licenseModel.getLicenseContactByEmailHash(emailHash)
  const deviceLimit = effectiveDeviceLimit(contact?.device_limit_override)

  const proCode = licenseModel.getProCode(code)
  if (!proCode) {
    throw licenseError(EC.ACTIVATION_CODE_INVALID, 400, { field: 'code' })
  }
  if (proCode.email_hash && proCode.email_hash !== emailHash) {
    throw licenseError(EC.ACTIVATION_CODE_EMAIL_MISMATCH, 400, { field: 'code' })
  }
  if (proCode.status !== 'fulfilled' && proCode.status !== 'redeemed') {
    throw licenseError(EC.ACTIVATION_CODE_INVALID, 400, { field: 'code' })
  }
  if (proCode.status === 'fulfilled' && !proCode.email_hash) {
    throw licenseError(EC.ACTIVATION_CODE_INVALID, 400, { field: 'code' })
  }

  if (proCode.status === 'redeemed') {
    const licenseId = proCode.license_id
    if (!licenseId) {
      throw licenseError(EC.ACTIVATION_CODE_USED, 409, { field: 'code' })
    }
    const record = licenseModel.getLicenseRecord(licenseId)
    if (!record || record.email_hash !== emailHash) {
      throw licenseError(EC.ACTIVATION_CODE_USED, 409, { field: 'code' })
    }
    if (record.revoked_at) {
      throw licenseError(EC.LICENSE_REVOKED, 403, { field: 'code' })
    }
    const deviceIds = record.device_ids
    if (deviceIds.includes(normalizedDeviceId)) {
      return {
        license: signLicensePayload(buildProPayload({ emailHash, deviceIds, licenseId })),
        edition: 'pro'
      }
    }
    const merged = mergeDeviceIds(deviceIds, normalizedDeviceId, deviceLimit)
    const license = signLicensePayload(buildProPayload({ emailHash, deviceIds: merged, licenseId }))
    licenseModel.upsertLicenseRecord({ licenseId, emailHash, edition: 'pro', deviceIds: merged })
    return { license, edition: 'pro' }
  }

  const activeRecord = licenseModel.getActiveLicenseRecordForEmail(emailHash)
  let deviceIds = [normalizedDeviceId]
  let licenseId = proCode.license_id || newLicenseId()

  if (activeRecord?.license_id) {
    licenseId = activeRecord.license_id
    const record = licenseModel.getLicenseRecord(licenseId)
    deviceIds = mergeDeviceIds(record.device_ids, normalizedDeviceId, deviceLimit)
  }

  const license = signLicensePayload(buildProPayload({ emailHash, deviceIds, licenseId }))

  licenseModel.markProCodeRedeemed({ code, licenseId })
  licenseModel.upsertLicenseRecord({
    licenseId,
    emailHash,
    edition: 'pro',
    deviceIds
  })

  return { license, edition: 'pro' }
}

function generateProCodes({ count }) {
  const total = Math.max(1, Math.min(Number(count) || 1, 500))
  const codes = []
  const seen = new Set()
  while (codes.length < total) {
    const code = generateActivationCode()
    if (seen.has(code) || licenseModel.getProCode(code)) continue
    seen.add(code)
    codes.push(code)
  }
  licenseModel.insertProCodes(codes)
  return { codes }
}

async function fulfillOrder({ email, requireTrialCode = true }) {
  const { email: normalizedEmail, emailHash } = requireLicenseEmail(email)

  if (requireTrialCode && !licenseModel.getTrialActivationByEmailHash(emailHash)) {
    throw licenseError(EC.TRIAL_REQUIRED_FOR_FULFILL, 400)
  }

  const existingCode = licenseModel.getFulfilledProCodeForEmail(emailHash)
  if (existingCode?.status === 'fulfilled') {
    throw licenseError(EC.ACTIVATION_CODE_ALREADY_SENT, 409, {
      activation_code: existingCode.code,
      fulfilled_at: existingCode.fulfilled_at
    })
  }

  const unused = licenseModel.takeUnusedProCode()
  if (!unused) {
    throw licenseError(EC.ACTIVATION_CODE_POOL_EMPTY, 409)
  }

  const activationCode = unused.code
  licenseModel.markProCodeFulfilled({ code: activationCode, emailHash })
  licenseModel.upsertLicenseContact({ email: normalizedEmail, emailHash })

  await licenseEmailService.sendProActivationEmail({
    email: normalizedEmail,
    activationCode
  })

  return {
    email: normalizedEmail,
    activation_code: activationCode
  }
}

/** 运维页一览：码池 + 全部已知邮箱（无分页，一次返回） */
function getAdminOverview() {
  const contacts = licenseModel.listAllLicenseContacts()
  const recipients = contacts.map((contact) =>
    buildRecipientSnapshot(contact.email_hash, contact.email, contact),
  )

  recipients.sort((a, b) => {
    const rank = (row) => {
      if (!row.fulfilled && row.can_fulfill) return 0
      if (row.code_status === 'fulfilled') return 1
      if (!row.fulfilled && !row.can_fulfill) return 2
      if (row.code_status === 'redeemed') return 3
      return 4
    }
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    return (b.fulfilled_at ?? b.redeemed_at ?? 0) - (a.fulfilled_at ?? a.redeemed_at ?? 0)
  })

  return {
    unused_codes: licenseModel.countUnusedProCodes(),
    default_device_limit: DEVICE_LIMIT,
    recipients
  }
}

function setRecipientDeviceLimit({ email, deviceLimitOverride }) {
  const { email: normalizedEmail, emailHash } = requireLicenseEmail(email)
  const parsed = parseDeviceLimitOverride(deviceLimitOverride)

  licenseModel.setLicenseContactDeviceLimit({
    email: normalizedEmail,
    emailHash,
    deviceLimitOverride: parsed
  })

  return buildRecipientSnapshot(emailHash, normalizedEmail, { device_limit_override: parsed })
}

function refreshLicense({ license, deviceId }) {
  const normalizedDeviceId = requireDeviceId(deviceId)
  if (!license?.payload || !license?.signature) {
    throw licenseError(EC.INVALID_LICENSE, 400)
  }
  if (!verifyLicenseFile(license)) {
    throw licenseError(EC.INVALID_LICENSE, 400)
  }

  const payload = license.payload
  const licenseId = payload.license_id
  if (!licenseId) {
    throw licenseError(EC.INVALID_LICENSE, 400)
  }

  const record = licenseModel.getLicenseRecord(licenseId)
  if (!record) {
    throw licenseError(EC.LICENSE_NOT_FOUND, 404)
  }
  if (record.revoked_at) {
    throw licenseError(EC.LICENSE_REVOKED, 403)
  }
  if (record.email_hash !== payload.email_hash) {
    throw licenseError(EC.INVALID_LICENSE, 400)
  }
  if (!record.device_ids.includes(normalizedDeviceId)) {
    throw licenseError(EC.INVALID_DEVICE_ID, 403)
  }

  if (record.edition === 'pro' && payload.edition === 'pro') {
    return {
      license: signLicensePayload(
        buildProPayload({
          emailHash: record.email_hash,
          deviceIds: record.device_ids,
          licenseId
        }),
      ),
      edition: 'pro'
    }
  }

  if (record.edition === 'trial' && payload.edition === 'trial') {
    const trial = licenseModel.getTrialActivationByEmailHash(record.email_hash)
    if (!trial || trial.id !== licenseId) {
      throw licenseError(EC.INVALID_LICENSE, 400)
    }
    if (nowMs() > trial.trial_expires_at) {
      throw licenseError(EC.TRIAL_CODE_INVALID, 403)
    }
    return {
      license: signLicensePayload(
        buildTrialPayload({
          emailHash: record.email_hash,
          deviceIds: record.device_ids,
          trialExpiresAtMs: trial.trial_expires_at,
          licenseId
        }),
      ),
      edition: 'trial',
      trial_expires_at: trial.trial_expires_at
    }
  }

  throw licenseError(EC.INVALID_LICENSE, 400)
}

function mutateProLicense({ email, findCode, notAllowedCode, assertRecord, apply }) {
  const { email: normalizedEmail, emailHash } = requireLicenseEmail(email)
  const proCode = findCode(emailHash)
  if (!proCode?.license_id) {
    throw licenseError(notAllowedCode, 400, { field: 'email' })
  }

  const record = licenseModel.getLicenseRecord(proCode.license_id)
  if (!record || record.edition !== 'pro') {
    throw licenseError(notAllowedCode, 400, { field: 'email' })
  }
  assertRecord(record)

  apply(proCode, record)
  return buildRecipientSnapshot(emailHash, normalizedEmail)
}

function revokeProLicense({ email }) {
  return mutateProLicense({
    email,
    findCode: licenseModel.getRedeemedProCodeForEmail,
    notAllowedCode: EC.PRO_NOT_REVOKABLE,
    assertRecord: (record) => {
      if (record.revoked_at) {
        throw licenseError(EC.PRO_ALREADY_REVOKED, 409, { field: 'email' })
      }
    },
    apply: (proCode) => {
      licenseModel.revokeLicenseRecord(proCode.license_id)
      licenseModel.markProCodeRevoked({ code: proCode.code })
    }
  })
}

function restoreProLicense({ email }) {
  return mutateProLicense({
    email,
    findCode: licenseModel.getRevokedProCodeForEmail,
    notAllowedCode: EC.PRO_NOT_RESTORABLE,
    assertRecord: (record) => {
      if (!record.revoked_at) {
        throw licenseError(EC.PRO_NOT_REVOKED, 409, { field: 'email' })
      }
    },
    apply: (proCode) => {
      licenseModel.restoreLicenseRecord(proCode.license_id)
      licenseModel.markProCodeRestored({ code: proCode.code })
    }
  })
}

module.exports = {
  sendTrialCode,
  activateTrial,
  redeemPro,
  generateProCodes,
  fulfillOrder,
  getAdminOverview,
  setRecipientDeviceLimit,
  refreshLicense,
  revokeProLicense,
  restoreProLicense
}
