// ============================================================
//  Google Places API (New) でスポットの「評価（★）」と「写真」を取得し、
//  スポットごとに DB（spot_place_cache）へキャッシュする。
//
//  方針（API コスト最適化＋規約準拠）:
//   - 取得結果はスポット単位で DB に保存し、再取得を避ける。
//     place_id は無期限保存可。評価・写真などのコンテンツは規約上 最大30日まで
//     なので REFRESH_MS=30日 を過ぎたら作り直す。
//   - リフレッシュ時は place_id があれば Place Details（Enterprise $20/1000）で安く、
//     無ければ Text Search（Enterprise $35/1000）で place_id ごと取得する。
//   - 写真は Place Photo (New) で表示用 URL（lh3.googleusercontent.com）に解決して
//     保存する（写真の実体は保存しない）。写真1枚=1課金。
//   - API キー未設定でも、DB にキャッシュがあればそれを返す（取得だけ行わない）。
// ============================================================
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Spot } from "../shared/types.ts";
import type { SpotPlaceCacheRow } from "../db/types.ts";

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PHOTO_MAX_WIDTH = 1000; // 取得する写真の最大幅（px）。カルーセルで大きく見るため広めに。
const PHOTO_COUNT = 6; // 1 スポットあたり解決する写真の最大枚数（Place Photo は 1 枚=1課金）。
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // キャッシュのリフレッシュ間隔（30日・規約上限）。

const apiKey = (): string => process.env.GOOGLE_MAPS_API_KEY ?? "";

/** API レスポンスとして返すスポットの評価・写真。 */
export interface SpotRatingValue {
  rating: number;
  userRatingCount: number;
  googleMapsUri: string | null;
  photoUrls: string[];
}

/** Places API から取り出した保存用の値。 */
interface FetchedPlace {
  placeId: string | null;
  rating: number;
  ratingCount: number;
  mapsUri: string | null;
  photoUrls: string[];
}

/** Places API（Text Search / Place Details）の place オブジェクト（必要分のみ）。 */
interface PlaceApiResult {
  id?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  photos?: Array<{ name?: string }>;
}

// ---- DB キャッシュ ------------------------------------------
function readCache(db: DatabaseSync, spotId: SQLInputValue): SpotPlaceCacheRow | null {
  return (db.prepare("SELECT * FROM spot_place_cache WHERE spot_id = ?").get(spotId) as SpotPlaceCacheRow | undefined) ?? null;
}

function writeCache(db: DatabaseSync, spotId: SQLInputValue, v: FetchedPlace): void {
  db.prepare(
    `INSERT INTO spot_place_cache (spot_id, place_id, rating, rating_count, maps_uri, photos, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(spot_id) DO UPDATE SET
       place_id = excluded.place_id, rating = excluded.rating, rating_count = excluded.rating_count,
       maps_uri = excluded.maps_uri, photos = excluded.photos, fetched_at = excluded.fetched_at`,
  ).run(spotId, v.placeId ?? null, v.rating ?? null, v.ratingCount ?? null, v.mapsUri ?? null,
    JSON.stringify(v.photoUrls ?? []));
}

/** spots を消したとき以外（名称等の編集時）に手動でキャッシュを無効化する。 */
export function invalidateSpotCache(db: DatabaseSync, spotId: SQLInputValue): void {
  db.prepare("DELETE FROM spot_place_cache WHERE spot_id = ?").run(spotId);
}

function isFresh(row: SpotPlaceCacheRow | null): boolean {
  if (!row?.fetched_at) return false;
  const t = Date.parse(row.fetched_at.replace(" ", "T") + "Z"); // SQLite datetime('now') は UTC
  return Number.isFinite(t) && Date.now() - t < REFRESH_MS;
}

/** キャッシュ行 → API レスポンス値（評価が無ければ null）。 */
function rowToValue(row: SpotPlaceCacheRow | null): SpotRatingValue | null {
  if (!row || row.rating == null) return null;
  let photoUrls: string[] = [];
  try {
    const v: unknown = JSON.parse(row.photos ?? "[]");
    if (Array.isArray(v)) photoUrls = v.filter((u): u is string => typeof u === "string");
  } catch {
    /* 壊れた JSON は空配列 */
  }
  return { rating: row.rating, userRatingCount: row.rating_count ?? 0, googleMapsUri: row.maps_uri ?? null, photoUrls };
}

// ---- Places API 取得 ---------------------------------------
function queryFor(spot: Spot): string {
  return [spot.name, spot.city, spot.country].filter(Boolean).join(" ").trim();
}

/** 写真リソース名 → 公開画像 URL（lh3.googleusercontent.com）。失敗時 null。 */
async function resolvePhotoUrl(photoName: string, signal?: AbortSignal): Promise<string | null> {
  if (!photoName) return null;
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH}&skipHttpRedirect=true`;
  try {
    const res = await fetch(url, { headers: { "X-Goog-Api-Key": apiKey() }, signal: signal ?? undefined });
    if (!res.ok) return null;
    const data = await res.json() as { photoUri?: string };
    return data.photoUri ?? null;
  } catch {
    return null;
  }
}

/** place オブジェクト（Text Search / Place Details 共通）→ 保存用の値。 */
async function placeToValue(p: PlaceApiResult | undefined, signal?: AbortSignal): Promise<FetchedPlace | null> {
  if (!p || typeof p.rating !== "number") return null;
  const names = (p.photos ?? []).slice(0, PHOTO_COUNT).map((ph) => ph.name).filter((n): n is string => !!n);
  const photoUrls = (await Promise.all(names.map((n) => resolvePhotoUrl(n, signal)))).filter((u): u is string => !!u);
  return {
    placeId: p.id ?? null,
    rating: p.rating,
    ratingCount: p.userRatingCount ?? 0,
    mapsUri: p.googleMapsUri ?? null,
    photoUrls,
  };
}

const PLACE_FIELDS_DETAILS = "id,displayName,rating,userRatingCount,googleMapsUri,photos";
const PLACE_FIELDS_SEARCH = "places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.photos";

/** place_id 既知なら Place Details（安い）、無ければ Text Search で取得。 */
async function fetchPlace(spot: Spot, knownPlaceId: string | null | undefined, signal?: AbortSignal): Promise<FetchedPlace | null> {
  try {
    if (knownPlaceId) {
      const res = await fetch(`https://places.googleapis.com/v1/places/${knownPlaceId}`, {
        headers: { "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": PLACE_FIELDS_DETAILS },
        signal: signal ?? undefined,
      });
      if (res.ok) return await placeToValue((await res.json()) as PlaceApiResult, signal);
      // place_id が無効化された等は Text Search にフォールバック
    }
    const query = queryFor(spot);
    if (!query) return null;
    const res = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": PLACE_FIELDS_SEARCH,
      },
      body: JSON.stringify({ textQuery: query, languageCode: "ja", maxResultCount: 1 }),
      signal: signal ?? undefined,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[places] HTTP ${res.status} query="${query}" ${body.slice(0, 200)}`);
      return null;
    }
    return await placeToValue(((await res.json()) as { places?: PlaceApiResult[] }).places?.[0], signal);
  } catch (err) {
    console.error("[places] fetch error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** 複数スポットの評価＋写真の取得結果。 */
export interface SpotRatingsResult {
  configured: boolean;
  ratings: Record<number, SpotRatingValue | null>;
}

/**
 * 複数スポットの評価＋写真を取得する。DB キャッシュ（30日）を優先し、
 * 期限切れ・未取得のものだけ Places API を叩いて DB に保存する。
 */
export async function getSpotRatings(db: DatabaseSync, spots: Spot[], signal?: AbortSignal): Promise<SpotRatingsResult> {
  const hasKey = !!apiKey();
  const entries = await Promise.all(
    spots.map(async (s): Promise<[number, SpotRatingValue | null]> => {
      const row = readCache(db, s.id);
      if (isFresh(row)) return [s.id, rowToValue(row)];
      if (!hasKey) return [s.id, rowToValue(row)]; // キー無し: 期限切れでもあるものは返す
      const fetched = await fetchPlace(s, row?.place_id, signal);
      if (fetched) {
        writeCache(db, s.id, fetched);
        return [s.id, rowToValue(readCache(db, s.id))];
      }
      return [s.id, rowToValue(row)]; // 取得失敗: 古いキャッシュがあれば返す
    }),
  );
  return { configured: hasKey, ratings: Object.fromEntries(entries) };
}
