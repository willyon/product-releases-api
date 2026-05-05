module.exports = function createCountersTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS counters (
      product_key TEXT NOT NULL,
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER,
      PRIMARY KEY (product_key, name)
    );
  `)
}
