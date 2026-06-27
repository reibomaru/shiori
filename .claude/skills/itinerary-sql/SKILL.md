---
name: itinerary-sql
description: /itinerary ページに表示される旅程プラン（日ごとの予定）を、SQLite のテーブルを直接 SQL で書き換えて変更する。「Day3 の予定を入れ替えたい」「この予定の時刻/タイトル/メモを直す」「この日に予定を1件足す/消す」「日付や都市名を直す」など、しおりの旅程そのものを編集する依頼で使う。生の SQL を data/travel.db に発行する点が travel-entry(CLI 経由) と異なる。地図の移動ルートは travel-route を使う。
---

# 旅程プラン 直接編集 Skill（SQLite 生 SQL）

`http://localhost:5173/itinerary` に表示される旅程プランは、SQLite (`data/travel.db`)
の **`days`（1日の枠）** と **`items`（その日の予定）** の2テーブルがソース。
この Skill はその2テーブルへ **生の SQL を直接発行**して旅程を書き換える。
React/PDF は同じ DB を読むので、書けばブラウザ再読み込みで反映される。

## 使うツール

```
node scripts/sql.mjs "<SQL>"
```

- `SELECT/PRAGMA/WITH/EXPLAIN` → 結果行を JSON で出力
- `INSERT/UPDATE/DELETE` → `{changes, lastInsertRowid}` を出力
- DB ファイルを直接読み書きする短命プロセス。pnpm/サーバー起動は不要。
- 文字列リテラルは SQL の **シングルクォート** で書く（例 `title='朝市散策'`）。
  外側の引数はダブルクォートで囲むと崩れにくい。値に `'` を含む場合は `''` で
  エスケープする。

## 対象テーブル

### days（1日の枠）— /itinerary の各カード見出し
| 列 | 内容 |
|---|---|
| `id` | 主キー |
| `day_no` | 何日目か（表示順の基準） |
| `date` | `'2026-09-12'` 形式 |
| `city` | その日の都市 |
| `title` | カード見出し（例 `'ルツェルン｜カペル橋とリギ山'`） |

### items（時系列の予定）— カード内の各行
| 列 | 内容 |
|---|---|
| `id` | 主キー |
| `day_id` | 所属する `days.id`（**day_no ではない**） |
| `sort_order` | 同じ日の中の並び順（小さいほど上） |
| `time` | `'09:30'` 形式の表示時刻 |
| `type` | `flight`/`train`/`bus`/`spot`/`meal`/`hotel`/`free`（アイコン・色が決まる） |
| `title` | 予定名（必須） |
| `note` | 補足メモ |
| `url`, `url_label` | リンクと表示ラベル |
| `cost` | 1人あたり概算（円） |
| `spot_id` | 候補スポット(spots)との紐付け（任意） |

## 進め方（重要）

1. **まず SELECT で現状と id を確認してから書く**。`day_no` と `days.id`、
   `items.id` を取り違えないこと。
   ```
   node scripts/sql.mjs "SELECT id, day_no, date, city, title FROM days ORDER BY day_no"
   node scripts/sql.mjs "SELECT i.id, i.sort_order, i.time, i.type, i.title FROM items i JOIN days d ON d.id=i.day_id WHERE d.day_no=3 ORDER BY i.sort_order"
   ```
2. `items` を追加するときは `day_id` を `days.id` で指定し、`sort_order` は
   その日の予定の並びに合わせる（末尾なら現在の最大 +1、途中に差し込むなら
   後続を `+1` してから INSERT）。
3. `type` は上記の enum のいずれか。外れるとアイコン/色が既定にフォールバックする。
4. 破壊的操作（UPDATE/DELETE）は **WHERE で id を厳密に指定**。広い WHERE で
   一括更新しない。実行前に対象を SELECT で見せて確認してから行うと安全。
5. 書き終えたら **何をどのテーブルにどう変えたかを1行で要約**し、
   「ブラウザを再読み込みすると反映されます」と伝える。

## 例

### 予定のタイトル/時刻を直す
```
node scripts/sql.mjs "SELECT id, time, title FROM items WHERE title LIKE '%カペル橋%'"
node scripts/sql.mjs "UPDATE items SET time='10:00', title='カペル橋と旧市街さんぽ' WHERE id=8"
```

### ある日（day_no=3）の末尾に予定を1件追加
```
node scripts/sql.mjs "SELECT id FROM days WHERE day_no=3"                 # → days.id を確認（例 3）
node scripts/sql.mjs "SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM items WHERE day_id=3"
node scripts/sql.mjs "INSERT INTO items (day_id, sort_order, time, type, title, note, cost) VALUES (3, 5, '18:30', 'meal', '夕食：チーズフォンデュ', '旧市街のレストラン', 6000)"
```

### 同じ日の中で並び順を入れ替える（id=8 の sort_order=2、id=9 の sort_order=3 の場合）
```
node scripts/sql.mjs "SELECT id, sort_order FROM items WHERE id IN (8,9)"
node scripts/sql.mjs "UPDATE items SET sort_order=3 WHERE id=8"
node scripts/sql.mjs "UPDATE items SET sort_order=2 WHERE id=9"
```
（現在値を SELECT で確認し、両者の `sort_order` を直接入れ替えるのが確実）

### 予定を削除 / 日付・都市を直す
```
node scripts/sql.mjs "DELETE FROM items WHERE id=12"
node scripts/sql.mjs "UPDATE days SET date='2026-09-15', city='ツェルマット', title='ツェルマット｜ゴルナーグラート' WHERE day_no=4"
```

## 注意

- `items.day_id` は `days(id)` への外部キー（`ON DELETE CASCADE`）。day を消すと
  その日の予定も全部消える。
- `data/travel.db` を直接いじるため、不安な大規模変更の前は
  `cp data/travel.db data/travel.db.bak` でバックアップしておくとよい。
