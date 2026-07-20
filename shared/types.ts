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
  id: string;
  day_id: string;
  sort_order: number;
  time: string | null;
  type: ItemType;
  title: string;
  note: string | null;
  url: string | null;
  url_label: string | null;
  cost: number | null;
  spot_id: string | null;
  leg_id: string | null;
}

export interface Day {
  id: string;
  day_no: number;
  date: string | null;
  city: string | null;
  title: string | null;
  items: Item[];
}

export interface RoutePoint {
  id: string;
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
    id: string;
    order_index: number;
    from: string | null;
    to: string | null;
    mode: "train" | "flight" | "bus" | "car" | "walk" | string;
    note: string | null;
  };
  geometry: { type: "LineString"; coordinates: [number, number][] } | null;
}

export interface BudgetItem {
  id: string;
  sort_order: number;
  category: string;
  per_person: number;
  note: string | null;
}

/**
 * 実費（確定した予約・領収書）1 件。budget（1人あたり概算）とは別レイヤーの
 * 「実際にいくら・いつ・何に支払ったか」を記録する。領収書/予約完了画面の
 * 元画像は images（別テーブル）に紐づく。配信は /api/expenses/images/:id。
 */
export interface Expense {
  id: string;
  sort_order: number;
  category: string; // 宿泊/交通/食事/観光 など（budget の費目と揃える想定）
  title: string; // 予約/支払いの概要
  vendor: string | null; // 予約先/店舗名
  amount: number; // 確定金額（currency 建て）
  currency: string; // 通貨コード（JPY / CHF / EUR など）
  paid: number; // 0=未払い / 1=支払済
  incurred_on: string | null; // 支払日 or 予約日（YYYY-MM-DD）
  source_url: string | null; // 予約サイト・完了メールのリンク（参考）
  note: string | null;
  created_at: string;
  updated_at: string;
  /** 紐づく領収書画像のメタ一覧（実体は別エンドポイントで配信）。 */
  images: ExpenseImageMeta[];
}

/** 実費に紐づく領収書画像のメタ情報（実体 data は含まない）。配信は /api/expenses/images/:id。 */
export interface ExpenseImageMeta {
  id: string;
  expense_id: string;
  mime_type: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 領収書画像から抽出した実費情報（ユーザーが確認・修正してから保存する）。 */
export interface ExpenseExtraction {
  title: string | null;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  paid: boolean | null;
  incurred_on: string | null; // YYYY-MM-DD
  category: string | null;
  note: string | null;
}

export interface Spot {
  id: string;
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

/** メモに取り込んだ元画像のメタ情報（実体 data は含まない）。配信は /api/memo/images/:id。 */
export interface MemoImageMeta {
  id: string;
  page_id: string;
  mime_type: string;
  sort_order: number;
  created_at: string;
  /** 回転保存などで内容が変わった時刻。配信 URL の ?v= に使いキャッシュを更新する。 */
  updated_at: string;
}

/** グラフ構造（フローチャート・組織図・相関図など）のノード。 */
export interface MemoGraphNode {
  id: string;
  label: string;
}

/** グラフ構造のエッジ（from → to）。有向。label は関係名など（任意）。 */
export interface MemoGraphEdge {
  from: string;
  to: string;
  label?: string;
  /** 矢印なしの無向な関係のとき true。既定は有向（矢印あり）。 */
  undirected?: boolean;
}

/** 画像から読み取ったグラフ構造（ノード＋エッジ）。React Flow で閲覧表示する。 */
export interface MemoGraph {
  nodes: MemoGraphNode[];
  edges: MemoGraphEdge[];
}

/**
 * メモの 1 ページ。自由記述の Markdown 本文(body)に加え、
 * 画像から抽出した HTML(html) と、その平文(text)、取り込んだ元画像(images) を持つ。
 * html は iframe(sandbox) で安全に表示し、text はスポット登録エージェントが参照する。
 * グラフ構造の図（ノード＋エッジ）は graph に構造化して保持し、React Flow で表示する。
 */
export interface MemoPage {
  id: string;
  title: string;
  body: string | null;
  html: string | null;
  text: string | null;
  /** 画像から読み取ったグラフ構造。無ければ null。 */
  graph: MemoGraph | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** 取り込んだ元画像のメタ一覧（実体は別エンドポイントで配信）。 */
  images: MemoImageMeta[];
}

export interface TripPayload {
  trip: TripMeta | null;
  days: Day[];
  route: RoutePoint[];
  legs: LegFeature[];
  budget: BudgetItem[];
  expenses: Expense[];
  spots: Spot[];
}
