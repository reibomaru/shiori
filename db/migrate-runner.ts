// ============================================================
//  versioned migration ランナー（純関数群。DB は引数で受け取る）。
//
//  - db/migrations/NNNN_*.sql を連番で管理する。
//  - schema_migrations テーブルで適用済み version を記録する。
//  - schema.sql は「0003 適用後の最終形」。<= BASELINE_VERSION の
//    マイグレーションは schema.sql に畳み込み済みとして扱い、
//    実行せず「適用済み」記録のみ行う（データ破棄を避ける）。
//  - 本番稼働後の変更は 0004 以降を追加し、Job で applyPending する。
// ============================================================
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(__dirname, "migrations");

/** schema.sql が内包する到達点。この版以下は実行せず記録のみ（baseline）。 */
export const BASELINE_VERSION = 3;

interface Migration {
  version: number;
  name: string;
  file: string;
}

/** migrations/ 配下の *.sql を version 昇順で列挙する。 */
export function listMigrations(): Migration[] {
  let files: string[] = [];
  try {
    files = readdirSync(MIGRATIONS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".sql"))
    .map((f): Migration | null => {
      const m = /^(\d+)[._-]/.exec(f);
      if (!m) return null;
      return { version: Number(m[1]), name: f.replace(/\.sql$/, ""), file: join(MIGRATIONS_DIR, f) };
    })
    .filter((x): x is Migration => x !== null)
    .sort((a, b) => a.version - b.version);
}

/** コードが期待する最新版（= 存在する最大 version、最低でも baseline）。 */
export function expectedVersion(): number {
  return listMigrations().reduce((max, m) => Math.max(max, m.version), BASELINE_VERSION);
}

export function ensureMigrationsTable(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
}

export function appliedVersions(db: DatabaseSync): Set<number> {
  ensureMigrationsTable(db);
  const rows = db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>;
  return new Set(rows.map((r) => r.version));
}

export function currentVersion(db: DatabaseSync): number {
  const applied = appliedVersions(db);
  return applied.size ? Math.max(...applied) : 0;
}

function record(db: DatabaseSync, m: Migration): void {
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)").run(m.version, m.name);
}

/** <= BASELINE_VERSION を「適用済み」として記録する（実行はしない）。冪等。 */
export function recordBaseline(db: DatabaseSync): void {
  ensureMigrationsTable(db);
  const applied = appliedVersions(db);
  for (const m of listMigrations()) {
    if (m.version <= BASELINE_VERSION && !applied.has(m.version)) record(db, m);
  }
}

/**
 * 未適用（version > BASELINE_VERSION）を昇順に実行する。適用件数を返す。
 * 各ファイルは自身でトランザクション/PRAGMA を管理する前提（既存 000X の書式）。
 */
export function applyPending(db: DatabaseSync): number {
  recordBaseline(db);
  const applied = appliedVersions(db);
  let count = 0;
  for (const m of listMigrations()) {
    if (applied.has(m.version)) continue;
    if (m.version <= BASELINE_VERSION) {
      record(db, m);
      continue;
    }
    const sql = readFileSync(m.file, "utf8");
    db.exec(sql);
    record(db, m);
    count += 1;
    console.log(`✓ applied ${m.name}`);
  }
  return count;
}
