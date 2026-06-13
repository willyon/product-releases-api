#!/usr/bin/env node
/**
 * 一次性迁移：为 license_records 增加 revoked_at 列（Pro 吊销时间戳）。
 *
 * 用法（在项目根目录，API 已停或仅读无妨）：
 *   node scripts/migrate-add-license-revoked-at.js
 *
 * 仅对「此列创建前」已有的 product-releases.db 执行一次。
 * 全新库由 initSchema 建表时已含该列，无需运行。
 */
require('dotenv').config()

const { getDb } = require('../src/db/getDb')

const db = getDb()
const columns = db.prepare('PRAGMA table_info(license_records)').all()
if (columns.some((col) => col.name === 'revoked_at')) {
  console.log('license_records.revoked_at 已存在，跳过')
  process.exit(0)
}

db.exec('ALTER TABLE license_records ADD COLUMN revoked_at INTEGER')
console.log('已添加 license_records.revoked_at')
