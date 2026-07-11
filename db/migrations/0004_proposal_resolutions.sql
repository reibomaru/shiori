-- ============================================================
--  提案カード（propose_* ツール由来）の解決状態を永続化する。
--
--  スポットチャットの AI が出す提案カード（追加/更新/削除）の「保存済み/破棄済み」を
--  記録し、リロードや履歴復元のあとも同じ状態に復元して再保存を防ぐ。
--  proposal_id は toolCall id 由来（"prop-<toolCallId>"）で、live・履歴復元の双方で一致する。
--
--  baseline(v3) 稼働後の追加のため 0004 として versioned migration で入れる。
--  非破壊（新規テーブルのみ）なので CREATE TABLE IF NOT EXISTS で冪等。
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS proposal_resolutions (
  session_id   TEXT NOT NULL,
  proposal_id  TEXT NOT NULL,
  status       TEXT NOT NULL,                    -- 'saved' | 'dismissed'
  resolved_at  TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, proposal_id)
);

COMMIT;
