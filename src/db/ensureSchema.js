const fs = require('fs')
const path = require('path')
const { getDb } = require('./getDb')

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)
}

function getMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.js'))
    .sort((a, b) => a.localeCompare(b))
}

function ensureSchemaInitialized() {
  const db = getDb()
  ensureMigrationsTable(db)

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC').all().map((r) => r.id)
  )

  for (const fileName of getMigrationFiles()) {
    const migrationId = fileName.replace(/\.js$/, '')
    if (applied.has(migrationId)) continue

    const runMigration = require(path.join(MIGRATIONS_DIR, fileName))
    db.exec('BEGIN')
    try {
      runMigration(db)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migrationId, Date.now())
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
}

module.exports = { ensureSchemaInitialized }
