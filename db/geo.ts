// 幾何データのユーティリティ。
// 内部表現は GeoJSON（LineString, 座標は [lng, lat]）。
// 入力として GPX も受け付け、取り込み時に GeoJSON へ変換する。
import type { LineString, Position } from "geojson";

/** [緯度, 経度] のペア。 */
export type LatLng = [number, number];

/** GPX(XML) → 座標列 [[lat, lng], ...]（依存ライブラリなし） */
export function parseGpx(xml: string): LatLng[] {
  const pts: LatLng[] = [];
  if (!xml) return pts;
  const tag = /<(?:trkpt|rtept|wpt)\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const a = m[1];
    const la = /\blat\s*=\s*"([\-0-9.]+)"/.exec(a);
    const lo = /\blon\s*=\s*"([\-0-9.]+)"/.exec(a);
    if (la && lo) pts.push([parseFloat(la[1]), parseFloat(lo[1])]);
  }
  return pts;
}

/** [[lat, lng], ...] → GeoJSON LineString geometry（[lng, lat] 順） */
export function toLineString(latlngs: LatLng[]): LineString {
  return { type: "LineString", coordinates: latlngs.map(([la, lo]) => [lo, la]) };
}

/** LineString geometry → [[lat, lng], ...] */
export function lineStringLatLngs(geom: LineString | null | undefined): LatLng[] {
  if (!geom || geom.type !== "LineString" || !Array.isArray(geom.coordinates)) return [];
  return geom.coordinates.map(([lo, la]) => [la, lo]);
}

/**
 * 任意の GeoJSON（FeatureCollection / Feature / geometry / GPX文字列）から
 * LineString geometry を取り出す。鉄道トラックの取り込みに使用。
 */
export function extractLineString(input: unknown): LineString | null {
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
  const obj = input as {
    type?: string;
    coordinates?: Position[][];
    geometry?: unknown;
    features?: unknown[];
  };
  if (obj.type === "LineString") return obj as unknown as LineString;
  if (obj.type === "MultiLineString") {
    return { type: "LineString", coordinates: (obj.coordinates ?? []).flat() };
  }
  if (obj.type === "Feature") return extractLineString(obj.geometry);
  if (obj.type === "FeatureCollection") {
    for (const f of obj.features ?? []) {
      const g = extractLineString(f);
      if (g) return g;
    }
  }
  return null;
}
