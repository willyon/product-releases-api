#!/usr/bin/env node
/**
 * 运维：批量生成永久激活码写入码池（status=unused）。
 * 用法：node scripts/license-generate-codes.js 20
 * 需 .env 与可写的 DB_PATH（或先 npm run dev 触发建表）
 */
require('dotenv').config()
const licenseService = require('../src/services/licenseService')

const count = Number(process.argv[2] || 10)
console.log(JSON.stringify(licenseService.generateProCodes({ count }), null, 2))
