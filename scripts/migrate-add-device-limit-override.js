#!/usr/bin/env node
/**
 * 一次性迁移：为 license_contacts 增加 device_limit_override 列。
 *
 * 用法（在项目根目录，API 已停或仅读无妨）：
 *   node scripts/migrate-add-device-limit-override.js
 *
 * 仅对「此列创建前」已有的 product-releases.db 执行一次。
 * 全新库由 initSchema 建表时已含该列，无需运行。
 */
require('dotenv').config()

const { getDb } = require('../src/db/getDb')

const db = getDb()
db.exec('ALTER TABLE license_contacts ADD COLUMN device_limit_override INTEGER')
console.log('已添加 license_contacts.device_limit_override')
