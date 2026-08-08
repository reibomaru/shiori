#!/bin/sh
# アプリ本体の起動。
#
# per-project storage 分離では DB がプロジェクトごとに増えるため、単一 DB を
# まとめてレプリケートする方式はやめ、アプリ（server/litestream.ts）が
# プロジェクト DB を開くたびに `litestream restore` / `litestream replicate` を
# 実行する。したがってここでは Node を直接起動するだけでよい。
# graceful shutdown（SIGTERM）でアプリが全 replicate を最終同期して停止する。
set -eu

exec node server/index.ts
