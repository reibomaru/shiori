// ============================================================
//  初期データ投入スクリプト
//   node db/seed.mjs          … 空のときだけ投入（既存データは保持）
//   node db/seed.mjs --reset  … 全削除してから投入し直す
// ============================================================
import { openDb } from "./db.mjs";
import { toLineString } from "./geo.mjs";

const RESET = process.argv.includes("--reset");
const db = openDb();

function count(table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

if (RESET) {
  for (const t of ["items", "days", "route", "legs", "budget", "spots", "trip"]) {
    db.exec(`DELETE FROM ${t};`);
  }
  console.log("既存データを削除しました（--reset）。");
}

if (count("trip") > 0 && !RESET) {
  console.log("既にデータがあります。再投入するには --reset を付けてください。");
  process.exit(0);
}

// ---- trip --------------------------------------------------
db.prepare(
  `INSERT INTO trip (id, title, subtitle, start_date, end_date, travelers, party_size, fx_note)
   VALUES (1, ?, ?, ?, ?, ?, ?, ?)`
).run(
  "Swiss & Côte d'Azur Honeymoon",
  "スイス・アルプス & 南仏 — ふたりの新婚旅行",
  "2026-09-12",
  "2026-09-22",
  "Rei & Partner",
  2,
  "為替の目安：1 CHF ≒ 190円 / 1 EUR ≒ 165円（2026年想定・要確認）"
);

// ---- days & items -----------------------------------------
const days = [
  {
    day_no: 1, date: "2026-09-12", city: "ルツェルン",
    title: "日本 → チューリッヒ → ルツェルンへ",
    items: [
      { time: "10:30", type: "flight", title: "羽田/成田 発 → チューリッヒ行き（直行 約14h）", note: "機内で時差調整。チューリッヒ着は同日夕方。", url: "https://www.zurich-airport.com/", url_label: "チューリッヒ空港" },
      { time: "17:00", type: "train", title: "チューリッヒ空港駅 → ルツェルン（約1時間）", note: "空港直結の駅から直通列車。Swiss Travel Pass の利用開始日。", url: "https://www.sbb.ch/en", url_label: "SBB（スイス鉄道）" },
      { time: "19:00", type: "hotel", title: "ルツェルン泊（旧市街 or 湖畔のホテル）", note: "到着日は無理せず、湖畔を散歩して早めに休む。" },
      { time: "20:00", type: "meal", title: "夕食：チーズフォンデュで乾杯", note: "スイス初日の定番。旧市街のレストランで。" },
    ],
  },
  {
    day_no: 2, date: "2026-09-13", city: "ルツェルン",
    title: "ルツェルン｜カペル橋とリギ山",
    items: [
      { time: "09:00", type: "spot", title: "カペル橋 & 旧市街さんぽ", note: "ヨーロッパ最古の木造屋根付き橋。瀕死のライオン像、旧市街の壁画もすぐ近く。", url: "https://maps.google.com/?q=Kapellbr%C3%BCcke+Luzern", url_label: "Google マップ" },
      { time: "11:00", type: "bus", title: "湖船クルーズ → ヴィッツナウ", note: "ルツェルン湖をクルーズし、リギ山の登山鉄道乗り場へ。", url: "https://www.lakelucerne.ch/en/", url_label: "ルツェルン湖クルーズ" },
      { time: "12:30", type: "bus", title: "リギ山（Rigi）登山鉄道で山頂へ", note: "「山の女王」。ヨーロッパ最古の登山鉄道で360°のアルプス展望。", url: "https://www.rigi.ch/en", url_label: "Rigi 公式", cost: 14000 },
      { time: "17:00", type: "hotel", title: "ルツェルン泊（連泊）" },
    ],
  },
  {
    day_no: 3, date: "2026-09-14", city: "ツェルマット",
    title: "氷河特急でツェルマットへ",
    items: [
      { time: "08:00", type: "train", title: "ルツェルン → アンデルマット（乗継）", note: "氷河特急の乗車駅アンデルマットへ。荷物は身軽に。" },
      { time: "10:00", type: "train", title: "★氷河特急（Glacier Express）に乗車", note: "「世界一遅い特急」。パノラマ車窓でオーバーアルプ峠の絶景。座席指定は必須（要事前予約）。", url: "https://www.glacierexpress.ch/en/", url_label: "氷河特急 公式", cost: 9000 },
      { time: "14:30", type: "spot", title: "ツェルマット着｜ガス車の街を散策", note: "ガソリン車が入れない静かな山岳リゾート。村のどこからでもマッターホルンが見える。", url: "https://www.zermatt.ch/en", url_label: "Zermatt 観光" },
      { time: "18:00", type: "hotel", title: "ツェルマット泊（マッターホルンビューの宿）", note: "ハネムーンの奮発ポイント。山が見える部屋を予約したい。" },
    ],
  },
  {
    day_no: 4, date: "2026-09-15", city: "ツェルマット",
    title: "ツェルマット｜マッターホルン展望",
    items: [
      { time: "08:00", type: "bus", title: "ゴルナーグラート鉄道で展望台へ", note: "標高3,089m。マッターホルンとモンテローザ氷河の大パノラマ。朝の光がベスト。", url: "https://www.gornergrat.ch/en/", url_label: "Gornergrat 公式", cost: 14000 },
      { time: "13:00", type: "spot", title: "マッターホルン・グレッシャー・パラダイス（任意）", note: "ヨーロッパ最高地点の展望台（3,883m）。氷の宮殿も。体力と相談で。", url: "https://matterhornparadise.ch/en", url_label: "Matterhorn Paradise" },
      { time: "18:30", type: "meal", title: "夕食：ラクレット & ヴァレー州ワイン", note: "ツェルマット連泊。山を眺めながらの食事を。" },
      { time: "20:00", type: "hotel", title: "ツェルマット泊（連泊）" },
    ],
  },
  {
    day_no: 5, date: "2026-09-16", city: "グリンデルワルト",
    title: "ツェルマット → ユングフラウ地方へ",
    items: [
      { time: "09:30", type: "train", title: "ツェルマット → フィスプ → グリンデルワルト（約3.5h）", note: "車窓を楽しみながらベルナーオーバーラント地方へ移動。", url: "https://www.sbb.ch/en", url_label: "SBB 経路検索" },
      { time: "14:00", type: "spot", title: "グリンデルワルト着｜村と氷河の谷", note: "アイガー北壁の足元の村。チェックイン後、ファースト（First）で空中散歩も。", url: "https://www.grindelwald.swiss/en/", url_label: "Grindelwald 観光" },
      { time: "18:00", type: "hotel", title: "グリンデルワルト泊", note: "アイガーが見える宿だと最高。" },
    ],
  },
  {
    day_no: 6, date: "2026-09-17", city: "グリンデルワルト",
    title: "ユングフラウヨッホ — トップ・オブ・ヨーロッパ",
    items: [
      { time: "08:30", type: "bus", title: "アイガーエクスプレスでアイガーグレッチャーへ", note: "ゴンドラで一気に標高を稼ぎ、登山鉄道に接続。", url: "https://www.jungfrau.ch/en-gb/", url_label: "Jungfrau 公式" },
      { time: "10:00", type: "spot", title: "★ユングフラウヨッホ（3,454m）", note: "ヨーロッパ最高所の鉄道駅。アレッチ氷河、アイスパレス、スフィンクス展望台。", url: "https://www.jungfrau.ch/en-gb/jungfraujoch-top-of-europe/", url_label: "Top of Europe", cost: 22000 },
      { time: "15:00", type: "free", title: "下山｜ラウターブルンネンの滝めぐり（任意）", note: "「霧の谷」と呼ばれる断崖の村。シュタウプバッハの滝が有名。" },
      { time: "18:00", type: "hotel", title: "グリンデルワルト泊（連泊）" },
    ],
  },
  {
    day_no: 7, date: "2026-09-18", city: "ジュネーブ",
    title: "グリンデルワルト → ジュネーブ（レマン湖）",
    items: [
      { time: "09:00", type: "train", title: "グリンデルワルト → ベルン → ジュネーブ（約3.5h）", note: "首都ベルンで途中下車も可。世界遺産の旧市街は寄り道の価値あり。", url: "https://www.sbb.ch/en", url_label: "SBB 経路検索" },
      { time: "14:00", type: "spot", title: "レマン湖 & ジェドー（大噴水）", note: "高さ140mの大噴水はジュネーブの象徴。湖畔のプロムナードを散歩。", url: "https://www.geneve.com/en/", url_label: "Geneva 観光" },
      { time: "16:00", type: "spot", title: "旧市街 & サンピエール大聖堂", note: "石畳の旧市街、花時計、時計店めぐり。", url: "https://maps.google.com/?q=St-Pierre+Cathedral+Geneva", url_label: "Google マップ" },
      { time: "19:00", type: "hotel", title: "ジュネーブ泊" },
    ],
  },
  {
    day_no: 8, date: "2026-09-19", city: "ニース",
    title: "ジュネーブ → 南仏ニースへ（国境越え）",
    items: [
      { time: "10:00", type: "flight", title: "ジュネーブ → ニース（直行フライト 約1h）", note: "TGV経由（マルセイユ乗継）でも行けるが、フライトが速い。スイスからフランスへ。", url: "https://www.nice.aeroport.fr/en", url_label: "ニース・コートダジュール空港", cost: 25000 },
      { time: "13:00", type: "spot", title: "プロムナード・デ・ザングレ & 旧市街", note: "紺碧海岸の散歩道と、コクトーが愛した旧市街。サレヤ広場のマルシェも。", url: "https://www.explorenicecotedazur.com/en/", url_label: "Nice 観光" },
      { time: "16:00", type: "spot", title: "シャガール美術館 / 城跡公園からの眺め（任意）", note: "丘の上の城跡公園からニースの赤い屋根と海を一望。" },
      { time: "19:00", type: "hotel", title: "ニース泊" },
    ],
  },
  {
    day_no: 9, date: "2026-09-20", city: "ニース",
    title: "エズ村 & モナコ（モンテカルロ）",
    items: [
      { time: "09:30", type: "spot", title: "鷲の巣村エズ（Èze）", note: "断崖に張り付く中世の村。熱帯植物園からの地中海の眺めは絶景。", url: "https://www.eze-tourisme.com/en/", url_label: "Èze 観光" },
      { time: "12:30", type: "spot", title: "モナコ｜モンテカルロ & 大公宮殿", note: "カジノ・ド・モンテカルロ、F1コース、旧市街、海洋博物館。ドレスコードに注意。", url: "https://www.visitmonaco.com/en", url_label: "Visit Monaco", cost: 8000 },
      { time: "19:30", type: "meal", title: "夕食：地中海料理 & ロゼワイン", note: "南仏らしいシーフードで。" },
      { time: "21:00", type: "hotel", title: "ニース泊（連泊）" },
    ],
  },
  {
    day_no: 10, date: "2026-09-21", city: "マルセイユ",
    title: "ニース → マルセイユ（帰路の拠点）",
    items: [
      { time: "09:30", type: "train", title: "ニース → マルセイユ（TGV 約2.5h）", note: "地中海沿いを走る快適なTGV。", url: "https://www.sncf-connect.com/en-en/", url_label: "SNCF（フランス鉄道）", cost: 8000 },
      { time: "13:00", type: "spot", title: "ノートルダム・ド・ラ・ギャルド寺院", note: "丘の上からマルセイユの街と港を見守る教会。市街と海の大パノラマ。", url: "https://www.notredamedelagarde.fr/", url_label: "公式サイト" },
      { time: "15:00", type: "spot", title: "旧港（ヴュー・ポール）& パニエ地区", note: "活気ある港、ブイヤベース、坂道の路地。旅の締めくくりの散策。", url: "https://www.marseille-tourisme.com/en/", url_label: "Marseille 観光" },
      { time: "19:00", type: "hotel", title: "マルセイユ泊（空港アクセス重視）" },
    ],
  },
  {
    day_no: 11, date: "2026-09-22", city: "帰国",
    title: "マルセイユ → 日本（経由便・機内泊）",
    items: [
      { time: "10:00", type: "flight", title: "マルセイユ・プロヴァンス空港 → 日本（欧州経由）", note: "パリ or フランクフルト等で乗継。翌日に日本着。おつかれさま！", url: "https://www.marseille.aeroport.fr/en", url_label: "マルセイユ空港" },
      { time: "—", type: "free", title: "機内泊 → 翌日 日本到着", note: "ふたりの新婚旅行、完。たくさんの写真と思い出を持ち帰ろう。" },
    ],
  },
];

const insDay = db.prepare(`INSERT INTO days (day_no, date, city, title) VALUES (?, ?, ?, ?)`);
const insItem = db.prepare(
  `INSERT INTO items (day_id, sort_order, time, type, title, note, url, url_label, cost)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
for (const d of days) {
  const { lastInsertRowid: dayId } = insDay.run(d.day_no, d.date, d.city, d.title);
  d.items.forEach((it, i) => {
    insItem.run(dayId, i, it.time ?? null, it.type, it.title, it.note ?? null, it.url ?? null, it.url_label ?? null, it.cost ?? null);
  });
}

// ---- route -------------------------------------------------
const route = [
  { name: "成田／羽田", lat: 35.5494, lng: 139.7798, hub: 0, leg_type: "flight", note: null },
  { name: "チューリッヒ空港", lat: 47.4647, lng: 8.5492, hub: 0, leg_type: "flight", note: null },
  { name: "ルツェルン", lat: 47.0502, lng: 8.3093, hub: 1, leg_type: "train", note: "Day 1–2｜カペル橋・リギ山" },
  { name: "アンデルマット", lat: 46.6359, lng: 8.594, hub: 0, leg_type: "train", note: "氷河特急 乗車" },
  { name: "ツェルマット", lat: 46.0207, lng: 7.7491, hub: 1, leg_type: "train", note: "Day 3–4｜マッターホルン" },
  { name: "グリンデルワルト", lat: 46.6242, lng: 8.0414, hub: 1, leg_type: "train", note: "Day 5–6｜ユングフラウヨッホ" },
  { name: "ジュネーブ", lat: 46.2044, lng: 6.1432, hub: 1, leg_type: "train", note: "Day 7｜レマン湖" },
  { name: "ニース", lat: 43.7102, lng: 7.262, hub: 1, leg_type: "flight", note: "Day 8–9｜エズ・モナコ" },
  { name: "マルセイユ", lat: 43.2965, lng: 5.3698, hub: 1, leg_type: "train", note: "Day 10｜帰路の拠点" },
];
const insRoute = db.prepare(`INSERT INTO route (order_index, name, lat, lng, hub, leg_type, note) VALUES (?, ?, ?, ?, ?, ?, ?)`);
route.forEach((r, i) => insRoute.run(i, r.name, r.lat, r.lng, r.hub, r.leg_type, r.note));

// ---- legs（都市間移動の詳細ルート）------------------------------
// order_index は route の (i)→(i+1) 区間に対応。
// 鉄道区間は経路の通過地点を GPX 化して保存（実際の GPX に差し替え可能）。
// 空路は gpx を持たず、地図では破線でフォールバック表示。
const legs = [
  { order_index: 0, from_name: "成田／羽田", to_name: "チューリッヒ", mode: "flight", coords: null, note: "国際線（直行 約14h）" },
  {
    order_index: 1, from_name: "チューリッヒ", to_name: "ルツェルン", mode: "train", note: "SBB 直通 約1h",
    coords: [[47.4647, 8.5492], [47.1724, 8.5174], [47.0502, 8.3093]],
  },
  {
    order_index: 2, from_name: "ルツェルン", to_name: "アンデルマット", mode: "train", note: "ルツェルン湖東岸〜ゴッタルド",
    coords: [[47.0502, 8.3093], [46.8995, 8.6224], [46.6667, 8.5894], [46.6359, 8.594]],
  },
  {
    order_index: 3, from_name: "アンデルマット", to_name: "ツェルマット", mode: "train", note: "★氷河特急（フルカ〜ローヌ谷）",
    coords: [[46.6359, 8.594], [46.601, 8.491], [46.531, 8.353], [46.398, 8.135], [46.3194, 7.988], [46.2939, 7.8815], [46.0686, 7.7806], [46.0207, 7.7491]],
  },
  {
    order_index: 4, from_name: "ツェルマット", to_name: "グリンデルワルト", mode: "train", note: "フィスプ〜シュピーツ〜インターラーケン",
    coords: [[46.0207, 7.7491], [46.2939, 7.8815], [46.6863, 7.6803], [46.6863, 7.8632], [46.6242, 8.0414]],
  },
  {
    order_index: 5, from_name: "グリンデルワルト", to_name: "ジュネーブ", mode: "train", note: "ベルン〜ローザンヌ経由",
    coords: [[46.6242, 8.0414], [46.6863, 7.8632], [46.948, 7.4474], [46.8022, 7.151], [46.5197, 6.6323], [46.2044, 6.1432]],
  },
  { order_index: 6, from_name: "ジュネーブ", to_name: "ニース", mode: "flight", coords: null, note: "直行フライト 約1h" },
  {
    order_index: 7, from_name: "ニース", to_name: "マルセイユ", mode: "train", note: "TGV（コートダジュール〜トゥーロン）",
    coords: [[43.7102, 7.262], [43.5528, 7.0174], [43.4247, 6.7685], [43.1242, 5.928], [43.2965, 5.3698]],
  },
];
const insLeg = db.prepare(`INSERT INTO legs (order_index, from_name, to_name, mode, geojson, note) VALUES (?, ?, ?, ?, ?, ?)`);
legs.forEach((l) => {
  const geojson = l.coords ? JSON.stringify(toLineString(l.coords)) : null;
  insLeg.run(l.order_index, l.from_name, l.to_name, l.mode, geojson, l.note);
});

// ---- budget ------------------------------------------------
const budget = [
  { category: "航空券（日本⇄欧州 往復・国際線）", per_person: 220000, note: "9月想定。経由便で抑える前提。" },
  { category: "スイス国内交通（Swiss Travel Pass＋氷河特急＋登山鉄道）", per_person: 140000, note: "8日パス2等＋氷河特急座席指定＋ユングフラウ/ゴルナーグラート割引運賃。" },
  { category: "スイス→南仏 移動（ジュネーブ→ニース、ニース→マルセイユ）", per_person: 40000, note: "フライト＋TGV。" },
  { category: "宿泊（10泊・1室2名利用の1人分）", per_person: 170000, note: "ツェルマット等は奮発、平均1泊1室3万円前後。" },
  { category: "食事（11日間）", per_person: 90000, note: "1日1人8,000円目安。記念日ディナーは別途上乗せ。" },
  { category: "観光・アクティビティ・入場料", per_person: 40000, note: "展望台、モナコ、美術館など。" },
  { category: "海外旅行保険", per_person: 10000, note: "ハネムーンは手厚めがおすすめ。" },
  { category: "お土産・予備費", per_person: 40000, note: "為替変動・チップ・雑費のバッファ。" },
];
const insBudget = db.prepare(`INSERT INTO budget (sort_order, category, per_person, note) VALUES (?, ?, ?, ?)`);
budget.forEach((b, i) => insBudget.run(i, b.category, b.per_person, b.note));

// ---- spots（行きたいスポット候補のサンプル）-----------------
const spots = [
  { name: "シヨン城", name_en: "Château de Chillon", category: "観光", city: "モントルー", country: "スイス", lat: 46.4143, lng: 6.9276, url: "https://www.chillon.ch/en/", google_maps_url: "https://maps.app.goo.gl/8YbY2Yq3Z4w5xK6n7", note: "レマン湖畔の水城。ジュネーブから足を延ばせる候補。", source: "サンプル" },
  { name: "グラン・カニオン・デュ・ヴェルドン", name_en: "Gorges du Verdon", category: "自然", city: "プロヴァンス", country: "フランス", lat: 43.7494, lng: 6.3389, url: "https://www.verdontourisme.com/en/", google_maps_url: "https://maps.app.goo.gl/1Aa2Bb3Cc4Dd5Ee6", note: "ヨーロッパのグランドキャニオン。マルセイユ前の候補。", source: "サンプル" },
];
const insSpot = db.prepare(`INSERT INTO spots (name, name_en, category, city, country, lat, lng, url, google_maps_url, note, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
spots.forEach((s) => insSpot.run(s.name, s.name_en, s.category, s.city, s.country, s.lat, s.lng, s.url, s.google_maps_url, s.note, s.source));

console.log(`投入完了: trip=1, days=${count("days")}, items=${count("items")}, route=${count("route")}, legs=${count("legs")}, budget=${count("budget")}, spots=${count("spots")}`);
db.close();
