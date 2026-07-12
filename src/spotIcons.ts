// 候補スポットのアイコン定義。地図のピン（IconLayer）と一覧（Spots.tsx）で共有する。
// spot.icon にキー（例 "castle"）を保存。未設定なら category から自動判定する。
import type { Spot } from "./types";

export type RGB = [number, number, number];

export interface SpotIconDef {
  key: string;
  emoji: string;
  label: string;
  rgb: RGB; // 地図ピンの色
}

// 選択肢（先頭の pin が既定フォールバック）
export const SPOT_ICONS: SpotIconDef[] = [
  { key: "pin", emoji: "📍", label: "デフォルト", rgb: [219, 39, 119] },
  { key: "sightseeing", emoji: "🏛️", label: "観光", rgb: [219, 39, 119] },
  { key: "nature", emoji: "⛰️", label: "自然", rgb: [22, 163, 74] },
  { key: "food", emoji: "🍽️", label: "食事", rgb: [234, 88, 12] },
  { key: "cafe", emoji: "☕", label: "カフェ", rgb: [180, 83, 9] },
  { key: "hotel", emoji: "🏨", label: "宿泊", rgb: [13, 148, 136] },
  { key: "castle", emoji: "🏰", label: "城", rgb: [147, 51, 234] },
  { key: "museum", emoji: "🖼️", label: "美術館", rgb: [124, 58, 237] },
  { key: "shopping", emoji: "🛍️", label: "買い物", rgb: [217, 70, 239] },
  { key: "view", emoji: "📷", label: "絶景", rgb: [2, 132, 199] },
  { key: "beach", emoji: "🏖️", label: "ビーチ", rgb: [14, 165, 233] },
  { key: "star", emoji: "⭐", label: "お気に入り", rgb: [202, 138, 4] },
];

const ICON_BY_KEY = new Map(SPOT_ICONS.map((d) => [d.key, d]));

// category 文字列 → 既定アイコンキー
const CATEGORY_TO_ICON: Record<string, string> = {
  観光: "sightseeing",
  名所: "sightseeing",
  自然: "nature",
  公園: "nature",
  食事: "food",
  グルメ: "food",
  レストラン: "food",
  カフェ: "cafe",
  宿泊: "hotel",
  ホテル: "hotel",
  城: "castle",
  美術館: "museum",
  博物館: "museum",
  買い物: "shopping",
  ショッピング: "shopping",
  絶景: "view",
  展望: "view",
  ビーチ: "beach",
  海: "beach",
};

/** spot.icon → category 自動判定 → pin、の優先順で確定したアイコン定義を返す。 */
export function resolveSpotIcon(spot: Pick<Spot, "icon" | "category">): SpotIconDef {
  if (spot.icon && ICON_BY_KEY.has(spot.icon)) return ICON_BY_KEY.get(spot.icon)!;
  if (spot.category && CATEGORY_TO_ICON[spot.category]) return ICON_BY_KEY.get(CATEGORY_TO_ICON[spot.category])!;
  return SPOT_ICONS[0];
}

export interface PinIcon {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

// 生成した data URL はアイコン種別ごとにキャッシュ（毎フレームの再生成を防ぐ）
const pinCache = new Map<string, PinIcon>();

/**
 * Google マップの POI ピン風の「小さめの色付き丸＋中央に絵文字」を canvas で生成し、IconLayer 用 descriptor を返す。
 * しずく形の尖り（tip）だと 3D/回転時にアンカーがズレて見えるため、円の中心をアンカーにして地点に正確に重ねる。
 */
export function spotPinIcon(def: SpotIconDef): PinIcon {
  const cached = pinCache.get(def.key);
  if (cached) return cached;

  const S = 64; // canvas 一辺（影が切れないよう本体より大きめの正方形）
  const cx = S / 2;
  const cy = S / 2;
  const r = 22; // 丸の半径

  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d")!;

  // 影付きの色付き円（シンプルな丸マーカー）
  ctx.save();
  ctx.shadowColor = "rgba(15,23,42,.35)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${def.rgb.join(",")})`;
  ctx.fill();
  ctx.restore();

  // 白い縁取り
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  // 中央の絵文字。textBaseline:"middle" 頼みだと iOS の絵文字フォントは実グリフが
  // em ボックスに対して下寄り・右寄りになり中央からズレる。measureText の実グリフ境界
  // （actualBoundingBox）を測り、その中心を丸の中心(cx,cy)へ厳密に合わせる。
  ctx.font = '24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif';
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(def.emoji);
  const left = m.actualBoundingBoxLeft ?? 0;
  const right = m.actualBoundingBoxRight ?? 0;
  const asc = m.actualBoundingBoxAscent ?? 0;
  const desc = m.actualBoundingBoxDescent ?? 0;
  if (right + left > 0 && asc + desc > 0) {
    // 実グリフの中心が (cx,cy) に来るようペン位置を補正
    ctx.fillText(def.emoji, cx - (right - left) / 2, cy + (asc - desc) / 2);
  } else {
    // measureText が境界を返さない環境向けフォールバック
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.emoji, cx, cy);
  }

  const icon: PinIcon = { url: canvas.toDataURL(), width: S, height: S, anchorX: cx, anchorY: cy };
  pinCache.set(def.key, icon);
  return icon;
}
