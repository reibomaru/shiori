# レシピ：候補スポット（spots）& 予算（budget）

## spots（行きたい候補）

「まだ日程に入れていないが行きたい場所」のプール。`/itinerary` の予定(items)に
昇格させる前段。地図ピンや候補リストに使う。

### フィールド
`name`(必須) / `name_en` / `category`(観光/食事/自然/美術館…) / `city` /
`country`(スイス/フランス) / `lat`,`lng` / `url`(公式サイト) /
`google_maps_url`(Google マップのリンク) / `note` /
`source`(出典 例:地球の歩き方 p.210) /
`icon`(地図ピンのアイコン種別。未指定なら category から自動)

口コミ・星評価は `google_maps_url` のリンク先で確認する方針。**評価値などは shiori 側に
重複保存しない**（`want_level` などの評価フィールドは廃止済み）。

`icon` のキー: `pin`/`sightseeing`/`nature`/`food`/`cafe`/`hotel`/`castle`/
`museum`/`shopping`/`view`/`beach`/`star`。通常は **category を入れれば自動で
それらしいピン**になるので省略可。明示したいときだけ指定する。

`instagram` は関連 Instagram 投稿 URL の **配列**（候補カードに埋め込み表示）。
公開投稿の `…/p/{code}/`・`/reel/{code}/`・`/tv/{code}/` 形式を手動で指定する。
```
node scripts/travel.ts edit-spot 1 '{"instagram":["https://www.instagram.com/p/ABC123/","https://www.instagram.com/reel/XYZ789/"]}'
```

### 操作
```
node scripts/travel.ts spots
node scripts/travel.ts add-spot '{"name":"シヨン城","name_en":"Château de Chillon","category":"観光","city":"モントルー","country":"スイス","lat":46.4143,"lng":6.9276,"url":"https://www.chillon.ch/en/","google_maps_url":"https://maps.app.goo.gl/...","note":"レマン湖畔の水城","source":"地球の歩き方"}'
node scripts/travel.ts edit-spot <id> '<json>'
node scripts/travel.ts rm-spot <id>
```

### 候補 → 旅程へ昇格
場所を挙げられたら **lat/lng を知識で補完**し、**URL が分かれば必ず入れる**。
「行きたい」段階なら spots、「この日に入れる」なら items へ。昇格時は spots を参照して
同等内容の item を `add-item`（recipes/itinerary.md）。費用が出るなら budget も調整。
```
node scripts/travel.ts days        # ジュネーブの日が day_no=7 と確認
node scripts/travel.ts add-item 7 '{"time":"15:30","type":"spot","title":"シヨン城","note":"レマン湖畔の水城","url":"https://www.chillon.ch/en/","url_label":"Château de Chillon"}'
```

## budget（予算）

`/` の予算表。1人あたり概算（円）。

### フィールド
`category`(費目) / `per_person`(円) / `note`

### 操作
```
node scripts/travel.ts budget
node scripts/travel.ts add-budget '{"category":"現地アクティビティ","per_person":20000,"note":"ボートツアー等"}'
node scripts/travel.ts edit-budget 3 '{"category":"スイス→南仏 移動（ジュネーブ→マルセイユ TGV直行）","per_person":15000,"note":"直行TGV（リヨン乗換）"}'
```

### 移動プラン・旅程を変えたら budget も直す
交通手段や経由地を変えると交通費・観光費が変わる。SKILL.md の依存グラフどおり、
route/legs・items を編集したら対応する budget 費目を `edit-budget` で更新する
（例：経由便を廃止して直行TGVにしたら交通費を減額、削除した観光地の入場料を観光費から外す）。
