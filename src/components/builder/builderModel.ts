// 旅程ビルダーのローカルデータモデルと、API ペイロードへの変換ヘルパー。
// Block は DB の items 行に 1:1 で対応する（id は items.id）。まだ保存前の楽観的ブロックは
// 負の一時 id を持ち、POST 後に実 id へ差し替える。
import type { Day, ItemType, LegFeature, Spot } from "../../types";

/** タイムラインに並ぶ 1 ブロック（= items 1 行）。 */
export interface Block {
  id: number; // items.id（保存前は負の一時値）
  time: string;
  type: ItemType;
  title: string;
  note: string | null;
  url: string | null;
  url_label: string | null;
  cost: number | null;
  spot_id: number | null;
  leg_id: number | null;
}

export interface BuilderDay {
  id: number;
  day_no: number;
  date: string | null;
  city: string | null;
  title: string | null;
  blocks: Block[];
}

/** 編集可能なブロックのフィールド（インライン編集パネル用）。 */
export type BlockPatch = Partial<
  Pick<Block, "time" | "type" | "title" | "note" | "url" | "url_label" | "cost">
>;

/** 飲食系カテゴリならば meal、それ以外は spot 扱い（初期 type の推定）。 */
const MEAL_HINT = ["食", "グルメ", "レストラン", "カフェ", "ディナー", "ランチ", "バー", "スイーツ"];
export function spotItemType(spot: Spot): ItemType {
  const c = spot.category ?? "";
  return MEAL_HINT.some((h) => c.includes(h)) ? "meal" : "spot";
}

/** 移動区間の mode を旅程の ItemType に対応づける。 */
export function legItemType(mode: string): ItemType {
  if (mode === "flight") return "flight";
  if (mode === "train") return "train";
  if (mode === "bus") return "bus";
  return "free"; // car / walk など
}

let tempSeq = 0;
/** 保存前の楽観的ブロック用の一時 id（負値）。 */
export const tempId = () => -++tempSeq;

/** items 行 → Block。 */
function blockFromItem(it: import("../../types").Item): Block {
  return {
    id: it.id,
    time: it.time ?? "",
    type: it.type,
    title: it.title,
    note: it.note,
    url: it.url,
    url_label: it.url_label,
    cost: it.cost,
    spot_id: it.spot_id,
    leg_id: it.leg_id,
  };
}

/** 実データの Day[] から初期 state を作る。 */
export function seedDays(days: Day[]): BuilderDay[] {
  return days.map((d) => ({
    id: d.id,
    day_no: d.day_no,
    date: d.date,
    city: d.city,
    title: d.title,
    blocks: [...d.items].sort((a, b) => a.sort_order - b.sort_order).map(blockFromItem),
  }));
}

/** スポット候補 → 楽観的ブロック（差し込み時の初期値）。 */
export function newBlockFromSpot(spot: Spot): Block {
  return {
    id: tempId(),
    time: "",
    type: spotItemType(spot),
    title: spot.name,
    note: spot.note,
    url: spot.url ?? spot.google_maps_url,
    url_label: spot.url || spot.google_maps_url ? "リンク" : null,
    cost: null,
    spot_id: spot.id,
    leg_id: null,
  };
}

/** 移動区間 → 楽観的ブロック。 */
export function newBlockFromLeg(leg: LegFeature): Block {
  const p = leg.properties;
  return {
    id: tempId(),
    time: "",
    type: legItemType(p.mode),
    title: `${p.from ?? "?"} → ${p.to ?? "?"}`,
    note: p.note,
    url: null,
    url_label: null,
    cost: null,
    spot_id: null,
    leg_id: p.id,
  };
}

/** 自由入力の空ブロック。 */
export function newBlockManual(): Block {
  return {
    id: tempId(),
    time: "",
    type: "free",
    title: "新しい予定",
    note: null,
    url: null,
    url_label: null,
    cost: null,
    spot_id: null,
    leg_id: null,
  };
}

/** Block → items の POST/PUT 用ボディ。 */
export function itemBody(block: Block, dayId: number, sortOrder: number) {
  return {
    day_id: dayId,
    sort_order: sortOrder,
    time: block.time || null,
    type: block.type,
    title: block.title || "（無題）",
    note: block.note,
    url: block.url,
    url_label: block.url_label,
    cost: block.cost,
    spot_id: block.spot_id,
    leg_id: block.leg_id,
  };
}
