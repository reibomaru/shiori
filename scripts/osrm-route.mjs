#!/usr/bin/env node
// ============================================================
//  osrm-route — 鉄道(等)の実線路ジオメトリを OSRM で補完して leg に取り込む
//
//  データ元: OpenRailRouting 公開インスタンス（OSM 線路データ + OSRM 形式 API, ODbL）
//    既定 BASE: https://signal.eu.org/osm/eu/route/v1/train
//    環境変数 OSRM_BASE で差し替え可（例: 自前ホストや道路用 OSRM）。
//
//  使い方:
//    node scripts/osrm-route.mjs <leg_id> '<spec>' [--eps 0.0006] [--dry] [--out <file>]
//
//  <spec> は経由点。3 つの書き方を受け付ける（座標は必ず lng,lat 順）:
//    1) "6.14,46.20;4.86,45.76;5.37,43.30"     … ; 区切り。単一ルートとしてルーティング
//    2) [[6.14,46.20],[4.86,45.76],[5.37,43.30]] … JSON 配列。同上
//    3) [{"route":[[..],[..]]},{"line":[[..],[..]]},{"route":[[..],[..]]}]
//         … サブ区間配列。route=ルーティング / line=そのまま直線で橋渡し（連結する）。
//         break-of-gauge 等で OSRM が通れない小区間だけ line で繋ぐのに使う。
//
//  取得 → 連結 → Douglas-Peucker で間引き → legs.geojson に UPDATE（--dry で書かずに確認）。
//  実距離/直線距離の比も出力する（迂回検知用。1.x 台が目安、大きいと経由点不足を疑う）。
// ============================================================
import { writeFileSync } from "node:fs";
import { openDb } from "../db/db.mjs";

const BASE = process.env.OSRM_BASE || "https://signal.eu.org/osm/eu/route/v1/train";

const argv = process.argv.slice(2);
const legId = argv[0];
const specRaw = argv[1];
const flag = (n, def) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] ?? true) : def; };
const EPS = Number(flag("--eps", 0.0006));
const DRY = argv.includes("--dry");
const OUT = flag("--out", null);

if (!legId || !specRaw) {
  console.error(`使い方: node scripts/osrm-route.mjs <leg_id> '<spec>' [--eps 0.0006] [--dry] [--out file]
  spec 例: "6.14,46.20;4.86,45.76;5.37,43.30"
           [{"route":[[8.31,47.05],[8.55,47.05]]},{"line":[[8.55,47.05],[8.59,46.64]]}]`);
  process.exit(1);
}

// ---- spec を segs（[{route|line: [[lng,lat],...]}, ...]）に正規化 ----
function parseSpec(s) {
  const t = s.trimStart();
  if (t.startsWith("[") || t.startsWith("{")) {
    const j = JSON.parse(s);
    const arr = Array.isArray(j) ? j : [j];
    if (arr.length && Array.isArray(arr[0])) return [{ route: arr }]; // [[lng,lat],...]
    return arr; // [{route|line:[...]}]
  }
  // "lng,lat;lng,lat;..." 形式
  const pts = s.split(";").map((p) => p.split(",").map(Number));
  return [{ route: pts }];
}

const hav = (a, b) => { const R = 6371, r = (x) => x * Math.PI / 180;
  const dLa = r(b[1] - a[1]), dLo = r(b[0] - a[0]);
  const v = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(v)); };

// Douglas-Peucker（度単位の平面近似）
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  const sd = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1];
    if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const st = [[0, pts.length - 1]];
  while (st.length) { const [s, e] = st.pop(); let md = 0, mi = -1;
    for (let i = s + 1; i < e; i++) { const d = sd(pts[i], pts[s], pts[e]); if (d > md) { md = d; mi = i; } }
    if (md > eps && mi > 0) { keep[mi] = true; st.push([s, mi], [mi, e]); } }
  return pts.filter((_, i) => keep[i]);
}

async function route(pts) {
  const url = `${BASE}/${pts.map((p) => `${p[0]},${p[1]}`).join(";")}?overview=full&geometries=geojson&steps=false&continue_straight=false`;
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 60000);
  try {
    const res = await fetch(url, { signal: c.signal });
    const j = await res.json();
    if (j.code !== "Ok" || !j.routes?.[0]) throw new Error(`OSRM code=${j.code}`);
    return { coords: j.routes[0].geometry.coordinates, dist: j.routes[0].distance };
  } finally { clearTimeout(t); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const segs = parseSpec(specRaw);
let all = [], dist = 0, origN = 0;
for (let i = 0; i < segs.length; i++) {
  const seg = segs[i];
  let coords;
  if (seg.line) {
    coords = seg.line;
    for (let k = 0; k < coords.length - 1; k++) dist += hav(coords[k], coords[k + 1]) * 1000;
    origN += coords.length;
  } else if (seg.route) {
    const r = await route(seg.route);
    coords = r.coords; dist += r.dist; origN += coords.length;
    if (i < segs.length - 1) await sleep(900); // 公開インスタンスへの礼儀
  } else {
    console.error(`seg[${i}] は route か line を持つ必要があります`); process.exit(1);
  }
  if (all.length && hav(all[all.length - 1], coords[0]) * 1000 < 300) coords = coords.slice(1); // 連結点の重複除去
  all = all.concat(coords);
}

const simp = dp(all, EPS);
const straight = hav(all[0], all[all.length - 1]);
const geom = { type: "LineString", coordinates: simp };
const stats = {
  leg: Number(legId), origPoints: origN, points: simp.length,
  routeKm: +(dist / 1000).toFixed(1), straightKm: +straight.toFixed(1),
  ratio: +(dist / 1000 / straight).toFixed(2),
};

if (OUT) {
  writeFileSync(OUT, JSON.stringify({ type: "Feature", properties: { leg: Number(legId) }, geometry: geom }));
  stats.wroteFile = OUT;
}

if (DRY) {
  stats.dry = true;
  console.log(JSON.stringify(stats, null, 2));
} else {
  const db = openDb();
  const row = db.prepare("SELECT id, from_name, to_name FROM legs WHERE id=?").get(Number(legId));
  if (!row) { console.error(`leg id=${legId} が見つかりません`); process.exit(1); }
  db.prepare("UPDATE legs SET geojson=? WHERE id=?").run(JSON.stringify(geom), Number(legId));
  db.close();
  console.log(JSON.stringify({ ...stats, from: row.from_name, to: row.to_name, updated: true }, null, 2));
}
