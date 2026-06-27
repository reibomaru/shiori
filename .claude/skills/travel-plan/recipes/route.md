# レシピ：移動ルート（route / legs）

`/map` の「移動プラン」を編集する。**変更したら必ず SKILL.md の依存グラフに沿って
下流（days/items/budget）も直し、整合チェックを実行する。**

## データの形

- **route（経由地点）**: `order_index`(0始まり連番), `name`(必須・地図ラベル),
  `lat`,`lng`(必須・ピン位置), `hub`(1=宿泊拠点で大ピン/0=通過点),
  `leg_type`(直線描画時のフォールバック色用 mode), `note`(ツールチップ。例「Day 5–6｜ユングフラウヨッホ」)
- **legs（区間）**: `order_index`(route の i→i+1 を指す), `from_name`,`to_name`(表示ラベル),
  `mode`(`train`/`flight`/`bus`/`car`/`walk`), `geojson`(GeoJSON LineString・任意), `note`。
  mode で線色が変わる（鉄道=シアン, バス・登山=青緑, 車=オレンジ, 飛行機=青, 徒歩=緑）。

## ★order_index の対応関係

- `route.order_index` は **0 始まりの連番**。地図のピン番号は `order_index+1`。
- `legs.order_index = i` の区間は **route[i] → route[i+1]** をつなぐ。
- よって **N 個の route 点に N-1 個の leg**。追加・削除・並べ替えでは両方の order_index を
  ずれなく振り直す。書く前に必ず `route` と `legs` で現状確認。

## ★区間の描画：GeoJSON が無い区間は「弧」になる（飛行機に見える）

mode（色）とは独立した「線の形」の話。

- **GeoJSON あり** → 座標列に沿った**平らな線**（"rail" レイヤー）。
- **GeoJSON なし** → **3D の弧**（ArcLayer）。色は mode のままだが形が空路っぽく見える。
  区間カードには「直線」と出る。

鉄道なのに弧で出るのは設定ミスではなくフォールバック。平らにしたいなら経由点を並べた
LineString を作って `set-geojson` で取り込む（`legs` の `points` が2点以上になれば "rail" 描画）。
空路をあえて弧で見せたい区間は GeoJSON を入れずそのままでよい。

## 確認系

```
node scripts/travel.mjs route     # 経由地点（order_index/hub/leg_type）
node scripts/travel.mjs legs      # 区間（from→to/mode/詳細点数）
```

## 区間の交通手段を変える（例：ジュネーブ→マルセイユを TGV に）
```
node scripts/travel.mjs legs      # 該当 leg の id を確認
node scripts/travel.mjs edit-leg 8 '{"mode":"train","note":"TGV（リヨン乗換）約3.5h"}'
```
直線フォールバック色を合わせるなら出発点 route の `leg_type` も合わせる
（例 `edit-route 7 '{"leg_type":"train"}'`）。
**→ 下流:** 対応する `items` の移動アイテム(type/title/出発到着)と `budget` の交通費も直す。

## 実ルート（氷河特急など）を取り込む
```
node scripts/travel.mjs set-geojson 4 ~/Downloads/glacier-express.geojson
node scripts/travel.mjs set-gpx     4 ~/Downloads/glacier-express.gpx   # GPX は自動変換
```
取込後 `legs` の `points` が増えていれば成功。

## 経由地を末尾に追加（例：マルセイユの先にアヴィニョン）
```
node scripts/travel.mjs route      # 現在の最大 order_index を確認（例 7=マルセイユ）
node scripts/travel.mjs add-route '{"order_index":8,"name":"アヴィニョン","lat":43.9493,"lng":4.8055,"hub":1,"leg_type":"train","note":"Day 11｜法王庁"}'
node scripts/travel.mjs add-leg   '{"order_index":7,"from_name":"マルセイユ","to_name":"アヴィニョン","mode":"train","note":"TGV 約35分"}'
```
**→ 下流:** `add-day` で日を足し、`add-item` で到着・観光・宿泊を入れ、`budget` を調整。

## 途中に経由地を挿入（order_index の振り直しが必要）
1. `route` で挿入位置以降を後ろから `edit-route <id> '{"order_index": +1}'` でずらす。
2. 空いた order_index に `add-route`。
3. 既存の通し leg を `edit-leg` で「手前→新点」に書き換え、`add-leg` で「新点→次点」を追加。
   以降の leg の order_index も +1。最後に整合チェックで連番と点数を検算。

## 経由地を削除（rm-route は無いので sql.mjs を使う）
例：ジュネーブ→ニース→マルセイユ から **ニースを外す**（実例）。
1. 出入りする2本の leg のうち片方を `rm-leg`、もう片方を `edit-leg` で「前点→後点」を直結に
   書き換え（from_name/to_name/mode/note を更新。古い geojson が残るなら `'{"geojson":null}'` でクリア）。
   ```
   node scripts/travel.mjs rm-leg 7
   node scripts/travel.mjs edit-leg 8 '{"from_name":"ジュネーブ","to_name":"マルセイユ","order_index":6,"mode":"train","note":"TGV（リヨン乗換）約3.5h","geojson":null}'
   ```
2. **route の点自体を削除（CLI に無いので生SQL）**：
   ```
   node scripts/sql.mjs "DELETE FROM route WHERE id=8"          # ニース
   ```
3. 削除点より後ろの route 点を order_index −1 して連番に詰める：
   ```
   node scripts/sql.mjs "UPDATE route SET order_index=order_index-1 WHERE order_index>7"
   ```
4. **→ 下流（必須）:** ニースの `days`/`items`（観光・宿泊・移動アイテム）を削除/付け替え、
   `budget` の交通・観光費を調整（詳細は recipes/itinerary.md）。
5. **整合チェックを実行**：route点数=legs+1 /「ニース」が items に残っていないか 等。
