#!/bin/sh
# マイグレーション Job: GCS レプリカから復元 → migrate 実行 → GCS へ確定。
#
# `litestream replicate -exec` は指定コマンド実行中もレプリケートし、
# コマンド終了時に最終同期してから同じ終了コードで終了する。
# これにより migrate の結果が確実に GCS レプリカへ反映される。
#
# ⚠️ アプリ本体が停止している（単一ライタ）窓で実行すること。
set -eu

mkdir -p "$(dirname "$TRAVEL_DB")"

litestream restore -if-replica-exists -if-db-not-exists "$TRAVEL_DB"

exec litestream replicate -exec "node db/migrate.ts"
