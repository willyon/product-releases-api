/**
 * 许可证 API：解析请求体/查询参数，调用 licenseService。
 */
const licenseService = require('../services/licenseService')
const authService = require('../services/authService')
const { TRIAL_DAYS, DEVICE_LIMIT } = require('../config/licenseConfig')
const CustomError = require('../errors/customError')
const { SUCCESS_CODES: SC, ERROR_CODES: EC } = require('../constants/messageCodes')

async function sendTrialCode(req, res) {
  await licenseService.sendTrialCode({ email: req.body?.email })
  res.sendResponse({ messageCode: SC.TRIAL_CODE_SENT })
}

function activateTrial(req, res) {
  const { code, device_id: deviceId } = req.body || {}
  if (!code || !deviceId) {
    throw new CustomError({ httpStatus: 400, messageCode: EC.MISSING_REQUIRED_FIELDS })
  }
  const data = licenseService.activateTrial({
    email: req.body?.email,
    code,
    deviceId
  })
  res.sendResponse({ messageCode: SC.TRIAL_ACTIVATED, data })
}

function redeemPro(req, res) {
  const { activation_code: activationCode, device_id: deviceId } = req.body || {}
  if (!activationCode || !deviceId) {
    throw new CustomError({ httpStatus: 400, messageCode: EC.MISSING_REQUIRED_FIELDS })
  }
  const data = licenseService.redeemPro({
    email: req.body?.email,
    activationCode,
    deviceId
  })
  res.sendResponse({ messageCode: SC.PRO_REDEEMED, data })
}

function refreshLicense(req, res) {
  const { license, device_id: deviceId } = req.body || {}
  if (!license || !deviceId) {
    throw new CustomError({ httpStatus: 400, messageCode: EC.MISSING_REQUIRED_FIELDS })
  }
  const data = licenseService.refreshLicense({ license, deviceId })
  res.sendResponse({ messageCode: SC.LICENSE_REFRESHED, data })
}

function generateProCodes(req, res) {
  const data = licenseService.generateProCodes({ count: req.body?.count })
  res.sendResponse({ data })
}

async function fulfillOrder(req, res) {
  const data = await licenseService.fulfillOrder({ email: req.body?.email })
  res.sendResponse({ messageCode: SC.PRO_ACTIVATION_CODE_SENT, data })
}

function getPublicConfig(_req, res) {
  res.sendResponse({ data: { trialDays: TRIAL_DAYS, deviceLimit: DEVICE_LIMIT } })
}

function getAdminOverview(_req, res) {
  res.sendResponse({ data: licenseService.getAdminOverview() })
}

function setRecipientDeviceLimit(req, res) {
  const data = licenseService.setRecipientDeviceLimit({
    email: req.body?.email,
    deviceLimitOverride: req.body?.device_limit_override ?? null
  })
  res.sendResponse({ messageCode: SC.DEVICE_LIMIT_UPDATED, data })
}

function revokeProLicense(req, res) {
  const data = licenseService.revokeProLicense({ email: req.body?.email })
  res.sendResponse({ messageCode: SC.PRO_REVOKED, data })
}

function restoreProLicense(req, res) {
  const data = licenseService.restoreProLicense({ email: req.body?.email })
  res.sendResponse({ messageCode: SC.PRO_RESTORED, data })
}

function createLicenseAdminSession(req, res) {
  const jwtToken = authService.loginLicenseAdmin(req)
  res.sendResponse({ messageCode: SC.ADMIN_LOGIN_SUCCESS, data: { jwtToken } })
}

module.exports = {
  sendTrialCode,
  activateTrial,
  redeemPro,
  refreshLicense,
  generateProCodes,
  fulfillOrder,
  getPublicConfig,
  getAdminOverview,
  setRecipientDeviceLimit,
  revokeProLicense,
  restoreProLicense,
  createLicenseAdminSession
}
