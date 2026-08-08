// ============================================================
//  プロジェクトごとの storage 分離（instance-per-tenant）。
//
//  プロジェクト（projectId）ごとに
//    - DB ファイル   : data/{projectId}/travel.db
//    - 会話セッション : agent-sessions/{projectId}/
//  を物理分離する。1 プロジェクトを複数ユーザーで共有・共同編集する。
//  ドメインのスキーマ・クエリは無改造のまま、ファイル単位で分ける。
//
//  本番では per-project Litestream（server/litestream.ts）で GCS に永続化する。
//  DB 接続は LRU でキャッシュし、Cloud Run は max=1（単一ライタ）前提。
// ============================================================
import type { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join } from "node:path";
import { openDb } from "../db/db.ts";
import { applyPending } from "../db/migrate-runner.ts";
import { restoreProjectDb, startReplication, stopAllReplication, stopReplication } from "./litestream.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// 各プロジェクトの DB ファイルを置く基点（本番は /data）。
const DATA_ROOT = process.env.TRAVEL_DATA_DIR || join(ROOT, "data");
// 会話セッション JSONL を置く基点（runner.ts と同じ既定を共有）。
const SESSIONS_ROOT = process.env.AGENT_SESSIONS_DIR || join(ROOT, "data", "agent-sessions");
// 同時に開いておく DB 接続の上限（超えたら最も古いものから close）。
const MAX_OPEN_DBS = Number(process.env.MAX_OPEN_DBS || 50);

/** projectId として許可する文字（uuid を想定）。 */
const VALID_PROJECT_ID = /^[A-Za-z0-9_-]+$/;

/**
 * projectId をパスセグメントとして安全な形に検証する。
 * `.` や `/` を弾くことでパストラバーサル（`../他プロジェクト`）を構造的に防ぐ。
 */
export function sanitizeProjectId(projectId: string): string {
  if (!projectId || !VALID_PROJECT_ID.test(projectId)) {
    throw new Error(`invalid projectId: ${JSON.stringify(projectId)}`);
  }
  return projectId;
}

function resolveRoot(base: string): string {
  return isAbsolute(base) ? base : join(ROOT, base);
}

function projectDbPath(id: string): string {
  return join(resolveRoot(DATA_ROOT), id, "travel.db");
}

// insertion-order を利用した簡易 LRU（Map はキー挿入順を保つ）。
const dbCache = new Map<string, DatabaseSync>();
// 初回オープンの多重実行を直列化する（async 化に伴うレース回避）。
const inflight = new Map<string, Promise<DatabaseSync>>();

/**
 * 指定プロジェクトの DB を開いて返す（LRU キャッシュ・Litestream 連携）。
 * 開く前に GCS レプリカから復元し、開いた後に継続レプリケーションを開始する。
 * 新規プロジェクトの空 DB は schema.sql + 未適用マイグレーションで最新版に初期化される。
 */
export async function getProjectDb(projectId: string): Promise<DatabaseSync> {
  const id = sanitizeProjectId(projectId);

  const cached = dbCache.get(id);
  if (cached) {
    dbCache.delete(id);
    dbCache.set(id, cached);
    return cached;
  }

  const pending = inflight.get(id);
  if (pending) return pending;

  const p = (async () => {
    const path = projectDbPath(id);
    await restoreProjectDb(id, path); // GCS レプリカがあれば復元
    const db = openDb(path); // 親ディレクトリ作成 + schema.sql + baseline 記録
    applyPending(db); // 0004 以降の未適用マイグレーションを適用（最新化）
    startReplication(id, path); // 継続レプリケーション開始
    dbCache.set(id, db);
    await evictIfNeeded();
    return db;
  })();

  inflight.set(id, p);
  try {
    return await p;
  } finally {
    inflight.delete(id);
  }
}

/** 上限を超えたら最も古い接続を replicate 停止 → close する。 */
async function evictIfNeeded(): Promise<void> {
  while (dbCache.size > MAX_OPEN_DBS) {
    const oldest = dbCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const oldDb = dbCache.get(oldest);
    dbCache.delete(oldest);
    await stopReplication(oldest);
    try {
      oldDb?.close();
    } catch {
      /* close 失敗は致命的でない */
    }
  }
}

/** 指定プロジェクトの会話セッション dir（agent-sessions/{projectId}）を返す。 */
export function getProjectSessionDir(projectId: string): string {
  const id = sanitizeProjectId(projectId);
  return join(resolveRoot(SESSIONS_ROOT), id);
}

/**
 * プロジェクトのローカル storage を破棄する（DB 接続・ファイル・セッション dir）。
 * replicate を停止し、キャッシュ・ローカルファイルを削除する。
 * ※ GCS 上の Litestream レプリカ本体の削除は行わない（残っても復元されないだけ・後続で整理）。
 */
export async function deleteProjectStorage(projectId: string): Promise<void> {
  const id = sanitizeProjectId(projectId);
  await stopReplication(id);
  const db = dbCache.get(id);
  if (db) {
    dbCache.delete(id);
    try {
      db.close();
    } catch {
      /* noop */
    }
  }
  try {
    rmSync(join(resolveRoot(DATA_ROOT), id), { recursive: true, force: true });
  } catch {
    /* noop */
  }
  try {
    rmSync(getProjectSessionDir(id), { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

/** graceful shutdown 用: 全 replicate を最終同期して停止し、全 DB を閉じる。 */
export async function closeAllProjectDbs(): Promise<void> {
  await stopAllReplication();
  for (const db of dbCache.values()) {
    try {
      db.close();
    } catch {
      /* noop */
    }
  }
  dbCache.clear();
}
