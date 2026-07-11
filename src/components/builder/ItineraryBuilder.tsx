// 旅程ビルダー。右ドックのパレットから DnD／クリックで部品（スポット候補・移動区間）を差し込み、
// タイムライン上で並べ替え・日跨ぎ移動できる。各操作は items API に永続化する（楽観的更新）。
import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FaPlus, FaCircleInfo, FaRegCalendarDays, FaPen, FaCheck, FaTrashCan } from "react-icons/fa6";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { Day, LegFeature, RoutePoint, Spot } from "../../types";
import { yen } from "../../itemMeta";
import { api } from "../../api";
import { useTrip } from "../../store";
import ConfirmDialog from "../ConfirmDialog";
import Palette, { type PlacedIndex } from "./Palette";
import BlockCard, { BlockBody } from "./BlockCard";
import {
  seedDays,
  newBlockFromSpot,
  newBlockFromLeg,
  newBlockManual,
  itemBody,
  type Block,
  type BlockPatch,
  type BuilderDay,
} from "./builderModel";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function fmtDate(d: string | null) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}/${dt.getDate()}（${WD[dt.getDay()]}）`;
}

const dayKey = (id: string) => `day:${id}`;
const dayIdFromKey = (key: string) => key.slice(4);

// ---- 1 日のカード（ドロップ先＋並べ替えコンテナ） --------------------------
const dayField =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-cyan-500 focus:outline-none";

function DayHeader({
  day,
  onSave,
  onDelete,
}: {
  day: BuilderDay;
  onSave: (patch: { date?: string | null; city?: string | null; title?: string | null }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ date: day.date, city: day.city, title: day.title });
  const dayCost = day.blocks.reduce((s, b) => s + (b.cost ?? 0), 0);

  if (!editing) {
    return (
      <header className="mb-3 flex items-start gap-3 border-b border-slate-100 pb-2.5">
        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 text-white">
          <span className="text-[9px] leading-none opacity-80">DAY</span>
          <span className="text-lg font-bold leading-none">{day.day_no}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{fmtDate(day.date)}</span>
            {day.city && <span className="rounded-full bg-slate-100 px-2 py-0.5">{day.city}</span>}
            {dayCost > 0 && <span className="text-amber-600">概算 {yen(dayCost)}/人</span>}
          </div>
          {day.title && <h3 className="mt-0.5 truncate text-base font-bold text-slate-800">{day.title}</h3>}
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft({ date: day.date, city: day.city, title: day.title });
            setEditing(true);
          }}
          className="no-print shrink-0 rounded p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600"
          aria-label="この日を編集"
        >
          <FaPen className="text-xs" />
        </button>
      </header>
    );
  }

  return (
    <header className="no-print mb-3 border-b border-slate-100 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 text-white">
          <span className="text-[9px] leading-none opacity-80">DAY</span>
          <span className="text-lg font-bold leading-none">{day.day_no}</span>
        </div>
        <input
          type="date"
          value={draft.date ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value || null }))}
          className={`${dayField} w-36`}
        />
        <input
          value={draft.city ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value || null }))}
          placeholder="都市"
          className={`${dayField} min-w-0 flex-1`}
        />
      </div>
      <input
        value={draft.title ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value || null }))}
        placeholder="この日のタイトル"
        className={`${dayField} mt-2 w-full`}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
          className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-1 text-sm font-semibold text-white hover:bg-cyan-700"
        >
          <FaCheck className="text-xs" /> 保存
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-200"
        >
          閉じる
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-rose-600 hover:bg-rose-50"
        >
          <FaTrashCan className="text-xs" /> この日を削除
        </button>
      </div>
    </header>
  );
}

function DayColumn({
  day,
  onTimeChange,
  onTimeCommit,
  onSave,
  onRemove,
  onAddManual,
  onDaySave,
  onDayDelete,
}: {
  day: BuilderDay;
  onTimeChange: (uid: string, v: string) => void;
  onTimeCommit: (uid: string, v: string) => void;
  onSave: (uid: string, patch: BlockPatch) => void;
  onRemove: (uid: string) => void;
  onAddManual: () => void;
  onDaySave: (patch: { date?: string | null; city?: string | null; title?: string | null }) => void;
  onDayDelete: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day.id) });

  return (
    <section className="day-card rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <DayHeader day={day} onSave={onDaySave} onDelete={onDayDelete} />

      <SortableContext items={day.blocks.map((b) => String(b.id))} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={`min-h-[3rem] space-y-2 rounded-xl p-1 transition-colors ${
            isOver ? "bg-cyan-50 ring-2 ring-dashed ring-cyan-300" : ""
          }`}
        >
          {day.blocks.length === 0 ? (
            <li className="flex h-16 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-xs text-slate-400">
              ここに部品をドロップ
            </li>
          ) : (
            day.blocks.map((b) => (
              <BlockCard
                key={b.id}
                block={b}
                onTimeChange={(v) => onTimeChange(b.id, v)}
                onTimeCommit={(v) => onTimeCommit(b.id, v)}
                onSave={(patch) => onSave(b.id, patch)}
                onRemove={() => onRemove(b.id)}
              />
            ))
          )}
        </ul>
      </SortableContext>

      <button
        onClick={onAddManual}
        className="no-print mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-medium text-slate-500 hover:border-cyan-300 hover:text-cyan-700"
      >
        <FaPlus className="text-[10px]" /> 自由項目を追加（食事・自由時間など）
      </button>
    </section>
  );
}

export default function ItineraryBuilder({
  days: srcDays,
  spots,
  legs,
  route,
}: {
  days: Day[];
  spots: Spot[];
  legs: LegFeature[];
  route: RoutePoint[];
}) {
  const { reload } = useTrip();
  const [days, setDays] = useState<BuilderDay[]>(() => seedDays(srcDays));
  // パレットは lg 以上でドック表示。lg 未満はオーバーレイのため初期は閉じる。
  const [paletteOpen, setPaletteOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1024
  );
  const [activeBlock, setActiveBlock] = useState<Block | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const [pendingDeleteDay, setPendingDeleteDay] = useState<BuilderDay | null>(null);
  // サーバに作成済みのブロック id（UUID）。POST 完了前の楽観的ブロックは含まれず、
  // 未作成の行への PUT/DELETE を防ぐ（旧実装の「id の符号」判定の置き換え）。
  const savedIds = useRef<Set<string>>(
    new Set(srcDays.flatMap((d) => d.items.map((it) => it.id)))
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 配置状況の索引（パレットのバッジ・フィルタ用）。
  const placed: PlacedIndex = useMemo(() => {
    const sp = new Map<string, number[]>();
    const lg = new Map<string, number[]>();
    for (const d of days)
      for (const b of d.blocks) {
        if (b.spot_id != null) sp.set(b.spot_id, [...(sp.get(b.spot_id) ?? []), d.day_no]);
        if (b.leg_id != null) lg.set(b.leg_id, [...(lg.get(b.leg_id) ?? []), d.day_no]);
      }
    return { spots: sp, legs: lg };
  }, [days]);

  // ---- 永続化ヘルパー ------------------------------------------------------
  /** 指定の日の全ブロックの (day_id, sort_order) を index どおりに保存。 */
  async function persistOrder(dayList: BuilderDay[], dayIds: string[]) {
    const jobs: Promise<unknown>[] = [];
    for (const id of new Set(dayIds)) {
      const day = dayList.find((d) => d.id === id);
      if (!day) continue;
      day.blocks.forEach((b, i) => {
        if (savedIds.current.has(b.id)) jobs.push(api.updateItem(b.id, { day_id: id, sort_order: i }));
      });
    }
    await Promise.all(jobs);
    await reload();
  }

  /** 楽観的にブロックを差し込み、POST（id はクライアント採番の UUID）→ 並び順を保存。 */
  async function addBlock(dayId: string, block: Block, index: number) {
    const inserted = days.map((d) =>
      d.id === dayId
        ? { ...d, blocks: spliceInsert(d.blocks, index, block) }
        : d
    );
    setDays(inserted);
    await api.createItem(itemBody(block, dayId, index < 0 ? 999 : index));
    savedIds.current.add(block.id);
    await persistOrder(inserted, [dayId]);
  }

  /** 既存ブロックの移動・並べ替え。 */
  async function moveBlock(activeId: string, targetDayId: string, overId: string) {
    const fromDay = days.find((d) => d.blocks.some((b) => b.id === activeId));
    const moving = fromDay?.blocks.find((b) => b.id === activeId);
    if (!fromDay || !moving) return;

    const next = days.map((d) => ({
      ...d,
      blocks: d.blocks.filter((b) => b.id !== activeId),
    }));
    const target = next.find((d) => d.id === targetDayId);
    if (!target) return;
    let idx = target.blocks.length;
    if (!overId.startsWith("day:")) {
      const oi = target.blocks.findIndex((b) => String(b.id) === overId);
      if (oi >= 0) idx = oi;
    }
    target.blocks.splice(idx, 0, moving);

    setDays(next);
    await persistOrder(next, [fromDay.id, targetDayId]);
  }

  // ---- 個別操作 ------------------------------------------------------------
  function setTimeLocal(id: string, v: string) {
    setDays((prev) =>
      prev.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, time: v } : b)) }))
    );
  }
  async function commitTime(id: string, v: string) {
    if (!savedIds.current.has(id)) return;
    await api.updateItem(id, { time: v || null });
    reload();
  }
  async function saveBlock(id: string, patch: BlockPatch) {
    setDays((prev) =>
      prev.map((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
    );
    if (!savedIds.current.has(id)) return;
    await api.updateItem(id, patch as Record<string, unknown>);
    reload();
  }
  async function removeBlock(id: string) {
    setDays((prev) => prev.map((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) })));
    if (savedIds.current.has(id)) {
      await api.deleteItem(id);
      savedIds.current.delete(id);
    }
    reload();
  }

  // ---- 日（days）の操作 ---------------------------------------------------
  async function addDay() {
    const last = days[days.length - 1];
    const dayNo = days.reduce((m, d) => Math.max(m, d.day_no), 0) + 1;
    const date = nextDate(last?.date ?? null);
    const created = (await api.createDay({ day_no: dayNo, date, city: null, title: null })) as {
      id: string;
      day_no: number;
      date: string | null;
      city: string | null;
      title: string | null;
    };
    setDays((prev) => [...prev, { ...created, blocks: [] }]);
    reload();
  }
  async function saveDay(
    dayId: string,
    patch: { date?: string | null; city?: string | null; title?: string | null }
  ) {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, ...patch } : d)));
    await api.updateDay(dayId, patch);
    reload();
  }
  async function deleteDay(dayId: string) {
    setDays((prev) => prev.filter((d) => d.id !== dayId));
    await api.deleteDay(dayId);
    reload();
  }

  // ---- DnD ハンドラ -------------------------------------------------------
  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith("palette:")) {
      const [, kind, refId] = id.split(":");
      if (kind === "spot") {
        const s = spots.find((x) => x.id === refId);
        if (s) setActiveBlock(newBlockFromSpot(s));
      } else {
        const l = legs.find((x) => x.properties.id === refId);
        if (l) setActiveBlock(newBlockFromLeg(l));
      }
      return;
    }
    for (const d of days) {
      const b = d.blocks.find((x) => String(x.id) === id);
      if (b) return setActiveBlock(b);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActiveBlock(null);
    if (!overId) return;

    const targetDayId = overId.startsWith("day:")
      ? dayIdFromKey(overId)
      : days.find((d) => d.blocks.some((b) => String(b.id) === overId))?.id;
    if (targetDayId == null) return;

    // パレットからの新規差し込み。
    if (activeId.startsWith("palette:")) {
      const [, kind, refId] = activeId.split(":");
      let block: Block | null = null;
      if (kind === "spot") {
        const s = spots.find((x) => x.id === refId);
        if (s) block = newBlockFromSpot(s);
      } else {
        const l = legs.find((x) => x.properties.id === refId);
        if (l) block = newBlockFromLeg(l);
      }
      if (!block) return;
      const target = days.find((d) => d.id === targetDayId);
      const idx = overId.startsWith("day:")
        ? -1
        : target?.blocks.findIndex((b) => String(b.id) === overId) ?? -1;
      addBlock(targetDayId, block, idx);
      return;
    }

    // 既存ブロックの並べ替え／日跨ぎ移動。
    moveBlock(activeId, targetDayId, overId);
  }

  const totalCost = days.reduce((s, d) => s + d.blocks.reduce((a, b) => a + (b.cost ?? 0), 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <FaRegCalendarDays className="text-cyan-700" /> 旅程（{days.length}日間）
          </h2>
        </div>
        <button
          onClick={() => setPaletteOpen((v) => !v)}
          className="no-print flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200"
        >
          {paletteOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          パーツ
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-4">
          {/* タイムライン */}
          <div className="min-w-0 flex-1 overflow-y-auto pr-1 print:overflow-visible">
            <p className="no-print mb-3 flex items-center gap-1.5 text-xs text-slate-400">
              <FaCircleInfo /> 右のパレットから部品をドラッグ、または「この日に追加」で差し込めます。概算合計 {yen(totalCost)}/人
            </p>
            <div className="flex flex-col gap-4 pb-8">
              {days.map((d) => (
                <DayColumn
                  key={d.id}
                  day={d}
                  onTimeChange={setTimeLocal}
                  onTimeCommit={commitTime}
                  onSave={saveBlock}
                  onRemove={(id) => {
                    const b = d.blocks.find((x) => x.id === id);
                    setPendingRemove({ id, title: b?.title ?? "" });
                  }}
                  onAddManual={() => addBlock(d.id, newBlockManual(), -1)}
                  onDaySave={(patch) => saveDay(d.id, patch)}
                  onDayDelete={() => setPendingDeleteDay(d)}
                />
              ))}
              <button
                onClick={addDay}
                className="no-print flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cyan-300 py-4 text-sm font-semibold text-cyan-700 hover:bg-cyan-50"
              >
                <FaPlus className="text-xs" /> 日を追加
              </button>
            </div>
          </div>

          {/* 右のパレット。lg 以上はドック、lg 未満はオーバーレイのドロワー。 */}
          {paletteOpen && (
            <>
              <div
                className="no-print fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
                onClick={() => setPaletteOpen(false)}
              />
              <aside className="no-print fixed bottom-0 right-0 top-14 z-40 flex w-80 max-w-[85vw] flex-col overflow-hidden bg-white shadow-xl ring-1 ring-slate-200 lg:static lg:top-0 lg:z-auto lg:max-w-none lg:shrink-0 lg:rounded-2xl lg:shadow-sm">
                <Palette
                  spots={spots}
                  legs={legs}
                  route={route}
                  days={days}
                  placed={placed}
                  onAddSpot={(s, dayId) => addBlock(dayId, newBlockFromSpot(s), -1)}
                  onAddLeg={(l, dayId) => addBlock(dayId, newBlockFromLeg(l), -1)}
                  onLegCreated={reload}
                />
              </aside>
            </>
          )}
        </div>

        <DragOverlay>
          {activeBlock && (
            <div className="flex items-center gap-2 rounded-xl border border-cyan-300 bg-white p-2.5 shadow-xl">
              <BlockBody block={activeBlock} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="旅程から外しますか？"
        message={
          pendingRemove
            ? `「${pendingRemove.title}」をこの旅程から外します。元のスポット候補・移動区間は残ります。`
            : undefined
        }
        confirmLabel="外す"
        onConfirm={() => {
          if (pendingRemove) removeBlock(pendingRemove.id);
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />

      <ConfirmDialog
        open={pendingDeleteDay !== null}
        title="この日を削除しますか？"
        message={
          pendingDeleteDay
            ? `Day${pendingDeleteDay.day_no}${
                pendingDeleteDay.title ? `「${pendingDeleteDay.title}」` : ""
              } と、この日の予定（${pendingDeleteDay.blocks.length}件）をすべて削除します。この操作は取り消せません。`
            : undefined
        }
        onConfirm={() => {
          if (pendingDeleteDay) deleteDay(pendingDeleteDay.id);
          setPendingDeleteDay(null);
        }}
        onCancel={() => setPendingDeleteDay(null)}
      />
    </div>
  );
}

/** 末尾の日の翌日（YYYY-MM-DD）。基準が無ければ null。 */
function nextDate(base: string | null): string | null {
  if (!base) return null;
  const dt = new Date(base + "T00:00:00");
  if (isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() + 1);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** index 位置に挿入（index<0 なら末尾）。 */
function spliceInsert(blocks: Block[], index: number, block: Block): Block[] {
  const next = [...blocks];
  if (index < 0 || index > next.length) next.push(block);
  else next.splice(index, 0, block);
  return next;
}
