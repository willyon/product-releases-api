/**
 * Ed25519 签名：服务端用私钥签 license payload，桌面 App 用公钥本地验签。
 * 公钥文件 config/license-public.pem（generate-keys 脚本生成，嵌入 Electron）。
 */
const crypto = require('crypto')
const { createApiError } = require('./apiError')

function loadPrivateKey() {
  const pemBase64 = String(process.env.LICENSE_PRIVATE_KEY_BASE64 || '').trim()
  if (!pemBase64) {
    throw createApiError('许可证签名私钥未配置', 503)
  }
  const pem = Buffer.from(pemBase64, 'base64').toString('utf8')
  return crypto.createPrivateKey(pem)
}

function signLicensePayload(payload) {
  const privateKey = loadPrivateKey()
  // 字段排序后 JSON 串行化，保证验签时 canonical 一致
  const message = Buffer.from(JSON.stringify(payload, Object.keys(payload).sort()), 'utf8')
  const signature = crypto.sign(null, message, privateKey)
  return {
    payload,
    signature: signature.toString('base64')
  }
}

module.exports = { signLicensePayload }
