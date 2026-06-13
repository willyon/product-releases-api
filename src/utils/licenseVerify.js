/**
 * 服务端验签（与 Electron licenseVerifier.cjs 一致）。
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { canonicalPayloadJson } = require('./licenseSigning')

let cachedPublicKey = null

function loadPublicKey() {
  if (cachedPublicKey) return cachedPublicKey
  const pemPath = path.join(__dirname, '../../config/license-public.pem')
  cachedPublicKey = crypto.createPublicKey(fs.readFileSync(pemPath, 'utf8'))
  return cachedPublicKey
}

function verifyLicenseFile(licenseFile) {
  if (!licenseFile?.payload || !licenseFile?.signature) return false
  try {
    const message = Buffer.from(canonicalPayloadJson(licenseFile.payload), 'utf8')
    const signature = Buffer.from(String(licenseFile.signature), 'base64')
    return crypto.verify(null, message, loadPublicKey(), signature)
  } catch {
    return false
  }
}

module.exports = { verifyLicenseFile }
