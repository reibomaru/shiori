// SQLite 接続の共通モジュール。
// Node 標準の node:sqlite を使うため、ネイティブビルド不要。
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** DB ファイルのパス（環境変数で上書き可） */
export const DB_PATH = process.env.TRAVEL_DB || join(ROOT, "data", "travel.db");
const SCHEMA_PATH = join(__dirname, "schema.sql");

/** DB を開く（無ければ作成）。スキーマも適用済みにして返す。 */
export function openDb() {
  mkdirSync(join(ROOT, "data"), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  migrate(db);
  return db;
}

/** 既存 DB 向けの軽量マイグレーション（CREATE TABLE IF NOT EXISTS は列追加しないため）。 */
function migrate(db: DatabaseSync): void {
  addColumnIfMissing(db, "spots", "icon", "TEXT");
  addColumnIfMissing(db, "spots", "instagram", "TEXT");
  addColumnIfMissing(db, "spots", "google_maps_url", "TEXT");
  addColumnIfMissing(db, "trip", "memo", "TEXT");
  // 旅程の予定を移動区間（legs）に紐づける参照。
  addColumnIfMissing(db, "items", "leg_id", "INTEGER REFERENCES legs(id) ON DELETE SET NULL");
  // 旧「行きたい度」は廃止（評価は Google マップのリンク先で確認する方針）。
  dropColumnIfExists(db, "spots", "want_level");
}

function addColumnIfMissing(db: DatabaseSync, table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function dropColumnIfExists(db: DatabaseSync, table: string, column: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
  }
}
