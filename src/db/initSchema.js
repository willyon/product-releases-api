/**
 * SQLite 表结构（stats + license 共用 product-releases.db）。
 *
 * 时间字段均为 INTEGER 毫秒时间戳。
 * pro_activation_codes.status: unused | fulfilled | redeemed | revoked
 */
function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS counters (
      product_key TEXT NOT NULL,
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER,
      PRIMARY KEY (product_key, name)
    );

    CREATE TABLE IF NOT EXISTS trial_activations (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      started_at INTEGER NOT NULL,
      trial_expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pro_activation_codes (
      code TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      fulfilled_email TEXT,
      fulfilled_at INTEGER,
      redeemed_at INTEGER,
      license_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pro_codes_status ON pro_activation_codes(status);
    CREATE INDEX IF NOT EXISTS idx_pro_codes_fulfilled_email ON pro_activation_codes(fulfilled_email);

    CREATE TABLE IF NOT EXISTS license_records (
      license_id TEXT PRIMARY KEY,
      edition TEXT NOT NULL,
      device_ids_json TEXT NOT NULL,
      device_limit_override INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_license_records_edition ON license_records(edition);
  `)
}

module.exports = { initSchema }
