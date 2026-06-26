const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Resolve DB_PATH relative to this file's directory so it works regardless of CWD
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '../../data/kroomdrive.db');
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password    TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- SSH Server credentials (stored per-server, not per-user)
  CREATE TABLE IF NOT EXISTS servers (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    host          TEXT NOT NULL,
    port          INTEGER NOT NULL DEFAULT 22,
    username      TEXT NOT NULL,
    password      TEXT,
    private_key   TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1,
    conn_type     TEXT NOT NULL DEFAULT 'direct',
    tunnel_url    TEXT,
    cf_service_token_id   TEXT,
    cf_service_token_secret TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Logical storage definitions (maps a name to a remote path on a server)
  CREATE TABLE IF NOT EXISTS storages (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    server_id   TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    root_path   TEXT NOT NULL,
    quota_gb    REAL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Per-user path permissions (which storages/paths they can access)
  CREATE TABLE IF NOT EXISTS user_permissions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    storage_id  TEXT REFERENCES storages(id) ON DELETE CASCADE,
    path        TEXT NOT NULL,
    can_read    INTEGER NOT NULL DEFAULT 1,
    can_write   INTEGER NOT NULL DEFAULT 0,
    can_delete  INTEGER NOT NULL DEFAULT 0,
    quota_bytes INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, path)
  );

  -- Trash records (tracks deleted items for restore)
  CREATE TABLE IF NOT EXISTS trash (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    server_id    TEXT NOT NULL,
    original_path TEXT NOT NULL,
    trash_path   TEXT NOT NULL,
    name         TEXT NOT NULL,
    deleted_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Git credentials per repo path (token or SSH passphrase for private repos)
  CREATE TABLE IF NOT EXISTS git_credentials (
    id          TEXT PRIMARY KEY,
    server_id   TEXT NOT NULL,
    repo_path   TEXT NOT NULL,
    auth_type   TEXT NOT NULL DEFAULT 'token',  -- 'token' | 'ssh'
    username    TEXT,
    token       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(server_id, repo_path)
  );
`);

// ─── Migrations (additive, safe to re-run) ─────────────────────────────────
const migrations = [
  // Add os_type column to servers table for OS detection caching
  `ALTER TABLE servers ADD COLUMN os_type TEXT NOT NULL DEFAULT 'unknown'`,
  // Cloudflare Tunnel support
  `ALTER TABLE servers ADD COLUMN conn_type TEXT NOT NULL DEFAULT 'direct'`,
  `ALTER TABLE servers ADD COLUMN tunnel_url TEXT`,
  `ALTER TABLE servers ADD COLUMN cf_service_token_id TEXT`,
  `ALTER TABLE servers ADD COLUMN cf_service_token_secret TEXT`,
  // Git credentials for private repos
  `CREATE TABLE IF NOT EXISTS git_credentials (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    repo_path TEXT NOT NULL,
    auth_type TEXT NOT NULL DEFAULT 'token',
    username TEXT,
    token TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(server_id, repo_path)
  )`,
];

for (const sql of migrations) {
  try {
    db.prepare(sql).run();
  } catch (e) {
    // Column already exists — ignore
    if (!e.message.includes('duplicate column')) {
      // Only log unexpected errors
    }
  }
}

// ─── Seed admin user on first run ──────────────────────────────────────────
const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
if (!adminExists) {
  const { v4: uuidv4 } = require('uuid');
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare(`
    INSERT INTO users (id, username, password, role)
    VALUES (?, ?, ?, 'admin')
  `).run(uuidv4(), adminUser, hash);
  // Log username only — never log the password
  console.log(`✅ Default admin created — username: ${adminUser}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('⚠️  Using default admin password. Set ADMIN_PASSWORD in .env before going to production!');
  }
}

module.exports = db;
