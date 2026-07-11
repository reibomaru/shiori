#!/bin/sh
# マイグレーション Job: GCS レプリカから復元 → migrate 実行 → GCS へ確定。
#
# ⚠️ アプリ本体が停止している（単一ライタ）窓で実行すること。
#
# 実装メモ（重要）:
#   以前は `litestream replicate -exec "node db/migrate.ts"` の 1 コマンドで
#   済ませていたが、migrate が 1 秒未満で終わると Litestream の sync-interval(1s)
#   tick が一度も回らず、終了時の最終同期も初回スナップショットを取り切る前に
#   プロセスが落ちて「migrate は成功したのに GCS へ未反映」になる競合があった
#   （常駐するアプリ本体では表面化しないが、短命な本 Job だけが踏む）。
#   そこで「① 先に migrate を適用 → ② Litestream 監視下で数秒待機して
#   フルスナップショットを確実に取り切る」の 2 段構えにする。
set -eu

mkdir -p "$(dirname "$TRAVEL_DB")"

# ① レプリカがあれば復元し、Litestream 監視外で migrate を適用する。
#    migrate 側で WAL を main db へチェックポイント済みにしておく。
litestream restore -if-replica-exists -if-db-not-exists "$TRAVEL_DB"
node db/migrate.ts

# ② migrate 済みの db を Litestream で GCS へ確定させる。
#    復元直後の db はローカルに generation メタを持たないため、replicate 開始で
#    新規 generation のフルスナップショットが作られる。sync-interval(1s) を十分に
#    上回る待機を挟み、スナップショット＋最終同期を確実に完了させてから終了する。
exec litestream replicate -exec "sh -c 'sleep 5'"
