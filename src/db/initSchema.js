/**
 * SQLite 表结构（stats + license 共用 product-releases.db）。
 *
 * 时间字段均为 INTEGER 毫秒时间戳。
 * pro_activation_codes.status: unused | fulfilled | redeemed | revoked
 */
function initSchema(db) {
  db.exec(`
    -- 下载站按 product_key 计数
    CREATE TABLE IF NOT EXISTS counters (
      product_key TEXT NOT NULL,
      name TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER,
      PRIMARY KEY (product_key, name)
    );

    -- 一邮箱终身一次试用
    CREATE TABLE IF NOT EXISTS trial_activations (
      id TEXT PRIMARY KEY,
      email_hash TEXT NOT NULL UNIQUE,
      started_at INTEGER NOT NULL,
      trial_expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Pro 码 XXXX-XXXX-XXXX
    CREATE TABLE IF NOT EXISTS pro_activation_codes (
      code TEXT PRIMARY KEY,
      email_hash TEXT,
      status TEXT NOT NULL,
      fulfilled_at INTEGER,
      redeemed_at INTEGER,
      license_id TEXT,
      note TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pro_codes_status ON pro_activation_codes(status);
    CREATE INDEX IF NOT EXISTS idx_pro_codes_email_hash ON pro_activation_codes(email_hash);

    CREATE TABLE IF NOT EXISTS order_fulfillments (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_hash TEXT NOT NULL,
      activation_code TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 12800,
      payment_note TEXT,
      fulfilled_at INTEGER NOT NULL,
      redeemed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_order_fulfillments_email_hash ON order_fulfillments(email_hash);

    CREATE TABLE IF NOT EXISTS license_records (
      license_id TEXT PRIMARY KEY,
      email_hash TEXT NOT NULL,
      edition TEXT NOT NULL,
      device_ids_json TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_license_records_email_hash ON license_records(email_hash);

    CREATE TABLE IF NOT EXISTS license_email_verification_codes (
      email_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_license_email_codes_email_hash ON license_email_verification_codes(email_hash);
  `)
}

module.exports = { initSchema }
