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
| 入力UX | **Claude Code Skill** `travel-entry` ＋ `scripts/travel.ts` CLI |
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
node scripts/travel.ts summary                    # 現状確認
node scripts/travel.ts add-spot '{"name":"…", "url":"…"}'
node scripts/travel.ts add-item 7 '{"time":"15:00","type":"spot","title":"…"}'
```

`node scripts/travel.ts` を引数なしで実行するとコマンド一覧が出ます。

## AI アシスタントでスポットを追加・編集する（候補画面のチャット）

候補画面（`/spots`）の「AI アシスタント」タブで、自然文の指示から AI が
Web を調べてスポット候補の**追加・更新・削除を提案**します。AI は DB を直接
書き換えず、提案カードの内容を確認・修正して「保存」を押したときに反映される
**プレビュー承認制**です。

```
ユーザー「ツェルマットでマッターホルンが見える展望スポットを3つ追加して」
  → AI: web_search → fetch_url → geocode（緯度経度）→ 追加の提案カード ×3
  → ユーザーが内容を確認/修正して [保存] → 候補一覧・地図に反映
```

- 使用エンジン: **Gemini**（`@earendil-works/pi-coding-agent` 経由）。
- 補完ツール: `web_search`（websearchapi.ai）/ `fetch_url` / `geocode`（OpenStreetMap Nominatim）。
- **画像対応（マルチモーダル）**: ガイドブックの写真・地図のスクショ等を添付すると、画像から施設名・場所を読み取って提案します（🖼️ ボタン or 貼り付け）。
- **セッション**: 会話は左の一覧からいつでも resume できます。会話本体は pi の JSONL（`data/agent-sessions/`）に永続化し、一覧・タイトル・コストなどの索引は SQLite（`chat_sessions` テーブル）に保存します。
- コスト表示: チャット右上にトークン数と概算 USD を表示。
- API キーはサーバ側のみで保持（ブラウザには出ません）。

### セットアップ

```bash
cp .env.example .env          # GEMINI_API_KEY / WEBSEARCH_API_KEY を設定
```

`GEMINI_API_KEY` は https://aistudio.google.com/apikey 、`WEBSEARCH_API_KEY` は
https://websearchapi.ai で取得できます。

**A) すべてホストで動かす（開発向け）**

```bash
pnpm dev   # API(:8080) + Vite(:5173) を前面でまとめて起動
```

Ctrl+C で 2 つとも停止します。`web_search` は websearchapi.ai を直接呼ぶため、
Docker は不要です（`WEBSEARCH_API_KEY` が未設定だと web_search だけ無効になります）。

**B) バックエンドを Docker で動かす**

```bash
docker compose up -d --build   # api(:8080) をコンテナ起動
pnpm web                        # フロント(Vite:5173) はホストで起動
```

`docker compose down` で停止。SQLite（`data/travel.db`）とエージェントの
セッションは `./data` をマウントして永続化します。

`WEBSEARCH_API_KEY` が未設定の場合、`web_search` だけが無効になり、URL を貼る運用
（`fetch_url`）や地名からの座標取得（`geocode`）は引き続き使えます。

> SearXNG は使わなくなりましたが、設定（`searxng/` と compose の `searxng` サービス）は
> 残してあります。必要なら `docker compose --profile searxng up searxng` で起動できます。

| 環境変数 | 既定 | 用途 |
|---|---|---|
| `GEMINI_API_KEY` | （必須） | Gemini の API キー |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | 使用モデル |
| `WEBSEARCH_API_KEY` | （必須） | web_search 用 websearchapi.ai の API キー |

### 都市間ルートを GeoJSON で詳細表示

鉄道などの地上移動は `legs` テーブルに **GeoJSON（LineString）** を持たせ、地図（Leaflet の
`<GeoJSON>`）で実際の経路に沿って描画します（空路は破線フォールバック）。内部標準は GeoJSON ですが、
手持ちの **GPX**（鉄道アプリ・Komoot・Garmin 等からエクスポート）も取り込めます（自動変換）:

```bash
node scripts/travel.ts legs                                    # 区間と現在の点数
node scripts/travel.ts set-geojson 3 ~/Downloads/route.geojson # GeoJSONを取込
node scripts/travel.ts set-gpx 3 ~/Downloads/route.gpx         # GPXを取込（→GeoJSONに変換）
```

## ディレクトリ

```
db/        schema.sql / db.ts(接続) / seed.ts(初期データ)
server/    index.ts  Hono API
scripts/   travel.ts CLI（Skill から利用）
src/       React（App / components / api / types）
.claude/skills/travel-entry/  情報入力 Skill
data/      travel.db（SQLite・自動生成）
```
