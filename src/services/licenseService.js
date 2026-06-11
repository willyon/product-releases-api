/**
 * 许可证核心业务。
 *
 * 试用：sendTrialCode → activateTrial（写 trial_activations + 签名 license）
 * Pro：码池 unused → fulfill 绑邮箱 → redeemPro（可同码追加第二台设备）
 *
 * 返回给 Electron 的 license = { payload, signature }，本地验签后存 license.json
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
const SEND_CODE_COOLDOWN_SECONDS = Number(process.env.LICENSE_SEND_CODE_COOLDOWN_SECONDS || 60)
const VERIFICATION_TTL_MINUTES = Number(process.env.LICENSE_VERIFICATION_TTL_MINUTES || 10)

/** 写入 Ed25519 签名的 payload 结构（字段名与桌面端验签约定一致） */
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

function assertNotRevoked(licenseId) {
  const record = licenseModel.getLicenseRecord(licenseId)
  if (record?.revoked) {
    throw createApiError('授权已被吊销', 403)
  }
}

function mergeDeviceIds(existingDeviceIds, deviceId) {
  const merged = [...new Set([...(existingDeviceIds || []), deviceId])]
  if (merged.length > DEVICE_LIMIT) {
    const err = createApiError('设备数量已达上限', 403)
    err.public = { device_limit: DEVICE_LIMIT }
    throw err
  }
  return merged
}

function parseDeviceId(deviceId) {
  try {
    return assertDeviceId(deviceId)
  } catch {
    throw createApiError('device_id 无效', 400)
  }
}

async function sendTrialCode({ email }) {
  // 仅发邮件验证码，不写 trial_activations；防刷：一邮箱一次试用 + 发码冷却
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
  const expiresAt = nowMs() + VERIFICATION_TTL_MINUTES * 60 * 1000
  licenseModel.insertVerificationCode({
    emailHash,
    codeHash: hashVerificationCode(code),
    expiresAt
  })

  await licenseEmailService.sendTrialVerificationEmail({ email: normalizedEmail, code })

  return {
    email: normalizedEmail,
    expires_in_seconds: VERIFICATION_TTL_MINUTES * 60
  }
}

function activateTrial({ email, code, deviceId }) {
  // 验证通过后才写库并签发 license；14 天从此时起算
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)
  const normalizedDeviceId = parseDeviceId(deviceId)

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
  // status=redeemed 时：同邮箱 + 同码可追加第二台设备（不超过 DEVICE_LIMIT）
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)
  const normalizedDeviceId = parseDeviceId(deviceId)
  const code = normalizeActivationCode(activationCode)

  const proCode = licenseModel.getProCode(code)
  if (!proCode) {
    throw createApiError('激活码无效', 400)
  }
  if (proCode.status === 'revoked') {
    throw createApiError('授权已被吊销', 403)
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
    // 第二台及以后：不再改 pro_activation_codes 状态，只更新 license_records.device_ids
    const licenseId = proCode.license_id
    if (!licenseId) {
      throw createApiError('激活码已被使用', 409)
    }
    assertNotRevoked(licenseId)
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
    const merged = mergeDeviceIds(deviceIds, normalizedDeviceId)
    const license = signLicensePayload(buildProPayload({ emailHash, deviceIds: merged, licenseId }))
    licenseModel.upsertLicenseRecord({ licenseId, emailHash, edition: 'pro', deviceIds: merged })
    return { license, edition: 'pro' }
  }

  const activeRecord = licenseModel.getActiveLicenseRecordForEmail(emailHash)
  let deviceIds = [normalizedDeviceId]
  let licenseId = proCode.license_id || newLicenseId()

  if (activeRecord?.license_id) {
    licenseId = activeRecord.license_id
    assertNotRevoked(licenseId)
    const record = licenseModel.getLicenseRecord(licenseId)
    deviceIds = mergeDeviceIds(record.device_ids, normalizedDeviceId)
  }

  const license = signLicensePayload(buildProPayload({ emailHash, deviceIds, licenseId }))

  licenseModel.markProCodeRedeemed({ code, licenseId })
  licenseModel.markFulfillmentRedeemed(emailHash, code)
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
  return { codes, count: codes.length }
}

async function fulfillOrder({ email, paymentNote, amountCents }) {
  // 从 unused 码池取码 → 绑 email_hash → 发邮件；order_fulfillments 留明文邮箱便于对账
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)

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
  const fulfillmentId = newLicenseId()
  licenseModel.markProCodeFulfilled({
    code: activationCode,
    emailHash,
    note: paymentNote || null
  })
  licenseModel.insertOrderFulfillment({
    id: fulfillmentId,
    email: normalizedEmail,
    emailHash,
    activationCode,
    amountCents: Number(amountCents) || 12800,
    paymentNote: paymentNote || null
  })

  await licenseEmailService.sendProActivationEmail({
    email: normalizedEmail,
    activationCode
  })

  return {
    fulfillment_id: fulfillmentId,
    email: normalizedEmail,
    activation_code: activationCode,
    email_sent: true
  }
}

function getLicenseStatus({ email }) {
  const normalizedEmail = normalizeEmail(email)
  const emailHash = hashEmail(normalizedEmail)
  const trial = licenseModel.getTrialActivationByEmailHash(emailHash)
  const fulfillment = licenseModel.getLatestFulfillmentForEmail(emailHash)
  const proCode = licenseModel.getFulfilledProCodeForEmail(emailHash)
  const activeRecord = licenseModel.getActiveLicenseRecordForEmail(emailHash)

  return {
    email: normalizedEmail,
    trial_used: Boolean(trial),
    trial_expires_at: trial?.trial_expires_at || null,
    fulfilled: Boolean(fulfillment),
    activation_code_status: proCode?.status || null,
    active_edition: activeRecord?.edition || null,
    unused_codes: licenseModel.countUnusedProCodes()
  }
}

module.exports = {
  sendTrialCode,
  activateTrial,
  redeemPro,
  generateProCodes,
  fulfillOrder,
  getLicenseStatus
}
