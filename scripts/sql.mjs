#!/usr/bin/env node
// data/travel.db に SQL を直接発行する薄いランナー。
// プロジェクト標準の node:sqlite を使うので追加依存・サーバー起動は不要。
//
// 使い方:
//   node scripts/sql.mjs "SELECT * FROM days ORDER BY day_no"
//   node scripts/sql.mjs "UPDATE items SET title='朝市散策' WHERE id=12"
//
// SELECT/PRAGMA/WITH/EXPLAIN は行を JSON で出力、
// それ以外（INSERT/UPDATE/DELETE 等）は {changes, lastInsertRowid} を出力する。
import { openDb } from "../db/db.mjs";

const sql = process.argv.slice(2).join(" ").trim();
if (!sql) {
  console.error('usage: node scripts/sql.mjs "<SQL>"');
  process.exit(1);
}

const db = openDb();
try {
  const isQuery = /^\s*(select|pragma|with|explain)\b/i.test(sql);
  if (isQuery) {
    const rows = db.prepare(sql).all();
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const r = db.prepare(sql).run();
    console.log(
      JSON.stringify({ changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) })
    );
  }
} finally {
  db.close();
}
