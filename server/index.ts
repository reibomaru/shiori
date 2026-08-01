// ============================================================
//  しおり API サーバー（Hono + node:sqlite）
//  React からの読み書き、Skill/CLI と同じ DB を共有します。
// ============================================================
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { HTTPException } from "hono/http-exception";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { registerAuthRoutes, requireAdmin, requireAuth } from "./auth.ts";
import { closeAllUserDbs, getUserDb, getUserSessionDir } from "./storage.ts";
import { listUsers, setUserFlags } from "./users.ts";
import * as spotsRepo from "../db/spots-repo.ts";
import * as memoRepo from "../db/memo-repo.ts";
import { getSpotRatings, invalidateSpotCache, previewPlace } from "./places.ts";
import { registerSpotChatRoute, registerMemoChatRoute } from "./agent/route.ts";
import { extractGraphFromImages, extractHtmlFromImages } from "./agent/extract.ts";
import { normalizeImageForWeb } from "./agent/images.ts";
import { MissingApiKeyError } from "./agent/runner.ts";
import type { AgentImage } from "./agent/runner.ts";
import { sanitizeHtml, htmlToText } from "./agent/html.ts";
import type {
  TripMeta,
  Day,
  Item,
  RoutePoint,
  BudgetItem,
  LegFeature,
} from "../shared/types.ts";
import type { LegRow } from "../db/types.ts";

/** legs 行 → GeoJSON Feature */
function legToFeature(l: LegRow): LegFeature {
  return {
    type: "Feature",
    properties: { id: l.id, order_index: l.order_index, from: l.from_name, to: l.to_name, mode: l.mode, note: l.note },
    geometry: l.geojson ? JSON.parse(l.geojson) : null,
  };
}

const app = new Hono();
const PORT = Number(process.env.PORT || 8080);

// ---- 認証（Google SSO）+ storage 解決 ---------------------
// /auth/* はログイン導線。/api/* は認証必須にし、認証で解決した userId から
// そのユーザー専用の DB ハンドル・会話セッション dir を毎リクエスト解決する。
// ドメインの各ハンドラは c.get("db") を使い、グローバル DB に依存しない。
// ヘルスチェック・静的配信・/auth/* は認証不要（順序に注意: /api/* にのみ適用）。
registerAuthRoutes(app);
app.use("/api/*", requireAuth);
app.use("/api/*", (c, next) => {
  const userId = c.get("userId");
  c.set("db", getUserDb(userId));
  c.set("sessionDir", getUserSessionDir(userId));
  return next();
});

// ---- 管理者 API（/api/admin/*・admin ロール必須）--------------
// ユーザー台帳（Firestore）の一覧と、他ユーザーの利用許可・ロールの変更。
// 変更は対象ユーザーの次回ログインで反映される（判定はログイン時のみ）。
app.use("/api/admin/*", requireAdmin);
app.get("/api/admin/users", async (c) => c.json(await listUsers()));
app.patch("/api/admin/users/:sub", async (c) => {
  const sub = c.req.param("sub");
  // 自分自身の権限変更は不可（誤操作による admin 全滅・自己ロックを防ぐ）。
  if (sub === c.get("userId")) return c.json({ error: "自分自身の権限は変更できません。" }, 400);
  const body = (await c.req.json().catch(() => ({}))) as { allowed?: unknown; role?: unknown };
  const patch: { allowed?: boolean; role?: "admin" | "user" } = {};
  if (typeof body.allowed === "boolean") patch.allowed = body.allowed;
  if (body.role === "admin" || body.role === "user") patch.role = body.role;
  if (Object.keys(patch).length === 0) return c.json({ error: "allowed か role を指定してください。" }, 400);
  const updated = await setUserFlags(sub, patch);
  if (!updated) return c.json({ error: "ユーザーが見つかりません。" }, 404);
  return c.json(updated);
});

// ---- 共通ヘルパー ------------------------------------------
/** 許可フィールドだけで UPDATE を組み立てる（部分更新対応） */
function updateRow(db: DatabaseSync, table: string, id: SQLInputValue, body: Record<string, unknown>, allowed: string[]): boolean {
  const keys = Object.keys(body).filter((k) => allowed.includes(k));
  if (keys.length === 0) return false;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => body[k] as SQLInputValue);
  db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`).run(...values, id);
  return true;
}

app.onError((err, c) => {
  // HTTPException（認証の 401 など）は本来の応答をそのまま返す。
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  const msg = String(err.message || err);
  // DB の制約違反はクライアント側の入力ミス（不正な予定）なので 400 で返す。
  //   - items: 移動は leg_id、スポット(spot/meal/hotel)は spot_id が必須（free は例外）
  //   - legs : geojson 必須
  if (/constraint/i.test(msg)) {
    const hint = /CHECK constraint/i.test(msg)
      ? "予定は移動なら leg_id、スポット(spot/meal/hotel)なら spot_id のどちらか一方が必要です（free は例外）。"
      : /NOT NULL constraint failed: legs\.geojson/i.test(msg)
        ? "移動区間（leg）には geojson が必須です。"
        : "データが制約に違反しています。";
    return c.json({ error: hint, detail: msg }, 400);
  }
  return c.json({ error: msg }, 500);
});

// ---- 全データ取得（React の初期ロード） ---------------------
app.get("/api/trip", (c) => {
  const db = c.get("db");
  const trip = (db.prepare("SELECT * FROM trip WHERE id = 1").get() as unknown as TripMeta | undefined) || null;
  const days = db.prepare("SELECT * FROM days ORDER BY day_no").all() as unknown as Day[];
  const allItems = db.prepare("SELECT * FROM items ORDER BY day_id, sort_order, time").all() as unknown as Item[];
  for (const d of days) d.items = allItems.filter((it) => it.day_id === d.id);
  const route = db.prepare("SELECT * FROM route ORDER BY order_index").all() as unknown as RoutePoint[];
  // legs: GeoJSON Feature の配列として返す（フロントはそのまま <GeoJSON> で描画）
  const legs = (db.prepare("SELECT * FROM legs ORDER BY order_index").all() as unknown as LegRow[]).map(legToFeature);
  const budget = db.prepare("SELECT * FROM budget ORDER BY sort_order, id").all() as unknown as BudgetItem[];
  const spots = spotsRepo.listSpots(db);
  return c.json({ trip, days, route, legs, budget, spots });
});

// ---- trip メタ --------------------------------------------
app.put("/api/trip", async (c) => {
  const db = c.get("db");
  // trip は id=1 の 1 行だけを持つシングルトン。まだ行が無い DB（本番の初期状態など）では
  // UPDATE が 0 行に当たり SELECT が undefined → c.json(undefined) が空ボディを返し、
  // フロントの res.json() が "Unexpected end of JSON input" で落ちる。先に行を用意する。
  db.prepare("INSERT OR IGNORE INTO trip (id) VALUES (1)").run();
  updateRow(db, "trip", 1, await c.req.json(), ["title", "subtitle", "start_date", "end_date", "travelers", "party_size", "fx_note", "memo"]);
  return c.json(db.prepare("SELECT * FROM trip WHERE id = 1").get());
});

// ---- days -------------------------------------------------
const DAY_FIELDS = ["day_no", "date", "city", "title"];
app.post("/api/days", async (c) => {
  const db = c.get("db");
  const b = await c.req.json();
  const id = b.id ?? randomUUID();
  db.prepare("INSERT INTO days (id, day_no, date, city, title) VALUES (?, ?, ?, ?, ?)")
    .run(id, b.day_no ?? 0, b.date ?? null, b.city ?? null, b.title ?? null);
  return c.json(db.prepare("SELECT * FROM days WHERE id = ?").get(id));
});
app.put("/api/days/:id", async (c) => {
  const db = c.get("db");
  updateRow(db, "days", c.req.param("id"), await c.req.json(), DAY_FIELDS);
  return c.json(db.prepare("SELECT * FROM days WHERE id = ?").get(c.req.param("id")));
});
app.delete("/api/days/:id", (c) => {
  c.get("db").prepare("DELETE FROM days WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- items ------------------------------------------------
const ITEM_FIELDS = ["day_id", "sort_order", "time", "type", "title", "note", "url", "url_label", "cost", "spot_id", "leg_id"];
app.post("/api/items", async (c) => {
  const db = c.get("db");
  const b = await c.req.json();
  const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM items WHERE day_id = ?").get(b.day_id) as { m: number }).m;
  const id = b.id ?? randomUUID();
  db.prepare(`INSERT INTO items (id, day_id, sort_order, time, type, title, note, url, url_label, cost, spot_id, leg_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, b.day_id, b.sort_order ?? maxOrder + 1, b.time ?? null, b.type ?? "spot", b.title ?? "（無題）",
         b.note ?? null, b.url ?? null, b.url_label ?? null, b.cost ?? null, b.spot_id ?? null, b.leg_id ?? null);
  return c.json(db.prepare("SELECT * FROM items WHERE id = ?").get(id));
});
app.put("/api/items/:id", async (c) => {
  const db = c.get("db");
  updateRow(db, "items", c.req.param("id"), await c.req.json(), ITEM_FIELDS);
  return c.json(db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id")));
});
app.delete("/api/items/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  // 移動の予定（leg_id あり）は、紐づく地図の移動ルート（legs）も一緒に削除して連動させる。
  const row = db.prepare("SELECT leg_id FROM items WHERE id = ?").get(id) as { leg_id: string | null } | undefined;
  db.prepare("DELETE FROM items WHERE id = ?").run(id);
  if (row?.leg_id != null) db.prepare("DELETE FROM legs WHERE id = ?").run(row.leg_id);
  return c.json({ ok: true });
});

// ---- budget -----------------------------------------------
const BUDGET_FIELDS = ["sort_order", "category", "per_person", "note"];
app.post("/api/budget", async (c) => {
  const db = c.get("db");
  const b = await c.req.json();
  const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM budget").get() as { m: number }).m;
  const id = b.id ?? randomUUID();
  db.prepare("INSERT INTO budget (id, sort_order, category, per_person, note) VALUES (?, ?, ?, ?, ?)")
    .run(id, b.sort_order ?? maxOrder + 1, b.category ?? "（費目）", b.per_person ?? 0, b.note ?? null);
  return c.json(db.prepare("SELECT * FROM budget WHERE id = ?").get(id));
});
app.put("/api/budget/:id", async (c) => {
  const db = c.get("db");
  updateRow(db, "budget", c.req.param("id"), await c.req.json(), BUDGET_FIELDS);
  return c.json(db.prepare("SELECT * FROM budget WHERE id = ?").get(c.req.param("id")));
});
app.delete("/api/budget/:id", (c) => {
  c.get("db").prepare("DELETE FROM budget WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- spots（行きたいスポット ライブラリ） ------------------
// Google マップの評価（★）を Places API でライブ取得（DB 非永続化）。
// /api/spots/:id（PUT/DELETE）とはメソッド・パスが異なるため衝突しない。
app.get("/api/spots/ratings", async (c) => {
  const db = c.get("db");
  const spots = spotsRepo.listSpots(db);
  return c.json(await getSpotRatings(db, spots));
});
// 提案プレビュー: 保存前スポットの評価・写真を名称等のクエリでライブ取得（DB 非永続化）。
app.get("/api/spots/place-preview", async (c) => {
  return c.json(await previewPlace(c.req.query("q") ?? ""));
});
app.get("/api/spots", (c) => c.json(spotsRepo.listSpots(c.get("db"))));
app.post("/api/spots", async (c) => c.json(spotsRepo.createSpot(c.get("db"), await c.req.json())));
app.put("/api/spots/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const patch = await c.req.json();
  // 名称・都市・国が変わると別の場所になり得るので Places キャッシュを無効化する。
  if (["name", "city", "country"].some((k) => k in patch)) invalidateSpotCache(db, id);
  return c.json(spotsRepo.updateSpot(db, id, patch));
});
app.delete("/api/spots/:id", (c) => c.json(spotsRepo.deleteSpot(c.get("db"), c.req.param("id"))));

// ---- spots / memo チャット（AI エージェントによる編集提案）----
// db はハンドラ内で c.get("db")（storage 解決ミドルウェア）から取得する。
registerSpotChatRoute(app);
registerMemoChatRoute(app);

// ---- memo pages（複数ページのメモ）--------------------------
app.get("/api/memo/pages", (c) => c.json(memoRepo.listMemoPages(c.get("db"))));
app.post("/api/memo/pages", async (c) => c.json(memoRepo.createMemoPage(c.get("db"), await c.req.json())));
app.put("/api/memo/pages/:id", async (c) => {
  const patch = (await c.req.json()) as Record<string, unknown>;
  // html を書き換えるとき（エージェント編集など）は無害化し、平文(text)も再生成して同期する。
  if (typeof patch.html === "string") {
    const clean = sanitizeHtml(patch.html);
    patch.html = clean;
    if (patch.text === undefined) patch.text = htmlToText(clean);
  }
  return c.json(memoRepo.updateMemoPage(c.get("db"), c.req.param("id"), patch));
});
app.delete("/api/memo/pages/:id", (c) => c.json(memoRepo.deleteMemoPage(c.get("db"), c.req.param("id"))));

// アップロード画像を Web 表示可能な形式へ正規化する（HEIC/HEIF → PNG）。
// ブラウザは HEIC を <img> で表示できず、クライアント変換も不安定なため、
// サーバ（heic-convert）で確実に変換してプレビュー/送信の両方に使う。
app.post("/api/image/normalize", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { data?: unknown; mimeType?: unknown };
  if (typeof body.data !== "string") return c.json({ error: "data（base64）が必要です。" }, 400);
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/heic";
  const out = await normalizeImageForWeb({ data: body.data, mimeType });
  return c.json(out);
});

// 取り込んだ元画像の配信（BLOB をそのまま返す）。内容は不変なので長期キャッシュ可。
app.get("/api/memo/images/:id", (c) => {
  const img = memoRepo.getMemoImageData(c.get("db"), c.req.param("id"));
  if (!img) return c.json({ error: "画像が見つかりません。" }, 404);
  return new Response(img.data, {
    headers: { "Content-Type": img.mime_type, "Cache-Control": "private, max-age=31536000, immutable" },
  });
});
// 画像 1 枚の実体を差し替える（クライアントで回転した PNG を保存）。更新後のメタを返す。
app.put("/api/memo/images/:id", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { data?: unknown; mimeType?: unknown };
  if (typeof body.data !== "string" || typeof body.mimeType !== "string") {
    return c.json({ error: "data（base64）と mimeType が必要です。" }, 400);
  }
  const meta = memoRepo.replaceMemoImageData(c.get("db"), c.req.param("id"), { data: body.data, mimeType: body.mimeType });
  if (!meta) return c.json({ error: "画像が見つかりません。" }, 404);
  return c.json(meta);
});
// 元画像 1 枚を削除する。
app.delete("/api/memo/images/:id", (c) => c.json(memoRepo.deleteMemoImage(c.get("db"), c.req.param("id"))));

// 画像（じゃらん等のスクショ）から情報を抽出し、HTML と平文をページに追記する。
// 元画像は必ず保存し、抽出した HTML は無害化して保存する（表示は iframe(sandbox) 側でも多層防御）。
// 抽出に失敗しても元画像は残し、warning を添えて 200 で返す。
app.post("/api/memo/pages/:id/extract", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const page = memoRepo.getMemoPage(db, id);
  if (!page) return c.json({ error: "メモページが見つかりません。" }, 404);

  const body = (await c.req.json().catch(() => ({}))) as { images?: unknown };
  const images: AgentImage[] = Array.isArray(body.images)
    ? (body.images as Array<{ data?: unknown; mimeType?: unknown }>)
        .filter((im): im is AgentImage => !!im && typeof im.data === "string" && typeof im.mimeType === "string")
        .slice(0, 4)
    : [];
  if (images.length === 0) return c.json({ error: "画像が指定されていません。" }, 400);

  // Web で表示できる形式へ正規化（HEIC/HEIF → PNG）。保存・抽出の両方に使う。
  const normalized = await Promise.all(images.map(normalizeImageForWeb));

  // 先に元画像を保存する（抽出が失敗・空でも原本は残す）。
  memoRepo.addMemoImages(db, id, normalized);

  // HTML（表・チャート等）とグラフ構造（フローチャート・相関図等）を並行で抽出する。
  // グラフは付加価値なので、失敗しても HTML 側には影響させない。
  const [htmlRes, graphRes] = await Promise.allSettled([
    extractHtmlFromImages({ images: normalized }),
    extractGraphFromImages({ images: normalized }),
  ]);

  let html = "";
  let warning: string | undefined;
  if (htmlRes.status === "fulfilled") {
    html = sanitizeHtml(htmlRes.value);
  } else {
    const err = htmlRes.reason;
    warning =
      err instanceof MissingApiKeyError
        ? `${err.message}（元画像は保存しました）`
        : `情報の抽出に失敗しました: ${err instanceof Error ? err.message : String(err)}（元画像は保存しました）`;
  }
  const addedGraph = graphRes.status === "fulfilled" ? graphRes.value : null;
  if (!warning && !html && !addedGraph) warning = "画像から情報を読み取れませんでした（元画像は保存しました）";

  const patch: memoRepo.MemoPageBody = {};
  if (html) {
    const text = htmlToText(html);
    // 既存の内容に追記（複数の画像/ページを 1 つのメモに貯められる）。
    patch.html = page.html ? `${page.html}\n<hr />\n${html}` : html;
    patch.text = page.text ? `${page.text}\n\n${text}` : text;
  }
  if (addedGraph) {
    // 新規ノードの id に一意な接頭辞を付け、既存グラフと衝突なく統合する。
    patch.graph = memoRepo.mergeMemoGraph(page.graph, addedGraph, `g${randomUUID().slice(0, 8)}-`);
  }
  if (Object.keys(patch).length > 0) {
    memoRepo.updateMemoPage(db, id, patch);
  }
  // 画像メタを反映した最新ページを返す。
  const updated = memoRepo.getMemoPage(db, id);
  return c.json(warning ? { ...updated, warning } : updated);
});

// ---- route ------------------------------------------------
const ROUTE_FIELDS = ["order_index", "name", "lat", "lng", "hub", "leg_type", "note"];
app.post("/api/route", async (c) => {
  const db = c.get("db");
  const b = await c.req.json();
  const maxOrder = (db.prepare("SELECT COALESCE(MAX(order_index), -1) AS m FROM route").get() as { m: number }).m;
  const id = b.id ?? randomUUID();
  db.prepare("INSERT INTO route (id, order_index, name, lat, lng, hub, leg_type, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id, b.order_index ?? maxOrder + 1, b.name ?? "（地点）", b.lat ?? null, b.lng ?? null, b.hub ?? 0, b.leg_type ?? null, b.note ?? null);
  return c.json(db.prepare("SELECT * FROM route WHERE id = ?").get(id));
});
app.put("/api/route/:id", async (c) => {
  const db = c.get("db");
  updateRow(db, "route", c.req.param("id"), await c.req.json(), ROUTE_FIELDS);
  return c.json(db.prepare("SELECT * FROM route WHERE id = ?").get(c.req.param("id")));
});
app.delete("/api/route/:id", (c) => {
  c.get("db").prepare("DELETE FROM route WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- legs（都市間の移動・GPX 詳細ルート）------------------
const LEG_FIELDS = ["order_index", "from_name", "to_name", "mode", "geojson", "note"];
app.post("/api/legs", async (c) => {
  const db = c.get("db");
  const b = await c.req.json();
  const geojson = b.geojson == null ? null : typeof b.geojson === "string" ? b.geojson : JSON.stringify(b.geojson);
  const id = b.id ?? randomUUID();
  db.prepare("INSERT INTO legs (id, order_index, from_name, to_name, mode, geojson, note) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, b.order_index ?? 0, b.from_name ?? null, b.to_name ?? null, b.mode ?? "train", geojson, b.note ?? null);
  return c.json(legToFeature(db.prepare("SELECT * FROM legs WHERE id = ?").get(id) as LegRow));
});
app.put("/api/legs/:id", async (c) => {
  const db = c.get("db");
  const b = await c.req.json();
  if (b.geojson != null && typeof b.geojson !== "string") b.geojson = JSON.stringify(b.geojson);
  updateRow(db, "legs", c.req.param("id"), b, LEG_FIELDS);
  return c.json(legToFeature(db.prepare("SELECT * FROM legs WHERE id = ?").get(c.req.param("id")) as LegRow));
});
app.delete("/api/legs/:id", (c) => {
  c.get("db").prepare("DELETE FROM legs WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ---- OSRM ルート候補（移動データ作成用）------------------
// 座標→町名（Photon reverse）。通過点サマリ用。失敗時は null。
async function reverseGeocode(lon: number, lat: number) {
  try {
    const base = (process.env.PHOTON_URL || "https://photon.komoot.io").replace(/\/$/, "");
    const lang = process.env.PHOTON_LANG || "en";
    const res = await fetch(`${base}/reverse?lon=${lon}&lat=${lat}&lang=${lang}`, {
      headers: { "User-Agent": "honeymoon-shiori/1.0" },
    });
    if (!res.ok) return null;
    const d: any = await res.json();
    const p = d.features?.[0]?.properties;
    if (!p) return null;
    // 町・市レベルを優先（道路名や番地より旅程の「通過点」として分かりやすい）。
    return p.city || p.town || p.village || p.county || p.district || p.name || p.state || null;
  } catch {
    return null;
  }
}

// 出発地・目的地（経度,緯度）から OSRM で複数の経路候補を取得して返す。
// 公開デモサーバ（driving のみ）を既定に、OSRM_URL で差し替え可能。
app.get("/api/osrm", async (c) => {
  const from = c.req.query("from"); // "lng,lat"
  const to = c.req.query("to"); // "lng,lat"
  const profile = c.req.query("profile") || "driving";
  // via="lng,lat;lng,lat;…"（経由地。順に from → via… → to で経路を組む）。
  const viaPoints = (c.req.query("via") || "").split(";").map((s) => s.trim()).filter(Boolean);
  if (!from || !to) return c.json({ error: "from と to（'lng,lat'）が必要です" }, 400);
  const base = (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
  // 経由地を挟んで座標列を組み立てる（from;via1;…;to）。
  const coordStr = [from, ...viaPoints, to].join(";");
  // steps=true で各ステップの道路名を取得し、候補を区別できる「主な経路」を作る。
  // 経由地を固定すると alternatives が減る（候補が 1 本になりうる）点は許容。
  const url = `${base}/route/v1/${profile}/${coordStr}?alternatives=3&overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { headers: { "User-Agent": "honeymoon-shiori/1.0" } });
  if (!res.ok) return c.json({ error: `OSRM ${res.status}` }, 502);
  const data: any = await res.json();
  if (data.code && data.code !== "Ok") return c.json({ error: data.code, routes: [] });
  const routes = await Promise.all(
    (data.routes || []).map(async (r: any) => {
      const legs = r.legs || [];
      // まず leg.summary（主要道路）を使い、無ければ steps の道路名から組み立てる。
      const legSummaries = legs.map((l: any) => l.summary).filter(Boolean);
      let via = legSummaries.join(" / ");
      const names: string[] = [];
      for (const leg of legs)
        for (const st of leg.steps || []) {
          const n = (st.name || "").trim();
          if (n && n !== "-" && !names.includes(n)) names.push(n);
        }
      if (!via) via = names.slice(0, 6).join(" → ");
      // ルート上の数点を逆ジオコードして「通過する町名」を作る（候補の中身が分かるように）。
      const coords = r.geometry?.coordinates || [];
      const waypoints: string[] = [];
      if (coords.length > 3) {
        for (const f of [0.25, 0.5, 0.75]) {
          const [lon, lat] = coords[Math.floor(f * (coords.length - 1))];
          const place = await reverseGeocode(lon, lat);
          if (place && waypoints[waypoints.length - 1] !== place) waypoints.push(place);
        }
      }
      return {
        distance: r.distance, // m
        duration: r.duration, // s
        geometry: r.geometry, // GeoJSON LineString（[lng,lat]）
        via, // 主な経路（道路名）
        roads: names.slice(0, 8), // 経由する主な道路名（先頭から）
        waypoints, // 通過する町名（逆ジオコード）
      };
    })
  );
  return c.json({ routes });
});

// ---- ジオコーディング（地名→座標の入力補完用）------------
// ひらがな・カタカナ・漢字を含むか（日本語クエリの判定）。
const hasJapanese = (s: string) =>
  /[぀-ゟ゠-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/.test(s);

// Photon（OSM ベース・キー不要）で検索。主に英語（name / name:en 等）向け。
async function geocodePhoton(
  q: string,
  bias: { lat?: string; lon?: string },
  tags: string[],
) {
  const base = (process.env.PHOTON_URL || "https://photon.komoot.io").replace(/\/$/, "");
  const params = new URLSearchParams({ q, limit: "6", lang: process.env.PHOTON_LANG || "en" });
  if (bias.lat && bias.lon) {
    params.set("lat", bias.lat);
    params.set("lon", bias.lon);
  }
  for (const t of tags) params.append("osm_tag", t);
  const res = await fetch(`${base}/api/?${params}`, { headers: { "User-Agent": "honeymoon-shiori/1.0" } });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const data: any = await res.json();
  return (data.features || [])
    .map((f: any) => {
      const p = f.properties || {};
      const [lng, lat2] = f.geometry?.coordinates || [];
      const parts = [
        p.name,
        p.city && p.city !== p.name ? p.city : null,
        p.state,
        p.country,
      ].filter(Boolean);
      return { name: p.name || parts[0] || q, label: parts.join(", "), lng, lat: lat2 };
    })
    .filter((r: any) => r.lng != null && r.lat != null);
}

// Nominatim で検索。accept-language=ja + namedetails で日本語名（name:ja）を拾う。
// 公開 Photon は日本語検索が弱いため、日本語クエリはこちらを使う。
async function geocodeNominatim(
  q: string,
  bias: { lat?: string; lon?: string },
  tags: string[],
) {
  const base = (process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "6",
    namedetails: "1",
    addressdetails: "1",
    "accept-language": "ja",
  });
  // viewbox（近傍を優先）。bounded=0 なので範囲外も候補に残る。
  if (bias.lat && bias.lon) {
    const dlat = parseFloat(bias.lat);
    const dlon = parseFloat(bias.lon);
    if (!Number.isNaN(dlat) && !Number.isNaN(dlon)) {
      const d = 3; // 度（おおよその優先範囲）
      params.set("viewbox", `${dlon - d},${dlat + d},${dlon + d},${dlat - d}`);
      params.set("bounded", "0");
    }
  }
  const res = await fetch(`${base}/search?${params}`, { headers: { "User-Agent": "honeymoon-shiori/1.0" } });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const data: any = await res.json();
  // OSM タグ（例: aeroway:aerodrome）指定時は class/type で絞り込む。
  const wanted = tags.map((t) => t.split(":"));
  return (Array.isArray(data) ? data : [])
    .filter((f: any) =>
      wanted.length === 0 ||
      wanted.some(([k, v]) => f.category === k && (!v || f.type === v)),
    )
    .map((f: any) => {
      const nd = f.namedetails || {};
      // name:ja があれば日本語名を優先、無ければ英語表記にフォールバック。
      const name = nd["name:ja"] || nd.name || f.name || (f.display_name || "").split(",")[0] || q;
      return {
        name,
        label: f.display_name || name,
        lng: parseFloat(f.lon),
        lat: parseFloat(f.lat),
      };
    })
    .filter((r: any) => !Number.isNaN(r.lng) && !Number.isNaN(r.lat));
}

// CORS 回避と利用ポリシー遵守のためサーバ経由にする。lat/lon を渡すと近傍を優先。
// 日本語クエリは Nominatim（accept-language=ja）、それ以外は Photon を使う。
app.get("/api/geocode", async (c) => {
  const q = (c.req.query("q") || "").trim();
  if (q.length < 2) return c.json({ results: [] });
  const bias = { lat: c.req.query("lat"), lon: c.req.query("lon") };
  // tag=aeroway:aerodrome のような OSM タグで種別を絞る（例: 空港検索）。カンマ区切り可。
  const tags = (c.req.query("tag") || "").split(",").map((t) => t.trim()).filter(Boolean);
  try {
    const results = hasJapanese(q)
      ? await geocodeNominatim(q, bias, tags)
      : await geocodePhoton(q, bias, tags);
    return c.json({ results });
  } catch (e) {
    return c.json({ error: String(e), results: [] }, 502);
  }
});

// ---- ヘルスチェック ----------------------------------------
app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

// ---- フロント配信（本番: dist を静的配信 + SPA フォールバック）----
// これらは全 /api ルートより後に登録するため、API が優先して処理される。
const DIST_DIR = "./dist";
if (existsSync(DIST_DIR)) {
  app.use("/*", serveStatic({ root: DIST_DIR }));
  // 実ファイルが無いパスは index.html を返す（react-router のクライアントルーティング）。
  app.get("/*", serveStatic({ path: `${DIST_DIR}/index.html` }));
} else {
  // dist が無い（API のみで起動した場合）の確認用ルート。
  app.get("/", (c) =>
    c.json({ name: "しおり API", status: "ok", endpoints: ["/api/trip", "/health"] }),
  );
}

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`🚆 しおり API (Hono): http://localhost:${PORT}  (per-user DB: ${process.env.TRAVEL_DATA_DIR || "data"}/{userId}/travel.db)`);
});

// ポート使用中などの起動エラーをクリーンに扱う
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`✖ ポート ${PORT} は既に使用中です。既存のサーバーを停止してから再実行してください。`);
  } else {
    console.error("✖ サーバーエラー:", err.message);
  }
  process.exit(1);
});

// グレースフルシャットダウン（Ctrl+C / SIGTERM でポートと DB を解放して正常終了）
let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} を受信。サーバーを停止します…`);
  server.close(() => {
    try { closeAllUserDbs(); } catch { /* noop */ }
    console.log("✓ 正常に停止しました。");
    process.exit(0);
  });
  // 接続が残っても一定時間で強制終了（ポートを確実に解放）
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
