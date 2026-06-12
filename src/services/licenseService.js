/**
 * 许可证核心业务。
 *
 * 试用：sendTrialCode → activateTrial（写 trial_activations + 签名 license）
 * 永久版：码池 unused → fulfill 绑邮箱 → redeemPro（可同码追加第二台设备）
 */
const { createApiError } = require('../utils/apiError')
const { signLicensePayload } = require('../utils/licenseSigning')
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
  addDaysMs,
  msToIso
} = require('../utils/licenseCrypto')
const licenseModel = require('../models/licenseModel')
const licenseEmailService = require('./licenseEmailService')

const TRIAL_DAYS = Number(process.env.LICENSE_TRIAL_DAYS || 14)
const DEVICE_LIMIT = Number(process.env.LICENSE_DEVICE_LIMIT || 2)
const isDev = process.env.NODE_ENV === 'development'
const SEND_CODE_COOLDOWN_SECONDS = Number(
  process.env.LICENSE_SEND_CODE_COOLDOWN_SECONDS ?? (isDev ? 0 : 60)
)
const VERIFICATION_TTL_MINUTES = Number(
  process.env.LICENSE_VERIFICATION_TTL_MINUTES ?? (isDev ? 1440 : 10)
)

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
    throw createApiError('device_limit_override 须为 null（默认）、0（不限）或 1–9999', 400)
  }
  return n
}

function mergeDeviceIds(existingDeviceIds, deviceId, deviceLimit) {
  const merged = [...new Set([...(existingDeviceIds || []), deviceId])]
  if (deviceLimit != null && merged.length > deviceLimit) {
    const err = createApiError('设备数量已达上限', 403)
    err.public = { device_limit: deviceLimit }
    throw err
  }
  return merged
}

function buildTrialPayload({ emailHash, deviceId, trialExpiresAtMs, licenseId }) {
  const issuedAtMs = nowMs()
  return {
    v: 1,
    edition: 'trial',
    email_hash: emailHash,
    trial_expires_at: msToIso(trialExpiresAtMs),
    pro_activated_at: null,
    device_ids: [deviceId],
    issued_at: msToIso(issuedAtMs),
    license_id: licenseId
  }
}

function buildProPayload({ emailHash, deviceIds, licenseId }) {
  const activatedAtMs = nowMs()
  return {
    v: 1,
    edition: 'pro',
    email_hash: emailHash,
    trial_expires_at: null,
    pro_activated_at: msToIso(activatedAtMs),
    device_ids: deviceIds,
    issued_at: msToIso(activatedAtMs),
    license_id: licenseId
  }
}

function requireDeviceId(deviceId) {
  try {
    return assertDeviceId(deviceId)
  } catch {
    throw createApiError('device_id 无效', 400)
  }
}

/** 单邮箱在运维列表中的快照（contact 来自 listAllLicenseContacts 或刚更新的 override） */
function buildRecipientSnapshot(emailHash, email, contact = {}) {
  const trial = licenseModel.getTrialActivationByEmailHash(emailHash)
  const proCode = licenseModel.getFulfilledProCodeForEmail(emailHash)
  const activeRecord = licenseModel.getActiveLicenseRecordForEmail(emailHash)
  const deviceLimitOverride = contact.device_limit_override ?? null
  const deviceLimit = effectiveDeviceLimit(deviceLimitOverride)

  let deviceCount = 0
  let deviceIds = []
  if (proCode?.license_id) {
    const record = licenseModel.getLicenseRecord(proCode.license_id)
    deviceIds = record?.device_ids || []
    deviceCount = deviceIds.length
  }

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
    device_count: deviceCount,
    device_limit: deviceLimit,
    device_limit_override: deviceLimitOverride,
    device_ids: deviceIds
  }
}

async function sendTrialCode({ email }) {
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)

  if (licenseModel.getTrialActivationByEmailHash(emailHash)) {
    throw createApiError('该邮箱已使用过试用', 409)
  }

  const sinceMs = nowMs() - SEND_CODE_COOLDOWN_SECONDS * 1000
  if (licenseModel.getVerificationCodeCreatedWithin(emailHash, sinceMs)) {
    throw createApiError('请求过于频繁，请稍后再试', 429)
  }

  const code = generateNumericCode(6)
  licenseModel.insertVerificationCode({
    emailHash,
    codeHash: hashVerificationCode(code),
    expiresAt: nowMs() + VERIFICATION_TTL_MINUTES * 60 * 1000
  })

  licenseModel.upsertLicenseContact({ email: normalizedEmail, emailHash })

  await licenseEmailService.sendTrialVerificationEmail({ email: normalizedEmail, code })

  return { expires_in_seconds: VERIFICATION_TTL_MINUTES * 60 }
}

function activateTrial({ email, code, deviceId }) {
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)
  const normalizedDeviceId = requireDeviceId(deviceId)

  if (licenseModel.getTrialActivationByEmailHash(emailHash)) {
    throw createApiError('该邮箱已使用过试用', 409)
  }

  const stored = licenseModel.getLatestVerificationCode(emailHash)
  if (!stored || stored.expires_at < nowMs()) {
    throw createApiError('验证码无效或已过期', 400)
  }

  if (stored.code_hash !== hashVerificationCode(String(code || '').trim())) {
    throw createApiError('验证码无效或已过期', 400)
  }

  const startedAtMs = nowMs()
  const trialExpiresAtMs = addDaysMs(TRIAL_DAYS)
  const licenseId = newLicenseId()
  const license = signLicensePayload(
    buildTrialPayload({
      emailHash,
      deviceId: normalizedDeviceId,
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
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)
  const normalizedDeviceId = requireDeviceId(deviceId)
  const code = normalizeActivationCode(activationCode)
  const contact = licenseModel.getLicenseContactByEmailHash(emailHash)
  const deviceLimit = effectiveDeviceLimit(contact?.device_limit_override)

  const proCode = licenseModel.getProCode(code)
  if (!proCode) {
    throw createApiError('激活码无效', 400)
  }
  if (proCode.email_hash && proCode.email_hash !== emailHash) {
    throw createApiError('邮箱与激活码不匹配', 400)
  }
  if (proCode.status !== 'fulfilled' && proCode.status !== 'redeemed') {
    throw createApiError('激活码无效', 400)
  }
  if (proCode.status === 'fulfilled' && !proCode.email_hash) {
    throw createApiError('激活码无效', 400)
  }

  if (proCode.status === 'redeemed') {
    const licenseId = proCode.license_id
    if (!licenseId) {
      throw createApiError('激活码已被使用', 409)
    }
    const record = licenseModel.getLicenseRecord(licenseId)
    if (!record || record.email_hash !== emailHash) {
      throw createApiError('激活码已被使用', 409)
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
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)

  if (requireTrialCode && !licenseModel.getTrialActivationByEmailHash(emailHash)) {
    throw createApiError('该邮箱尚未激活试用，无法发码', 400)
  }

  const existingCode = licenseModel.getFulfilledProCodeForEmail(emailHash)
  if (existingCode?.status === 'fulfilled') {
    const err = createApiError('该邮箱已发过激活码', 409)
    err.public = {
      activation_code: existingCode.code,
      fulfilled_at: existingCode.fulfilled_at
    }
    throw err
  }

  const unused = licenseModel.takeUnusedProCode()
  if (!unused) {
    throw createApiError('激活码池已用尽，请先生成新码', 409)
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

function sortAdminRecipients(recipients) {
  const rank = (row) => {
    if (!row.fulfilled && row.can_fulfill) return 0
    if (row.code_status === 'fulfilled') return 1
    if (!row.fulfilled && !row.can_fulfill) return 2
    if (row.code_status === 'redeemed') return 3
    return 4
  }
  recipients.sort((a, b) => {
    const rankDiff = rank(a) - rank(b)
    if (rankDiff !== 0) return rankDiff
    return (b.fulfilled_at ?? b.redeemed_at ?? 0) - (a.fulfilled_at ?? a.redeemed_at ?? 0)
  })
}

/** 运维页一览：码池 + 全部已知邮箱（无分页，一次返回） */
function getAdminOverview() {
  const contacts = licenseModel.listAllLicenseContacts()
  const recipients = contacts.map((contact) =>
    buildRecipientSnapshot(contact.email_hash, contact.email, contact),
  )

  sortAdminRecipients(recipients)

  return {
    unused_codes: licenseModel.countUnusedProCodes(),
    default_device_limit: DEVICE_LIMIT,
    recipients
  }
}

function setRecipientDeviceLimit({ email, deviceLimitOverride }) {
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)
  const parsed = parseDeviceLimitOverride(deviceLimitOverride)

  licenseModel.setLicenseContactDeviceLimit({
    email: normalizedEmail,
    emailHash,
    deviceLimitOverride: parsed
  })

  return buildRecipientSnapshot(emailHash, normalizedEmail, { device_limit_override: parsed })
}

module.exports = {
  sendTrialCode,
  activateTrial,
  redeemPro,
  generateProCodes,
  fulfillOrder,
  getAdminOverview,
  setRecipientDeviceLimit
}
