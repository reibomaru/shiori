-- ============================================================
--  メモに取り込んだ「元画像」を保存する memo_images テーブルを追加する。
--
--  - 画像の実体は BLOB として DB に持つ（他データと同じく litestream で永続化）。
--  - memo_pages と 1:N。ページ削除時は CASCADE で画像も消える
--    （PRAGMA foreign_keys = ON は db.ts で有効化済み）。
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS memo_images (
  id          TEXT PRIMARY KEY NOT NULL,     -- UUID
  page_id     TEXT NOT NULL REFERENCES memo_pages(id) ON DELETE CASCADE,
  mime_type   TEXT NOT NULL DEFAULT 'image/png',
  data        BLOB NOT NULL,                 -- 画像の実体（アップロード原本）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memo_images_page ON memo_images(page_id, sort_order, created_at);

COMMIT;
