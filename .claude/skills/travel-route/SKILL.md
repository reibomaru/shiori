---
name: travel-route
description: スイス&南仏ハネムーンしおりの「移動プラン」（/map に表示される都市間の移動ルート）を変更する。「ルートを変える」「立ち寄り先を追加/順番を入れ替えたい」「この区間を鉄道→飛行機にしたい」「氷河特急の実ルート(GeoJSON/GPX)を取り込みたい」といった、地図上の経路・交通手段に関する依頼で使う。スポット候補や1日の予定・予算の編集は travel-entry を使う。SQLite(data/travel.db) を travel CLI 経由で読み書きする。
---

# 移動プラン（地図ルート）編集 Skill

`/map` ページ（MapView「移動プラン」）に出る都市間の移動を編集するための Skill。
データは 2 つのテーブルで構成される。React プレビュー・PDF はこの DB を読むので、
ここで書けば再読み込みで画面に反映される。

- **route** … 地図に置く経由地点（都市・空港）の並び。番号付きピンとして表示される。
- **legs** … 隣り合う route 点どうしをつなぐ「区間」。交通手段(mode)と、任意で実ルートの
  GeoJSON を持つ。GeoJSON があれば線路に沿った平らな線、無ければ弧（後述）で描画される。

## ★区間の描画：GeoJSON が無い区間は「弧」になる（飛行機に見える）

MapView (`src/components/MapView.tsx`) は区間を **2 通りで描き分ける**。これは色(mode)とは
独立した「線の形」の話なので、mode が train でも形が空路っぽく見えることがある。

- **GeoJSON を持つ区間** → `GeoJsonLayer`（"rail"）で、座標列に沿った**平らな線**。
- **GeoJSON を持たない区間** → `ArcLayer` で `getHeight: 0.5` の**3D の弧**。
  色は mode のままだが、この弧の形が**飛行機の経路のように見える**。区間カードには「直線」と出る。

つまり「鉄道なのに飛行機みたいな弧で表示される」のは設定ミスではなく、実ルートの
GeoJSON が無い区間のフォールバック描画。**平らな鉄道の線にしたいなら GeoJSON を取り込む**
（経由点を並べた LineString でよい。例：ジュネーブ→マルセイユは Geneva→Lyon→ローヌ谷→
Marseille の経由点で近似ルートを作成し `set-geojson` で取込）。`legs` の `points` が
2 点以上になれば "rail" レイヤーで平らに描かれる。空路をあえて弧で見せたい区間は
GeoJSON を入れずにそのままでよい。

## ★最重要：order_index の対応関係

- `route.order_index` は **0 始まりの連番**（0,1,2,…）。地図のピン番号は `order_index+1`。
- `legs.order_index` が `i` の区間は **route[i] → route[i+1]** をつなぐ。
  例：leg.order_index=3 は route[3]「アンデルマット」→ route[4]「ツェルマット」。
- したがって **N 個の route 点には N-1 個の leg** が対応する。
  地点を追加・削除・並べ替えると、route と legs の両方の `order_index` を
  ずれなく振り直す必要がある。書く前に必ず `route` と `legs` で現状を確認すること。

## 使うツール

すべて `node scripts/travel.mjs <command>`（pnpm/サーバー起動は不要。DB を直接読み書きする短命プロセス）。

確認系（書く前に必ず実行）:

```
node scripts/travel.mjs route     # 経由地点一覧（order_index / hub / leg_type を確認）
node scripts/travel.mjs legs      # 区間一覧（from→to / mode / 詳細ルートの点数）
```

書き込み系（JSON は **シングルクォート**で囲む）:

```
node scripts/travel.mjs add-route  '<json>'          # 経由地点を追加
node scripts/travel.mjs edit-route <id> '<json>'     # 経由地点を修正（順番・座標・hub 等）
node scripts/travel.mjs rm-route   <id>              # 経由地点を削除
node scripts/travel.mjs add-leg    '<json>'          # 区間を追加
node scripts/travel.mjs edit-leg   <id> '<json>'     # 区間を修正（mode・note・順番）
node scripts/travel.mjs rm-leg     <id>              # 区間を削除
node scripts/travel.mjs set-geojson <leg_id> <file>  # 区間に実ルート GeoJSON を取込
node scripts/travel.mjs set-gpx     <leg_id> <file>  # GPX を取込（自動で GeoJSON 化）
```

※ `rm-route` で点自体は消せるが、order_index の振り直しと leg の統合は自動では行われない。
地点を消す時は後述の手順（leg 統合 + order_index 振り直し）とセットで使うこと。

## データの形（フィールド）

- **route（経由地点）**: `order_index`(0始まり連番), `name`(必須・地図ラベル),
  `lat`, `lng`(必須・ピン位置), `hub`(1=宿泊拠点で大きいピン / 0=通過点),
  `leg_type`(直線描画時のフォールバック色用 mode), `note`(ピンのツールチップ。例「Day 5–6｜ユングフラウヨッホ」)
- **legs（区間）**: `order_index`(route の i→i+1 を指す), `from_name`, `to_name`(表示用ラベル),
  `mode`(`train`/`flight`/`bus`/`car`/`walk`), `geojson`(GeoJSON LineString・任意),
  `note`(ツールチップ。例「★氷河特急（フルカ〜ローヌ谷）」)。
  `mode` ごとに線の色が変わる（鉄道=シアン, バス・登山=青緑, 車=オレンジ, 飛行機=青, 徒歩=緑）。

## 進め方

1. **まず `route` と `legs` で現状を確認**し、対象の `id` と `order_index` を正確に把握する。
2. 地点を挙げられたら **緯度経度(lat/lng) を自分の知識で補完**して登録する（ピン位置に必要）。
3. 変更後は **route 点数 = legs 数 + 1** になっているか、order_index に飛び・重複がないかを
   `route` / `legs` で再確認する。
4. 書き終えたら **何を変えたかを1行で要約**し、「再読み込みで地図に反映されます」と伝える。
5. 交通手段や経由地が費用に影響する場合は、必要に応じて travel-entry で `budget` / `items` も調整する。

## よくある操作

### 区間の交通手段を変える（例：ジュネーブ→ニースを飛行機→鉄道に）
```
node scripts/travel.mjs legs        # 該当 leg の id を確認（例 id=7, order_index=6）
node scripts/travel.mjs edit-leg 7 '{"mode":"train","note":"TGV 約7h（リヨン乗換）"}'
```
route 側の `leg_type` も直線フォールバック色に使われるので、対応する出発点の leg_type も
合わせておくと色が揃う（例 route id=7「ジュネーブ」を `{"leg_type":"train"}`）。

### 実ルート（氷河特急など）を取り込んで線形を綺麗にする
```
node scripts/travel.mjs legs                               # 対象区間の id を確認
node scripts/travel.mjs set-geojson 4 ~/Downloads/glacier-express.geojson
# GPX しかない場合
node scripts/travel.mjs set-gpx 4 ~/Downloads/glacier-express.gpx
```
取込後 `legs` の `points` が増えていれば反映成功。

### 経由地を末尾に追加する（例：マルセイユの先にアヴィニョンを足す）
```
node scripts/travel.mjs route       # 現在の最大 order_index を確認（例 8 = マルセイユ）
node scripts/travel.mjs add-route '{"order_index":9,"name":"アヴィニョン","lat":43.9493,"lng":4.8055,"hub":1,"leg_type":"train","note":"Day 11｜法王庁"}'
node scripts/travel.mjs add-leg   '{"order_index":8,"from_name":"マルセイユ","to_name":"アヴィニョン","mode":"train","note":"TGV 約35分"}'
```

### 途中に経由地を挿入する（order_index の振り直しが必要）
1. `route` で挿入位置以降の点を、後ろから順に `edit-route <id> '{"order_index": +1}'` でずらす。
2. 新しい点を空いた order_index で `add-route`。
3. 既存の通し区間 leg を `edit-leg` で「手前→新点」に書き換え、`add-leg` で「新点→次点」を追加。
   以降の leg の order_index も +1 する。最後に `route`/`legs` で連番と点数を検算する。

### 経由地を削除する（例：ジュネーブ→ニース→マルセイユからニースを外す）
1. 消す点に出入りする 2 本の leg のうち片方を `rm-leg`、もう片方を `edit-leg` で
   「前点→後点」を直接つなぐ区間に書き換える（from_name/to_name/mode/note/order_index を更新。
   古い区間の geojson が残るなら `'{"geojson":null}'` でクリアする）。
2. 消す点を `rm-route <id>` で削除する。
3. 消した点より後ろの route 点を `edit-route` で order_index −1、後ろの leg も order_index −1
   して連番に詰める。最後に `route`/`legs` で **route 点数 = legs 数 + 1** と連番を検算する。
