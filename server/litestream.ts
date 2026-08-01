// ============================================================
//  per-project Litestream 永続化（アプリが各 DB ごとに管理）。
//
//  storage 分離では DB がプロジェクトごとに増える（data/{projectId}/travel.db）。
//  静的な litestream.yml では動的なプロジェクトを列挙できないため、アプリが
//  プロジェクト DB を開くタイミングで Litestream を CLI で起動する:
//    - 開く直前: `litestream restore` で GCS レプリカから復元
//    - 開いている間: `litestream replicate` を子プロセスで常駐
//    - 閉じる/終了時: SIGTERM で最終同期させて停止
//
//  LITESTREAM_BUCKET 未設定（dev）なら何もしない＝ローカルファイルのみで動く。
//  GCS 認証は Cloud Run 実行 SA の ADC（メタデータサーバ）を自動利用する。
// ============================================================
import { spawn, type ChildProcess } from "node:child_process";

const BUCKET = process.env.LITESTREAM_BUCKET || "";
const PREFIX = (process.env.LITESTREAM_PATH || "litestream").replace(/\/+$/, "");
const BIN = process.env.LITESTREAM_BIN || "litestream";

/** 永続化が有効か（本番のみ）。 */
export const litestreamEnabled = Boolean(BUCKET);

/** プロジェクト DB のレプリカ URL（gcs://bucket/prefix/projects/{id}）。 */
function replicaUrl(projectId: string): string {
  return `gcs://${BUCKET}/${PREFIX}/projects/${projectId}`;
}

/** 起動中の replicate 子プロセス（projectId → child）。 */
const replicators = new Map<string, ChildProcess>();

/**
 * GCS レプリカがあれば dbPath へ復元する（無ければ何もしない）。
 * DB を開く前に呼ぶ。プロセスの終了を待つ。
 */
export function restoreProjectDb(projectId: string, dbPath: string): Promise<void> {
  if (!litestreamEnabled) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const child = spawn(
      BIN,
      ["restore", "-if-replica-exists", "-o", dbPath, replicaUrl(projectId)],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("error", (e) => {
      console.error(`litestream restore 失敗 (${projectId}):`, e);
      resolve(); // 失敗しても空 DB で継続（初回など）
    });
    child.on("exit", () => resolve());
  });
}

/**
 * dbPath の継続レプリケーションを開始する（既に起動済みなら何もしない）。
 * DB を開いた後に呼ぶ。
 */
export function startReplication(projectId: string, dbPath: string): void {
  if (!litestreamEnabled || replicators.has(projectId)) return;
  const child = spawn(BIN, ["replicate", dbPath, replicaUrl(projectId)], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("error", (e) => {
    console.error(`litestream replicate 失敗 (${projectId}):`, e);
    replicators.delete(projectId);
  });
  child.on("exit", () => replicators.delete(projectId));
  replicators.set(projectId, child);
}

/** 1 プロジェクトの replicate を停止する（SIGTERM で最終同期を促し、終了を待つ）。 */
export function stopReplication(projectId: string): Promise<void> {
  const child = replicators.get(projectId);
  if (!child) return Promise.resolve();
  return new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    // 保険: 一定時間で強制終了。
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      resolve();
    }, 10_000).unref();
  });
}

/** 全 replicate を停止する（graceful shutdown 用）。 */
export async function stopAllReplication(): Promise<void> {
  await Promise.all([...replicators.keys()].map(stopReplication));
}
