// API クライアント。Vite の proxy 経由で /api を叩きます。
import type { TripPayload } from "./types";
import type { ChatMessage } from "./hooks/useSpotChat";

/** チャットセッション一覧の 1 行（サーバの chat_sessions より）。 */
export interface ChatSessionSummary {
  id: string;
  title: string | null;
  message_count: number;
  cost_usd: number;
  created_at: string;
  updated_at: string;
  has_history: boolean;
}

/** Google マップの評価（★）・写真。Places API から取得し DB に30日キャッシュ。 */
export interface SpotRating {
  rating: number;
  userRatingCount: number;
  googleMapsUri: string | null;
  photoUrls: string[]; // Places の写真 URL（lh3.googleusercontent.com）。複数枚。
}
export interface SpotRatingsResponse {
  configured: boolean; // GOOGLE_MAPS_API_KEY が設定されているか（未設定でもキャッシュは返る）
  ratings: Record<string, SpotRating | null>;
}

/** ジオコーディング結果（地名→座標）。 */
export interface GeocodeResult {
  name: string; // 短い名称（from_name 用）
  label: string; // 表示用の詳細（名称, 都市, 州, 国）
  lng: number;
  lat: number;
}

/** OSRM の経路候補（移動データ作成用）。 */
export interface OsrmRoute {
  distance: number; // m
  duration: number; // s
  geometry: { type: "LineString"; coordinates: [number, number][] };
  via?: string; // 主な経路（道路名のまとめ）
  roads?: string[]; // 経由する主な道路名
  waypoints?: string[]; // 通過する町名（逆ジオコード）
}

async function http<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getTrip: () => http<TripPayload>("/api/trip", "GET"),

  updateTrip: (patch: Record<string, unknown>) => http("/api/trip", "PUT", patch),

  createDay: (body: Record<string, unknown>) => http(`/api/days`, "POST", body),
  updateDay: (id: string, patch: Record<string, unknown>) => http(`/api/days/${id}`, "PUT", patch),
  deleteDay: (id: string) => http(`/api/days/${id}`, "DELETE"),

  updateItem: (id: string, patch: Record<string, unknown>) => http(`/api/items/${id}`, "PUT", patch),
  createItem: (body: Record<string, unknown>) => http(`/api/items`, "POST", body),
  deleteItem: (id: string) => http(`/api/items/${id}`, "DELETE"),

  updateBudget: (id: string, patch: Record<string, unknown>) => http(`/api/budget/${id}`, "PUT", patch),
  createBudget: (body: Record<string, unknown>) => http(`/api/budget`, "POST", body),
  deleteBudget: (id: string) => http(`/api/budget/${id}`, "DELETE"),

  getSpotRatings: () => http<SpotRatingsResponse>(`/api/spots/ratings`, "GET"),
  createSpot: (body: Record<string, unknown>) => http(`/api/spots`, "POST", body),
  updateSpot: (id: string, patch: Record<string, unknown>) => http(`/api/spots/${id}`, "PUT", patch),
  deleteSpot: (id: string) => http(`/api/spots/${id}`, "DELETE"),

  updateRoute: (id: string, patch: Record<string, unknown>) => http(`/api/route/${id}`, "PUT", patch),

  createLeg: (body: Record<string, unknown>) => http(`/api/legs`, "POST", body),
  deleteLeg: (id: string) => http(`/api/legs/${id}`, "DELETE"),
  // 地名→座標（Photon）。lat/lon を渡すと近傍を優先。tag で OSM 種別（例: 空港）に絞る。
  geocode: (q: string, bias?: { lat: number; lng: number }, tag?: string) =>
    http<{ results: GeocodeResult[]; error?: string }>(
      `/api/geocode?q=${encodeURIComponent(q)}${bias ? `&lat=${bias.lat}&lon=${bias.lng}` : ""}${
        tag ? `&tag=${encodeURIComponent(tag)}` : ""
      }`,
      "GET"
    ),
  // OSRM の経路候補を取得（from/to は "lng,lat"）。
  osrmRoute: (from: string, to: string, profile = "driving") =>
    http<{ routes: OsrmRoute[]; error?: string }>(
      `/api/osrm?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&profile=${profile}`,
      "GET"
    ),

  // ---- スポット候補チャットのセッション ----
  listChatSessions: () => http<ChatSessionSummary[]>(`/api/spots/chat/sessions`, "GET"),
  getChatSessionMessages: (id: string) =>
    http<ChatMessage[]>(`/api/spots/chat/sessions/${id}/messages`, "GET"),
  deleteChatSession: (id: string) => http(`/api/spots/chat/sessions/${id}`, "DELETE"),
};
