// ============================================================
//  しおり API サーバー（Hono + node:sqlite）
//  React からの読み書き、Skill/CLI と同じ DB を共有します。
// ============================================================
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { openDb } from "../db/db.mjs";
import * as spotsRepo from "../db/spots-repo.mjs";
import { getSpotRatings, invalidateSpotCache } from "./places.mjs";
import { registerSpotChatRoute } from "./agent/route.mjs";

/** legs 行 → GeoJSON Feature */
function legToFeature(l) {
  return {
    type: "Feature",
    properties: { id: l.id, order_index: l.order_index, from: l.from_name, to: l.to_name, mode: l.mode, note: l.note },
    geometry: l.geojson ? JSON.parse(l.geojson) : null,
  };
}

const db = openDb();
const app = new Hono();
const PORT = Number(process.env.PORT || 8080);

// ---- 共通ヘルパー ------------------------------------------
/** 許可フィールドだけで UPDATE を組み立てる（部分更新対応） */
function updateRow(table, id, body, allowed) {
  const keys = Object.keys(body).filter((k) => allowed.includes(k));
  if (keys.length === 0) return false;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => body[k]);
  db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values, id);
  return true;
}

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: String(err.message || err) }, 500);
});

// ---- 全データ取得（React の初期ロード） ---------------------
app.get("/api/trip", (c) => {
  const trip = db.prepare("SELECT * FROM trip WHERE id = 1").get() || null;
  const days = db.prepare("SELECT * FROM days ORDER BY day_no").all();
  const allItems = db.prepare("SELECT * FROM items ORDER BY day_id, sort_order, time").all();
  for (const d of days) d.items = allItems.filter((it) => it.day_id === d.id);
  const route = db.prepare("SELECT * FROM route ORDER BY order_index").all();
  // legs: GeoJSON Feature の配列として返す（フロントはそのまま <GeoJSON> で描画）
  const legs = db.prepare("SELECT * FROM legs ORDER BY order_index").all().map(legToFeature);
  const budget = db.prepare("SELECT * FROM budget ORDER BY sort_order, id").all();
  const spots = spotsRepo.listSpots(db);
  return c.json({ trip, days, route, legs, budget, spots });
});

// ---- trip メタ --------------------------------------------
app.put("/api/trip", async (c) => {
  updateRow("trip", 1, await c.req.json(), ["title", "subtitle", "start_date", "end_date", "travelers", "party_size", "fx_note"]);
  return c.json(db.prepare("SELECT * FROM trip WHERE id = 1").get());
});

// ---- days -------------------------------------------------
const DAY_FIELDS = ["day_no", "date", "city", "title"];
app.post("/api/days", async (c) => {
  const b = await c.req.json();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO days (day_no, date, city, title) VALUES (?, ?, ?, ?)")
    .run(b.day_no ?? 0, b.date ?? null, b.city ?? null, b.title ?? null);
  return c.json(db.prepare("SELECT * FROM days WHERE id = ?").get(lastInsertRowid));
});
app.put("/api/days/:id", async (c) => {
  updateRow("days", c.req.param("id"), await c.req.json(), DAY_FIELDS);
  return c.json(db.prepare("SELECT * FROM days WHERE id = ?").get(c.req.param("id")));
});
app.delete("/api/days/:id", (c) => {
  db.prepare("DELETE FROM days WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- items ------------------------------------------------
const ITEM_FIELDS = ["day_id", "sort_order", "time", "type", "title", "note", "url", "url_label", "cost", "spot_id"];
app.post("/api/items", async (c) => {
  const b = await c.req.json();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM items WHERE day_id = ?").get(b.day_id).m;
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO items (day_id, sort_order, time, type, title, note, url, url_label, cost, spot_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(b.day_id, b.sort_order ?? maxOrder + 1, b.time ?? null, b.type ?? "spot", b.title ?? "（無題）",
         b.note ?? null, b.url ?? null, b.url_label ?? null, b.cost ?? null, b.spot_id ?? null);
  return c.json(db.prepare("SELECT * FROM items WHERE id = ?").get(lastInsertRowid));
});
app.put("/api/items/:id", async (c) => {
  updateRow("items", c.req.param("id"), await c.req.json(), ITEM_FIELDS);
  return c.json(db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id")));
});
app.delete("/api/items/:id", (c) => {
  db.prepare("DELETE FROM items WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- budget -----------------------------------------------
const BUDGET_FIELDS = ["sort_order", "category", "per_person", "note"];
app.post("/api/budget", async (c) => {
  const b = await c.req.json();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM budget").get().m;
  const { lastInsertRowid } = db
    .prepare("INSERT INTO budget (sort_order, category, per_person, note) VALUES (?, ?, ?, ?)")
    .run(b.sort_order ?? maxOrder + 1, b.category ?? "（費目）", b.per_person ?? 0, b.note ?? null);
  return c.json(db.prepare("SELECT * FROM budget WHERE id = ?").get(lastInsertRowid));
});
app.put("/api/budget/:id", async (c) => {
  updateRow("budget", c.req.param("id"), await c.req.json(), BUDGET_FIELDS);
  return c.json(db.prepare("SELECT * FROM budget WHERE id = ?").get(c.req.param("id")));
});
app.delete("/api/budget/:id", (c) => {
  db.prepare("DELETE FROM budget WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- spots（行きたいスポット ライブラリ） ------------------
// Google マップの評価（★）を Places API でライブ取得（DB 非永続化）。
// /api/spots/:id（PUT/DELETE）とはメソッド・パスが異なるため衝突しない。
app.get("/api/spots/ratings", async (c) => {
  const spots = spotsRepo.listSpots(db);
  return c.json(await getSpotRatings(db, spots));
});
app.get("/api/spots", (c) => c.json(spotsRepo.listSpots(db)));
app.post("/api/spots", async (c) => c.json(spotsRepo.createSpot(db, await c.req.json())));
app.put("/api/spots/:id", async (c) => {
  const id = c.req.param("id");
  const patch = await c.req.json();
  // 名称・都市・国が変わると別の場所になり得るので Places キャッシュを無効化する。
  if (["name", "city", "country"].some((k) => k in patch)) invalidateSpotCache(db, id);
  return c.json(spotsRepo.updateSpot(db, id, patch));
});
app.delete("/api/spots/:id", (c) => c.json(spotsRepo.deleteSpot(db, c.req.param("id"))));

// ---- spots チャット（AI エージェントによる候補編集の提案）----
registerSpotChatRoute(app, db);

// ---- route ------------------------------------------------
const ROUTE_FIELDS = ["order_index", "name", "lat", "lng", "hub", "leg_type", "note"];
app.post("/api/route", async (c) => {
  const b = await c.req.json();
  const maxOrder = db.prepare("SELECT COALESCE(MAX(order_index), -1) AS m FROM route").get().m;
  const { lastInsertRowid } = db
    .prepare("INSERT INTO route (order_index, name, lat, lng, hub, leg_type, note) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(b.order_index ?? maxOrder + 1, b.name ?? "（地点）", b.lat ?? null, b.lng ?? null, b.hub ?? 0, b.leg_type ?? null, b.note ?? null);
  return c.json(db.prepare("SELECT * FROM route WHERE id = ?").get(lastInsertRowid));
});
app.put("/api/route/:id", async (c) => {
  updateRow("route", c.req.param("id"), await c.req.json(), ROUTE_FIELDS);
  return c.json(db.prepare("SELECT * FROM route WHERE id = ?").get(c.req.param("id")));
});
app.delete("/api/route/:id", (c) => {
  db.prepare("DELETE FROM route WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- legs（都市間の移動・GPX 詳細ルート）------------------
const LEG_FIELDS = ["order_index", "from_name", "to_name", "mode", "geojson", "note"];
app.post("/api/legs", async (c) => {
  const b = await c.req.json();
  const geojson = b.geojson == null ? null : typeof b.geojson === "string" ? b.geojson : JSON.stringify(b.geojson);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO legs (order_index, from_name, to_name, mode, geojson, note) VALUES (?, ?, ?, ?, ?, ?)")
    .run(b.order_index ?? 0, b.from_name ?? null, b.to_name ?? null, b.mode ?? "train", geojson, b.note ?? null);
  return c.json(legToFeature(db.prepare("SELECT * FROM legs WHERE id = ?").get(lastInsertRowid)));
});
app.put("/api/legs/:id", async (c) => {
  const b = await c.req.json();
  if (b.geojson != null && typeof b.geojson !== "string") b.geojson = JSON.stringify(b.geojson);
  updateRow("legs", c.req.param("id"), b, LEG_FIELDS);
  return c.json(legToFeature(db.prepare("SELECT * FROM legs WHERE id = ?").get(c.req.param("id"))));
});
app.delete("/api/legs/:id", (c) => {
  db.prepare("DELETE FROM legs WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- ルート / ヘルスチェック（ブラウザで開いたときの確認用）----
app.get("/", (c) =>
  c.json({ name: "しおり API", status: "ok", endpoints: ["/api/trip", "/health"] })
);
app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`🚆 しおり API (Hono): http://localhost:${PORT}  (DB: ${process.env.TRAVEL_DB || "data/travel.db"})`);
});

// ポート使用中などの起動エラーをクリーンに扱う
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`✖ ポート ${PORT} は既に使用中です。既存のサーバーを停止してから再実行してください。`);
  } else {
    console.error("✖ サーバーエラー:", err.message);
  }
  process.exit(1);
});

// グレースフルシャットダウン（Ctrl+C / SIGTERM でポートと DB を解放して正常終了）
let closing = false;
function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} を受信。サーバーを停止します…`);
  server.close(() => {
    try { db.close(); } catch { /* noop */ }
    console.log("✓ 正常に停止しました。");
    process.exit(0);
  });
  // 接続が残っても一定時間で強制終了（ポートを確実に解放）
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
