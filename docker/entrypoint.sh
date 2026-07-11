#!/bin/sh
# アプリ本体の起動: GCS レプリカから復元 → Litestream 監視下でサーバー起動。
set -eu

mkdir -p "$(dirname "$TRAVEL_DB")"

# レプリカがあれば復元（初回=レプリカ無しなら何もしない）。
litestream restore -if-replica-exists -if-db-not-exists "$TRAVEL_DB"

# Litestream の監視下で API サーバーを起動（プロセス終了時に最終同期される）。
exec litestream replicate -exec "node server/index.ts"
