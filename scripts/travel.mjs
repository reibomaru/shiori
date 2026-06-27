#!/usr/bin/env node
// ============================================================
//  travel CLI — SQLite を直接編集するためのツール
//  Skill（情報入力UX）から呼び出して使います。
//
//  使い方:
//    node scripts/travel.mjs <command> [args...]
//
//  JSON を取る系は引数に JSON 文字列を渡します（シングルクォート推奨）。
// ============================================================
import { readFileSync } from "node:fs";
import { openDb } from "../db/db.mjs";
import { extractLineString, lineStringLatLngs } from "../db/geo.mjs";

const db = openDb();
const [cmd, ...args] = process.argv.slice(2);

const out = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
function parseJson(s, label) {
  if (!s) { console.error(`JSON 引数（${label}）が必要です`); process.exit(1); }
  try { return JSON.parse(s); }
  catch (e) { console.error(`JSON の解析に失敗: ${e.message}`); process.exit(1); }
}
/** SQLite はプリミティブしかバインドできないため、配列/オブジェクトは JSON 文字列にする */
const bindVal = (v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);
/** 許可フィールドだけ INSERT */
function insert(table, obj, fields) {
  const cols = fields.filter((f) => obj[f] !== undefined);
  const ph = cols.map(() => "?").join(", ");
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${ph})`)
    .run(...cols.map((f) => bindVal(obj[f])));
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(lastInsertRowid);
}
function update(table, id, obj, fields) {
  const cols = fields.filter((f) => obj[f] !== undefined);
  if (!cols.length) { console.error("更新するフィールドがありません"); process.exit(1); }
  db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`)
    .run(...cols.map((f) => bindVal(obj[f])), id);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}
function dayIdByNo(no) {
  const row = db.prepare("SELECT id FROM days WHERE day_no = ?").get(no);
  if (!row) { console.error(`Day ${no} が見つかりません`); process.exit(1); }
  return row.id;
}

const SPOT_FIELDS = ["name", "name_en", "category", "city", "country", "lat", "lng", "url", "note", "source", "want_level", "icon", "instagram"];
const ITEM_FIELDS = ["day_id", "sort_order", "time", "type", "title", "note", "url", "url_label", "cost", "spot_id"];
const DAY_FIELDS = ["day_no", "date", "city", "title"];
const BUDGET_FIELDS = ["sort_order", "category", "per_person", "note"];
const ROUTE_FIELDS = ["order_index", "name", "lat", "lng", "hub", "leg_type", "note"];
const LEG_FIELDS = ["order_index", "from_name", "to_name", "mode", "geojson", "note"];

switch (cmd) {
  // ---- 全体サマリ ----
  case "summary": {
    const trip = db.prepare("SELECT * FROM trip WHERE id=1").get();
    const days = db.prepare("SELECT d.day_no, d.date, d.city, d.title, COUNT(i.id) AS items FROM days d LEFT JOIN items i ON i.day_id=d.id GROUP BY d.id ORDER BY d.day_no").all();
    const spots = db.prepare("SELECT COUNT(*) n FROM spots").get().n;
    const budget = db.prepare("SELECT COALESCE(SUM(per_person),0) p FROM budget").get().p;
    out({ trip, days, spotCount: spots, budgetPerPerson: budget });
    break;
  }

  // ---- spots（行きたい候補） ----
  case "spots":
    out(db.prepare("SELECT * FROM spots ORDER BY want_level DESC, id").all());
    break;
  case "add-spot":
    out(insert("spots", parseJson(args[0], "spot"), SPOT_FIELDS));
    break;
  case "edit-spot":
    out(update("spots", args[0], parseJson(args[1], "spot"), SPOT_FIELDS));
    break;
  case "rm-spot":
    db.prepare("DELETE FROM spots WHERE id=?").run(args[0]); out("ok");
    break;

  // ---- days ----
  case "days":
    out(db.prepare("SELECT * FROM days ORDER BY day_no").all());
    break;
  case "add-day":
    out(insert("days", parseJson(args[0], "day"), DAY_FIELDS));
    break;
  case "edit-day":
    out(update("days", args[0], parseJson(args[1], "day"), DAY_FIELDS));
    break;

  // ---- items（旅程の予定）----
  case "items": {
    const where = args[0] ? "WHERE day_id = ?" : "";
    const params = args[0] ? [dayIdByNo(Number(args[0]))] : [];
    out(db.prepare(`SELECT * FROM items ${where} ORDER BY day_id, sort_order`).all(...params));
    break;
  }
  case "add-item": {
    // add-item <day_no> '<json>'
    const obj = parseJson(args[1], "item");
    obj.day_id = dayIdByNo(Number(args[0]));
    if (obj.sort_order === undefined) {
      obj.sort_order = db.prepare("SELECT COALESCE(MAX(sort_order),-1)+1 n FROM items WHERE day_id=?").get(obj.day_id).n;
    }
    out(insert("items", obj, ITEM_FIELDS));
    break;
  }
  case "edit-item":
    out(update("items", args[0], parseJson(args[1], "item"), ITEM_FIELDS));
    break;
  case "rm-item":
    db.prepare("DELETE FROM items WHERE id=?").run(args[0]); out("ok");
    break;

  // ---- budget ----
  case "budget":
    out(db.prepare("SELECT * FROM budget ORDER BY sort_order, id").all());
    break;
  case "add-budget":
    out(insert("budget", parseJson(args[0], "budget"), BUDGET_FIELDS));
    break;
  case "edit-budget":
    out(update("budget", args[0], parseJson(args[1], "budget"), BUDGET_FIELDS));
    break;

  // ---- route（地図のルート）----
  case "route":
    out(db.prepare("SELECT * FROM route ORDER BY order_index").all());
    break;
  case "add-route":
    out(insert("route", parseJson(args[0], "route"), ROUTE_FIELDS));
    break;
  case "edit-route":
    out(update("route", args[0], parseJson(args[1], "route"), ROUTE_FIELDS));
    break;
  case "rm-route":
    db.prepare("DELETE FROM route WHERE id=?").run(args[0]); out("ok");
    break;

  // ---- legs（都市間移動・GeoJSON 詳細ルート）----
  case "legs":
    out(db.prepare("SELECT id, order_index, from_name, to_name, mode, note, geojson FROM legs ORDER BY order_index").all()
      .map(({ geojson, ...r }) => ({ ...r, points: geojson ? lineStringLatLngs(JSON.parse(geojson)).length : 0 })));
    break;
  case "add-leg":
    out(insert("legs", parseJson(args[0], "leg"), LEG_FIELDS));
    break;
  case "edit-leg":
    out(update("legs", args[0], parseJson(args[1], "leg"), LEG_FIELDS));
    break;
  case "set-gpx":
  case "set-geojson": {
    // set-gpx / set-geojson <leg_id> <file>  … ファイルを読み GeoJSON LineString として保存
    const raw = readFileSync(args[1], "utf8");
    const geom = extractLineString(raw);
    if (!geom) { console.error("LineString を抽出できませんでした"); process.exit(1); }
    const geojson = JSON.stringify(geom);
    const row = update("legs", args[0], { geojson }, LEG_FIELDS);
    out({ id: row.id, from: row.from_name, to: row.to_name, mode: row.mode, points: lineStringLatLngs(geom).length });
    break;
  }
  case "rm-leg":
    db.prepare("DELETE FROM legs WHERE id=?").run(args[0]); out("ok");
    break;

  // ---- trip メタ ----
  case "edit-trip":
    out(update("trip", 1, parseJson(args[0], "trip"), ["title", "subtitle", "start_date", "end_date", "travelers", "party_size", "fx_note"]));
    break;

  default:
    out(`travel CLI コマンド一覧:
  summary                         全体の概要
  spots | add-spot <json> | edit-spot <id> <json> | rm-spot <id>
  days  | add-day <json>  | edit-day <id> <json>
  items [day_no] | add-item <day_no> <json> | edit-item <id> <json> | rm-item <id>
  budget | add-budget <json> | edit-budget <id> <json>
  route  | add-route <json>  | edit-route <id> <json> | rm-route <id>
  legs   | add-leg <json> | edit-leg <id> <json> | set-geojson <id> <file> | set-gpx <id> <file> | rm-leg <id>
  edit-trip <json>

例:
  node scripts/travel.mjs add-spot '{"name":"シヨン城","city":"モントルー","country":"スイス","lat":46.4143,"lng":6.9276,"url":"https://www.chillon.ch/","want_level":4,"source":"地球の歩き方 p.210"}'
  node scripts/travel.mjs add-item 7 '{"time":"15:00","type":"spot","title":"シヨン城","note":"レマン湖畔の水城","url":"https://www.chillon.ch/"}'
  node scripts/travel.mjs legs                          # 区間と現在の点数を確認
  node scripts/travel.mjs set-geojson 3 ~/Downloads/glacier-express.geojson  # GeoJSON取込
  node scripts/travel.mjs set-gpx 3 ~/Downloads/glacier-express.gpx          # GPXを取込(自動変換)`);
}

db.close();
