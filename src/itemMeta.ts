import type { IconType } from "react-icons";
import {
  FaPlane,
  FaTrain,
  FaCableCar,
  FaLocationDot,
  FaUtensils,
  FaBed,
  FaRegClock,
} from "react-icons/fa6";
import type { ItemType } from "./types";

/** 予定タイプごとのアイコン（react-icons）・色。表示名は itinerary 名前空間の `itemType.{type}` で翻訳する。 */
export const ITEM_META: Record<ItemType, { Icon: IconType; color: string }> = {
  flight: { Icon: FaPlane, color: "#2563eb" },
  train: { Icon: FaTrain, color: "#0e7490" },
  bus: { Icon: FaCableCar, color: "#0891b2" },
  spot: { Icon: FaLocationDot, color: "#d97706" },
  meal: { Icon: FaUtensils, color: "#db2777" },
  hotel: { Icon: FaBed, color: "#7c3aed" },
  free: { Icon: FaRegClock, color: "#64748b" },
};

export const ITEM_TYPES = Object.keys(ITEM_META) as ItemType[];

export const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");
