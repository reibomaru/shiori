# レシピ：候補スポット（spots）& 予算（budget）

## spots（行きたい候補）

「まだ日程に入れていないが行きたい場所」のプール。`/itinerary` の予定(items)に
昇格させる前段。地図ピンや候補リストに使う。

### フィールド
`name`(必須) / `name_en` / `category`(観光/食事/自然/美術館…) / `city` /
`country`(スイス/フランス) / `lat`,`lng` / `url` / `note` /
`source`(出典 例:地球の歩き方 p.210) / `want_level`(1–5)

### 操作
```
node scripts/travel.mjs spots
node scripts/travel.mjs add-spot '{"name":"シヨン城","name_en":"Château de Chillon","category":"観光","city":"モントルー","country":"スイス","lat":46.4143,"lng":6.9276,"url":"https://www.chillon.ch/en/","note":"レマン湖畔の水城","source":"地球の歩き方","want_level":4}'
node scripts/travel.mjs edit-spot <id> '<json>'
node scripts/travel.mjs rm-spot <id>
```

### 候補 → 旅程へ昇格
場所を挙げられたら **lat/lng を知識で補完**し、**URL が分かれば必ず入れる**。
「行きたい」段階なら spots、「この日に入れる」なら items へ。昇格時は spots を参照して
同等内容の item を `add-item`（recipes/itinerary.md）。費用が出るなら budget も調整。
```
node scripts/travel.mjs days        # ジュネーブの日が day_no=7 と確認
node scripts/travel.mjs add-item 7 '{"time":"15:30","type":"spot","title":"シヨン城","note":"レマン湖畔の水城","url":"https://www.chillon.ch/en/","url_label":"Château de Chillon"}'
```

## budget（予算）

`/` の予算表。1人あたり概算（円）。

### フィールド
`category`(費目) / `per_person`(円) / `note`

### 操作
```
node scripts/travel.mjs budget
node scripts/travel.mjs add-budget '{"category":"現地アクティビティ","per_person":20000,"note":"ボートツアー等"}'
node scripts/travel.mjs edit-budget 3 '{"category":"スイス→南仏 移動（ジュネーブ→マルセイユ TGV直行）","per_person":15000,"note":"直行TGV（リヨン乗換）"}'
```

### 移動プラン・旅程を変えたら budget も直す
交通手段や経由地を変えると交通費・観光費が変わる。SKILL.md の依存グラフどおり、
route/legs・items を編集したら対応する budget 費目を `edit-budget` で更新する
（例：経由便を廃止して直行TGVにしたら交通費を減額、削除した観光地の入場料を観光費から外す）。
