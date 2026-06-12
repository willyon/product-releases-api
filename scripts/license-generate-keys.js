#!/usr/bin/env node
/**
 * 生成 Ed25519 许可证签名密钥对。
 * 用法：node scripts/license-generate-keys.js
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' })
const publicPem = publicKey.export({ type: 'spki', format: 'pem' })

const privateBase64 = Buffer.from(privatePem).toString('base64')
const publicBase64 = Buffer.from(publicPem).toString('base64')

const outDir = path.join(__dirname, '..', 'config')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'license-public.pem'), publicPem, 'utf8')

console.log('Public key: config/license-public.pem（可嵌入桌面 App 验签）')
console.log('')
console.log('# 写入 product-releases-api/.env（勿提交 Git）：')
console.log(`LICENSE_PRIVATE_KEY_BASE64=${privateBase64}`)
console.log(`LICENSE_PUBLIC_KEY_BASE64=${publicBase64}`)
