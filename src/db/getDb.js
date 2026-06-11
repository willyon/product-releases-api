/**
 * SQLite 单例；路径由 .env DB_PATH 指定（默认 ./data/product-releases.db）。
 * 首次 getDb() 时建表；Docker 数据卷挂载 /app/data 持久化。
 */
const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')
const { initSchema } = require('./initSchema')

let dbInstance = null

function getDb() {
  if (dbInstance) return dbInstance

  const relative = process.env.DB_PATH || './data/product-releases.db'
  const dbPath = path.isAbsolute(relative) ? relative : path.join(__dirname, '..', '..', relative)
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  dbInstance = new Database(dbPath)
  dbInstance.pragma('journal_mode = WAL')
  initSchema(dbInstance)
  return dbInstance
}

function closeDb() {
  if (dbInstance) {
    try {
      dbInstance.close()
    } catch {
      // ignore
    }
    dbInstance = null
  }
}

module.exports = { getDb, closeDb }
