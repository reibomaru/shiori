-- ============================================================
--  memo_images に updated_at を追加する。
--  画像の回転保存で内容が差し替わるため、配信 URL のバージョン（?v=）に使い、
--  ブラウザキャッシュ（immutable）と整合させる。
--
--  ALTER ADD COLUMN の既定値には非定数（datetime('now')）を使えないため、
--  NULL 許容で追加してから created_at で初期化する。
-- ============================================================
BEGIN;

ALTER TABLE memo_images ADD COLUMN updated_at TEXT;
UPDATE memo_images SET updated_at = created_at WHERE updated_at IS NULL;

COMMIT;
