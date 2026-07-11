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
  id          TEXT PRIMARY KEY NOT NULL,      -- UUID（アプリ側で crypto.randomUUID() を採番）
  name        TEXT NOT NULL,
  name_en     TEXT,
  category    TEXT,                  -- 観光/食事/自然/美術館 など
  city        TEXT,
  country     TEXT,                  -- スイス / フランス など
  lat         REAL,
  lng         REAL,
  url         TEXT,                  -- 公式サイト等
  google_maps_url TEXT,              -- Google マップのリンク（口コミ・評価はこのリンク先で確認するため shiori には保存しない）
  note        TEXT,
  source      TEXT,                  -- 出典（例: 地球の歩き方 p.123）
  icon        TEXT,                  -- 地図ピンのアイコン種別（未指定なら category から自動）
  instagram   TEXT,                  -- 関連 Instagram 投稿 URL の JSON 配列（埋め込みギャラリー用）
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Google Places から取得した情報のキャッシュ（スポットごと・API コスト削減用）。
-- place_id は無期限保存可。評価・写真などのコンテンツは規約上 最大30日でリフレッシュする。
-- 写真の実体は保存せず、表示用 URL（lh3.googleusercontent.com）だけを持つ。
-- これは純粋なキャッシュなので、消えても再取得できる（spots を消すと CASCADE で消える）。
CREATE TABLE IF NOT EXISTS spot_place_cache (
  spot_id      TEXT PRIMARY KEY NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  place_id     TEXT,                 -- Google の place_id（無期限保存可・リフレッシュは Place Details で安く）
  rating       REAL,                 -- 評価（★）
  rating_count INTEGER,              -- 評価件数
  maps_uri     TEXT,                 -- Google マップの URL
  photos       TEXT,                 -- 表示用写真 URL の JSON 配列
  fetched_at   TEXT                  -- 取得時刻（datetime('now') / UTC）。30日でリフレッシュ判定。
);

-- 1日の枠
CREATE TABLE IF NOT EXISTS days (
  id      TEXT PRIMARY KEY NOT NULL,          -- UUID
  day_no  INTEGER NOT NULL,
  date    TEXT,
  city    TEXT,
  title   TEXT
);

-- 旅程の個々の予定（時系列）。
-- item の詳細情報は spot（スポット）か leg（移動区間）のどちらか一方に必ず紐づく。
-- これにより「地図に出せない無効な予定」を DB レベルで弾く（Skill/API の直接 INSERT でも保証）。
CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY NOT NULL,      -- UUID
  day_id      TEXT NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  time        TEXT,
  type        TEXT NOT NULL DEFAULT 'spot',  -- 移動: flight/train/bus/car/walk ／ スポット: spot/meal/hotel ／ 例外: free
  title       TEXT NOT NULL,
  note        TEXT,
  url         TEXT,
  url_label   TEXT,
  cost        INTEGER,                        -- 1人あたり概算（円）
  -- 親（spot / leg）が消えると item は詳細を失い無効になるため CASCADE で削除する。
  spot_id     TEXT REFERENCES spots(id) ON DELETE CASCADE,
  leg_id      TEXT REFERENCES legs(id)  ON DELETE CASCADE,   -- 移動区間（legs）由来の予定の紐づけ
  -- 移動 → leg_id 必須 / スポット → spot_id 必須 / free（自由時間・機内泊）→ どちらも不要（例外）
  CHECK (
       type = 'free'
    OR (type IN ('flight','train','bus','car','walk') AND leg_id  IS NOT NULL AND spot_id IS NULL)
    OR (type IN ('spot','meal','hotel')               AND spot_id IS NOT NULL AND leg_id  IS NULL)
  )
);

-- 地図に描くルート（順番に線で結ぶ主要地点）
CREATE TABLE IF NOT EXISTS route (
  id           TEXT PRIMARY KEY NOT NULL,     -- UUID
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
  id          TEXT PRIMARY KEY NOT NULL,      -- UUID
  sort_order  INTEGER NOT NULL DEFAULT 0,
  category    TEXT NOT NULL,
  per_person  INTEGER NOT NULL DEFAULT 0,
  note        TEXT
);

-- 都市間の移動区間。鉄道などは GPX で詳細ルートを保持する。
-- order_index は route の (i)→(i+1) 区間に対応。
CREATE TABLE IF NOT EXISTS legs (
  id           TEXT PRIMARY KEY NOT NULL,     -- UUID
  order_index  INTEGER NOT NULL,
  from_name    TEXT,
  to_name      TEXT,
  mode         TEXT NOT NULL DEFAULT 'train',  -- train/flight/bus/car/walk
  geojson      TEXT NOT NULL,                   -- GeoJSON LineString geometry（[lng,lat]）。地図表示必須（空路は直線でも可）。
  note         TEXT
);

-- AI アシスタント（スポット候補チャット）のセッション索引。
-- 会話本体は pi-coding-agent の JSONL（session_file）に永続化し、
-- ここには一覧・resume 用のメタ情報だけを持つ。
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            TEXT PRIMARY KEY NOT NULL,                 -- クライアント生成 UUID
  session_file  TEXT,                             -- pi の JSONL セッションファイルの絶対パス
  title         TEXT,                             -- 一覧表示用（最初のユーザー発言から生成）
  message_count INTEGER NOT NULL DEFAULT 0,       -- ユーザー発言の回数
  cost_usd      REAL NOT NULL DEFAULT 0,          -- 累計コスト（USD）
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_day ON items(day_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_route_order ON route(order_index);
CREATE INDEX IF NOT EXISTS idx_legs_order ON legs(order_index);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
