// バックエンド内部で使う「DB の生の行」の型。
// API レスポンス（shared/types.ts）と形が違うカラム（JSON 文字列のまま等）は
// ここで個別に定義し、整形後に API 型へ変換する。
import type {
  TripMeta,
  Item,
  RoutePoint,
  BudgetItem,
  Day,
} from "../shared/types.ts";

/** trip テーブルの生の行（API の TripMeta と同形）。 */
export type TripRow = TripMeta;

/** days テーブルの生の行（items は後から組み立てる）。 */
export type DayRow = Omit<Day, "items">;

/** items テーブルの生の行（API の Item と同形）。 */
export type ItemRow = Item;

/** route テーブルの生の行（API の RoutePoint と同形）。 */
export type RouteRow = RoutePoint;

/** budget テーブルの生の行（API の BudgetItem と同形）。 */
export type BudgetRow = BudgetItem;

// 以下の「生の行」型は object-literal の `type` で定義する。
// node:sqlite の get()/all() は Record<string, SQLOutputValue> を返すため、
// その結果を `as` で各行型へ変換するには（暗黙の index signature を得られる）
// type エイリアスである必要がある（interface だと変換不可と判定される）。

/** spots テーブルの生の行。instagram は JSON 文字列のまま保持する。 */
export type SpotRow = {
  id: number;
  name: string;
  name_en: string | null;
  category: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  google_maps_url: string | null;
  note: string | null;
  source: string | null;
  icon: string | null;
  instagram: string | null;
  created_at: string;
};

/** legs テーブルの生の行（geojson は LineString geometry の JSON 文字列）。 */
export type LegRow = {
  id: number;
  order_index: number;
  from_name: string | null;
  to_name: string | null;
  mode: string;
  geojson: string | null;
  note: string | null;
};

/** spot_place_cache テーブルの生の行。 */
export type SpotPlaceCacheRow = {
  spot_id: number;
  place_id: string | null;
  rating: number | null;
  rating_count: number | null;
  maps_uri: string | null;
  photos: string | null;
  fetched_at: string | null;
};

/** chat_sessions テーブルの生の行。 */
export type ChatSessionRow = {
  id: string;
  session_file: string | null;
  title: string | null;
  message_count: number;
  cost_usd: number;
  created_at: string;
  updated_at: string;
};
