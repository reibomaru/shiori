-- ============================================================
--  items を「spot か leg のどちらか一方に必ず紐づく」制約に移行し、
--  legs.geojson を NOT NULL 化する。
--
--  SQLite は CHECK / NOT NULL を後付けできないためテーブルを再構築する。
--  既存の非適合データは破棄する（移行性は考慮しない方針）。
--    - legs : geojson を持つ行だけ残す
--    - items: 制約に適合する行だけ残す（free、または type↔FK が整合する行）
-- ============================================================
PRAGMA foreign_keys=OFF;
BEGIN;

-- ---- legs: geojson NOT NULL ----
CREATE TABLE legs_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_index  INTEGER NOT NULL,
  from_name    TEXT,
  to_name      TEXT,
  mode         TEXT NOT NULL DEFAULT 'train',
  geojson      TEXT NOT NULL,
  note         TEXT
);
INSERT INTO legs_new (id, order_index, from_name, to_name, mode, geojson, note)
  SELECT id, order_index, from_name, to_name, mode, geojson, note
  FROM legs
  WHERE geojson IS NOT NULL AND geojson <> '';
DROP TABLE legs;
ALTER TABLE legs_new RENAME TO legs;
CREATE INDEX IF NOT EXISTS idx_legs_order ON legs(order_index);

-- ---- items: type↔FK の XOR 制約（free は例外）+ FK CASCADE ----
CREATE TABLE items_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id      INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  time        TEXT,
  type        TEXT NOT NULL DEFAULT 'spot',
  title       TEXT NOT NULL,
  note        TEXT,
  url         TEXT,
  url_label   TEXT,
  cost        INTEGER,
  spot_id     INTEGER REFERENCES spots(id) ON DELETE CASCADE,
  leg_id      INTEGER REFERENCES legs(id)  ON DELETE CASCADE,
  CHECK (
       type = 'free'
    OR (type IN ('flight','train','bus','car','walk') AND leg_id  IS NOT NULL AND spot_id IS NULL)
    OR (type IN ('spot','meal','hotel')               AND spot_id IS NOT NULL AND leg_id  IS NULL)
  )
);
INSERT INTO items_new (id, day_id, sort_order, time, type, title, note, url, url_label, cost, spot_id, leg_id)
  SELECT id, day_id, sort_order, time, type, title, note, url, url_label, cost, spot_id, leg_id
  FROM items
  WHERE type = 'free'
     OR (type IN ('flight','train','bus','car','walk') AND leg_id  IS NOT NULL AND spot_id IS NULL)
     OR (type IN ('spot','meal','hotel')               AND spot_id IS NOT NULL AND leg_id  IS NULL);
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
CREATE INDEX IF NOT EXISTS idx_items_day ON items(day_id, sort_order);

COMMIT;
PRAGMA foreign_keys=ON;
