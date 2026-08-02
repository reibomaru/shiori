// 右ドックのパーツパレット。スポット候補と移動区間を、検索・タブ・配置状況付きで一覧表示し、
// DnD（useDraggable）＋クリック追加の両方で旅程へ差し込めるようにする。
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDraggable } from "@dnd-kit/core";
import {
  FaCompass,
  FaRoute,
  FaMagnifyingGlass,
  FaGripVertical,
  FaPlus,
  FaChevronDown,
  FaTrashCan,
} from "react-icons/fa6";
import type { LegFeature, RoutePoint, Spot } from "../../types";
import { ITEM_META } from "../../itemMeta";
import { legItemType, spotItemType } from "./builderModel";
import type { BuilderDay } from "./builderModel";
import LegCreator, { type Place } from "./LegCreator";

type Tab = "spots" | "legs";

/** どの日に何回配置されているかの索引。 */
export interface PlacedIndex {
  spots: Map<string, number[]>; // spotId -> day_no[]
  legs: Map<string, number[]>; // legId -> day_no[]
}

function PlacedBadge({ dayNos }: { dayNos: number[] }) {
  const { t } = useTranslation("itinerary");
  if (dayNos.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
      {t("palette.placedBadge", { days: dayNos.map((n) => `Day${n}`).join(" ") })}
    </span>
  );
}

/** 「＋ この日に追加」用の自前ドロップダウン（<select> は使わない）。 */
function AddToDayMenu({ days, onPick }: { days: BuilderDay[]; onPick: (dayId: string) => void }) {
  const { t } = useTranslation("itinerary");
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
      >
        <FaPlus className="text-[9px]" /> {t("palette.addToDay")} <FaChevronDown className="text-[8px]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 max-h-56 w-44 overflow-y-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
            {days.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(d.id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <span className="font-semibold text-slate-700 dark:text-slate-200">Day{d.day_no}</span>
                <span className="truncate text-slate-400 dark:text-slate-500">{d.city ?? d.title ?? ""}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 1 枚のパーツカード（ドラッグ可能）。 */
function PaletteCard({
  dragId,
  emoji,
  color,
  title,
  subtitle,
  dayNos,
  days,
  onAdd,
  onDelete,
}: {
  dragId: string;
  emoji: React.ReactNode;
  color: string;
  title: string;
  subtitle: string;
  dayNos: number[];
  days: BuilderDay[];
  onAdd: (dayId: string) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation("itinerary");
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });
  const placed = dayNos.length > 0;
  return (
    <div
      ref={setNodeRef}
      className={`flex items-start gap-2 rounded-xl border bg-white p-2.5 shadow-sm transition dark:bg-slate-900 ${
        isDragging ? "opacity-30" : ""
      } ${placed ? "border-slate-100 opacity-70 dark:border-slate-800" : "border-slate-200 hover:border-cyan-300 dark:border-slate-700 dark:hover:border-cyan-500/50"}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab touch-none rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-400"
        aria-label={t("palette.dragToAdd")}
      >
        <FaGripVertical />
      </button>
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: `${color}1a`, color }}
      >
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</div>
        <div className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">{subtitle}</div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <PlacedBadge dayNos={dayNos} />
          <div className="flex items-center gap-1">
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded-md p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                aria-label={t("palette.deleteLeg")}
                title={t("palette.deleteLeg")}
              >
                <FaTrashCan className="text-[11px]" />
              </button>
            )}
            <AddToDayMenu days={days} onPick={onAdd} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Palette({
  spots,
  legs,
  route,
  days,
  placed,
  onAddSpot,
  onAddLeg,
  onDeleteLeg,
  onLegCreated,
}: {
  spots: Spot[];
  legs: LegFeature[];
  route: RoutePoint[];
  days: BuilderDay[];
  placed: PlacedIndex;
  onAddSpot: (spot: Spot, dayId: string) => void;
  onAddLeg: (leg: LegFeature, dayId: string) => void;
  onDeleteLeg: (leg: LegFeature) => void;
  onLegCreated: () => void;
}) {
  const { t } = useTranslation("itinerary");
  const [tab, setTab] = useState<Tab>("spots");
  const [q, setQ] = useState("");
  const [unplacedOnly, setUnplacedOnly] = useState(false);

  const kw = q.trim().toLowerCase();
  const matchSpot = (s: Spot) =>
    !kw || [s.name, s.name_en, s.city, s.category].some((v) => v?.toLowerCase().includes(kw));
  const matchLeg = (l: LegFeature) =>
    !kw || [l.properties.from, l.properties.to].some((v) => v?.toLowerCase().includes(kw));

  const visibleSpots = spots
    .filter(matchSpot)
    .filter((s) => !unplacedOnly || (placed.spots.get(s.id) ?? []).length === 0);
  const visibleLegs = legs
    .filter(matchLeg)
    .filter((l) => !unplacedOnly || (placed.legs.get(l.properties.id) ?? []).length === 0)
    .sort((a, b) => a.properties.order_index - b.properties.order_index);

  // 移動作成（OSRM）の出発地・目的地候補：座標を持つルート地点＋スポット。
  const places: Place[] = [
    ...route
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ name: p.name, lng: p.lng as number, lat: p.lat as number })),
    ...spots
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ name: s.name, lng: s.lng as number, lat: s.lat as number })),
  ];
  const nextOrderIndex = legs.reduce((m, l) => Math.max(m, l.properties.order_index), -1) + 1;

  const tabBtn = (tb: Tab, Icon: typeof FaCompass, label: string, n: number) => (
    <button
      type="button"
      onClick={() => setTab(tb)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold transition ${
        tab === tb
          ? "bg-white text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-400"
          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      }`}
    >
      <Icon className="text-xs" /> {label}
      <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">{n}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-3 dark:border-slate-700">
        <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {tabBtn("spots", FaCompass, t("palette.tabSpots"), spots.length)}
          {tabBtn("legs", FaRoute, t("palette.tabLegs"), legs.length)}
        </div>
        <div className="relative">
          <FaMagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("palette.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={unplacedOnly}
            onChange={(e) => setUnplacedOnly(e.target.checked)}
            className="accent-cyan-600"
          />
          {t("palette.unplacedOnly")}
        </label>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {tab === "spots" &&
          (visibleSpots.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">{t("palette.noSpots")}</p>
          ) : (
            visibleSpots.map((s) => {
              const meta = ITEM_META[spotItemType(s)];
              return (
                <PaletteCard
                  key={s.id}
                  dragId={`palette:spot:${s.id}`}
                  emoji={<meta.Icon />}
                  color={meta.color}
                  title={s.name}
                  subtitle={[s.city, s.category].filter(Boolean).join(" · ") || s.country || ""}
                  dayNos={placed.spots.get(s.id) ?? []}
                  days={days}
                  onAdd={(dayId) => onAddSpot(s, dayId)}
                />
              );
            })
          ))}
        {tab === "legs" && (
          <LegCreator places={places} nextOrderIndex={nextOrderIndex} onCreated={onLegCreated} />
        )}
        {tab === "legs" &&
          (visibleLegs.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">{t("palette.noLegs")}</p>
          ) : (
            visibleLegs.map((l) => {
              const it = legItemType(l.properties.mode);
              const meta = ITEM_META[it];
              return (
                <PaletteCard
                  key={l.properties.id}
                  dragId={`palette:leg:${l.properties.id}`}
                  emoji={<meta.Icon />}
                  color={meta.color}
                  title={`${l.properties.from ?? "?"} → ${l.properties.to ?? "?"}`}
                  subtitle={t("palette.legSubtitle", {
                    index: l.properties.order_index + 1,
                    mode: t(`itemType.${it}`),
                  })}
                  dayNos={placed.legs.get(l.properties.id) ?? []}
                  days={days}
                  onAdd={(dayId) => onAddLeg(l, dayId)}
                  onDelete={() => onDeleteLeg(l)}
                />
              );
            })
          ))}
      </div>
    </div>
  );
}
