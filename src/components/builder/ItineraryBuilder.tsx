// 旅程ビルダー。右ドックのパレットから DnD／クリックで部品（スポット候補・移動区間）を差し込み、
// タイムライン上で並べ替え・日跨ぎ移動できる。各操作は items API に永続化する（楽観的更新）。
import { useEffect, useMemo, useRef, useState } from "react";
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
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  FaPlus,
  FaCircleInfo,
  FaRegCalendarDays,
  FaPen,
  FaCheck,
  FaTrashCan,
  FaGripVertical,
} from "react-icons/fa6";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { Day, LegFeature, RoutePoint, Spot } from "../../types";
import { yen } from "../../itemMeta";
import { api, type SpotRating } from "../../api";
import { useTrip } from "../../store";
import ConfirmDialog from "../ConfirmDialog";
import SpotDetailModal from "../SpotDetailModal";
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

// ブロックのドロップ先（`day:`）と、日そのものの並べ替え対象（`dayrow:`）で id を分ける。
// どちらも同じ DndContext に載るため、prefix で判別できるよう命名を分離する。
const dayKey = (id: string) => `day:${id}`;
const dayIdFromKey = (key: string) => key.slice(4);
const DAY_ROW_PREFIX = "dayrow:";
const dayRowKey = (id: string) => `${DAY_ROW_PREFIX}${id}`;

// ---- 1 日のカード（ドロップ先＋並べ替えコンテナ） --------------------------
const dayField =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-cyan-500 focus:outline-none";

function DayHeader({
  day,
  onSave,
  onDelete,
  dragHandleProps,
}: {
  day: BuilderDay;
  onSave: (patch: { date?: string | null; city?: string | null; title?: string | null }) => void;
  onDelete: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ date: day.date, city: day.city, title: day.title });
  const dayCost = day.blocks.reduce((s, b) => s + (b.cost ?? 0), 0);

  if (!editing) {
    return (
      <header className="mb-3 flex items-start gap-2 border-b border-slate-100 pb-2.5">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            type="button"
            className="no-print mt-2 shrink-0 cursor-grab touch-none rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            aria-label="ドラッグして日を並べ替え"
          >
            <FaGripVertical />
          </button>
        )}
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
  onOpenDetail,
  onAddManual,
  onDaySave,
  onDayDelete,
}: {
  day: BuilderDay;
  onTimeChange: (uid: string, v: string) => void;
  onTimeCommit: (uid: string, v: string) => void;
  onSave: (uid: string, patch: BlockPatch) => void;
  onRemove: (uid: string) => void;
  onOpenDetail: (spotId: string) => void;
  onAddManual: () => void;
  onDaySave: (patch: { date?: string | null; city?: string | null; title?: string | null }) => void;
  onDayDelete: () => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dayKey(day.id) });
  // 日そのものの並べ替え（`dayrow:` id）。ハンドルは DayHeader のグリップに割り当てる。
  const {
    setNodeRef: setSortRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dayRowKey(day.id) });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <section
      ref={setSortRef}
      style={style}
      className={`day-card rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${
        isDragging ? "relative z-10 opacity-50" : ""
      }`}
    >
      <DayHeader
        day={day}
        onSave={onDaySave}
        onDelete={onDayDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
      />

      <SortableContext items={day.blocks.map((b) => String(b.id))} strategy={verticalListSortingStrategy}>
        <ul
          ref={setDropRef}
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
                onOpenDetail={b.spot_id != null ? () => onOpenDetail(b.spot_id!) : undefined}
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

/** 日と日の間（および先頭）に空の日を差し込むための、ホバーで現れる挿入ボタン。 */
function InsertDayRow({ onClick }: { onClick: () => void }) {
  return (
    <div className="no-print group relative flex h-4 items-center justify-center">
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-cyan-200 opacity-0 transition-opacity group-hover:opacity-100" />
      <button
        type="button"
        onClick={onClick}
        aria-label="ここに日を追加"
        className="relative flex items-center gap-1 rounded-full border border-dashed border-cyan-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-cyan-700 opacity-0 shadow-sm transition-opacity hover:bg-cyan-50 focus:opacity-100 group-hover:opacity-100"
      >
        <FaPlus className="text-[9px]" /> ここに日を追加
      </button>
    </div>
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
  const [activeDay, setActiveDay] = useState<BuilderDay | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const [pendingDeleteDay, setPendingDeleteDay] = useState<BuilderDay | null>(null);
  // スポット由来カードの詳細モーダル（一覧ページ・地図パネルと同じ SpotDetailModal を再利用）。
  const [openSpotId, setOpenSpotId] = useState<string | null>(null);
  const [pendingDeleteLeg, setPendingDeleteLeg] = useState<LegFeature | null>(null);
  // サーバに作成済みのブロック id（UUID）。POST 完了前の楽観的ブロックは含まれず、
  // 未作成の行への PUT/DELETE を防ぐ（旧実装の「id の符号」判定の置き換え）。
  const savedIds = useRef<Set<string>>(
    new Set(srcDays.flatMap((d) => d.items.map((it) => it.id)))
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Google マップの評価・写真。一覧ページ・地図と同じソース（DB に30日キャッシュ）。
  // 取得失敗時は写真・★ なしで詳細モーダルを表示する。
  const [ratings, setRatings] = useState<Record<string, SpotRating | null>>({});
  const idsKey = spots.map((s) => s.id).join(",");
  useEffect(() => {
    if (spots.length === 0) return;
    let cancelled = false;
    api
      .getSpotRatings()
      .then((r) => {
        if (!cancelled) setRatings(r.ratings ?? {});
      })
      .catch(() => {
        /* 取得失敗時は写真・★ なしで続行 */
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, spots.length]);

  // 詳細モーダルはサイドバー・右パレットを覆わず、本文（<main>）エリア内で中央寄せにする。
  // サイドバーの開閉で幅が変わるので main の位置・幅を実測して追従させる（Spots.tsx と同様）。
  const rootRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const main = rootRef.current?.closest("main");
    if (!main) return;
    const update = () => {
      const r = main.getBoundingClientRect();
      setArea({ left: r.left, width: r.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(main);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

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
  /** 各日の day_no を index どおり（1 始まり）に採番し直して保存。変わった日だけ PUT。 */
  async function persistDayOrder(dayList: BuilderDay[]) {
    const jobs: Promise<unknown>[] = [];
    dayList.forEach((d, i) => {
      if (d.day_no !== i + 1) jobs.push(api.updateDay(d.id, { day_no: i + 1 }));
    });
    await Promise.all(jobs);
    await reload();
  }

  /**
   * 日の並べ替え（from → to）。
   * 日付（date）は位置（スロット）に固定し、都市・タイトル・予定だけを入れ替える。
   * こうすることで並べ替え後も日付は昇順のまま整合する（例: Day2 を先頭へ動かすと、
   * その内容が Day1 の日付を受け継ぎ、以降の日付も繰り上がる）。day_no も採番し直す。
   */
  function reorderDays(activeDayId: string, overDayId: string) {
    const from = days.findIndex((d) => d.id === activeDayId);
    const to = days.findIndex((d) => d.id === overDayId);
    if (from < 0 || to < 0 || from === to) return;
    const slotDates = days.map((d) => d.date); // 位置ごとの日付（並べ替えても動かさない）
    const prev = new Map(days.map((d) => [d.id, d] as const));
    const next = arrayMove(days, from, to).map((d, i) => ({
      ...d,
      day_no: i + 1,
      date: slotDates[i],
    }));
    setDays(next);
    void persistDayReorder(next, prev);
  }

  /** 並べ替え後、day_no / date が変わった日だけ PUT で永続化する。 */
  async function persistDayReorder(dayList: BuilderDay[], prev: Map<string, BuilderDay>) {
    const jobs: Promise<unknown>[] = [];
    for (const d of dayList) {
      const before = prev.get(d.id);
      const patch: Record<string, unknown> = {};
      if (before?.day_no !== d.day_no) patch.day_no = d.day_no;
      if (before?.date !== d.date) patch.date = d.date;
      if (Object.keys(patch).length) jobs.push(api.updateDay(d.id, patch));
    }
    await Promise.all(jobs);
    await reload();
  }

  /** index 位置に空の日を挿入し、以降の day_no を採番し直す。 */
  async function insertDayAt(index: number) {
    const created = (await api.createDay({ day_no: index + 1, date: null, city: null, title: null })) as {
      id: string;
      day_no: number;
      date: string | null;
      city: string | null;
      title: string | null;
    };
    const next = [...days];
    next.splice(index, 0, { ...created, blocks: [] }); // created は day_no=index+1、既存日は旧 day_no
    setDays(next.map((d, i) => ({ ...d, day_no: i + 1 })));
    await persistDayOrder(next);
  }

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

  // ---- 移動区間（legs）の削除 ---------------------------------------------
  async function deleteLeg(legId: string) {
    await api.deleteLeg(legId);
    reload();
  }

  // ---- DnD ハンドラ -------------------------------------------------------
  /** ドロップ先 id（dayrow: / day: / ブロック id）から対象の日 id を解決する。 */
  function resolveDayId(overId: string): string | null {
    if (overId.startsWith(DAY_ROW_PREFIX)) return overId.slice(DAY_ROW_PREFIX.length);
    if (overId.startsWith("day:")) return dayIdFromKey(overId);
    return days.find((d) => d.blocks.some((b) => String(b.id) === overId))?.id ?? null;
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith(DAY_ROW_PREFIX)) {
      const d = days.find((x) => x.id === id.slice(DAY_ROW_PREFIX.length));
      if (d) setActiveDay(d);
      return;
    }
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
    setActiveDay(null);
    if (!overId) return;

    // 日そのものの並べ替え。
    if (activeId.startsWith(DAY_ROW_PREFIX)) {
      const overDayId = resolveDayId(overId);
      if (overDayId) reorderDays(activeId.slice(DAY_ROW_PREFIX.length), overDayId);
      return;
    }

    // ブロックのドロップ先。日カード余白（dayrow:）に落ちた場合も日として解決する。
    const targetDayId = resolveDayId(overId);
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
            <div className="flex flex-col gap-2 pb-8">
              <SortableContext
                items={days.map((d) => dayRowKey(d.id))}
                strategy={verticalListSortingStrategy}
              >
                {days.map((d, i) => (
                  <div key={d.id} className="flex flex-col gap-2">
                    {i === 0 && <InsertDayRow onClick={() => insertDayAt(0)} />}
                    <DayColumn
                      day={d}
                      onTimeChange={setTimeLocal}
                      onTimeCommit={commitTime}
                      onSave={saveBlock}
                      onRemove={(id) => {
                        const b = d.blocks.find((x) => x.id === id);
                        setPendingRemove({ id, title: b?.title ?? "" });
                      }}
                      onOpenDetail={setOpenSpotId}
                      onAddManual={() => addBlock(d.id, newBlockManual(), -1)}
                      onDaySave={(patch) => saveDay(d.id, patch)}
                      onDayDelete={() => setPendingDeleteDay(d)}
                    />
                    {i < days.length - 1 && (
                      <InsertDayRow onClick={() => insertDayAt(i + 1)} />
                    )}
                  </div>
                ))}
              </SortableContext>
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
                  onDeleteLeg={(l) => setPendingDeleteLeg(l)}
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
          {activeDay && (
            <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-cyan-300">
              <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 text-white">
                <span className="text-[9px] leading-none opacity-80">DAY</span>
                <span className="text-lg font-bold leading-none">{activeDay.day_no}</span>
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500">{fmtDate(activeDay.date)}</div>
                {activeDay.title && (
                  <div className="truncate text-base font-bold text-slate-800">{activeDay.title}</div>
                )}
              </div>
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

      <SpotDetailModal
        spots={spots}
        openId={openSpotId}
        ratings={ratings}
        reload={reload}
        onClose={() => setOpenSpotId(null)}
        area={area}
      />

      <ConfirmDialog
        open={pendingDeleteLeg !== null}
        title="この移動を削除しますか？"
        message={
          pendingDeleteLeg
            ? (() => {
                const p = pendingDeleteLeg.properties;
                const placedNos = placed.legs.get(p.id) ?? [];
                const where =
                  placedNos.length > 0
                    ? `旅程（${placedNos.map((n) => `Day${n}`).join("・")}）に配置済みの予定はそのまま残ります。`
                    : "";
                return `「${p.from ?? "?"} → ${p.to ?? "?"}」の移動区間を削除します。この操作は取り消せません。${where}`;
              })()
            : undefined
        }
        onConfirm={() => {
          if (pendingDeleteLeg) deleteLeg(pendingDeleteLeg.properties.id);
          setPendingDeleteLeg(null);
        }}
        onCancel={() => setPendingDeleteLeg(null)}
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
