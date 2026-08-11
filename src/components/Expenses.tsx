import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaReceipt, FaPlus, FaPen, FaTrash, FaLink, FaFilePdf } from "react-icons/fa6";
import type { Expense, ItemType } from "../types";
import { money } from "../lib/money";
import { ITEM_META } from "../itemMeta";
import { api, expenseImageUrl } from "../api";
import { useTrip } from "../store";
import EditToggle from "./EditToggle";
import ConfirmDialog from "./ConfirmDialog";
import ExpenseFormDialog from "./expenses/ExpenseFormDialog";

/** 実費に紐づく旅程の予定（表示用の最小情報）。 */
interface LinkedItem {
  dayNo: number;
  title: string;
  type: ItemType;
}

/** 紐づく旅程予定を示すチップ（種別アイコン＋Day 番号＋予定名）。 */
function ItemChip({ item }: { item: LinkedItem }) {
  const { t } = useTranslation("budget");
  const meta = ITEM_META[item.type] ?? ITEM_META.spot;
  return (
    <span
      className="inline-flex max-w-[16rem] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${meta.color}1a`, color: meta.color }}
      title={t("row.linkedItem", { day: item.dayNo, title: item.title })}
    >
      <meta.Icon className="shrink-0 text-[9px]" />
      <span className="shrink-0">{t("row.dayLabel", { day: item.dayNo })}</span>
      <span className="min-w-0 truncate">{item.title}</span>
    </span>
  );
}

type Filter = "all" | "paid" | "unpaid";

/** 通貨ごとの実費集計（合計・支払済・未払い）。 */
function aggregate(expenses: Expense[]) {
  const byCurrency = new Map<string, { total: number; paid: number; unpaid: number }>();
  for (const e of expenses) {
    const cur = byCurrency.get(e.currency) ?? { total: 0, paid: 0, unpaid: 0 };
    cur.total += e.amount;
    if (e.paid) cur.paid += e.amount;
    else cur.unpaid += e.amount;
    byCurrency.set(e.currency, cur);
  }
  return byCurrency;
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-700">
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-base font-bold tabular-nums ${tone ?? "text-slate-800 dark:text-slate-100"}`}>{value}</div>
    </div>
  );
}

function ExpenseRow({
  e,
  item,
  edit,
  onEdit,
  onDelete,
}: {
  e: Expense;
  item?: LinkedItem;
  edit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("budget");
  return (
    <li className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-slate-700">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            {e.category}
          </span>
          <span className="font-medium text-slate-800 dark:text-slate-100">{e.title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              e.paid
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
            }`}
          >
            {e.paid ? t("status.paid") : t("status.unpaid")}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
          {e.vendor && <span>{e.vendor}</span>}
          {e.incurred_on && <span className="tabular-nums">{e.incurred_on}</span>}
          {e.source_url && (
            <a
              href={e.source_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-cyan-600 hover:underline dark:text-cyan-400"
            >
              <FaLink className="text-[10px]" /> {t("row.link")}
            </a>
          )}
          {item && <ItemChip item={item} />}
        </div>
        {e.note && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{e.note}</p>}
        {e.images.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {e.images.map((im) => (
              <a key={im.id} href={expenseImageUrl(im.id, im.updated_at)} target="_blank" rel="noreferrer">
                {im.mime_type === "application/pdf" ? (
                  <span className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md bg-white text-rose-500 ring-1 ring-slate-200 transition hover:ring-cyan-400 dark:bg-slate-800 dark:ring-slate-700">
                    <FaFilePdf className="text-base" />
                    <span className="text-[8px] font-semibold text-slate-500 dark:text-slate-400">PDF</span>
                  </span>
                ) : (
                  <img
                    src={expenseImageUrl(im.id, im.updated_at)}
                    alt={t("row.receiptAlt")}
                    className="h-12 w-12 rounded-md object-cover ring-1 ring-slate-200 transition hover:ring-cyan-400 dark:ring-slate-700"
                  />
                )}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="whitespace-nowrap font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {money(e.amount, e.currency)}
        </span>
        {edit && (
          <div className="no-print flex gap-1">
            <button
              onClick={onEdit}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title={t("row.edit")}
            >
              <FaPen className="text-xs" />
            </button>
            <button
              onClick={onDelete}
              className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
              title={t("row.delete")}
            >
              <FaTrash className="text-xs" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * 実費（確定した予約・領収書）の一覧・集計。budget（概算）とは別レイヤー。
 * 追加・編集・削除は編集モード（EditToggle）でのみ操作できる（予算ページの規約に合わせる）。
 */
export default function Expenses({
  expenses,
  edit,
  reload,
}: {
  expenses: Expense[];
  edit: boolean;
  reload: () => void;
}) {
  const { t } = useTranslation("budget");
  const { data } = useTrip();
  const [filter, setFilter] = useState<Filter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const byCurrency = useMemo(() => aggregate(expenses), [expenses]);

  // item_id → 紐づく旅程予定（Day 番号・タイトル・種別）の索引。
  const itemIndex = useMemo(() => {
    const m = new Map<string, LinkedItem>();
    for (const d of data?.days ?? [])
      for (const it of d.items) m.set(it.id, { dayNo: d.day_no, title: it.title, type: it.type });
    return m;
  }, [data?.days]);

  const shown = expenses.filter((e) => (filter === "paid" ? e.paid : filter === "unpaid" ? !e.paid : true));

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(e: Expense) {
    setEditing(e);
    setFormOpen(true);
  }
  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteExpense(deleteTarget.id);
      setDeleteTarget(null);
      reload();
    } finally {
      setDeleting(false);
    }
  }

  const tab = (f: Filter) =>
    `rounded-lg px-3 py-1 text-sm font-medium transition ${
      filter === f
        ? "bg-cyan-600 text-white"
        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
    }`;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-white/10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <FaReceipt className="text-cyan-700 dark:text-cyan-400" /> {t("title")}
        </h2>
        <EditToggle />
      </div>

      {/* 集計サマリー */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...byCurrency.entries()].map(([cur, agg]) => (
          <Card key={cur} label={t("summary.total", { currency: cur })} value={money(agg.total, cur)} />
        ))}
        {expenses.length === 0 && <Card label={t("summary.emptyLabel")} value="—" />}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...byCurrency.entries()].map(([cur, agg]) => (
          <Card
            key={cur}
            label={t("summary.unpaid", { currency: cur })}
            value={money(agg.unpaid, cur)}
            tone={agg.unpaid > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}
          />
        ))}
      </div>

      {/* フィルタ */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="no-print flex gap-1">
          <button onClick={() => setFilter("all")} className={tab("all")}>{t("filter.all")}</button>
          <button onClick={() => setFilter("unpaid")} className={tab("unpaid")}>{t("filter.unpaid")}</button>
          <button onClick={() => setFilter("paid")} className={tab("paid")}>{t("filter.paid")}</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400 dark:border-slate-600 dark:text-slate-500">
          {expenses.length === 0 ? t("empty.none") : t("empty.filtered")}
        </div>
      ) : (
        <ul>
          {shown.map((e) => (
            <ExpenseRow
              key={e.id}
              e={e}
              item={e.item_id ? itemIndex.get(e.item_id) : undefined}
              edit={edit}
              onEdit={() => openEdit(e)}
              onDelete={() => setDeleteTarget(e)}
            />
          ))}
        </ul>
      )}

      {edit && (
        <button
          onClick={openAdd}
          className="no-print mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-300 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50 dark:border-cyan-500/40 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
        >
          <FaPlus className="text-xs" /> {t("addButton")}
        </button>
      )}

      <ExpenseFormDialog
        open={formOpen}
        expense={editing}
        onClose={() => setFormOpen(false)}
        onSaved={reload}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("delete.title")}
        message={deleteTarget ? t("delete.message", { title: deleteTarget.title }) : undefined}
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
