# しおり API サーバー（Hono + node:sqlite）の本番イメージ。
# node:sqlite を使うためネイティブビルド不要。Node 24 は node:sqlite を
# フラグ無しで利用できる。
FROM node:24-slim

WORKDIR /app
RUN corepack enable

# 依存だけ先に入れてレイヤキャッシュを効かせる。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# バックエンドの実行に必要なソースのみコピー（フロントはビルド対象外）。
COPY server ./server
COPY db ./db

ENV PORT=8080
ENV TRAVEL_DB=/app/data/travel.db
EXPOSE 8080

CMD ["node", "server/index.mjs"]
