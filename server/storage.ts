// ============================================================
//  ユーザーごとの storage 分離（instance-per-tenant）。
//
//  認証で解決した Google `sub` から、そのユーザー専用の
//    - DB ファイル   : data/{userId}/travel.db
//    - 会話セッション : agent-sessions/{userId}/
//  を解決する。ドメインのスキーマ・クエリは無改造のまま、ファイル単位で
//  物理分離する（`WHERE user_id` を書かないので越境が構造的に起きない）。
//
//  DB 接続は LRU でキャッシュし、Cloud Run は max=1（単一ライタ）前提。
// ============================================================
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join } from "node:path";
import { openDb } from "../db/db.ts";
import { applyPending } from "../db/migrate-runner.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// 各ユーザーの DB ファイルを置く基点（本番は GCS/FUSE 上の /data）。
const DATA_ROOT = process.env.TRAVEL_DATA_DIR || join(ROOT, "data");
// 会話セッション JSONL を置く基点（runner.ts と同じ既定を共有）。
const SESSIONS_ROOT = process.env.AGENT_SESSIONS_DIR || join(ROOT, "data", "agent-sessions");
// 同時に開いておく DB 接続の上限（超えたら最も古いものから close）。
const MAX_OPEN_DBS = Number(process.env.MAX_OPEN_DBS || 50);

/** userId として許可する文字。Google `sub` は数字列なので十分。 */
const VALID_USER_ID = /^[A-Za-z0-9_-]+$/;

/**
 * userId をパスセグメントとして安全な形に検証する。
 * `.` や `/` を弾くことでパストラバーサル（`../他人`）を構造的に防ぐ。
 */
export function sanitizeUserId(userId: string): string {
  if (!userId || !VALID_USER_ID.test(userId)) {
    throw new Error(`invalid userId: ${JSON.stringify(userId)}`);
  }
  return userId;
}

function resolveRoot(base: string): string {
  return isAbsolute(base) ? base : join(ROOT, base);
}

// insertion-order を利用した簡易 LRU（Map はキー挿入順を保つ）。
const dbCache = new Map<string, DatabaseSync>();

/**
 * 指定ユーザーの DB を開いて返す（LRU キャッシュ）。
 * 新規ユーザーの空 DB は schema.sql 適用後に未適用マイグレーションを適用し、
 * 最新版で初期化される。既存 DB も open 時に自動追従する（max=1 で安全）。
 */
export function getUserDb(userId: string): DatabaseSync {
  const id = sanitizeUserId(userId);

  const cached = dbCache.get(id);
  if (cached) {
    // アクセスされたので末尾（最近使用）へ移動。
    dbCache.delete(id);
    dbCache.set(id, cached);
    return cached;
  }

  const path = join(resolveRoot(DATA_ROOT), id, "travel.db");
  const db = openDb(path); // 親ディレクトリ作成 + schema.sql + baseline 記録
  applyPending(db); // 0004 以降の未適用マイグレーションを適用（新規/既存とも最新化）
  dbCache.set(id, db);

  // 上限を超えたら最も古い接続から閉じる。
  while (dbCache.size > MAX_OPEN_DBS) {
    const oldest = dbCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const oldDb = dbCache.get(oldest);
    dbCache.delete(oldest);
    try {
      oldDb?.close();
    } catch {
      /* close 失敗は致命的でない */
    }
  }

  return db;
}

/** 指定ユーザーの会話セッション dir（agent-sessions/{userId}）を返す。 */
export function getUserSessionDir(userId: string): string {
  const id = sanitizeUserId(userId);
  return join(resolveRoot(SESSIONS_ROOT), id);
}

/** graceful shutdown 用: 開いている全 DB 接続を閉じる。 */
export function closeAllUserDbs(): void {
  for (const db of dbCache.values()) {
    try {
      db.close();
    } catch {
      /* noop */
    }
  }
  dbCache.clear();
}
