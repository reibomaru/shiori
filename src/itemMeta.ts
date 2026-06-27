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

/** 予定タイプごとのアイコン（react-icons）・ラベル・色 */
export const ITEM_META: Record<ItemType, { Icon: IconType; label: string; color: string }> = {
  flight: { Icon: FaPlane, label: "移動（飛行機）", color: "#2563eb" },
  train: { Icon: FaTrain, label: "移動（鉄道）", color: "#0e7490" },
  bus: { Icon: FaCableCar, label: "移動（バス・登山）", color: "#0891b2" },
  spot: { Icon: FaLocationDot, label: "観光", color: "#d97706" },
  meal: { Icon: FaUtensils, label: "食事", color: "#db2777" },
  hotel: { Icon: FaBed, label: "宿泊", color: "#7c3aed" },
  free: { Icon: FaRegClock, label: "自由・その他", color: "#64748b" },
};

export const ITEM_TYPES = Object.keys(ITEM_META) as ItemType[];

export const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");
