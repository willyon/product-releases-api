/**
 * 许可证 API：解析请求体/查询参数，调用 licenseService。
 */
const licenseService = require('../services/licenseService')
const authService = require('../services/authService')
const { createApiError } = require('../utils/apiError')

function requireEmail(raw) {
  const email = String(raw || '').trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createApiError('邮箱格式无效', 400)
  }
  return email
}

async function sendTrialCode(req, res) {
  const data = await licenseService.sendTrialCode({ email: requireEmail(req.body?.email) })
  res.sendResponse({ message: '试用验证码已发送', data })
}

function activateTrial(req, res) {
  const { code, device_id: deviceId } = req.body || {}
  if (!code || !deviceId) {
    throw createApiError('code 与 device_id 必填', 400)
  }
  const data = licenseService.activateTrial({
    email: requireEmail(req.body?.email),
    code,
    deviceId
  })
  res.sendResponse({ message: '试用已激活', data })
}

function redeemPro(req, res) {
  const { activation_code: activationCode, device_id: deviceId } = req.body || {}
  if (!activationCode || !deviceId) {
    throw createApiError('activation_code 与 device_id 必填', 400)
  }
  const data = licenseService.redeemPro({
    email: requireEmail(req.body?.email),
    activationCode,
    deviceId
  })
  res.sendResponse({ message: '永久激活成功', data })
}

function generateProCodes(req, res) {
  const data = licenseService.generateProCodes({ count: req.body?.count })
  res.sendResponse({ data })
}

async function fulfillOrder(req, res) {
  const data = await licenseService.fulfillOrder({
    email: requireEmail(req.body?.email)
  })
  res.sendResponse({ message: '激活码已发送', data })
}

function getAdminOverview(_req, res) {
  res.sendResponse({ data: licenseService.getAdminOverview() })
}

function setRecipientDeviceLimit(req, res) {
  const data = licenseService.setRecipientDeviceLimit({
    email: requireEmail(req.body?.email),
    deviceLimitOverride: req.body?.device_limit_override ?? null
  })
  res.sendResponse({ message: '设备上限已更新', data })
}

function createLicenseAdminSession(req, res, next) {
  const { username, password } = req.body || {}
  if (!username || !password) {
    return next(createApiError('请填写用户名和密码', 400))
  }
  if (!authService.isLicenseAdminAuthConfigured()) {
    return next(createApiError('服务端未配置 LICENSE_ADMIN_USERNAME / LICENSE_ADMIN_PASSWORD / STATS_JWT_SECRET', 503))
  }
  if (!authService.validateLicenseAdminCredentials(username, password)) {
    return next(createApiError('用户名或密码错误', 401))
  }
  res.sendResponse({ data: { jwtToken: authService.signLicenseAdminToken() } })
}

module.exports = {
  sendTrialCode,
  activateTrial,
  redeemPro,
  generateProCodes,
  fulfillOrder,
  getAdminOverview,
  setRecipientDeviceLimit,
  createLicenseAdminSession
}
