# データベース ER 図

`data/travel.db`（SQLite）の現在のテーブルスキーマ。

```mermaid
erDiagram
    trip {
        INTEGER id PK "CHECK(id=1) 単一行"
        TEXT title
        TEXT subtitle
        TEXT start_date
        TEXT end_date
        TEXT travelers
        INTEGER party_size "default 2"
        TEXT fx_note
    }

    spots {
        TEXT id PK "UUID"
        TEXT name "NOT NULL"
        TEXT name_en
        TEXT category "観光/食事/自然/美術館 など"
        TEXT city
        TEXT country "スイス/フランス など"
        REAL lat
        REAL lng
        TEXT url
        TEXT note
        TEXT source
        TEXT created_at
        TEXT icon
        TEXT instagram
        TEXT google_maps_url
    }

    days {
        TEXT id PK "UUID"
        INTEGER day_no "NOT NULL"
        TEXT date
        TEXT city
        TEXT title
    }

    items {
        TEXT id PK "UUID"
        TEXT day_id FK "NOT NULL, ON DELETE CASCADE"
        INTEGER sort_order "default 0"
        TEXT time
        TEXT type "移動:flight/train/bus/car/walk スポット:spot/meal/hotel 例外:free"
        TEXT title "NOT NULL"
        TEXT note
        TEXT url
        TEXT url_label
        INTEGER cost "1人あたり概算(円)"
        TEXT spot_id FK "ON DELETE CASCADE / CHECK"
        TEXT leg_id FK "ON DELETE CASCADE / CHECK"
    }

    route {
        TEXT id PK "UUID"
        INTEGER order_index "NOT NULL"
        TEXT name "NOT NULL"
        REAL lat
        REAL lng
        INTEGER hub "1=宿泊拠点"
        TEXT leg_type
        TEXT note
    }

    legs {
        TEXT id PK "UUID"
        INTEGER order_index "NOT NULL"
        TEXT from_name
        TEXT to_name
        TEXT mode "train/flight/bus/car/walk"
        TEXT geojson "NOT NULL / GeoJSON LineString"
        TEXT note
    }

    budget {
        TEXT id PK "UUID"
        INTEGER sort_order "default 0"
        TEXT category "NOT NULL"
        INTEGER per_person "NOT NULL default 0"
        TEXT note
    }

    spot_place_cache {
        TEXT spot_id PK,FK "UUID / ON DELETE CASCADE"
        TEXT place_id
        REAL rating
        INTEGER rating_count
        TEXT maps_uri
        TEXT photos "写真URLのJSON配列"
        TEXT fetched_at
    }

    chat_sessions {
        TEXT id PK "クライアント生成UUID"
        TEXT session_file
        TEXT title
        INTEGER message_count "NOT NULL default 0"
        REAL cost_usd "NOT NULL default 0"
        TEXT created_at
        TEXT updated_at
    }

    days ||--o{ items : "day_id (CASCADE)"
    spots ||--o{ items : "spot_id (CASCADE)"
    legs ||--o{ items : "leg_id (CASCADE)"
    spots ||--o| spot_place_cache : "spot_id (CASCADE)"
```

## items の詳細紐づけ制約（CHECK）

`items` は「地図に出せない無効な予定」を DB レベルで弾くため、`type` と外部キーを結びつけた CHECK 制約を持つ。Skill / API が直接 INSERT しても保証される。

```sql
CHECK (
     type = 'free'                                                                    -- 自由時間・機内泊は例外（どちらも不要）
  OR (type IN ('flight','train','bus','car','walk') AND leg_id  IS NOT NULL AND spot_id IS NULL)  -- 移動 → leg 必須
  OR (type IN ('spot','meal','hotel')               AND spot_id IS NOT NULL AND leg_id  IS NULL)  -- スポット → spot 必須
)
```

- 移動 item は `geojson` を持つ `legs`（NOT NULL）に紐づくので、必ず地図に描ける。
- 親（spot / leg）を削除すると該当 item も無効になるため、FK は `ON DELETE CASCADE`。

## 主キー（UUID）

`trip`（`id=1` 固定の単一行）を除き、全テーブルの主キーは `TEXT PRIMARY KEY NOT NULL`（UUID）。`crypto.randomUUID()` で採番する。

> SQLite では `INTEGER PRIMARY KEY`（rowid の別名）と違い、非 integer の `PRIMARY KEY` は `PRIMARY KEY` だけでは NULL を弾かない（後方互換の既知仕様）。そのため UUID の PK 列には `NOT NULL` を明示し、直接 SQL でも NULL id を防ぐ。
- サーバ / Skill / seed は INSERT 時に UUID を生成する（`lastInsertRowid` に依存しない）。
- フロント（旅程ビルダー）はクライアントで UUID を採番し、その id をそのまま POST する（楽観的更新時の一時 id 差し替えが不要）。
- API の各 POST は `body.id` があればそれを採用し、無ければサーバ側で採番する。

## 補足

外部キー制約があるのは以下の関係だけ。

| 子テーブル | 親テーブル | カラム | 削除時の挙動 |
|---|---|---|---|
| `items` | `days` | `day_id` | `ON DELETE CASCADE` |
| `items` | `spots` | `spot_id` | `ON DELETE CASCADE` |
| `items` | `legs` | `leg_id` | `ON DELETE CASCADE` |
| `spot_place_cache` | `spots` | `spot_id`（PK兼） | `ON DELETE CASCADE` |

### リレーションを持たない独立テーブル

- `trip` — `CHECK(id=1)` で単一行のみ。旅行全体のメタ情報。
- `route` — 地図表示用の地点リスト（`order_index` で並ぶ）。どこからも参照されない独立テーブル。
- `budget` — 費目リスト。
- `chat_sessions` — 会話履歴。外部キーは持たず独立。

> 注: `route` と `legs` は `from_name` / `to_name` / `name` を文字列で保持しており、`spots` や相互のテーブルとは FK で結ばれていない（地図側は座標・名前ベースで疎結合）。

## インデックス

| インデックス | 対象 |
|---|---|
| `idx_items_day` | `items(day_id, sort_order)` |
| `idx_route_order` | `route(order_index)` |
| `idx_legs_order` | `legs(order_index)` |
| `idx_chat_sessions_updated` | `chat_sessions(updated_at DESC)` |
