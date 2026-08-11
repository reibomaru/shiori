-- ============================================================
--  実費（expenses）を旅程の予定（items）に紐づけるための item_id を追加する。
--
--  - 移動・ホテル・レストランなどの予定に、確定した請求（実費）を結びつけて
--    「この予定に実際いくらかかったか」を費用ページで確認できるようにする。
--  - 1 実費 → 1 予定（多対一）。1 つの予定に複数の実費を紐づけられる。
--  - 予定（items）が消えたとき（スポット/移動区間/日の CASCADE 削除を含む）は、
--    実費は残したまま紐づけだけ外れるよう ON DELETE SET NULL にする。
-- ============================================================
BEGIN;

ALTER TABLE expenses ADD COLUMN item_id TEXT REFERENCES items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_item ON expenses(item_id);

COMMIT;
