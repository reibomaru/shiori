// 幾何データのユーティリティ。
// 内部表現は GeoJSON（LineString, 座標は [lng, lat]）。
// 入力として GPX も受け付け、取り込み時に GeoJSON へ変換する。

/** GPX(XML) → 座標列 [[lat, lng], ...]（依存ライブラリなし） */
export function parseGpx(xml) {
  const pts = [];
  if (!xml) return pts;
  const tag = /<(?:trkpt|rtept|wpt)\b([^>]*?)\/?>/g;
  let m;
  while ((m = tag.exec(xml))) {
    const a = m[1];
    const la = /\blat\s*=\s*"([\-0-9.]+)"/.exec(a);
    const lo = /\blon\s*=\s*"([\-0-9.]+)"/.exec(a);
    if (la && lo) pts.push([parseFloat(la[1]), parseFloat(lo[1])]);
  }
  return pts;
}

/** [[lat, lng], ...] → GeoJSON LineString geometry（[lng, lat] 順） */
export function toLineString(latlngs) {
  return { type: "LineString", coordinates: latlngs.map(([la, lo]) => [lo, la]) };
}

/** LineString geometry → [[lat, lng], ...] */
export function lineStringLatLngs(geom) {
  if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) return [];
  return geom.coordinates.map(([lo, la]) => [la, lo]);
}

/**
 * 任意の GeoJSON（FeatureCollection / Feature / geometry / GPX文字列）から
 * LineString geometry を取り出す。鉄道トラックの取り込みに使用。
 */
export function extractLineString(input) {
  // GPX 文字列ならまず変換
  if (typeof input === "string") {
    const trimmed = input.trimStart();
    if (trimmed.startsWith("<")) {
      const pts = parseGpx(input);
      return pts.length ? toLineString(pts) : null;
    }
    input = JSON.parse(input);
  }
  if (!input || typeof input !== "object") return null;
  if (input.type === "LineString") return input;
  if (input.type === "MultiLineString") {
    return { type: "LineString", coordinates: input.coordinates.flat() };
  }
  if (input.type === "Feature") return extractLineString(input.geometry);
  if (input.type === "FeatureCollection") {
    for (const f of input.features ?? []) {
      const g = extractLineString(f);
      if (g) return g;
    }
  }
  return null;
}
