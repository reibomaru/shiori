-- ============================================================
--  Gmail 連携（購入完了メールから実費を取り込む）の認証情報を保存する。
--
--  - このアプリは 2 人用・Basic 認証下の単一利用を想定しているため、
--    Gmail も「単一の Google アカウント」を OAuth（オフライン）で連携し、
--    リフレッシュトークンをここに 1 行だけ保持する（id = 1 固定）。
--  - アクセストークンは都度リフレッシュして取得するため保存しない。
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS gmail_auth (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT,                          -- offline アクセス用のリフレッシュトークン
  email         TEXT,                          -- 連携した Google アカウント（表示用）
  connected_at  TEXT DEFAULT (datetime('now'))
);

COMMIT;
