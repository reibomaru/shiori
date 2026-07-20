import { useState } from "react";
import { FaWallet, FaReceipt } from "react-icons/fa6";
import { useTrip } from "../store";
import Budget from "../components/Budget";
import Expenses from "../components/Expenses";

type Tab = "budget" | "expenses";

export default function BudgetPage() {
  const { data, edit, reload } = useTrip();
  const [tab, setTab] = useState<Tab>("budget");
  if (!data) return null;

  const tabCls = (t: Tab) =>
    `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      tab === t ? "bg-cyan-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
    }`;

  return (
    <div className="space-y-4">
      {/* 概算（budget）と実費（expenses）の切り替え。 */}
      <div className="no-print flex gap-2">
        <button onClick={() => setTab("budget")} className={tabCls("budget")}>
          <FaWallet className="text-xs" /> 予算（概算）
        </button>
        <button onClick={() => setTab("expenses")} className={tabCls("expenses")}>
          <FaReceipt className="text-xs" /> 実費（請求）
        </button>
      </div>

      {tab === "budget" ? (
        <Budget budget={data.budget} partySize={data.trip?.party_size || 2} edit={edit} reload={reload} />
      ) : (
        <Expenses
          expenses={data.expenses}
          budget={data.budget}
          partySize={data.trip?.party_size || 2}
          edit={edit}
          reload={reload}
        />
      )}
    </div>
  );
}
