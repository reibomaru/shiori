-- ============================================================
--  TEXT(UUID) 主キーに NOT NULL を明示する。
--
--  SQLite では INTEGER PRIMARY KEY(=rowid) と違い、非 integer の PRIMARY KEY は
--  PRIMARY KEY だけでは NULL を弾かない（後方互換のための既知仕様。NULL id や複数 NULL が通る）。
--  Skill の直接 SQL・手書き INSERT でも NULL id を防ぐため、全 UUID PK に NOT NULL を付ける。
--
--   ドメイン7テーブルは drop → schema.sql（NOT NULL 付き）で再作成 → seed し直す方針のため
--  ここでは DROP のみ。chat_sessions は行を保持したまま再構築する。
--    実行手順:  sqlite3 data/travel.db < db/migrations/0003_pk_not_null.sql
--               node db/seed.ts --reset
-- ============================================================
PRAGMA foreign_keys=OFF;
BEGIN;

-- chat_sessions: id を NOT NULL 化（行は保持）
CREATE TABLE chat_sessions_new (
  id            TEXT PRIMARY KEY NOT NULL,
  session_file  TEXT,
  title         TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);
INSERT INTO chat_sessions_new SELECT * FROM chat_sessions WHERE id IS NOT NULL;
DROP TABLE chat_sessions;
ALTER TABLE chat_sessions_new RENAME TO chat_sessions;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- ドメインテーブルは drop（schema.sql で NOT NULL 付き再作成 → seed）
DROP TABLE IF EXISTS spot_place_cache;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS days;
DROP TABLE IF EXISTS legs;
DROP TABLE IF EXISTS route;
DROP TABLE IF EXISTS budget;
DROP TABLE IF EXISTS spots;

COMMIT;
PRAGMA foreign_keys=ON;
