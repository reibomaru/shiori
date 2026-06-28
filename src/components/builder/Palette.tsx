// 右ドックのパーツパレット。スポット候補と移動区間を、検索・タブ・配置状況付きで一覧表示し、
// DnD（useDraggable）＋クリック追加の両方で旅程へ差し込めるようにする。
import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  FaCompass,
  FaRoute,
  FaMagnifyingGlass,
  FaGripVertical,
  FaPlus,
  FaChevronDown,
} from "react-icons/fa6";
import type { LegFeature, RoutePoint, Spot } from "../../types";
import { ITEM_META } from "../../itemMeta";
import { legItemType, spotItemType } from "./builderModel";
import type { BuilderDay } from "./builderModel";
import LegCreator, { type Place } from "./LegCreator";

type Tab = "spots" | "legs";

/** どの日に何回配置されているかの索引。 */
export interface PlacedIndex {
  spots: Map<number, number[]>; // spotId -> day_no[]
  legs: Map<number, number[]>; // legId -> day_no[]
}

function PlacedBadge({ dayNos }: { dayNos: number[] }) {
  if (dayNos.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
      ✓ {dayNos.map((n) => `Day${n}`).join(" ")}
    </span>
  );
}

/** 「＋ この日に追加」用の自前ドロップダウン（<select> は使わない）。 */
function AddToDayMenu({ days, onPick }: { days: BuilderDay[]; onPick: (dayId: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-100"
      >
        <FaPlus className="text-[9px]" /> この日に追加 <FaChevronDown className="text-[8px]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 max-h-56 w-44 overflow-y-auto rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
            {days.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(d.id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100"
              >
                <span className="font-semibold text-slate-700">Day{d.day_no}</span>
                <span className="truncate text-slate-400">{d.city ?? d.title ?? ""}</span>
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
}: {
  dragId: string;
  emoji: React.ReactNode;
  color: string;
  title: string;
  subtitle: string;
  dayNos: number[];
  days: BuilderDay[];
  onAdd: (dayId: number) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId });
  const placed = dayNos.length > 0;
  return (
    <div
      ref={setNodeRef}
      className={`flex items-start gap-2 rounded-xl border bg-white p-2.5 shadow-sm transition ${
        isDragging ? "opacity-30" : ""
      } ${placed ? "border-slate-100 opacity-70" : "border-slate-200 hover:border-cyan-300"}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-0.5 cursor-grab touch-none rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        aria-label="ドラッグして旅程に追加"
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
        <div className="truncate text-sm font-semibold text-slate-800">{title}</div>
        <div className="mt-0.5 truncate text-[11px] text-slate-400">{subtitle}</div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <PlacedBadge dayNos={dayNos} />
          <AddToDayMenu days={days} onPick={onAdd} />
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
  onLegCreated,
}: {
  spots: Spot[];
  legs: LegFeature[];
  route: RoutePoint[];
  days: BuilderDay[];
  placed: PlacedIndex;
  onAddSpot: (spot: Spot, dayId: number) => void;
  onAddLeg: (leg: LegFeature, dayId: number) => void;
  onLegCreated: () => void;
}) {
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

  const tabBtn = (t: Tab, Icon: typeof FaCompass, label: string, n: number) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold transition ${
        tab === t ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
      }`}
    >
      <Icon className="text-xs" /> {label}
      <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{n}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-3">
        <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1">
          {tabBtn("spots", FaCompass, "スポット", spots.length)}
          {tabBtn("legs", FaRoute, "移動", legs.length)}
        </div>
        <div className="relative">
          <FaMagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名称・都市で検索"
            className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-sm focus:border-cyan-500 focus:outline-none"
          />
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={unplacedOnly}
            onChange={(e) => setUnplacedOnly(e.target.checked)}
            className="accent-cyan-600"
          />
          未配置のみ表示
        </label>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {tab === "spots" &&
          (visibleSpots.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">該当するスポットがありません</p>
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
            <p className="py-6 text-center text-xs text-slate-400">移動区間がありません。上の「移動を作成」で追加できます。</p>
          ) : (
            visibleLegs.map((l) => {
              const meta = ITEM_META[legItemType(l.properties.mode)];
              return (
                <PaletteCard
                  key={l.properties.id}
                  dragId={`palette:leg:${l.properties.id}`}
                  emoji={<meta.Icon />}
                  color={meta.color}
                  title={`${l.properties.from ?? "?"} → ${l.properties.to ?? "?"}`}
                  subtitle={`区間 ${l.properties.order_index + 1} · ${meta.label}`}
                  dayNos={placed.legs.get(l.properties.id) ?? []}
                  days={days}
                  onAdd={(dayId) => onAddLeg(l, dayId)}
                />
              );
            })
          ))}
      </div>
    </div>
  );
}
