---
name: travel-entry
description: スイス&南仏ハネムーンしおりの旅程データを編集する。ガイドブック（地球の歩き方など）を見ながら「行きたいスポットを登録」「この日に予定を追加」「予算を直す」「ルートを変える」といった依頼が来たときに使う。SQLite(data/travel.db)へ travel CLI 経由で読み書きする。
---

# 旅のしおり データ入力 Skill

ユーザーがガイドブックを見ながら口頭で伝えてくる旅行情報を、しおりの SQLite DB
(`data/travel.db`) に登録・編集するための Skill。React プレビュー・PDF はこの DB を
読むので、ここで書けば画面にそのまま反映される。

## 使うツール

すべて `node scripts/travel.mjs <command>` で操作する（pnpm/サーバー起動は不要。
DB ファイルを直接読み書きする短命プロセス）。

```
node scripts/travel.mjs summary                  # まず現状把握
node scripts/travel.mjs days                      # Day 一覧（day_no を確認）
node scripts/travel.mjs spots                     # 候補スポット一覧
node scripts/travel.mjs items <day_no>            # その日の予定
```

書き込み系（JSON は **シングルクォート**で囲む）:

```
node scripts/travel.mjs add-spot   '<json>'           # 行きたい候補を登録
node scripts/travel.mjs add-item   <day_no> '<json>'  # 旅程の予定を追加
node scripts/travel.mjs edit-item  <id> '<json>'      # 予定を修正
node scripts/travel.mjs rm-item    <id>
node scripts/travel.mjs add-day    '<json>'
node scripts/travel.mjs edit-budget <id> '<json>'
node scripts/travel.mjs add-route  '<json>'
node scripts/travel.mjs edit-trip  '<json>'
```

都市間の移動ルート（GeoJSON で詳細表示。GPX も取込可）:

```
node scripts/travel.mjs legs                          # 区間一覧と点数
node scripts/travel.mjs set-geojson <leg_id> <file>   # GeoJSONを区間に取込
node scripts/travel.mjs set-gpx <leg_id> <file.gpx>   # GPXを取込（自動でGeoJSONに変換）
node scripts/travel.mjs add-leg '<json>'              # 区間を追加（mode: train/flight/bus/car/walk）
```

## データの形（主なフィールド）

- **spots（行きたい候補）**: `name`(必須), `name_en`, `category`(観光/食事/自然/美術館…),
  `city`, `country`(スイス/フランス), `lat`, `lng`, `url`, `note`, `source`(出典 例:地球の歩き方 p.210),
  `want_level`(1–5)
- **items（旅程の予定）**: `time`("09:30"), `type`(`flight`/`train`/`bus`/`spot`/`meal`/`hotel`/`free`),
  `title`(必須), `note`, `url`, `url_label`, `cost`(円・1人あたり)
- **budget**: `category`, `per_person`(円), `note`
- **route（地図のルート点）**: `name`, `lat`, `lng`, `hub`(1=宿泊拠点), `leg_type`, `note`
- **legs（都市間の移動・GeoJSON詳細ルート）**: `order_index`(route の i→i+1 区間), `from_name`, `to_name`,
  `mode`(train/flight/bus/car/walk), `geojson`(GeoJSON LineString・任意), `note`。
  鉄道など地上移動は GeoJSON で実際の経路を表示、空路は破線フォールバック。
  ユーザーがルートファイルのパスを渡したら `set-geojson <leg_id> <path>`（GPXなら `set-gpx`）で取り込む。
- **days**: `day_no`, `date`("2026-09-12"), `city`, `title`

## 進め方

1. **まず `summary` と関連する一覧コマンドで現状を確認**してから書く（day_no・id を取り違えない）。
2. ユーザーが場所を挙げたら、**緯度経度(lat/lng)を自分の知識で補完**して登録する
   （地図ピンに使うため。確信がなければ省略可、後から `edit-spot` で足せる）。
3. 公式サイト等の **URL がわかれば必ず入れる**（リンク保存が要件）。出典がわかれば `source` に。
4. 「行きたい」段階なら **spots** に、「この日に組み込む」なら **items** に入れる。
   候補を旅程へ昇格させる時は、spots を参照して同等内容の item を `add-item` する。
5. 書き込んだら、**何をどのテーブルに入れたかを1行で要約**し、
   「ブラウザを再読み込みすると反映されます」と伝える。
6. 費用に関わる追加をしたら、必要に応じて `budget` の該当費目も `edit-budget` で調整する。

## 例

ユーザー:「地球の歩き方で見たシヨン城、レマン湖の日に行きたい」

```
node scripts/travel.mjs days        # ジュネーブの日が day_no=7 と確認
node scripts/travel.mjs add-spot '{"name":"シヨン城","name_en":"Château de Chillon","category":"観光","city":"モントルー","country":"スイス","lat":46.4143,"lng":6.9276,"url":"https://www.chillon.ch/en/","note":"レマン湖畔の水城","source":"地球の歩き方","want_level":4}'
node scripts/travel.mjs add-item 7 '{"time":"15:30","type":"spot","title":"シヨン城","note":"レマン湖畔の水城。ジュネーブから列車で。","url":"https://www.chillon.ch/en/","url_label":"Château de Chillon"}'
```

→「Day 7（ジュネーブ）にシヨン城を追加し、候補リストにも登録しました。再読み込みで反映されます。」
