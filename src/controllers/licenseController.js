/**
 * 许可证 API：解析请求体/查询参数，调用 licenseService。
 * 邮箱格式在此校验；device_id / 激活码等业务规则在 service 层。
 */
const licenseService = require('../services/licenseService')
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
    email: requireEmail(req.body?.email),
    paymentNote: req.body?.payment_note,
    amountCents: req.body?.amount_cents
  })
  res.sendResponse({ message: '激活码已发送', data })
}

function getLicenseStatus(req, res) {
  const data = licenseService.getLicenseStatus({ email: requireEmail(req.query?.email) })
  res.sendResponse({ data })
}

module.exports = {
  sendTrialCode,
  activateTrial,
  redeemPro,
  generateProCodes,
  fulfillOrder,
  getLicenseStatus
}
