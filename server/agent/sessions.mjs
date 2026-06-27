// ============================================================
//  チャットセッションの索引（SQLite: chat_sessions テーブル）。
//
//  会話本体は pi-coding-agent の JSONL ファイル（session_file）に
//  永続化される。このモジュールは「どの sessionId がどの JSONL に
//  対応するか」と、一覧表示用のメタ情報（タイトル・件数・コスト・
//  更新時刻）を SQLite で管理し、resume と一覧を可能にする。
// ============================================================

/** 最初のユーザー発言からタイトルを作る（40 文字で打ち切り）。 */
function makeTitle(message) {
  const t = (message ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "新しい会話";
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
}

/** セッション行が無ければ作成。初回メッセージがあればタイトルも設定。 */
export function upsertSession(db, id, firstMessage) {
  const row = db.prepare("SELECT id, title FROM chat_sessions WHERE id = ?").get(id);
  if (!row) {
    db.prepare("INSERT INTO chat_sessions (id, title) VALUES (?, ?)").run(id, makeTitle(firstMessage));
  } else if (!row.title && firstMessage) {
    db.prepare("UPDATE chat_sessions SET title = ? WHERE id = ?").run(makeTitle(firstMessage), id);
  }
}

/** resume 用の JSONL セッションファイルパスを取得（無ければ undefined）。 */
export function getSessionFile(db, id) {
  if (!id) return undefined;
  const row = db.prepare("SELECT session_file FROM chat_sessions WHERE id = ?").get(id);
  return row?.session_file ?? undefined;
}

/** 1 ターン完了後に session_file・件数・コスト・更新時刻を記録する。 */
export function recordTurn(db, id, { sessionFile, costUSD = 0 }) {
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
export function listSessions(db) {
  return db
    .prepare(
      `SELECT id, title, message_count, cost_usd, created_at, updated_at,
              (session_file IS NOT NULL) AS has_history
         FROM chat_sessions
        ORDER BY updated_at DESC`,
    )
    .all()
    .map((r) => ({ ...r, has_history: !!r.has_history }));
}

export function getSession(db, id) {
  return db.prepare("SELECT * FROM chat_sessions WHERE id = ?").get(id) ?? null;
}

/** セッションを削除（行のみ。JSONL ファイルの削除は呼び出し側で行う）。 */
export function deleteSession(db, id) {
  db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(id);
}
