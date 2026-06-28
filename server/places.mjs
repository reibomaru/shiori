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

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PHOTO_MAX_WIDTH = 1000; // 取得する写真の最大幅（px）。カルーセルで大きく見るため広めに。
const PHOTO_COUNT = 6; // 1 スポットあたり解決する写真の最大枚数（Place Photo は 1 枚=1課金）。
const REFRESH_MS = 30 * 24 * 60 * 60 * 1000; // キャッシュのリフレッシュ間隔（30日・規約上限）。

const apiKey = () => process.env.GOOGLE_MAPS_API_KEY ?? "";

// ---- DB キャッシュ ------------------------------------------
function readCache(db, spotId) {
  return db.prepare("SELECT * FROM spot_place_cache WHERE spot_id = ?").get(spotId) ?? null;
}

function writeCache(db, spotId, v) {
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
export function invalidateSpotCache(db, spotId) {
  db.prepare("DELETE FROM spot_place_cache WHERE spot_id = ?").run(spotId);
}

function isFresh(row) {
  if (!row?.fetched_at) return false;
  const t = Date.parse(row.fetched_at.replace(" ", "T") + "Z"); // SQLite datetime('now') は UTC
  return Number.isFinite(t) && Date.now() - t < REFRESH_MS;
}

/** キャッシュ行 → API レスポンス値（評価が無ければ null）。 */
function rowToValue(row) {
  if (!row || row.rating == null) return null;
  let photoUrls = [];
  try {
    const v = JSON.parse(row.photos ?? "[]");
    if (Array.isArray(v)) photoUrls = v.filter((u) => typeof u === "string");
  } catch {
    /* 壊れた JSON は空配列 */
  }
  return { rating: row.rating, userRatingCount: row.rating_count ?? 0, googleMapsUri: row.maps_uri ?? null, photoUrls };
}

// ---- Places API 取得 ---------------------------------------
function queryFor(spot) {
  return [spot.name, spot.city, spot.country].filter(Boolean).join(" ").trim();
}

/** 写真リソース名 → 公開画像 URL（lh3.googleusercontent.com）。失敗時 null。 */
async function resolvePhotoUrl(photoName, signal) {
  if (!photoName) return null;
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH}&skipHttpRedirect=true`;
  try {
    const res = await fetch(url, { headers: { "X-Goog-Api-Key": apiKey() }, signal: signal ?? undefined });
    if (!res.ok) return null;
    const data = await res.json();
    return data.photoUri ?? null;
  } catch {
    return null;
  }
}

/** place オブジェクト（Text Search / Place Details 共通）→ 保存用の値。 */
async function placeToValue(p, signal) {
  if (!p || typeof p.rating !== "number") return null;
  const names = (p.photos ?? []).slice(0, PHOTO_COUNT).map((ph) => ph.name).filter(Boolean);
  const photoUrls = (await Promise.all(names.map((n) => resolvePhotoUrl(n, signal)))).filter(Boolean);
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
async function fetchPlace(spot, knownPlaceId, signal) {
  try {
    if (knownPlaceId) {
      const res = await fetch(`https://places.googleapis.com/v1/places/${knownPlaceId}`, {
        headers: { "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": PLACE_FIELDS_DETAILS },
        signal: signal ?? undefined,
      });
      if (res.ok) return await placeToValue(await res.json(), signal);
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
    return await placeToValue((await res.json()).places?.[0], signal);
  } catch (err) {
    console.error("[places] fetch error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 複数スポットの評価＋写真を取得する。DB キャッシュ（30日）を優先し、
 * 期限切れ・未取得のものだけ Places API を叩いて DB に保存する。
 * @returns {Promise<{configured: boolean, ratings: Record<number, object|null>}>}
 */
export async function getSpotRatings(db, spots, signal) {
  const hasKey = !!apiKey();
  const entries = await Promise.all(
    spots.map(async (s) => {
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
