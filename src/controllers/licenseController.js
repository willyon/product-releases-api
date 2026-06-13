/**
 * 许可证 API：解析请求体/查询参数，调用 licenseService。
 */
const licenseService = require('../services/licenseService')
const authService = require('../services/authService')
const { TRIAL_DAYS, DEVICE_LIMIT } = require('../config/licenseConfig')
const CustomError = require('../errors/customError')
const { SUCCESS_CODES: SC, ERROR_CODES: EC } = require('../constants/messageCodes')

function startTrial(req, res) {
  const { device_id: deviceId } = req.body || {}
  if (!deviceId) {
    throw new CustomError({ httpStatus: 400, messageCode: EC.MISSING_REQUIRED_FIELDS })
  }
  const data = licenseService.startTrial({ deviceId })
  res.sendResponse({ messageCode: SC.TRIAL_STARTED, data })
}

function redeemPro(req, res) {
  const { activation_code: activationCode, device_id: deviceId } = req.body || {}
  if (!activationCode || !deviceId) {
    throw new CustomError({ httpStatus: 400, messageCode: EC.MISSING_REQUIRED_FIELDS })
  }
  const data = licenseService.redeemPro({ activationCode, deviceId })
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

function setLicenseDeviceLimit(req, res) {
  const activationCode = req.body?.activation_code
  if (!activationCode) {
    throw new CustomError({ httpStatus: 400, messageCode: EC.MISSING_REQUIRED_FIELDS })
  }
  const data = licenseService.setLicenseDeviceLimit({
    activationCode,
    deviceLimitOverride: req.body?.device_limit_override ?? null
  })
  res.sendResponse({ messageCode: SC.DEVICE_LIMIT_UPDATED, data })
}

function revokeProLicense(req, res) {
  const activationCode = req.body?.activation_code
  if (!activationCode) {
    throw new CustomError({ httpStatus: 400, messageCode: EC.MISSING_REQUIRED_FIELDS })
  }
  const data = licenseService.revokeProLicense({ activationCode })
  res.sendResponse({ messageCode: SC.PRO_REVOKED, data })
}

function restoreProLicense(req, res) {
  const activationCode = req.body?.activation_code
  if (!activationCode) {
    throw new CustomError({ httpStatus: 400, messageCode: EC.MISSING_REQUIRED_FIELDS })
  }
  const data = licenseService.restoreProLicense({ activationCode })
  res.sendResponse({ messageCode: SC.PRO_RESTORED, data })
}

function createLicenseAdminSession(req, res) {
  const jwtToken = authService.loginLicenseAdmin(req)
  res.sendResponse({ messageCode: SC.ADMIN_LOGIN_SUCCESS, data: { jwtToken } })
}

module.exports = {
  startTrial,
  redeemPro,
  refreshLicense,
  generateProCodes,
  fulfillOrder,
  getPublicConfig,
  getAdminOverview,
  setLicenseDeviceLimit,
  revokeProLicense,
  restoreProLicense,
  createLicenseAdminSession
}
