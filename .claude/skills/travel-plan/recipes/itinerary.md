# レシピ：旅程（days / items）

`/itinerary` の日ごとの予定を編集する。CLI(`travel.mjs`)でも生SQL(`sql.mjs`)でも編集可。
単純な追加・修正は CLI、複数行の並べ替え・横断検索は生SQL が向く。

## データの形

### days（1日の枠）— カード見出し
`id`(主キー) / `day_no`(表示順) / `date`(`2026-09-12`) / `city` / `title`

### items（その日の予定）— カード内の各行
`id` / `day_id`(**days.id。day_no ではない**) / `sort_order`(小さいほど上) /
`time`(`09:30`) / `type`(`flight`/`train`/`bus`/`spot`/`meal`/`hotel`/`free`／アイコン色が決まる) /
`title`(必須) / `note` / `url`,`url_label` / `cost`(1人あたり円) / `spot_id`(spots紐付・任意)

## 確認系（書く前に必ず）
```
node scripts/travel.mjs days
node scripts/travel.mjs items <day_no>
# 生SQLなら：
node scripts/sql.mjs "SELECT i.id,i.sort_order,i.time,i.type,i.title FROM items i JOIN days d ON d.id=i.day_id WHERE d.day_no=3 ORDER BY i.sort_order"
```

## 予定の追加（day_no=3 の末尾に1件）
```
node scripts/travel.mjs add-item 3 '{"time":"18:30","type":"meal","title":"夕食：チーズフォンデュ","note":"旧市街のレストラン","cost":6000}'
```
`add-item` は `sort_order` 省略時に「その日の最大+1」を自動採番。途中に差し込むなら
後続を +1 してから追加するか、`sort_order` を明示する。

## 予定の修正
```
node scripts/travel.mjs items 2                         # id を確認
node scripts/travel.mjs edit-item 8 '{"time":"10:00","title":"カペル橋と旧市街さんぽ"}'
```

## 同じ日の中で並べ替え（sort_order を入れ替える）
```
node scripts/sql.mjs "SELECT id,sort_order FROM items WHERE id IN (8,9)"
node scripts/sql.mjs "UPDATE items SET sort_order=3 WHERE id=8"
node scripts/sql.mjs "UPDATE items SET sort_order=2 WHERE id=9"
```

## 予定を別の日に移す（day_id を変更）
`edit-item` は `day_id`・`sort_order` も変更できる（day_id は **days.id** を渡す）。
```
node scripts/travel.mjs edit-item 34 '{"day_id":8,"sort_order":1,"time":"19:30"}'
```

## 予定の削除 / 日付・都市・見出しの修正
```
node scripts/travel.mjs rm-item 12
node scripts/travel.mjs edit-day 4 '{"date":"2026-09-15","city":"ツェルマット","title":"ツェルマット｜ゴルナーグラート"}'
```

## 日を増やす / 減らす（移動プラン変更に伴う日構成の組み替え）
```
node scripts/travel.mjs add-day '{"day_no":12,"date":"2026-09-23","city":"アヴィニョン","title":"アヴィニョン｜法王庁"}'
```
- `day_no` は表示順の基準。途中に挿入するなら後続の day_no を繰り上げる。
- **day を消すと `items` も CASCADE で全消し**。残したい予定があれば先に `edit-item` で別日へ移す。
- 破壊的変更前は `cp data/travel.db data/travel.db.bak`。

## 移動プラン変更に伴う旅程の組み替え（実例：ニースを外す）
route/legs でジュネーブ→マルセイユ直行 TGV にした時の下流対応：
1. ニース着のフライト item を「ジュネーブ→マルセイユ TGV」に `edit-item`。
2. ニース観光・モナコ等の item を `rm-item`。宿泊 item の都市名を `edit-item`。
3. 浮いた日（ニース連泊だった日）を別の滞在（マルセイユ/プロヴァンス）に `edit-day`＋`add-item`、
   または `day` を減らして日程短縮。
4. `budget` の交通・観光費を調整（recipes/spots-budget.md）。
5. SKILL.md の **整合チェック**を実行（消えた地名が items に残っていないか 等）。

## 注意
- `type` は enum のいずれか。外れるとアイコン/色が既定にフォールバック。
- 破壊的操作（UPDATE/DELETE）は WHERE で id を厳密指定。広い WHERE で一括更新しない。
