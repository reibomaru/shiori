# しおりアプリ本番イメージ（フロント静的配信 + Hono API + Litestream）。
# node:sqlite を使うためネイティブビルド不要。Node 24 は node:sqlite と
# TypeScript の型ストリップ（node server/index.ts）をフラグ無しで利用できる。

# ============================================================
#  builder: フロント（Vite → dist）をビルドする
# ============================================================
FROM node:24-slim AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# フロントのビルドに必要なソースをコピーして dist を生成。
COPY . .
RUN pnpm exec vite build

# ============================================================
#  runtime: API + 静的配信 + Litestream
# ============================================================
FROM node:24-slim AS runtime
WORKDIR /app
RUN corepack enable

# Litestream バイナリを導入（GCS レプリケーション用）。
# TARGETARCH は buildkit が自動設定（amd64/arm64）。Cloud Run は amd64。
# ca-certificates は必須: これが無いと litestream が GCS への TLS 検証に失敗して起動できない。
ARG LITESTREAM_VERSION=v0.3.13
ARG TARGETARCH
ADD https://github.com/benbjohnson/litestream/releases/download/${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${TARGETARCH}.deb /tmp/litestream.deb
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates /tmp/litestream.deb \
  && rm -rf /var/lib/apt/lists/* /tmp/litestream.deb

# 本番依存だけ入れてレイヤキャッシュを効かせる。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# バックエンド実行に必要なソース（shared は型のみだが念のため同梱）。
COPY server ./server
COPY db ./db
COPY shared ./shared

# ビルド済みフロント。
COPY --from=builder /app/dist ./dist

# Litestream 設定と起動スクリプト。
COPY litestream.yml /etc/litestream.yml
COPY docker/entrypoint.sh docker/migrate-job.sh /app/
RUN chmod +x /app/entrypoint.sh /app/migrate-job.sh

ENV NODE_ENV=production
ENV PORT=8080
ENV TRAVEL_DB=/data/travel.db
# AI チャット履歴の保存先（本番は GCS FUSE マウント）。
ENV AGENT_SESSIONS_DIR=/data/agent-sessions
EXPOSE 8080

# アプリ本体は entrypoint（restore → replicate -exec server）。
# マイグレーション Job は command を /app/migrate-job.sh に差し替えて実行する。
CMD ["/app/entrypoint.sh"]
