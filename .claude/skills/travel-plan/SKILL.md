---
name: travel-plan
description: スイス&南仏ハネムーンしおり（data/travel.db）の旅行データを編集する唯一のスキル。地図の移動ルート（経由地・交通手段・GeoJSON/GPX）、日ごとの旅程（予定の追加/編集/並べ替え/削除）、行きたい候補スポット、予算のすべてを扱う。「ルートを変える」「この区間を鉄道→飛行機に」「Day3に予定を足す/入れ替える」「スポットを登録」「予算を直す」等の依頼で使う。これらは1つの DB で密に結合しているため、必ずこのスキルに集約する。
---

# 旅のしおり データ編集 Skill（統合版）

スイス&南仏ハネムーンしおりのデータは **単一の SQLite (`data/travel.db`)** に入っている。
React プレビュー・PDF はこの DB を読むので、ここで書けばブラウザ再読み込みで反映される。

このスキル1つで **移動ルート / 旅程 / 候補スポット / 予算** のすべてを扱う。
**画面ごとに別々ではなく、データが密結合しているため1スキルに集約**している（後述の
依存グラフを参照）。pnpm/サーバー起動は不要。すべて DB を直接読み書きする短命プロセス。

## どの画面が何のテーブルを読むか

| 画面 | 読むテーブル |
|---|---|
| `/map`（移動プラン） | **route**（経由地点ピン）＋ **legs**（区間・交通手段・GeoJSON） |
| `/itinerary`（旅程） | **days**（1日の枠）＋ **items**（その日の予定） |
| 予算 | **budget** |
| 候補スポット | **spots** |
| しおり全体のメタ | **trip** |

## ★最重要：依存グラフ（1か所直したら波及先を必ず直す）

テーブルは互いに結合している。**片方だけ編集すると地図と旅程が静かにズレる**（過去の事故原因）。
移動・経由地を変えたら、下流をセットで更新すること。

```
route / legs（移動プラン・地図）
   │  経由地の追加/削除/順序変更、区間の交通手段変更
   ├─▶ days        … その都市の「日」を増減・都市名/タイトル修正
   ├─▶ items       … 移動アイテム(type:flight/train/bus/car)の出発・到着・交通手段を一致させる。
   │                  消えた都市の観光・宿泊 items を削除/付け替え
   └─▶ budget      … 交通費・観光費の費目を調整

spots（行きたい候補）──昇格──▶ items（その日の予定に組み込む）
```

**鉄則:** 「移動プランを変える」依頼は、route/legs だけで終わらせない。
**route → items → budget まで波及させ、最後に下の整合チェックを必ず実行する。**

## 2つのインターフェイス

### ① travel.mjs CLI（主・推奨）
構造化された読み書き。JSON は **シングルクォート**で囲む。

```
node scripts/travel.mjs summary                       # まず全体把握
node scripts/travel.mjs route | legs | days | spots | budget
node scripts/travel.mjs items <day_no>

node scripts/travel.mjs add-route '<json>'  | edit-route <id> '<json>' | rm-route <id>
node scripts/travel.mjs add-leg   '<json>'  | edit-leg   <id> '<json>' | rm-leg <id>
node scripts/travel.mjs set-geojson <leg_id> <file> | set-gpx <leg_id> <file.gpx>
node scripts/osrm-route.mjs <leg_id> '<spec>' [--dry] # OSRM で実線路ルートを補完して取込（recipes/route.md）
node scripts/travel.mjs add-day  '<json>'   | edit-day   <id> '<json>'
node scripts/travel.mjs add-item <day_no> '<json>' | edit-item <id> '<json>' | rm-item <id>
node scripts/travel.mjs add-spot '<json>'   | edit-spot  <id> '<json>' | rm-spot <id>
node scripts/travel.mjs add-budget '<json>' | edit-budget <id> '<json>'
node scripts/travel.mjs edit-trip '<json>'
```

### ② sql.mjs 生SQL（逃げ道・CLIに無い操作用）
CLI に無い操作（複数行の一括並べ替え、横断検索）はこちらで。

```
node scripts/sql.mjs "<SQL>"
```
- `SELECT/PRAGMA/WITH` は行を JSON、`INSERT/UPDATE/DELETE` は `{changes, lastInsertRowid}` を出力。
- 文字列は SQL のシングルクォート、外側はダブルクォートで囲む。`'` は `''` でエスケープ。
- 経由地の削除は CLI の `rm-route <id>`。ただし order_index の振り直しと leg の統合は自動で行われないので、recipes/route.md の手順とセットで使う。
- 破壊的操作は WHERE で id を厳密指定。広い WHERE で一括更新しない。
- `items.day_id` は `days(id)` への FK（`ON DELETE CASCADE`）。day を消すと予定も全消し。

## ★書き込み後に必ず実行する整合チェック

移動プラン・経由地・日構成を変えたら、最後に下を流して破綻が無いか確認する。

```
# 1) route点数 = legs数 + 1 か（移動プランの基本不変条件）
node scripts/sql.mjs "SELECT (SELECT COUNT(*) FROM route) rpts, (SELECT COUNT(*) FROM legs) legs"

# 2) route.order_index に飛び・重複が無いか
node scripts/sql.mjs "SELECT order_index, COUNT(*) c FROM route GROUP BY order_index HAVING c>1"
node scripts/sql.mjs "SELECT order_index FROM route ORDER BY order_index"   # 0,1,2,… の連番か目視

# 3) 各 leg の from/to が route の隣接ペアと一致するか
node scripts/sql.mjs "SELECT l.order_index, l.from_name, l.to_name, ra.name route_from, rb.name route_to FROM legs l LEFT JOIN route ra ON ra.order_index=l.order_index LEFT JOIN route rb ON rb.order_index=l.order_index+1 ORDER BY l.order_index"

# 4) 旅程の都市が地図ルートに存在するか（移動プランと旅程のズレ検出）
#    ※「帰国」など route に無い終端は想定内。それ以外が出たら片側の直し忘れ
node scripts/sql.mjs "SELECT DISTINCT city FROM days WHERE city NOT IN (SELECT name FROM route)"

# 5) 削除したはずの地名が予定に残っていないか（例：ニースを外したら）
node scripts/sql.mjs "SELECT i.id, d.day_no, i.title FROM items i JOIN days d ON d.id=i.day_id WHERE i.title LIKE '%ニース%' OR i.note LIKE '%ニース%'"
```

手動クロスチェック（クエリ化しにくい分）：各 leg の `mode` と、対応する `items` の移動アイテム
（type=flight/train/bus/car）の出発地・到着地・交通手段が一致しているか。

## 進め方（共通）

1. **まず `summary` と関連一覧で現状確認**し、対象の `id`・`order_index`・`day_no` を正確に把握する。
   `days.id` と `day_no`、`legs.order_index` を取り違えない。
2. 場所を挙げられたら **緯度経度(lat/lng) を知識で補完**して登録（地図ピンに必要）。
3. **公式サイト等の URL は分かれば必ず入れる**（リンク保存が要件）。出典は spots の `source` に。
4. 移動・経由地を変えたら **依存グラフに沿って下流(items/budget)も更新**する。
5. 破壊的変更前で不安なら `cp data/travel.db data/travel.db.bak` でバックアップ。
6. 書き終えたら **整合チェックを実行** → **何をどのテーブルにどう変えたか1行で要約** →
   「ブラウザを再読み込みすると反映されます」と伝える。

## 操作レシピ（詳細は参照）

- 移動ルート（route/legs：交通手段変更・経由地の追加/挿入/削除・GeoJSON/GPX取込）→ `recipes/route.md`
- 旅程（days/items：予定の編集・並べ替え・別日への移動・日構成の組み替え）→ `recipes/itinerary.md`
- 候補スポット & 予算（spots/budget）→ `recipes/spots-budget.md`
