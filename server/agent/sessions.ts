// ============================================================
//  チャットセッションの索引（SQLite: chat_sessions テーブル）。
//
//  会話本体は pi-coding-agent の JSONL ファイル（session_file）に
//  永続化される。このモジュールは「どの sessionId がどの JSONL に
//  対応するか」と、一覧表示用のメタ情報（タイトル・件数・コスト・
//  更新時刻）を SQLite で管理し、resume と一覧を可能にする。
// ============================================================
import type { DatabaseSync } from "node:sqlite";
import type { ChatSessionRow } from "../../db/types.ts";

/** 一覧表示用のセッション情報（has_history を boolean 化済み）。 */
export interface SessionListItem {
  id: string;
  title: string | null;
  message_count: number;
  cost_usd: number;
  created_at: string;
  updated_at: string;
  has_history: boolean;
}

/** 最初のユーザー発言からタイトルを作る（40 文字で打ち切り）。 */
function makeTitle(message: string | null | undefined): string {
  const t = (message ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "新しい会話";
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}

/** セッション行が無ければ作成。初回メッセージがあればタイトルも設定。 */
export function upsertSession(db: DatabaseSync, id: string, firstMessage?: string): void {
  const row = db.prepare("SELECT id, title FROM chat_sessions WHERE id = ?").get(id) as
    | Pick<ChatSessionRow, "id" | "title">
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO chat_sessions (id, title) VALUES (?, ?)").run(id, makeTitle(firstMessage));
  } else if (!row.title && firstMessage) {
    db.prepare("UPDATE chat_sessions SET title = ? WHERE id = ?").run(makeTitle(firstMessage), id);
  }
}

/** resume 用の JSONL セッションファイルパスを取得（無ければ undefined）。 */
export function getSessionFile(db: DatabaseSync, id: string): string | undefined {
  if (!id) return undefined;
  const row = db.prepare("SELECT session_file FROM chat_sessions WHERE id = ?").get(id) as
    | Pick<ChatSessionRow, "session_file">
    | undefined;
  return row?.session_file ?? undefined;
}

/** 1 ターン完了後に session_file・件数・コスト・更新時刻を記録する。 */
export function recordTurn(
  db: DatabaseSync,
  id: string,
  { sessionFile, costUSD = 0 }: { sessionFile?: string; costUSD?: number },
): void {
  db.prepare(
    `UPDATE chat_sessions
       SET session_file = COALESCE(?, session_file),
           message_count = message_count + 1,
           cost_usd = cost_usd + ?,
           updated_at = datetime('now')
     WHERE id = ?`,
  ).run(sessionFile ?? null, costUSD, id);
}

/** セッション一覧（更新の新しい順）。 */
export function listSessions(db: DatabaseSync): SessionListItem[] {
  return (db
    .prepare(
      `SELECT id, title, message_count, cost_usd, created_at, updated_at,
              (session_file IS NOT NULL) AS has_history
         FROM chat_sessions
        ORDER BY updated_at DESC`,
    )
    .all() as Array<Omit<SessionListItem, "has_history"> & { has_history: number }>)
    .map((r) => ({ ...r, has_history: !!r.has_history }));
}

export function getSession(db: DatabaseSync, id: string): ChatSessionRow | null {
  return (db.prepare("SELECT * FROM chat_sessions WHERE id = ?").get(id) as ChatSessionRow | undefined) ?? null;
}

/** セッションを削除（行のみ。JSONL ファイルの削除は呼び出し側で行う）。 */
export function deleteSession(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
  db.prepare("DELETE FROM proposal_resolutions WHERE session_id = ?").run(id);
}

/** 提案カードの解決状態（保存/破棄）。 */
export type ProposalStatus = "saved" | "dismissed";

/** 提案カードの解決状態を記録する（保存・破棄を押したとき）。 */
export function recordResolution(db: DatabaseSync, sessionId: string, proposalId: string, status: ProposalStatus): void {
  db.prepare(
    `INSERT INTO proposal_resolutions (session_id, proposal_id, status, resolved_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(session_id, proposal_id) DO UPDATE SET status = excluded.status, resolved_at = excluded.resolved_at`,
  ).run(sessionId, proposalId, status);
}

/** セッション内の提案 id → 解決状態のマップ（履歴復元時に付与する）。 */
export function getResolutions(db: DatabaseSync, sessionId: string): Record<string, ProposalStatus> {
  const rows = db
    .prepare("SELECT proposal_id, status FROM proposal_resolutions WHERE session_id = ?")
    .all(sessionId) as Array<{ proposal_id: string; status: ProposalStatus }>;
  return Object.fromEntries(rows.map((r) => [r.proposal_id, r.status]));
}
