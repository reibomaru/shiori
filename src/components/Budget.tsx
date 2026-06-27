import { useState } from "react";
import { FaWallet, FaPlus } from "react-icons/fa6";
import type { BudgetItem } from "../types";
import { yen } from "../itemMeta";
import { api } from "../api";
import EditToggle from "./EditToggle";
import ConfirmDialog from "./ConfirmDialog";

function Row({ item, edit, reload }: { item: BudgetItem; edit: boolean; reload: () => void }) {
  const [draft, setDraft] = useState(item);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(item);
  const f = "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-cyan-500 focus:outline-none";

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
      <tr className="border-b border-slate-100">
        <td className="py-2 pr-3">
          <div className="font-medium text-slate-700">{item.category}</div>
          {item.note && <div className="text-xs text-slate-400">{item.note}</div>}
        </td>
        <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums text-slate-700">{yen(item.per_person)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2 pr-2">
        <input className={`${f} w-full`} value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
        <input className={`${f} mt-1 w-full`} value={draft.note ?? ""} placeholder="メモ"
          onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </td>
      <td className="py-2 text-right">
        <input className={`${f} w-28 text-right`} type="number" value={draft.per_person}
          onChange={(e) => setDraft({ ...draft, per_person: Number(e.target.value) })} />
        <div className="mt-1 flex justify-end gap-1">
          <button onClick={save} disabled={!dirty}
            className="rounded bg-cyan-600 px-2 py-0.5 text-xs font-semibold text-white disabled:opacity-40">保存</button>
          <button onClick={() => setConfirmOpen(true)} className="rounded px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50">削除</button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title="費目を削除しますか？"
          message={`「${item.category}」を予算から削除します。この操作は取り消せません。`}
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
  const perPerson = budget.reduce((s, b) => s + b.per_person, 0);
  const total = perPerson * (partySize || 1);

  async function add() {
    await api.createBudget({ category: "新しい費目", per_person: 0 });
    reload();
  }

  return (
    <div className="budget-card rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <FaWallet className="text-cyan-700" /> 予算計画（1人あたり）
        </h2>
        <EditToggle />
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 text-left text-xs text-slate-500">
            <th className="pb-2">費目</th>
            <th className="pb-2 text-right">1人あたり</th>
          </tr>
        </thead>
        <tbody>
          {budget.map((b) => <Row key={b.id} item={b} edit={edit} reload={reload} />)}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300">
            <td className="pt-3 font-bold text-slate-800">1人あたり合計</td>
            <td className="pt-3 text-right text-lg font-bold tabular-nums text-cyan-700">{yen(perPerson)}</td>
          </tr>
          <tr>
            <td className="pt-1 text-sm text-slate-500">{partySize}名 総額</td>
            <td className="pt-1 text-right text-base font-bold tabular-nums text-slate-800">{yen(total)}</td>
          </tr>
        </tfoot>
      </table>
      {edit && (
        <button onClick={add} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-300 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-50">
          <FaPlus className="text-xs" /> 費目を追加
        </button>
      )}
    </div>
  );
}
