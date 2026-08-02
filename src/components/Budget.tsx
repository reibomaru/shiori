import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaWallet, FaPlus } from "react-icons/fa6";
import type { BudgetItem } from "../types";
import { yen } from "../itemMeta";
import { api } from "../api";
import EditToggle from "./EditToggle";
import ConfirmDialog from "./ConfirmDialog";

function Row({ item, edit, reload }: { item: BudgetItem; edit: boolean; reload: () => void }) {
  const { t } = useTranslation("budget");
  const [draft, setDraft] = useState(item);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(item);
  const f = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 placeholder-slate-400 focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500";

  async function save() {
    await api.updateBudget(item.id, { category: draft.category, per_person: draft.per_person, note: draft.note });
    reload();
  }
  async function remove() {
    setDeleting(true);
    try {
      await api.deleteBudget(item.id);
      setConfirmOpen(false);
      reload();
    } finally {
      setDeleting(false);
    }
  }

  if (!edit) {
    return (
      <tr className="border-b border-slate-100 dark:border-slate-700">
        <td className="py-2 pr-3">
          <div className="font-medium text-slate-700 dark:text-slate-100">{item.category}</div>
          {item.note && <div className="text-xs text-slate-400 dark:text-slate-500">{item.note}</div>}
        </td>
        <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-100">{yen(item.per_person)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-slate-100 dark:border-slate-700">
      <td className="py-2 pr-2">
        <input className={`${f} w-full`} value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
        <input className={`${f} mt-1 w-full`} value={draft.note ?? ""} placeholder={t("notePlaceholder")}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </td>
      <td className="py-2 text-right">
        <input className={`${f} w-28 text-right`} type="number" value={draft.per_person}
          onChange={(e) => setDraft({ ...draft, per_person: Number(e.target.value) })} />
        <div className="mt-1 flex justify-end gap-1">
          <button onClick={save} disabled={!dirty}
            className="rounded bg-cyan-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-40">{t("common:actions.save")}</button>
          <button onClick={() => setConfirmOpen(true)} className="rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">{t("common:actions.delete")}</button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title={t("confirmDelete.title")}
          message={t("confirmDelete.message", { category: item.category })}
          busy={deleting}
          onConfirm={remove}
          onCancel={() => setConfirmOpen(false)}
        />
      </td>
    </tr>
  );
}

export default function Budget({ budget, partySize, edit, reload }: {
  budget: BudgetItem[]; partySize: number; edit: boolean; reload: () => void;
}) {
  const { t } = useTranslation("budget");
  const perPerson = budget.reduce((s, b) => s + b.per_person, 0);
  const total = perPerson * (partySize || 1);

  async function add() {
    await api.createBudget({ category: t("newItemName"), per_person: 0 });
    reload();
  }

  return (
    <div className="budget-card rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <FaWallet className="text-cyan-700 dark:text-cyan-400" /> {t("title")}
        </h2>
        <EditToggle />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <th className="pb-2">{t("col.category")}</th>
            <th className="pb-2 text-right">{t("col.perPerson")}</th>
          </tr>
        </thead>
        <tbody>
          {budget.map((b) => <Row key={b.id} item={b} edit={edit} reload={reload} />)}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 dark:border-slate-700">
            <td className="pt-3 font-bold text-slate-800 dark:text-slate-100">{t("perPersonTotal")}</td>
            <td className="pt-3 text-right text-lg font-bold tabular-nums text-cyan-700 dark:text-cyan-400">{yen(perPerson)}</td>
          </tr>
          <tr>
            <td className="pt-1 text-sm text-slate-500 dark:text-slate-400">{t("grandTotal", { count: partySize })}</td>
            <td className="pt-1 text-right text-base font-bold tabular-nums text-slate-800 dark:text-slate-100">{yen(total)}</td>
          </tr>
        </tfoot>
      </table>
      {budget.length === 0 && (
        <p className="mt-3 text-center text-sm text-slate-400 dark:text-slate-500">{t("empty")}</p>
      )}
      {edit && (
        <button onClick={add} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-300 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50 dark:border-cyan-500/40 dark:text-cyan-400 dark:hover:bg-cyan-500/10">
          <FaPlus className="text-xs" /> {t("addItem")}
        </button>
      )}
    </div>
  );
}
