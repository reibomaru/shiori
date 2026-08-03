# Contributing

shiori（旅のしおりアプリ）の開発手順。UI の一貫性など実装上の規約は [`CLAUDE.md`](CLAUDE.md) を参照。

## 開発環境のセットアップ

### 必要なもの

- **Node.js 24** — リポジトリ直下の [`.nvmrc`](.nvmrc) で固定。標準の `node:sqlite` と TypeScript の型ストリップ（`node server/index.ts`）をフラグ無しで使うため、24 系に揃える（`package.json` の `engines.node` は `>=24`）。
- **pnpm 9 以上** — `packageManager` に `pnpm@9.15.0` を固定済み。`corepack enable` で有効化できる。
- **Docker** — ローカルの Firestore エミュレータ（`pnpm dev` / `pnpm test` が起動する）。

```bash
# nvm 利用時。リポジトリ直下で .nvmrc の Node を使う。
nvm use            # 未インストールなら nvm install

corepack enable    # pnpm を有効化（未導入の場合）
pnpm install       # 依存をインストール（--frozen-lockfile 相当は CI 側）
```

### 環境変数（AI アシスタントを使う場合）

```bash
cp .env.example .env   # GEMINI_API_KEY などを設定（使わなければスキップ可）
```

主要な変数は [`README.md`](README.md#configuration) を参照。

## 日常の開発コマンド

```bash
pnpm db:init       # サンプルデータを SQLite に投入（初回）
pnpm db:reset      # データを作り直す

pnpm dev           # Firestore エミュレータ + API(:8080) + Vite(:5173) を同時起動
pnpm dev:no-emu    # エミュレータ無しで API + Vite（外部 Firestore を使う場合）
```

ブラウザで http://localhost:5173 を開く。

## 変更を出す前のチェック

コミット / PR を出す前に、ローカルで最低限これらを通す（CI でも実行される）:

```bash
pnpm typecheck     # tsc（フロント + サーバ）
pnpm build         # 型チェック + Vite ビルド
pnpm test          # Firestore エミュレータ + node:test（server/**/*.test.ts）
```

> Lint / Format（Biome）は #39 で導入予定。導入後は `pnpm check` をこの一覧に追加する。

## データ編集（Skill / CLI）

移動ルート・旅程・スポット・予算は 1 つの SQLite に密結合しているため、[`.claude/skills/travel-plan`](.claude/skills/travel-plan/SKILL.md) の Skill（内部で `scripts/travel.ts` / `scripts/sql.ts`）に集約している。詳細は README「Using Skills」を参照。
