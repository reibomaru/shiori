// API（SQLite）レスポンスの型。DB のカラム名（snake_case）に合わせています。

export type ItemType =
  | "flight" // 飛行機
  | "train" // 鉄道（氷河特急など）
  | "bus" // バス・ロープウェイ・登山鉄道
  | "spot" // 観光スポット
  | "meal" // 食事
  | "hotel" // 宿泊
  | "free"; // 自由時間・その他

export interface TripMeta {
  id: number;
  title: string;
  subtitle: string;
  start_date: string;
  end_date: string;
  travelers: string;
  party_size: number;
  fx_note: string;
  memo: string | null;
}

export interface Item {
  id: number;
  day_id: number;
  sort_order: number;
  time: string | null;
  type: ItemType;
  title: string;
  note: string | null;
  url: string | null;
  url_label: string | null;
  cost: number | null;
  spot_id: number | null;
  leg_id: number | null;
}

export interface Day {
  id: number;
  day_no: number;
  date: string | null;
  city: string | null;
  title: string | null;
  items: Item[];
}

export interface RoutePoint {
  id: number;
  order_index: number;
  name: string;
  lat: number | null;
  lng: number | null;
  hub: number;
  leg_type: ItemType | null;
  note: string | null;
}

/** 都市間の移動区間（GeoJSON Feature）。geometry は LineString（[lng, lat]）。 */
export interface LegFeature {
  type: "Feature";
  properties: {
    id: number;
    order_index: number;
    from: string | null;
    to: string | null;
    mode: "train" | "flight" | "bus" | "car" | "walk" | string;
    note: string | null;
  };
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
}

export interface BudgetItem {
  id: number;
  sort_order: number;
  category: string;
  per_person: number;
  note: string | null;
}

export interface Spot {
  id: number;
  name: string;
  name_en: string | null;
  category: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  google_maps_url: string | null; // Google マップのリンク（口コミ・評価はリンク先で確認）
  note: string | null;
  source: string | null;
  icon: string | null;
  instagram: string[]; // 関連 Instagram 投稿 URL（埋め込みギャラリー用）。API 側で JSON をパース済み。
  created_at: string;
}

export interface TripPayload {
  trip: TripMeta | null;
  days: Day[];
  route: RoutePoint[];
  legs: LegFeature[];
  budget: BudgetItem[];
  spots: Spot[];
}
