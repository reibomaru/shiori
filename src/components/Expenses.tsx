import { useMemo, useState } from "react";
import { FaReceipt, FaPlus, FaPen, FaTrash, FaLink } from "react-icons/fa6";
import type { BudgetItem, Expense } from "../types";
import { yen } from "../itemMeta";
import { money } from "../lib/money";
import { api, expenseImageUrl } from "../api";
import EditToggle from "./EditToggle";
import ConfirmDialog from "./ConfirmDialog";
import ExpenseFormDialog from "./expenses/ExpenseFormDialog";

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
    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`text-base font-bold tabular-nums ${tone ?? "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function ExpenseRow({
  e,
  edit,
  onEdit,
  onDelete,
}: {
  e: Expense;
  edit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-slate-100 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            {e.category}
          </span>
          <span className="font-medium text-slate-800">{e.title}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              e.paid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {e.paid ? "支払済" : "未払い"}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
          {e.vendor && <span>{e.vendor}</span>}
          {e.incurred_on && <span className="tabular-nums">{e.incurred_on}</span>}
          {e.source_url && (
            <a
              href={e.source_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-cyan-600 hover:underline"
            >
              <FaLink className="text-[10px]" /> リンク
            </a>
          )}
        </div>
        {e.note && <p className="mt-0.5 text-xs text-slate-500">{e.note}</p>}
        {e.images.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {e.images.map((im) => (
              <a key={im.id} href={expenseImageUrl(im.id, im.updated_at)} target="_blank" rel="noreferrer">
                <img
                  src={expenseImageUrl(im.id, im.updated_at)}
                  alt="領収書"
                  className="h-12 w-12 rounded-md object-cover ring-1 ring-slate-200 transition hover:ring-cyan-400"
                />
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="whitespace-nowrap font-semibold tabular-nums text-slate-800">{money(e.amount, e.currency)}</span>
        {edit && (
          <div className="no-print flex gap-1">
            <button onClick={onEdit} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="編集">
              <FaPen className="text-xs" />
            </button>
            <button onClick={onDelete} className="rounded p-1 text-rose-500 hover:bg-rose-50" title="削除">
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
  budget,
  partySize,
  edit,
  reload,
}: {
  expenses: Expense[];
  budget: BudgetItem[];
  partySize: number;
  edit: boolean;
  reload: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const byCurrency = useMemo(() => aggregate(expenses), [expenses]);
  const budgetTotalJpy = budget.reduce((s, b) => s + b.per_person, 0) * (partySize || 1);
  const actualJpy = byCurrency.get("JPY")?.total ?? 0;
  const diffJpy = actualJpy - budgetTotalJpy;
  const otherCurrencies = [...byCurrency.keys()].filter((c) => c !== "JPY");

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
      filter === f ? "bg-cyan-600 text-white" : "text-slate-500 hover:bg-slate-100"
    }`;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <FaReceipt className="text-cyan-700" /> 実費（請求）
        </h2>
        <EditToggle />
      </div>

      {/* 集計サマリー */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...byCurrency.entries()].map(([cur, agg]) => (
          <Card key={cur} label={`${cur} 合計`} value={money(agg.total, cur)} />
        ))}
        {expenses.length === 0 && <Card label="実費合計" value="—" />}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...byCurrency.entries()].map(([cur, agg]) => (
          <Card key={cur} label={`${cur} 未払い`} value={money(agg.unpaid, cur)} tone={agg.unpaid > 0 ? "text-amber-600" : "text-slate-400"} />
        ))}
      </div>

      {/* 予算比（円のみ。budget は 1人あたり概算×人数） */}
      <div className="mb-4 rounded-xl bg-cyan-50/60 px-4 py-3 ring-1 ring-cyan-100">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[11px] font-medium text-slate-500">予算（概算）</div>
            <div className="text-sm font-bold tabular-nums text-slate-700">{yen(budgetTotalJpy)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">実費（円）</div>
            <div className="text-sm font-bold tabular-nums text-slate-700">{yen(actualJpy)}</div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">差分</div>
            <div className={`text-sm font-bold tabular-nums ${diffJpy > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {diffJpy > 0 ? "+" : ""}
              {yen(diffJpy)}
            </div>
          </div>
        </div>
        {otherCurrencies.length > 0 && (
          <p className="mt-2 text-center text-[11px] text-slate-400">
            ※ {otherCurrencies.join(" / ")} 建ての実費は円の予算比には含めていません
          </p>
        )}
      </div>

      {/* フィルタ + 追加 */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="no-print flex gap-1">
          <button onClick={() => setFilter("all")} className={tab("all")}>すべて</button>
          <button onClick={() => setFilter("unpaid")} className={tab("unpaid")}>未払い</button>
          <button onClick={() => setFilter("paid")} className={tab("paid")}>支払済</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400">
          {expenses.length === 0 ? "まだ実費がありません。領収書のスクショから追加できます。" : "該当する実費はありません。"}
        </div>
      ) : (
        <ul>
          {shown.map((e) => (
            <ExpenseRow
              key={e.id}
              e={e}
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
          className="no-print mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-300 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50"
        >
          <FaPlus className="text-xs" /> 実費を追加（領収書から取り込み可）
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
        title="実費を削除しますか？"
        message={deleteTarget ? `「${deleteTarget.title}」を実費から削除します。この操作は取り消せません。` : undefined}
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
