# 🥂 スイス & 南仏 ハネムーン しおり

[![deploy](https://github.com/reibomaru/travel-plans/actions/workflows/deploy.yml/badge.svg)](https://github.com/reibomaru/travel-plans/actions/workflows/deploy.yml)

旅程・予算・移動ルート（地図）・スポット候補・旅のメモを1つにまとめた、新婚旅行のしおりアプリ。
データは単一の SQLite にまとまっており、Claude Code Skill / AI アシスタント / 画面のどこから編集しても
同じ DB に反映される。本番は Google Cloud Run へ自動デプロイ（Litestream で SQLite を GCS へ継続レプリケーション）。

```
[Skill / AIアシスタント] 情報入力・編集 →  [SQLite] 永続化  →  [React] 旅程・地図・予算・メモをプレビュー
        ▲                                                      │
        └──────────── [画面] 微修正 → SQLite保存 ◀─────────────┘  →  [PDF出力]
```

## 画面（機能）

| 画面 | 内容 |
|---|---|
| 🗺️ **地図**（`/map`） | 移動ルートを番号付きピンと線で表示。deck.gl 製で、標準/衛星/地形/淡色のベースマップ切替、空路は弧（Arc）、地上移動は GeoJSON 実経路で描画。候補スポットのピンも重ねられる。 |
| 🗓️ **旅程**（`/itinerary`） | 日ごとの予定。ドラッグ&ドロップ（`@dnd-kit`）の**ビルダー**で予定・移動区間を編集・並べ替え。 |
| 💰 **予算**（`/budget`） | 費目ごとの予算管理。 |
| 🧭 **スポット**（`/spots`） | 行きたい候補スポットの一覧・地図。Google 評価（★）・写真の表示、Instagram ギャラリー、**AI アシスタント**での追加/編集。 |
| 📝 **メモ**（`/memo`） | 旅のメモ。画像の取り込み・情報抽出、ページ間の関係グラフ（Mermaid）、**AI アシスタント**による編集。 |

- **編集モード**: 旅程・予算ページのヘッダーのトグル。各予定・費目を直接編集 → 保存で SQLite に反映。
- **PDF出力**: ブラウザの印刷（「PDFに保存」）。操作用 UI は `no-print` で印刷対象外。

## 構成

| 層 | 技術 |
|---|---|
| 永続化 | **SQLite**（Node 標準 `node:sqlite`／ネイティブビルド不要）＋ マイグレーション（`db/migrations/`） |
| API | **Hono**（`@hono/node-server`） |
| 表示/編集 | **React 19 + Vite + React Router + Tailwind CSS v4** |
| 地図 | **deck.gl**（タイルは OpenStreetMap 等・APIキー不要） |
| AI アシスタント | **pi-coding-agent**（`@earendil-works/pi-coding-agent`）＋ **Gemini** |
| 補完ツール | `web_search`（websearchapi.ai）/ `fetch_url` / `geocode`（OSM Nominatim）/ ルート補完（OSRM） |
| スポット評価・写真 | **Google Places API (New)**（任意・`spot_place_cache` に30日キャッシュ） |
| 入力UX | **Claude Code Skill** `travel-plan` ＋ `scripts/travel.ts` / `scripts/sql.ts` CLI |
| 出力 | 印刷CSS（ブラウザの「PDFに保存」） |
| デプロイ | **Docker → Google Cloud Run**（`.github/workflows/deploy.yml`）＋ **Litestream**（SQLite を GCS へレプリケーション）＋ **Terraform**（`infra/terraform`） |

## セットアップ

```bash
pnpm install
pnpm db:init      # SQLite に初期データ（11日間の旅程）を投入
pnpm dev          # API(:8080) と Vite(:5173) を同時起動
```

ブラウザで http://localhost:5173 を開く。

### データを作り直す

```bash
pnpm db:reset     # 全削除して初期データを再投入
```

### マイグレーション

スキーマ変更は `db/migrations/` に連番 SQL を追加していく方式。

```bash
node db/migrate.ts            # 未適用のマイグレーションを適用
node db/migrate.ts --status   # 適用状況を表示
```

本番デプロイでは、`db/migrations/` に差分がある push のときだけ、デプロイ前に
「単一ライタ窓での migrate Job」を自動で挟む（詳細は `.github/workflows/deploy.yml`）。

## AI アシスタントの環境変数

スポット候補・メモの AI アシスタントは Gemini を利用する。

```bash
cp .env.example .env          # 各 API キーを設定
```

| 環境変数 | 既定 | 用途 |
|---|---|---|
| `GEMINI_API_KEY` | （必須） | Gemini の API キー（https://aistudio.google.com/apikey） |
| `GEMINI_MODEL` | `gemini-3-flash-preview` | 使用モデル（複雑な調べ物は `gemini-3-pro-preview`） |
| `WEBSEARCH_API_KEY` | （任意） | `web_search` 用（https://websearchapi.ai）。未設定だと web_search だけ無効 |
| `GOOGLE_MAPS_API_KEY` | （任意） | スポットの Google 評価（★）・写真取得用。未設定でもキャッシュがあれば表示 |

### AI でスポットを追加・編集する（スポット画面のチャット）

スポット画面（`/spots`）の「AI アシスタント」タブで、自然文の指示から AI が Web を調べて
スポット候補の**追加・更新・削除を提案**します。AI は DB を直接書き換えず、提案カードを確認・修正して
「保存」を押したときに反映される**プレビュー承認制**です。

```
ユーザー「ツェルマットでマッターホルンが見える展望スポットを3つ追加して」
  → AI: web_search → fetch_url → geocode（緯度経度）→ 追加の提案カード ×3
  → ユーザーが内容を確認/修正して [保存] → 候補一覧・地図に反映
```

- **画像対応（マルチモーダル）**: ガイドブックの写真・地図のスクショ等を添付すると、画像から施設名・場所を読み取って提案します（🖼️ ボタン or 貼り付け）。
- **セッション**: 会話は左の一覧からいつでも resume できます。会話本体は pi の JSONL（`data/agent-sessions/`）に永続化し、一覧・タイトル・コストなどの索引は SQLite（`chat_sessions`）に保存します。
- コスト表示: チャット右上にトークン数と概算 USD を表示。API キーはサーバ側のみで保持します。

## Skill でデータを編集する

Claude Code の `travel-plan` Skill が、移動ルート / 旅程 / 候補スポット / 予算をまとめて扱います
（これらは1つの DB で密結合しているため1スキルに集約）。内部的には次の CLI を使います:

```bash
node scripts/travel.ts summary                     # まず全体把握
node scripts/travel.ts route | legs | days | spots | budget
node scripts/travel.ts add-spot '{"name":"…", "url":"…"}'
node scripts/travel.ts add-item 7 '{"time":"15:00","type":"spot","title":"…"}'
node scripts/sql.ts "<SQL>"                          # CLI に無い操作用の逃げ道
```

`node scripts/travel.ts` を引数なしで実行するとコマンド一覧が出ます。

### 都市間ルートを GeoJSON で詳細表示

鉄道などの地上移動は `legs` テーブルに **GeoJSON（LineString）** を持たせ、地図で実際の経路に沿って
描画します（空路は弧のフォールバック）。内部標準は GeoJSON ですが、手持ちの **GPX** も取り込めます（自動変換）:

```bash
node scripts/travel.ts legs                                    # 区間と現在の点数
node scripts/travel.ts set-geojson 3 ~/Downloads/route.geojson # GeoJSONを取込
node scripts/travel.ts set-gpx 3 ~/Downloads/route.gpx         # GPXを取込（→GeoJSONに変換）
node scripts/osrm-route.ts <leg_id> '<spec>'                   # OSRM で実線路ルートを補完して取込
```

## Docker / 本番デプロイ

ローカルでも本番同等のイメージ（フロント静的配信 + Hono API + Litestream）を Docker で起動できます。

```bash
docker compose up -d --build   # api(:8080) をコンテナ起動
pnpm web                        # フロント(Vite:5173) はホストで起動
```

`docker compose down` で停止。SQLite（`data/travel.db`）やエージェントのセッションは `./data` を
マウントして永続化します。`GOOGLE_MAPS_API_KEY` などの環境変数は `.env` から渡ります。

本番は **Google Cloud Run**。`main` への push で `.github/workflows/deploy.yml` が
イメージのビルド → Artifact Registry へ push → Cloud Run 更新まで自動実行します
（上部の deploy バッジが最新の結果）。SQLite は **Litestream** で GCS バケットへ継続レプリケーション。
インフラ（Cloud Run / Artifact Registry / IAM / GCS など）は `infra/terraform` で管理しています。
設計の詳細は `docs/gcp-deployment-design.md` を参照。

## ディレクトリ

```
db/         schema.sql / migrations/ / db.ts(接続) / migrate.ts / seed.ts / *-repo.ts / geo.ts
server/     index.ts  Hono API（/api/... と /health）、agent/ AIアシスタント、places.ts Google Places
scripts/    travel.ts / sql.ts / osrm-route.ts CLI（Skill から利用）
src/        React（pages / components / hooks / api.ts / types.ts）
  components/  MapView(deck.gl) / builder(旅程) / spotChat / memoChat / memo など
.claude/skills/travel-plan/   データ編集 Skill
infra/terraform/              GCP インフラ定義
docs/       er-diagram.md / gcp-deployment-design.md
data/       travel.db（SQLite・自動生成）/ agent-sessions（AI会話ログ）
```
