-- ============================================================
--  実費（確定した予約・領収書）を記録する expenses テーブルと、
--  領収書/予約完了画面の元画像を保存する expense_images テーブルを追加する。
--
--  - budget（1人あたり概算）とは別レイヤーの「実費（確定）」を持つ。
--    概算 vs 実費 を並べて見られるようにするための土台。
--  - 領収書画像の実体は BLOB として DB に持つ（他データと同じく litestream で永続化）。
--    memo_images に倣った 1:N。expenses 削除時は CASCADE で画像も消える
--    （PRAGMA foreign_keys = ON は db.ts で有効化済み）。
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS expenses (
  id           TEXT PRIMARY KEY NOT NULL,      -- UUID
  sort_order   INTEGER NOT NULL DEFAULT 0,
  category     TEXT NOT NULL,                  -- 宿泊/交通/食事/観光 など（budget の費目と揃える想定）
  title        TEXT NOT NULL,                  -- 予約/支払いの概要（プラン名・区間など）
  vendor       TEXT,                           -- 予約先/店舗名（ホテル名・航空会社・予約サイト等）
  amount       INTEGER NOT NULL DEFAULT 0,     -- 確定金額（currency の最小単位ではなく通貨の主単位。円なら円、CHF/EUR なら小数はあり得るが当面は整数運用）
  currency     TEXT NOT NULL DEFAULT 'JPY',    -- 通貨コード（JPY / CHF / EUR など）
  paid         INTEGER NOT NULL DEFAULT 0,     -- 支払状況: 0=未払い / 1=支払済
  incurred_on  TEXT,                           -- 支払日 or 予約日（YYYY-MM-DD）
  source_url   TEXT,                           -- 予約サイト・完了メールのリンク（参考）
  note         TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_order ON expenses(sort_order, created_at);

CREATE TABLE IF NOT EXISTS expense_images (
  id          TEXT PRIMARY KEY NOT NULL,     -- UUID
  expense_id  TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  mime_type   TEXT NOT NULL DEFAULT 'image/png',
  data        BLOB NOT NULL,                 -- 領収書/予約完了画面の元画像（アップロード原本）
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expense_images_expense ON expense_images(expense_id, sort_order, created_at);

COMMIT;
