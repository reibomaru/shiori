# 🥂 スイス & 南仏 ハネムーン しおり

旅程・予算・移動ルート（地図）を1つにまとめた、新婚旅行のしおりアプリ。

```
[Skill] 情報入力/編集  →  [SQLite] 永続化  →  [React] 旅程・地図・予算をプレビュー
        ▲                                              │
        └──────── [画面] 微修正 → SQLite保存 ◀─────────┘  →  [PDF出力]
```

## 構成

| 層 | 技術 |
|---|---|
| 永続化 | **SQLite**（Node 標準 `node:sqlite`／ネイティブビルド不要） |
| API | **Hono**（`@hono/node-server`） |
| 入力UX | **Claude Code Skill** `travel-entry` ＋ `scripts/travel.mjs` CLI |
| 表示/編集 | **React + Vite + react-leaflet**（地図は OpenStreetMap・APIキー不要） |
| 出力 | 印刷CSS（ブラウザの「PDFに保存」） |

## セットアップ

```bash
pnpm install
pnpm db:init      # SQLite に初期データ（11日間の旅程）を投入
pnpm dev          # API(:8080) と Vite(:5173) を同時起動
```

ブラウザで http://localhost:5173 を開く。

- **編集モード**: 画面右上のボタン。各予定・予算を直接編集 → 保存で SQLite に反映。
- **PDF出力**: 「🖨️ PDF出力」→ ブラウザの印刷ダイアログで「PDFに保存」。
- **地図**: 移動ルートを番号付きピンと点線で表示。

### データを作り直す

```bash
pnpm db:reset     # 全削除して初期データを再投入
```

## Skill でスポットを登録する

Claude Code で `travel-entry` Skill を使い、ガイドブックを見ながら
「シヨン城をレマン湖の日に追加して」のように話しかけると、SQLite に登録されます。
内部的には次の CLI を使います:

```bash
node scripts/travel.mjs summary                    # 現状確認
node scripts/travel.mjs add-spot '{"name":"…", "url":"…"}'
node scripts/travel.mjs add-item 7 '{"time":"15:00","type":"spot","title":"…"}'
```

`node scripts/travel.mjs` を引数なしで実行するとコマンド一覧が出ます。

### 都市間ルートを GeoJSON で詳細表示

鉄道などの地上移動は `legs` テーブルに **GeoJSON（LineString）** を持たせ、地図（Leaflet の
`<GeoJSON>`）で実際の経路に沿って描画します（空路は破線フォールバック）。内部標準は GeoJSON ですが、
手持ちの **GPX**（鉄道アプリ・Komoot・Garmin 等からエクスポート）も取り込めます（自動変換）:

```bash
node scripts/travel.mjs legs                                    # 区間と現在の点数
node scripts/travel.mjs set-geojson 3 ~/Downloads/route.geojson # GeoJSONを取込
node scripts/travel.mjs set-gpx 3 ~/Downloads/route.gpx         # GPXを取込（→GeoJSONに変換）
```

## ディレクトリ

```
db/        schema.sql / db.mjs(接続) / seed.mjs(初期データ)
server/    index.mjs  Hono API
scripts/   travel.mjs CLI（Skill から利用）
src/       React（App / components / api / types）
.claude/skills/travel-entry/  情報入力 Skill
data/      travel.db（SQLite・自動生成）
```
