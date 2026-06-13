/**
 * Ed25519 签名与 license payload 构建（桌面端验签须字段排序 JSON 一致）。
 */
const crypto = require('crypto')
const CustomError = require('../errors/customError')
const { ERROR_CODES: EC } = require('../constants/messageCodes')
const { nowMs, msToIso } = require('./licenseCrypto')

function loadPrivateKey() {
  const pemBase64 = String(process.env.LICENSE_PRIVATE_KEY_BASE64 || '').trim()
  if (!pemBase64) {
    throw new CustomError({ httpStatus: 503, messageCode: EC.LICENSE_SIGNING_KEY_NOT_CONFIGURED })
  }
  const pem = Buffer.from(pemBase64, 'base64').toString('utf8')
  return crypto.createPrivateKey(pem)
}

function buildTrialPayload({ emailHash, deviceIds, trialExpiresAtMs, licenseId }) {
  return {
    v: 1,
    edition: 'trial',
    email_hash: emailHash,
    trial_expires_at: msToIso(trialExpiresAtMs),
    pro_activated_at: null,
    device_ids: deviceIds,
    issued_at: msToIso(nowMs()),
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

function canonicalPayloadJson(payload) {
  return JSON.stringify(payload, Object.keys(payload).sort())
}

function signLicensePayload(payload) {
  const privateKey = loadPrivateKey()
  const message = Buffer.from(canonicalPayloadJson(payload), 'utf8')
  const signature = crypto.sign(null, message, privateKey)
  return {
    payload,
    signature: signature.toString('base64')
  }
}

module.exports = { buildTrialPayload, buildProPayload, canonicalPayloadJson, signLicensePayload }
