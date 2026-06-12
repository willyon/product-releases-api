#!/usr/bin/env node
/**
 * 验证期 fulfill：确认到账后发永久激活码。
 * 用法：node scripts/license-fulfill.js user@example.com
 */
require('dotenv').config()
const licenseService = require('../src/services/licenseService')

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: node scripts/license-fulfill.js <email>')
    process.exit(1)
  }
  console.log(JSON.stringify(await licenseService.fulfillOrder({ email, requireTrialCode: false }), null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
