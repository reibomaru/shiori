-- ============================================================
--  memo を「複数ページ」化する memo_pages テーブルを追加する。
--
--  - 各ページは Markdown 本文(body)に加え、画像から抽出した HTML(html)と
--    その平文(text)を持つ。html は iframe(sandbox) で安全に表示し、
--    text はスポット登録エージェントが参照する。
--  - 既存の trip.memo（単一メモ）は 1 ページ目として移行する。
--    trip.memo カラム自体は非破壊のため残す（読み書きは memo_pages に一本化）。
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS memo_pages (
  id          TEXT PRIMARY KEY NOT NULL,     -- UUID
  title       TEXT NOT NULL DEFAULT '無題のメモ',
  body        TEXT,                          -- 自由記述の Markdown 本文（従来の memo 相当）
  html        TEXT,                          -- 画像から抽出した HTML（iframe 表示用）
  text        TEXT,                          -- 抽出情報のプレーンテキスト（エージェント連携用）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memo_pages_order ON memo_pages(sort_order, created_at);

-- 既存の単一メモ（trip.memo）を 1 ページ目として移行する（空でなければ）。
INSERT INTO memo_pages (id, title, body, sort_order)
SELECT
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) ||
        '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) ||
        '-' || hex(randomblob(6))),
  'メモ',
  memo,
  0
FROM trip
WHERE id = 1 AND memo IS NOT NULL AND trim(memo) <> '';

COMMIT;
