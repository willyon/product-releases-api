/**
 * 许可证核心业务。
 *
 * 试用：startTrial（device_id 终身一次，启动时静默调用）
 * Pro：码池 unused → fulfill 发邮件 → redeemPro（activation_code + device_id）
 */
const CustomError = require('../errors/customError')
const { ERROR_CODES: EC } = require('../constants/messageCodes')
const { buildTrialPayload, buildProPayload, signLicensePayload } = require('../utils/licenseSigning')
const { verifyLicenseFile } = require('../utils/licenseVerify')
const licenseModel = require('../models/licenseModel')
const licenseEmailService = require('./licenseEmailService')
const {
  normalizeEmail,
  assertDeviceId,
  generateActivationCode,
  normalizeActivationCode,
  newLicenseId,
  nowMs,
  addDaysMs
} = require('../utils/licenseCrypto')
const { TRIAL_DAYS, DEVICE_LIMIT } = require('../config/licenseConfig')

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
  return email
}

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
      field: 'code',
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

function resolveRecordDeviceLimit(record) {
  return effectiveDeviceLimit(record?.device_limit_override ?? null)
}

function buildProAdminEntry(proCode, record) {
  const deviceLimit = resolveRecordDeviceLimit(record)
  const deviceIds = record?.device_ids || []
  const proRevoked = Boolean(record?.revoked_at) || proCode.status === 'revoked'

  return {
    kind: 'pro',
    activation_code: proCode.code,
    code_status: proCode.status,
    fulfilled_email: proCode.fulfilled_email ?? null,
    fulfilled_at: proCode.fulfilled_at ?? null,
    redeemed_at: proCode.redeemed_at ?? null,
    pro_revoked_at: record?.revoked_at ?? null,
    device_count: deviceIds.length,
    device_limit: deviceLimit,
    device_limit_override: record?.device_limit_override ?? null,
    device_ids: deviceIds,
    can_revoke_pro: proCode.status === 'redeemed' && record?.edition === 'pro' && !proRevoked,
    can_restore_pro: proCode.status === 'revoked' && record?.edition === 'pro' && proRevoked
  }
}

function buildTrialAdminEntry(trial) {
  return {
    kind: 'trial',
    device_id: trial.device_id,
    trial_started_at: trial.started_at,
    trial_expires_at: trial.trial_expires_at
  }
}

function signTrialLicense(trial) {
  const license = signLicensePayload(
    buildTrialPayload({
      deviceIds: [trial.device_id],
      trialExpiresAtMs: trial.trial_expires_at,
      licenseId: trial.id
    }),
  )
  const active = nowMs() <= trial.trial_expires_at
  return {
    license,
    edition: active ? 'trial' : 'free',
    trial_expires_at: trial.trial_expires_at
  }
}

function startTrial({ deviceId }) {
  const normalizedDeviceId = requireDeviceId(deviceId)
  const existing = licenseModel.getTrialActivationByDeviceId(normalizedDeviceId)

  if (existing) {
    licenseModel.upsertLicenseRecord({
      licenseId: existing.id,
      edition: 'trial',
      deviceIds: [normalizedDeviceId]
    })
    return signTrialLicense(existing)
  }

  const startedAtMs = nowMs()
  const trialExpiresAtMs = addDaysMs(TRIAL_DAYS)
  const licenseId = newLicenseId()

  licenseModel.insertTrialActivation({
    id: licenseId,
    deviceId: normalizedDeviceId,
    startedAt: startedAtMs,
    trialExpiresAt: trialExpiresAtMs
  })
  licenseModel.upsertLicenseRecord({
    licenseId,
    edition: 'trial',
    deviceIds: [normalizedDeviceId]
  })

  return signTrialLicense({
    id: licenseId,
    device_id: normalizedDeviceId,
    trial_expires_at: trialExpiresAtMs
  })
}

function redeemPro({ activationCode, deviceId }) {
  const normalizedDeviceId = requireDeviceId(deviceId)
  const code = normalizeActivationCode(activationCode)
  const proCode = licenseModel.getProCode(code)

  if (!proCode) {
    throw licenseError(EC.ACTIVATION_CODE_INVALID, 400, { field: 'code' })
  }
  if (proCode.status === 'unused') {
    throw licenseError(EC.ACTIVATION_CODE_INVALID, 400, { field: 'code' })
  }
  if (proCode.status === 'revoked') {
    throw licenseError(EC.LICENSE_REVOKED, 403, { field: 'code' })
  }

  const licenseId = proCode.license_id
  if (!licenseId) {
    throw licenseError(EC.ACTIVATION_CODE_INVALID, 400, { field: 'code' })
  }

  const record = licenseModel.getLicenseRecord(licenseId)
  if (!record) {
    throw licenseError(EC.ACTIVATION_CODE_INVALID, 400, { field: 'code' })
  }
  if (record.revoked_at) {
    throw licenseError(EC.LICENSE_REVOKED, 403, { field: 'code' })
  }

  const deviceLimit = resolveRecordDeviceLimit(record)
  const deviceIds = record.device_ids || []

  if (deviceIds.includes(normalizedDeviceId)) {
    return {
      license: signLicensePayload(buildProPayload({ deviceIds, licenseId })),
      edition: 'pro'
    }
  }

  const merged = mergeDeviceIds(deviceIds, normalizedDeviceId, deviceLimit)
  const license = signLicensePayload(buildProPayload({ deviceIds: merged, licenseId }))

  licenseModel.upsertLicenseRecord({
    licenseId,
    edition: 'pro',
    deviceIds: merged,
    deviceLimitOverride: record.device_limit_override ?? null
  })

  if (proCode.status === 'fulfilled') {
    licenseModel.markProCodeRedeemed({ code, licenseId })
  }

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

async function fulfillOrder({ email }) {
  const normalizedEmail = requireLicenseEmail(email)

  const pending = licenseModel.getPendingFulfilledProCodeForEmail(normalizedEmail)
  if (pending) {
    throw licenseError(EC.ACTIVATION_CODE_ALREADY_SENT, 409, {
      activation_code: pending.code,
      fulfilled_at: pending.fulfilled_at
    })
  }

  const unused = licenseModel.takeUnusedProCode()
  if (!unused) {
    throw licenseError(EC.ACTIVATION_CODE_POOL_EMPTY, 409)
  }

  const activationCode = unused.code
  const licenseId = newLicenseId()
  licenseModel.markProCodeFulfilled({
    code: activationCode,
    fulfilledEmail: normalizedEmail,
    licenseId
  })
  licenseModel.upsertLicenseRecord({
    licenseId,
    edition: 'pro',
    deviceIds: []
  })

  await licenseEmailService.sendProActivationEmail({
    email: normalizedEmail,
    activationCode
  })

  return {
    email: normalizedEmail,
    activation_code: activationCode
  }
}

function getAdminOverview() {
  const proEntries = licenseModel.listProCodesForAdmin().map((proCode) => {
    const record = proCode.license_id ? licenseModel.getLicenseRecord(proCode.license_id) : null
    return buildProAdminEntry(proCode, record)
  })

  const trialEntries = licenseModel.listTrialActivationsForAdmin().map(buildTrialAdminEntry)

  const entries = [...proEntries, ...trialEntries].sort((a, b) => {
    const timeA = a.redeemed_at ?? a.fulfilled_at ?? a.trial_started_at ?? 0
    const timeB = b.redeemed_at ?? b.fulfilled_at ?? b.trial_started_at ?? 0
    return timeB - timeA
  })

  return {
    unused_codes: licenseModel.countUnusedProCodes(),
    default_device_limit: DEVICE_LIMIT,
    entries
  }
}

function setLicenseDeviceLimit({ activationCode, deviceLimitOverride }) {
  const code = normalizeActivationCode(activationCode)
  const parsed = parseDeviceLimitOverride(deviceLimitOverride)
  const proCode = licenseModel.getProCode(code)

  if (!proCode || !['fulfilled', 'redeemed', 'revoked'].includes(proCode.status) || !proCode.license_id) {
    throw licenseError(EC.ACTIVATION_CODE_INVALID, 400, { field: 'code' })
  }

  licenseModel.setLicenseRecordDeviceLimitOverride({
    licenseId: proCode.license_id,
    deviceLimitOverride: parsed
  })

  const record = licenseModel.getLicenseRecord(proCode.license_id)
  return buildProAdminEntry(proCode, { ...record, device_limit_override: parsed })
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
  if (!record.device_ids.includes(normalizedDeviceId)) {
    throw licenseError(EC.INVALID_DEVICE_ID, 403)
  }

  if (record.edition === 'pro' && payload.edition === 'pro') {
    return {
      license: signLicensePayload(
        buildProPayload({
          deviceIds: record.device_ids,
          licenseId
        }),
      ),
      edition: 'pro'
    }
  }

  if (record.edition === 'trial' && payload.edition === 'trial') {
    const trial = licenseModel.getTrialActivationById(licenseId)
    if (!trial || trial.device_id !== normalizedDeviceId) {
      throw licenseError(EC.INVALID_LICENSE, 400)
    }
    return signTrialLicense(trial)
  }

  throw licenseError(EC.INVALID_LICENSE, 400)
}

function mutateProLicenseByCode({ activationCode, notAllowedCode, assertRecord, apply }) {
  const code = normalizeActivationCode(activationCode)
  const proCode = licenseModel.getProCode(code)
  if (!proCode?.license_id) {
    throw licenseError(notAllowedCode, 400, { field: 'code' })
  }

  const record = licenseModel.getLicenseRecord(proCode.license_id)
  if (!record || record.edition !== 'pro') {
    throw licenseError(notAllowedCode, 400, { field: 'code' })
  }
  assertRecord(record)

  apply(proCode)
  return buildProAdminEntry(proCode, licenseModel.getLicenseRecord(proCode.license_id))
}

function revokeProLicense({ activationCode }) {
  return mutateProLicenseByCode({
    activationCode,
    notAllowedCode: EC.PRO_NOT_REVOKABLE,
    assertRecord: (record) => {
      if (record.revoked_at) {
        throw licenseError(EC.PRO_ALREADY_REVOKED, 409, { field: 'code' })
      }
    },
    apply: (proCode) => {
      licenseModel.revokeLicenseRecord(proCode.license_id)
      licenseModel.markProCodeRevoked({ code: proCode.code })
    }
  })
}

function restoreProLicense({ activationCode }) {
  return mutateProLicenseByCode({
    activationCode,
    notAllowedCode: EC.PRO_NOT_RESTORABLE,
    assertRecord: (record) => {
      if (!record.revoked_at) {
        throw licenseError(EC.PRO_NOT_REVOKED, 409, { field: 'code' })
      }
    },
    apply: (proCode) => {
      licenseModel.restoreLicenseRecord(proCode.license_id)
      licenseModel.markProCodeRestored({ code: proCode.code })
    }
  })
}

module.exports = {
  startTrial,
  redeemPro,
  generateProCodes,
  fulfillOrder,
  getAdminOverview,
  setLicenseDeviceLimit,
  refreshLicense,
  revokeProLicense,
  restoreProLicense
}
