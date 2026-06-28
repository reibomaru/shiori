# しおり API サーバー（Hono + node:sqlite）の本番イメージ。
# node:sqlite を使うためネイティブビルド不要。Node 24 は node:sqlite と
# TypeScript の型ストリップ（node server/index.ts）をフラグ無しで利用できる。
FROM node:24-slim

WORKDIR /app
RUN corepack enable

# 依存だけ先に入れてレイヤキャッシュを効かせる。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# バックエンドの実行に必要なソースのみコピー（フロントはビルド対象外）。
# shared は型のみ（import type で実行時には消去される）だが、念のため同梱する。
COPY server ./server
COPY db ./db
COPY shared ./shared

ENV PORT=8080
ENV TRAVEL_DB=/app/data/travel.db
EXPOSE 8080

CMD ["node", "server/index.ts"]
