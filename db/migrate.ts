// ============================================================
//  マイグレーション CLI。
//    node db/migrate.ts            未適用を適用（本番 Job / 開発とも共通）
//    node db/migrate.ts --status   適用状況を表示
//    node db/migrate.ts --baseline schema.sql 起点（<=3）を「適用済み」記録
// ============================================================
import { pathToFileURL } from "node:url";
import { openDb } from "./db.ts";
import {
  applyPending,
  appliedVersions,
  currentVersion,
  expectedVersion,
  recordBaseline,
  BASELINE_VERSION,
} from "./migrate-runner.ts";

function main(): void {
  const args = new Set(process.argv.slice(2));
  const db = openDb(); // schema.sql 適用 + baseline 記録まで済む

  if (args.has("--status")) {
    const applied = [...appliedVersions(db)].sort((a, b) => a - b);
    console.log(`applied : ${applied.join(", ") || "(none)"}`);
    console.log(`current : v${currentVersion(db)}`);
    console.log(`expected: v${expectedVersion()}`);
    return;
  }

  if (args.has("--baseline")) {
    recordBaseline(db);
    console.log(`baseline を v${BASELINE_VERSION} まで記録しました。`);
    return;
  }

  const n = applyPending(db);
  console.log(
    n > 0
      ? `完了: ${n} 件のマイグレーションを適用しました（現在 v${currentVersion(db)}）。`
      : `最新です（現在 v${currentVersion(db)}）。`,
  );
}

// 直接実行時のみ main を走らせる（import 時は何もしない）。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
