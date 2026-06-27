import { useState } from "react";
import { FaLink, FaPlus } from "react-icons/fa6";
import type { Day, Item, ItemType } from "../types";
import { ITEM_META, ITEM_TYPES, yen } from "../itemMeta";
import { api } from "../api";
import ConfirmDialog from "./ConfirmDialog";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function fmtDate(d: string | null) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return `${dt.getMonth() + 1}/${dt.getDate()}（${WD[dt.getDay()]}）`;
}

// ---- 1件の予定（表示＋編集） -------------------------------
function ItemRow({ item, edit, reload }: { item: Item; edit: boolean; reload: () => void }) {
  const [draft, setDraft] = useState<Item>(item);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const meta = ITEM_META[draft.type] ?? ITEM_META.spot;
  const dirty = JSON.stringify(draft) !== JSON.stringify(item);

  async function save() {
    setSaving(true);
    try {
      await api.updateItem(item.id, {
        time: draft.time, type: draft.type, title: draft.title,
        note: draft.note, url: draft.url, url_label: draft.url_label, cost: draft.cost,
      });
      reload();
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setDeleting(true);
    try {
      await api.deleteItem(item.id);
      setConfirmOpen(false);
      reload();
    } finally {
      setDeleting(false);
    }
  }

  if (!edit) {
    return (
      <li className="flex gap-3 py-2.5">
        <div className="w-12 shrink-0 pt-0.5 text-right text-sm font-semibold tabular-nums text-slate-500">
          {draft.time}
        </div>
        <div
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: meta.color }}
          title={meta.label}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-800">
            <meta.Icon className="mr-1.5 inline -translate-y-px" style={{ color: meta.color }} />
            {draft.title}
            {draft.cost ? (
              <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                {yen(draft.cost)}
              </span>
            ) : null}
          </div>
          {draft.note && <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{draft.note}</p>}
          {draft.url && (
            <a
              href={draft.url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-cyan-700 hover:underline"
            >
              <FaLink className="text-xs" /> {draft.url_label || "リンク"}
            </a>
          )}
        </div>
      </li>
    );
  }

  // 編集モード
  const f = "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-cyan-500 focus:outline-none";
  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${f} w-20`} value={draft.time ?? ""} placeholder="時刻"
          onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
        <select className={f} value={draft.type}
          onChange={(e) => setDraft({ ...draft, type: e.target.value as ItemType })}>
          {ITEM_TYPES.map((t) => <option key={t} value={t}>{ITEM_META[t].label}</option>)}
        </select>
        <input className={`${f} min-w-[12rem] flex-1`} value={draft.title}
          placeholder="タイトル" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input className={`${f} w-24`} type="number" value={draft.cost ?? ""} placeholder="費用¥"
          onChange={(e) => setDraft({ ...draft, cost: e.target.value === "" ? null : Number(e.target.value) })} />
      </div>
      <textarea className={`${f} mt-2 w-full`} rows={2} value={draft.note ?? ""} placeholder="メモ・見どころ"
        onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className={`${f} min-w-[14rem] flex-1`} value={draft.url ?? ""} placeholder="https://… 保存したいリンク"
          onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
        <input className={`${f} w-32`} value={draft.url_label ?? ""} placeholder="リンク表示名"
          onChange={(e) => setDraft({ ...draft, url_label: e.target.value })} />
        <button onClick={save} disabled={!dirty || saving}
          className="rounded-md bg-cyan-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? "保存中…" : dirty ? "保存" : "保存済"}
        </button>
        <button onClick={() => setConfirmOpen(true)} className="rounded-md px-2 py-1 text-sm text-rose-600 hover:bg-rose-50">削除</button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="予定を削除しますか？"
        message={`「${item.title}」を旅程から削除します。この操作は取り消せません。`}
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmOpen(false)}
      />
    </li>
  );
}

// ---- 1日のカード ------------------------------------------
function DayCard({ day, edit, reload }: { day: Day; edit: boolean; reload: () => void }) {
  const dayCost = day.items.reduce((s, it) => s + (it.cost ?? 0), 0);

  async function addItem() {
    await api.createItem({ day_id: day.id, type: "spot", title: "新しい予定", time: "" });
    reload();
  }

  return (
    <section className="day-card scroll-mt-20 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200" id={`day-${day.day_no}`}>
      <header className="mb-2 flex items-baseline gap-3 border-b border-slate-100 pb-3">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-blue-600 text-white">
          <span className="text-[10px] leading-none opacity-80">DAY</span>
          <span className="text-xl font-bold leading-none">{day.day_no}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{fmtDate(day.date)}</span>
            {day.city && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{day.city}</span>}
            {dayCost > 0 && <span className="text-xs text-amber-600">概算 {yen(dayCost)}/人</span>}
          </div>
          <h3 className="mt-0.5 truncate text-lg font-bold text-slate-800">{day.title}</h3>
        </div>
      </header>
      <ul className="divide-y divide-slate-100">
        {day.items.map((it) => <ItemRow key={it.id} item={it} edit={edit} reload={reload} />)}
      </ul>
      {edit && (
        <button onClick={addItem} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-300 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50">
          <FaPlus className="text-xs" /> この日に予定を追加
        </button>
      )}
    </section>
  );
}

export default function Itinerary({ days, edit, reload }: { days: Day[]; edit: boolean; reload: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      {days.map((d) => <DayCard key={d.id} day={d} edit={edit} reload={reload} />)}
    </div>
  );
}
