import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Spot } from "../types";
import type { SpotRating } from "../api";
import SpotDetailContent from "./SpotDetailContent";

/**
 * 候補スポットの詳細モーダル（一覧ページ用）。本体は SpotDetailContent を共有し、
 * 表示項目が地図パネルのインライン展開と乖離しないようにする。
 * - `area` を渡すとその領域内に中央寄せ（一覧ページはサイドバーを覆わないため main を実測して渡す）。
 *   省略時はビューポート全面。
 */
export default function SpotDetailModal({
  spots,
  openId,
  ratings,
  reload,
  onClose,
  area,
}: {
  spots: Spot[];
  openId: string | null;
  ratings: Record<string, SpotRating | null>;
  reload: () => void;
  onClose: () => void;
  area?: { left: number; width: number } | null;
}) {
  const openSpot = spots.find((s) => s.id === openId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!openSpot) return null;

  return createPortal(
    <div
      className="fixed top-0 bottom-0 z-[400] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8"
      style={{ left: area?.left ?? 0, width: area?.width ?? "100%" }}
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <SpotDetailContent spot={openSpot} rating={ratings[openSpot.id] ?? null} reload={reload} onClose={onClose} />
      </div>
    </div>,
    document.body
  );
}
