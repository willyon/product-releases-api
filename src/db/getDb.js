const path = require('path')
const fs = require('fs')
const Database = require('better-sqlite3')

let dbInstance = null

/**
 * 返回单例 SQLite 连接。
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (dbInstance) return dbInstance

  const relative = process.env.STATS_DB_PATH || './data/stats.db'
  const dbPath = path.isAbsolute(relative) ? relative : path.join(__dirname, '..', '..', relative)
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  dbInstance = new Database(dbPath)
  dbInstance.pragma('journal_mode = WAL')
  return dbInstance
}

/**
 * 关闭数据库（优雅退出时调用）。
 * @returns {void}
 */
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
