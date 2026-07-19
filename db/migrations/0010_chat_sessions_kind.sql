-- ============================================================
--  chat_sessions に kind 列を追加する。
--
--  従来のスポット編集チャットに加え、メモ編集チャットも同じ
--  chat_sessions / proposal_resolutions を使うため、どちらの会話かを
--  kind ('spot' | 'memo') で区別する。既存行はすべて 'spot' 扱い。
-- ============================================================
BEGIN;

ALTER TABLE chat_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'spot';

CREATE INDEX IF NOT EXISTS idx_chat_sessions_kind ON chat_sessions(kind, updated_at DESC);

COMMIT;
