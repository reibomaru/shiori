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
  return db;
}
