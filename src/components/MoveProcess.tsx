import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import { FaTrain, FaPlane, FaCableCar, FaCar, FaPersonWalking, FaRoute, FaLocationDot, FaCheck } from "react-icons/fa6";
import { TbLayoutSidebarRightCollapse } from "react-icons/tb";
import { ChevronDown, ChevronLeft } from "lucide-react";
import type { LegFeature, Spot } from "../types";
import type { SpotRating } from "../api";
import { resolveSpotIcon } from "../spotIcons";
import SpotDetailContent, { RatingBadge } from "./SpotDetailContent";

const MODE: Record<string, { Icon: IconType; color: string }> = {
  train: { Icon: FaTrain, color: "#0e7490" },
  flight: { Icon: FaPlane, color: "#2563eb" },
  bus: { Icon: FaCableCar, color: "#0891b2" },
  car: { Icon: FaCar, color: "#d97706" },
  walk: { Icon: FaPersonWalking, color: "#16a34a" },
};

// 工程・候補スポットで共通の見出し（同列カテゴリとして見た目を揃える）
const SECTION_HEADER =
  "group flex w-full items-center gap-2 rounded-lg py-1 text-left transition-colors hover:bg-white/40 dark:hover:bg-white/10";
const SECTION_TITLE =
  "flex items-center gap-2 text-base font-bold text-slate-800 [text-shadow:0_1px_3px_rgba(255,255,255,0.9)] dark:text-slate-100 dark:[text-shadow:none]";

export default function MoveProcess({
  legs,
  spots = [],
  ratings = {},
  visibleSpotIds = [],
  showSpots = true,
  onToggleShowSpots,
  detailSpotId = null,
  onOpenSpot,
  onCloseDetail,
  reload,
  selectedLeg = null,
  onSelectLeg,
  onClose,
  itineraryLegOrder = [],
}: {
  legs: LegFeature[];
  spots?: Spot[];
  ratings?: Record<string, SpotRating | null>;
  visibleSpotIds?: string[];
  showSpots?: boolean;
  onToggleShowSpots?: () => void;
  detailSpotId?: string | null;
  onOpenSpot?: (id: string) => void;
  onCloseDetail?: () => void;
  reload?: () => void;
  selectedLeg?: number | null;
  onSelectLeg?: (order: number | null) => void;
  onClose?: () => void;
  itineraryLegOrder?: string[]; // 旅程に組み込まれた leg id を旅程順に並べた配列
}) {
  const { t } = useTranslation("map");
  const modeLabel = (m: string) => t(`mode.${m}`, { defaultValue: m });
  // 旅程に移動が組み込まれていれば、その記載順で表示（地図の番号と一致）。
  // 無ければ従来どおり order_index 順で全件表示。
  const legById = new Map(legs.map((l) => [l.properties.id, l]));
  const itinLegs = itineraryLegOrder
    .map((id) => legById.get(id))
    .filter((f): f is LegFeature => !!f);
  const ordered = itinLegs.length
    ? itinLegs
    : [...legs].sort((a, b) => a.properties.order_index - b.properties.order_index);
  // 各セクションの開閉（既定は開く）
  const [legsOpen, setLegsOpen] = useState(true);
  const [spotsOpen, setSpotsOpen] = useState(true);

  const detailSpot = detailSpotId != null ? spots.find((s) => s.id === detailSpotId) ?? null : null;

  // いま地図に見えているスポットを上に（同順は元の並びを維持＝安定ソート）
  const visibleSet = new Set(visibleSpotIds);
  const orderedSpots = visibleSet.size
    ? [...spots].sort((a, b) => (visibleSet.has(a.id) ? 0 : 1) - (visibleSet.has(b.id) ? 0 : 1))
    : spots;

  // 一覧⇄詳細の切替時はスクロール位置を先頭に戻す
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [detailSpotId]);

  return (
    <aside className="mesh-overlay flex h-full min-w-0 flex-1 flex-col bg-white/45 shadow-[-8px_0_24px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:bg-slate-900/55">
      {/* パネルの開閉トグルはカテゴリより一段上に置く */}
      {onClose && (
        <div className="flex px-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("controls.closePanel")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-white/60 hover:text-slate-900 [filter:drop-shadow(0_1px_2px_rgba(255,255,255,0.9))] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100 dark:[filter:none]"
          >
            <TbLayoutSidebarRightCollapse size={20} />
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 pt-3">
        {detailSpot ? (
          /* 詳細ビュー（一覧から遷移） */
          <div className="space-y-3">
            <button
              type="button"
              onClick={onCloseDetail}
              className="-ml-1 flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-white/50 hover:text-slate-900 [text-shadow:0_1px_3px_rgba(255,255,255,0.9)] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100 dark:[text-shadow:none]"
            >
              <ChevronLeft size={18} /> {t("panel.backToSpots")}
            </button>
            <div className="overflow-hidden rounded-xl border border-pink-200 bg-white shadow-sm dark:border-pink-500/30 dark:bg-slate-800">
              <SpotDetailContent spot={detailSpot} rating={ratings[detailSpot.id] ?? null} reload={reload ?? (() => {})} />
            </div>
          </div>
        ) : (
          /* 一覧ビュー（候補スポットを上、移動の工程を下に） */
          <div className="flex flex-col gap-5">
            {/* 移動の工程 */}
            <section className="order-2 space-y-3">
              <button type="button" onClick={() => setLegsOpen((v) => !v)} aria-expanded={legsOpen} className={SECTION_HEADER}>
                <h2 className={SECTION_TITLE}>
                  <FaRoute className="text-cyan-700 dark:text-cyan-400" /> {t("panel.legsTitle")}
                </h2>
                <ChevronDown
                  size={18}
                  className={`ml-auto text-slate-500 transition-transform [filter:drop-shadow(0_1px_2px_rgba(255,255,255,0.9))] dark:text-slate-400 dark:[filter:none] ${legsOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {legsOpen && (
                <>
                  <p className="px-1 text-[11px] text-slate-500 [text-shadow:0_1px_3px_rgba(255,255,255,0.9)] dark:text-slate-400 dark:[text-shadow:none]">
                    {t("panel.legsHint")}
                  </p>
                  <ol className="space-y-3">
                    {ordered.map((f, i) => {
                      const p = f.properties;
                      const m = MODE[p.mode] ?? MODE.train;
                      const pts = f.geometry?.coordinates.length ?? 0;
                      const active = selectedLeg === p.order_index;
                      return (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => onSelectLeg?.(active ? null : p.order_index)}
                            aria-pressed={active}
                            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left shadow-sm backdrop-blur transition-colors ${
                              active
                                ? "border-cyan-500 bg-cyan-50/95 ring-2 ring-cyan-500/40 dark:border-cyan-500 dark:bg-cyan-500/15"
                                : "border-white/70 bg-white/85 hover:border-cyan-300 hover:bg-white/95 dark:border-white/10 dark:bg-slate-800/85 dark:hover:border-cyan-500/50 dark:hover:bg-slate-800/95"
                            }`}
                          >
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                              style={{ background: m.color }}
                            >
                              <m.Icon />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                                <span className="font-semibold text-slate-500 dark:text-slate-400">{t("panel.segment", { n: i + 1 })}</span>
                                <span>· {modeLabel(p.mode)}</span>
                                <span>· {pts > 0 ? t("panel.routePoints", { count: pts }) : t("panel.straight")}</span>
                              </div>
                              <div className="font-semibold text-slate-800 dark:text-slate-100">
                                {p.from} <span className="text-slate-400 dark:text-slate-500">→</span> {p.to}
                              </div>
                              {p.note && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{p.note}</p>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </section>

            {/* 候補スポット（移動の工程と同列のカテゴリ） */}
            {spots.length > 0 && (
              <section className="order-1 space-y-2">
                <div className="flex items-center gap-2">
                  {/* 地図にピンを表示するかのチェック（候補スポット見出しの横） */}
                  <label
                    className="flex shrink-0 cursor-pointer items-center"
                    title={t("panel.showSpotsOnMap")}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={showSpots}
                      onChange={() => onToggleShowSpots?.()}
                    />
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                        showSpots ? "border-pink-600 bg-pink-600 text-white" : "border-slate-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-800"
                      }`}
                    >
                      <FaCheck size={11} />
                    </span>
                  </label>
                  <button type="button" onClick={() => setSpotsOpen((v) => !v)} aria-expanded={spotsOpen} className={SECTION_HEADER}>
                    <h2 className={SECTION_TITLE}>
                      <FaLocationDot className="text-pink-600 dark:text-pink-400" /> {t("panel.spotsTitle")}
                      <span className="text-sm font-normal text-slate-400 dark:text-slate-500">{spots.length}</span>
                    </h2>
                    <ChevronDown
                      size={18}
                      className={`ml-auto text-slate-500 transition-transform [filter:drop-shadow(0_1px_2px_rgba(255,255,255,0.9))] dark:text-slate-400 dark:[filter:none] ${spotsOpen ? "" : "-rotate-90"}`}
                    />
                  </button>
                </div>
                {spotsOpen && (
                  <>
                    <p className="px-1 text-[11px] text-slate-500 [text-shadow:0_1px_3px_rgba(255,255,255,0.9)] dark:text-slate-400 dark:[text-shadow:none]">
                      {t("panel.spotsHint")}
                    </p>
                    <ul className="space-y-2">
                      {orderedSpots.map((s) => {
                        const def = resolveSpotIcon(s);
                        const rating = ratings[s.id] ?? null;
                        const photo = rating?.photoUrls?.[0];
                        const onMap = visibleSet.has(s.id);
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => onOpenSpot?.(s.id)}
                              className="block w-full overflow-hidden rounded-xl border border-white/70 bg-white/90 text-left shadow-sm backdrop-blur transition-colors hover:border-pink-300 hover:bg-white dark:border-white/10 dark:bg-slate-800/90 dark:hover:border-pink-500/50 dark:hover:bg-slate-800"
                            >
                              {photo ? (
                                <img
                                  src={photo}
                                  alt={s.name}
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                  className="h-40 w-full object-cover"
                                />
                              ) : (
                                <div
                                  className="flex h-24 w-full items-center justify-center text-4xl"
                                  style={{ background: `rgba(${def.rgb.join(",")},0.16)` }}
                                >
                                  {def.emoji}
                                </div>
                              )}
                              <div className="space-y-1.5 p-3">
                                <div className="flex items-start gap-2">
                                  <span className="shrink-0 text-base leading-6">{def.emoji}</span>
                                  <h3 className="line-clamp-2 min-w-0 flex-1 font-bold leading-snug text-slate-800 dark:text-slate-100">
                                    {s.name}
                                    {s.name_en && (
                                      <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">{s.name_en}</span>
                                    )}
                                  </h3>
                                  <span className="mt-0.5 shrink-0 text-pink-500">›</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                  {onMap && (
                                    <span className="inline-flex items-center gap-0.5 rounded bg-pink-100 px-1.5 py-0.5 font-medium text-pink-700 dark:bg-pink-500/15 dark:text-pink-300">
                                      <FaLocationDot className="text-[9px]" /> {t("panel.shownOnMap")}
                                    </span>
                                  )}
                                  {s.country && <span>{s.country}</span>}
                                  {s.city && <span>· {s.city}</span>}
                                  {s.category && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">{s.category}</span>}
                                  {rating && <RatingBadge rating={rating.rating} count={rating.userRatingCount} />}
                                </div>
                                {s.note && (
                                  <p className="line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{s.note}</p>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
