// API クライアント。Vite の proxy 経由で /api を叩きます。
import type { TripPayload, MemoPage, MemoImageMeta, Expense, ExpenseExtraction } from "./types";
import type { ChatMessage } from "./hooks/useSpotChat";
import type { MemoChatMessage } from "./hooks/useMemoChat";

/** メモの抽出/添付に使う画像（base64・プレフィックス無し）。 */
export interface MemoImage {
  data: string;
  mimeType: string;
}

/** 取り込んだ元画像の配信 URL。version（updated_at）を付けて回転後のキャッシュを更新する。 */
export const memoImageUrl = (id: string, version?: string) =>
  `/api/memo/images/${id}${version ? `?v=${encodeURIComponent(version)}` : ""}`;

/** 領収書画像の配信 URL。version（updated_at）を付けてキャッシュを更新する。 */
export const expenseImageUrl = (id: string, version?: string) =>
  `/api/expenses/images/${id}${version ? `?v=${encodeURIComponent(version)}` : ""}`;

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
  // 空ボディ（Content-Length: 0 や 204）を res.json() に渡すと
  // "Unexpected end of JSON input" で落ちるため、テキストを見てから解釈する。
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
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

  // ---- 実費（確定した予約・領収書） ----
  createExpense: (body: Record<string, unknown>) => http<Expense>(`/api/expenses`, "POST", body),
  updateExpense: (id: string, patch: Record<string, unknown>) => http<Expense>(`/api/expenses/${id}`, "PUT", patch),
  deleteExpense: (id: string) => http(`/api/expenses/${id}`, "DELETE"),
  // 領収書画像を実費に追加保存し、更新後の実費を返す。
  addExpenseImages: (id: string, images: MemoImage[]) =>
    http<Expense>(`/api/expenses/${id}/images`, "POST", { images }),
  deleteExpenseImage: (id: string) => http(`/api/expenses/images/${id}`, "DELETE"),
  // 領収書/予約完了画面のスクショから実費情報を抽出する（保存はしない）。
  extractReceipt: (images: MemoImage[]) =>
    http<{ extraction: ExpenseExtraction; warning?: string }>(`/api/expenses/extract`, "POST", { images }),

  getSpotRatings: () => http<SpotRatingsResponse>(`/api/spots/ratings`, "GET"),
  // 提案プレビュー用: 保存前スポットの評価・写真を名称等のクエリで取得。
  previewSpotPhotos: (q: string) =>
    http<{ configured: boolean; rating: SpotRating | null }>(
      `/api/spots/place-preview?q=${encodeURIComponent(q)}`,
      "GET"
    ),
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
  // OSRM の経路候補を取得（from/to/vias は "lng,lat"）。経由地は from→via…→to の順。
  osrmRoute: (from: string, to: string, profile = "driving", vias: string[] = []) =>
    http<{ routes: OsrmRoute[]; error?: string }>(
      `/api/osrm?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&profile=${profile}${
        vias.length ? `&via=${encodeURIComponent(vias.join(";"))}` : ""
      }`,
      "GET"
    ),

  // ---- メモ（複数ページ） ----
  listMemoPages: () => http<MemoPage[]>(`/api/memo/pages`, "GET"),
  createMemoPage: (body: Record<string, unknown> = {}) => http<MemoPage>(`/api/memo/pages`, "POST", body),
  updateMemoPage: (id: string, patch: Record<string, unknown>) => http<MemoPage>(`/api/memo/pages/${id}`, "PUT", patch),
  deleteMemoPage: (id: string) => http(`/api/memo/pages/${id}`, "DELETE"),
  // 元画像を保存しつつ情報を抽出して HTML/テキストをページに追記し、更新後のページを返す。
  // 抽出に失敗しても元画像は保存され、warning が添えられる。
  extractMemoPage: (id: string, images: MemoImage[]) =>
    http<MemoPage & { warning?: string }>(`/api/memo/pages/${id}/extract`, "POST", { images }),
  deleteMemoImage: (id: string) => http(`/api/memo/images/${id}`, "DELETE"),
  // 画像の実体を差し替える（回転後の PNG を保存）。更新後のメタを返す。
  replaceMemoImage: (id: string, image: MemoImage) => http<MemoImageMeta>(`/api/memo/images/${id}`, "PUT", image),

  // ---- メモ編集チャットのセッション ----
  listMemoChatSessions: () => http<ChatSessionSummary[]>(`/api/memo/chat/sessions`, "GET"),
  getMemoChatSessionMessages: (id: string) =>
    http<MemoChatMessage[]>(`/api/memo/chat/sessions/${id}/messages`, "GET"),
  deleteMemoChatSession: (id: string) => http(`/api/memo/chat/sessions/${id}`, "DELETE"),
  // 提案カードの解決状態（保存/破棄）を永続化。リロード後も再保存させないため。
  resolveMemoProposal: (sessionId: string, proposalId: string, status: "saved" | "dismissed") =>
    http(`/api/memo/chat/sessions/${sessionId}/resolutions`, "POST", { proposalId, status }),

  // ---- スポット候補チャットのセッション ----
  listChatSessions: () => http<ChatSessionSummary[]>(`/api/spots/chat/sessions`, "GET"),
  getChatSessionMessages: (id: string) =>
    http<ChatMessage[]>(`/api/spots/chat/sessions/${id}/messages`, "GET"),
  deleteChatSession: (id: string) => http(`/api/spots/chat/sessions/${id}`, "DELETE"),
  // 提案カードの解決状態（保存/破棄）を永続化。リロード後も再保存させないため。
  resolveProposal: (sessionId: string, proposalId: string, status: "saved" | "dismissed") =>
    http(`/api/spots/chat/sessions/${sessionId}/resolutions`, "POST", { proposalId, status }),
};
