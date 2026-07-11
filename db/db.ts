// SQLite 接続の共通モジュール。
// Node 標準の node:sqlite を使うため、ネイティブビルド不要。
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ensureMigrationsTable, recordBaseline } from "./migrate-runner.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** DB ファイルのパス（環境変数で上書き可） */
export const DB_PATH = process.env.TRAVEL_DB || join(ROOT, "data", "travel.db");
const SCHEMA_PATH = join(__dirname, "schema.sql");

/**
 * DB を開く（無ければ作成）。schema.sql（最終形）を適用し、
 * マイグレーション管理テーブルと baseline(<=3) を記録して返す。
 *
 * スキーマ変更の反映（version > baseline）は起動時には行わない。
 * サーバーは起動時に版を検証し、本番で未適用があればフェイルファストする
 * （適用は db/migrate.ts / マイグレーション Job で行う）。
 */
export function openDb() {
  // TRAVEL_DB が絶対パス（例: /data/travel.db）でも動くよう親ディレクトリを作る。
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  // Litestream は WAL モードの DB を要求する（本番のレプリケーション前提）。
  // WAL 設定は DB ファイルに永続化され、dev/CLI でも無害。
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  ensureMigrationsTable(db);
  recordBaseline(db); // <=3 を「適用済み」として記録（非破壊・冪等）
  return db;
}
