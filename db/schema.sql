-- ============================================================
--  スイス & 南仏 ハネムーン しおり — SQLite スキーマ
--  Skill / API / React がすべてこの DB を共有します。
-- ============================================================

-- 旅全体のメタ情報（1行のみ）
CREATE TABLE IF NOT EXISTS trip (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  title       TEXT,
  subtitle    TEXT,
  start_date  TEXT,
  end_date    TEXT,
  travelers   TEXT,
  party_size  INTEGER DEFAULT 2,
  fx_note     TEXT
);

-- 行きたいスポットのライブラリ（地球の歩き方などから登録していく場所）
-- まだ旅程に組み込んでいない「候補」もここに貯める。
CREATE TABLE IF NOT EXISTS spots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  name_en     TEXT,
  category    TEXT,                  -- 観光/食事/自然/美術館 など
  city        TEXT,
  country     TEXT,                  -- スイス / フランス など
  lat         REAL,
  lng         REAL,
  url         TEXT,                  -- 公式サイト・Googleマップ等
  note        TEXT,
  source      TEXT,                  -- 出典（例: 地球の歩き方 p.123）
  want_level  INTEGER DEFAULT 3,     -- 行きたい度 1-5
  created_at  TEXT DEFAULT (datetime('now'))
);

-- 1日の枠
CREATE TABLE IF NOT EXISTS days (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  day_no  INTEGER NOT NULL,
  date    TEXT,
  city    TEXT,
  title   TEXT
);

-- 旅程の個々の予定（時系列）。spot_id でライブラリのスポットと紐付け可能。
CREATE TABLE IF NOT EXISTS items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day_id      INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  time        TEXT,
  type        TEXT NOT NULL DEFAULT 'spot',  -- flight/train/bus/spot/meal/hotel/free
  title       TEXT NOT NULL,
  note        TEXT,
  url         TEXT,
  url_label   TEXT,
  cost        INTEGER,                        -- 1人あたり概算（円）
  spot_id     INTEGER REFERENCES spots(id) ON DELETE SET NULL
);

-- 地図に描くルート（順番に線で結ぶ主要地点）
CREATE TABLE IF NOT EXISTS route (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_index  INTEGER NOT NULL,
  name         TEXT NOT NULL,
  lat          REAL,
  lng          REAL,
  hub          INTEGER DEFAULT 0,             -- 1=宿泊拠点（大きめのピン）
  leg_type     TEXT,                          -- この地点へ来る移動手段
  note         TEXT
);

-- 予算（1人あたり概算）
CREATE TABLE IF NOT EXISTS budget (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  category    TEXT NOT NULL,
  per_person  INTEGER NOT NULL DEFAULT 0,
  note        TEXT
);

-- 都市間の移動区間。鉄道などは GPX で詳細ルートを保持する。
-- order_index は route の (i)→(i+1) 区間に対応。
CREATE TABLE IF NOT EXISTS legs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_index  INTEGER NOT NULL,
  from_name    TEXT,
  to_name      TEXT,
  mode         TEXT NOT NULL DEFAULT 'train',  -- train/flight/bus/car/walk
  geojson      TEXT,                            -- GeoJSON LineString geometry（[lng,lat]）。詳細ルート。
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_day ON items(day_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_route_order ON route(order_index);
CREATE INDEX IF NOT EXISTS idx_legs_order ON legs(order_index);
