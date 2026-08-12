// タイムライン上の 1 ブロック（= items 1 行）。並べ替え（DnD）・時刻のインライン編集・
// 詳細編集パネル（タイトル/種別/費用/リンク/メモ）・削除を持つ。
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaGripVertical, FaXmark, FaPen, FaLink, FaCompass, FaRoute, FaCheck, FaReceipt, FaPlus } from "react-icons/fa6";
import type { Block, BlockPatch } from "./builderModel";
import type { Expense, ItemType } from "../../types";
import { ITEM_META, yen } from "../../itemMeta";
import { money } from "../../lib/money";

// 編集パネルで種別を切り替えられるのは「スポット由来（spot_id あり）」のブロックのみ。
// spot/meal/hotel はいずれも spot_id を持つため相互に切り替えても CHECK 制約を満たす。
// 手入力の自由項目（spot_id/leg_id なし）は free 固定（下でピッカー自体を出さない）。
// 移動（鉄道/飛行機/バス等）は「移動タブ」の OSRM ルート作成に限定する（leg_id を伴う）。
const EDITABLE_TYPES: ItemType[] = ["spot", "meal", "hotel"];

/** 紐づく実費を通貨ごとに合計する（表示用）。 */
function sumByCurrency(expenses: Expense[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const e of expenses) m.set(e.currency, (m.get(e.currency) ?? 0) + e.amount);
  return [...m.entries()];
}

/** ドラッグ中のオーバーレイや一覧で使う、ブロックの本体表示（アイコン＋タイトル＋費用＋由来）。 */
export function BlockBody({ block, linked = [] }: { block: Block; linked?: Expense[] }) {
  const { t } = useTranslation("itinerary");
  const meta = ITEM_META[block.type] ?? ITEM_META.spot;
  const actuals = sumByCurrency(linked);
  return (
    <>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: `${meta.color}1a`, color: meta.color }}
      >
        <meta.Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-slate-800 dark:text-slate-100">{block.title}</span>
          {block.cost ? (
            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              {yen(block.cost)}
            </span>
          ) : null}
          {actuals.map(([cur, amt]) => (
            <span
              key={cur}
              className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
              title={t("block.expense.actual")}
            >
              {money(amt, cur)}
            </span>
          ))}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400 dark:text-slate-500">
          {block.spot_id != null && (
            <span className="inline-flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
              <FaCompass className="text-[9px]" /> {t("block.fromSpot")}
            </span>
          )}
          {block.leg_id != null && (
            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <FaRoute className="text-[9px]" /> {t("block.fromLeg")}
            </span>
          )}
          {block.url && (
            <a
              href={block.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-w-0 max-w-[12rem] items-center gap-1 font-medium text-cyan-700 hover:underline dark:text-cyan-400"
            >
              <FaLink className="shrink-0 text-[9px]" />
              <span className="min-w-0 flex-1 truncate">{block.url_label || t("block.link")}</span>
            </a>
          )}
        </div>
      </div>
    </>
  );
}

const fieldCls =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-cyan-500 focus:outline-none dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 dark:placeholder-slate-500";

/** この予定に紐づく実費（金額チップ＋解除）と、未紐づけ実費を選んで紐づける自前ピッカー。 */
function ExpenseLink({
  block,
  expenses,
  onLink,
  onUnlink,
}: {
  block: Block;
  expenses: Expense[];
  onLink: (expenseId: string) => void;
  onUnlink: (expenseId: string) => void;
}) {
  const { t } = useTranslation("itinerary");
  const [open, setOpen] = useState(false);
  const linked = expenses.filter((e) => e.item_id === block.id);
  const available = expenses.filter((e) => e.item_id == null);

  return (
    <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        <FaReceipt className="text-cyan-600 dark:text-cyan-400" /> {t("block.expense.label")}
      </div>

      {linked.length > 0 && (
        <ul className="mb-1.5 space-y-1">
          {linked.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1 text-xs dark:bg-emerald-500/10"
            >
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{e.title}</span>
              <span className="shrink-0 font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {money(e.amount, e.currency)}
              </span>
              <button
                type="button"
                onClick={() => onUnlink(e.id)}
                className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400"
                aria-label={t("block.expense.unlink")}
              >
                <FaXmark className="text-[10px]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {expenses.length === 0 ? (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{t("block.expense.none")}</p>
      ) : available.length === 0 ? (
        linked.length === 0 && <p className="text-[11px] text-slate-400 dark:text-slate-500">{t("block.expense.allLinked")}</p>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-cyan-300 py-1 text-[11px] font-medium text-cyan-700 hover:bg-cyan-50 dark:border-cyan-500/40 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
          >
            <FaPlus className="text-[9px]" /> {t("block.expense.add")}
          </button>
          {open && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              {available.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onLink(e.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      {e.category}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200">{e.title}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                      {money(e.amount, e.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** 詳細編集パネル（種別はアイコンボタンの自前ピッカー＝<select> は使わない）。 */
function Editor({
  block,
  expenses,
  onSave,
  onLinkExpense,
  onUnlinkExpense,
  onClose,
}: {
  block: Block;
  expenses: Expense[];
  onSave: (patch: BlockPatch) => void;
  onLinkExpense: (expenseId: string) => void;
  onUnlinkExpense: (expenseId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(["itinerary", "common"]);
  const [draft, setDraft] = useState<BlockPatch>({
    type: block.type,
    title: block.title,
    cost: block.cost,
    note: block.note,
    url: block.url,
    url_label: block.url_label,
  });

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      {/* 種別ピッカーはスポット由来（spot_id あり）のブロックのみ。
          手入力の自由項目（spot_id/leg_id なし）は free 固定、移動（leg_id あり）は種別を変えない。 */}
      {block.spot_id != null && (
        <div className="flex flex-wrap gap-1">
          {EDITABLE_TYPES.map((ty) => {
            const m = ITEM_META[ty];
            const on = draft.type === ty;
            return (
              <button
                key={ty}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, type: ty }))}
                title={t(`itemType.${ty}`)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm transition ${
                  on
                    ? "text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-700"
                }`}
                style={on ? { background: m.color } : undefined}
              >
                <m.Icon />
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${fieldCls} min-w-[8rem] flex-1`}
          value={draft.title ?? ""}
          placeholder={t("block.titlePlaceholder")}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <input
          className={`${fieldCls} w-24`}
          type="number"
          value={draft.cost ?? ""}
          placeholder={t("block.costPlaceholder")}
          onChange={(e) =>
            setDraft((d) => ({ ...d, cost: e.target.value === "" ? null : Number(e.target.value) }))
          }
        />
      </div>
      <textarea
        className={`${fieldCls} w-full`}
        rows={2}
        value={draft.note ?? ""}
        placeholder={t("block.notePlaceholder")}
        onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
      />
      <ExpenseLink block={block} expenses={expenses} onLink={onLinkExpense} onUnlink={onUnlinkExpense} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${fieldCls} min-w-[8rem] flex-1`}
          value={draft.url ?? ""}
          placeholder={t("block.urlPlaceholder")}
          onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
        />
        <input
          className={`${fieldCls} w-32`}
          value={draft.url_label ?? ""}
          placeholder={t("block.urlLabelPlaceholder")}
          onChange={(e) => setDraft((d) => ({ ...d, url_label: e.target.value }))}
        />
        <button
          type="button"
          onClick={() => {
            onSave(draft);
            onClose();
          }}
          className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-1 text-sm font-semibold text-white hover:bg-cyan-700"
        >
          <FaCheck className="text-xs" /> {t("common:actions.save")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          {t("common:actions.close")}
        </button>
      </div>
    </div>
  );
}

export default function BlockCard({
  block,
  expenses,
  onTimeChange,
  onTimeCommit,
  onSave,
  onLinkExpense,
  onUnlinkExpense,
  onRemove,
  onOpenDetail,
}: {
  block: Block;
  expenses: Expense[];
  onTimeChange: (v: string) => void;
  onTimeCommit: (v: string) => void;
  onSave: (patch: BlockPatch) => void;
  onLinkExpense: (expenseId: string) => void;
  onUnlinkExpense: (expenseId: string) => void;
  onRemove: () => void;
  // スポット由来（spot_id あり）のカード本体クリックで詳細モーダルを開く。
  // 自由項目・移動区間では undefined（開く手段を出さない）。
  onOpenDetail?: () => void;
}) {
  const { t } = useTranslation("itinerary");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(block.id),
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);
  const linked = expenses.filter((e) => e.item_id === block.id);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:ring-1 dark:ring-white/10 ${
        isDragging ? "z-10 opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="no-print cursor-grab touch-none rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-400"
          aria-label={t("block.dragReorder")}
        >
          <FaGripVertical />
        </button>
        <input
          value={block.time}
          onChange={(e) => onTimeChange(e.target.value)}
          onBlur={(e) => onTimeCommit(e.target.value)}
          placeholder={t("block.timePlaceholder")}
          className="w-14 shrink-0 rounded-md border border-slate-200 px-1.5 py-1 text-center text-xs tabular-nums focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
        />
        {onOpenDetail ? (
          // 本体（アイコン＋タイトル）をクリックで詳細モーダルを開く。中にリンク <a> を
          // 内包するため <button> ではなく role="button" の div にする（a のネスト回避）。
          <div
            role="button"
            tabIndex={0}
            onClick={onOpenDetail}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenDetail();
              }
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
            aria-label={t("block.viewDetail", { title: block.title })}
          >
            <BlockBody block={block} linked={linked} />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BlockBody block={block} linked={linked} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={`no-print shrink-0 rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 ${
            editing ? "text-cyan-700 dark:text-cyan-400" : "text-slate-300 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-300"
          }`}
          aria-label={t("block.edit")}
        >
          <FaPen className="text-xs" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="no-print shrink-0 rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          aria-label={t("block.removeAria")}
        >
          <FaXmark />
        </button>
      </div>
      {editing && (
        <div className="no-print">
          <Editor
            block={block}
            expenses={expenses}
            onSave={onSave}
            onLinkExpense={onLinkExpense}
            onUnlinkExpense={onUnlinkExpense}
            onClose={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  );
}
