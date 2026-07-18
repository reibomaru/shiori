// タイムライン上の 1 ブロック（= items 1 行）。並べ替え（DnD）・時刻のインライン編集・
// 詳細編集パネル（タイトル/種別/費用/リンク/メモ）・削除を持つ。
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FaGripVertical, FaXmark, FaPen, FaLink, FaCompass, FaRoute, FaCheck } from "react-icons/fa6";
import type { Block, BlockPatch } from "./builderModel";
import type { ItemType } from "../../types";
import { ITEM_META, yen } from "../../itemMeta";

// 編集パネルで種別を切り替えられるのは「スポット由来（spot_id あり）」のブロックのみ。
// spot/meal/hotel はいずれも spot_id を持つため相互に切り替えても CHECK 制約を満たす。
// 手入力の自由項目（spot_id/leg_id なし）は free 固定（下でピッカー自体を出さない）。
// 移動（鉄道/飛行機/バス等）は「移動タブ」の OSRM ルート作成に限定する（leg_id を伴う）。
const EDITABLE_TYPES: ItemType[] = ["spot", "meal", "hotel"];

/** ドラッグ中のオーバーレイや一覧で使う、ブロックの本体表示（アイコン＋タイトル＋費用＋由来）。 */
export function BlockBody({ block }: { block: Block }) {
  const meta = ITEM_META[block.type] ?? ITEM_META.spot;
  return (
    <>
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
        style={{ background: `${meta.color}1a`, color: meta.color }}
      >
        <meta.Icon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-slate-800">{block.title}</span>
          {block.cost ? (
            <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {yen(block.cost)}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
          {block.spot_id != null && (
            <span className="inline-flex items-center gap-1 text-cyan-600">
              <FaCompass className="text-[9px]" /> スポット候補より
            </span>
          )}
          {block.leg_id != null && (
            <span className="inline-flex items-center gap-1 text-blue-600">
              <FaRoute className="text-[9px]" /> 移動区間より
            </span>
          )}
          {block.url && (
            <a
              href={block.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex min-w-0 max-w-[12rem] items-center gap-1 font-medium text-cyan-700 hover:underline"
            >
              <FaLink className="shrink-0 text-[9px]" />
              <span className="min-w-0 flex-1 truncate">{block.url_label || "リンク"}</span>
            </a>
          )}
        </div>
      </div>
    </>
  );
}

const fieldCls =
  "rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-cyan-500 focus:outline-none";

/** 詳細編集パネル（種別はアイコンボタンの自前ピッカー＝<select> は使わない）。 */
function Editor({
  block,
  onSave,
  onClose,
}: {
  block: Block;
  onSave: (patch: BlockPatch) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BlockPatch>({
    type: block.type,
    title: block.title,
    cost: block.cost,
    note: block.note,
    url: block.url,
    url_label: block.url_label,
  });

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
      {/* 種別ピッカーはスポット由来（spot_id あり）のブロックのみ。
          手入力の自由項目（spot_id/leg_id なし）は free 固定、移動（leg_id あり）は種別を変えない。 */}
      {block.spot_id != null && (
        <div className="flex flex-wrap gap-1">
          {EDITABLE_TYPES.map((t) => {
            const m = ITEM_META[t];
            const on = draft.type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, type: t }))}
                title={m.label}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm transition ${
                  on ? "text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
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
          placeholder="タイトル"
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <input
          className={`${fieldCls} w-24`}
          type="number"
          value={draft.cost ?? ""}
          placeholder="費用¥"
          onChange={(e) =>
            setDraft((d) => ({ ...d, cost: e.target.value === "" ? null : Number(e.target.value) }))
          }
        />
      </div>
      <textarea
        className={`${fieldCls} w-full`}
        rows={2}
        value={draft.note ?? ""}
        placeholder="メモ・見どころ"
        onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${fieldCls} min-w-[8rem] flex-1`}
          value={draft.url ?? ""}
          placeholder="https://… 保存したいリンク"
          onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
        />
        <input
          className={`${fieldCls} w-32`}
          value={draft.url_label ?? ""}
          placeholder="リンク表示名"
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
          <FaCheck className="text-xs" /> 保存
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-200"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

export default function BlockCard({
  block,
  onTimeChange,
  onTimeCommit,
  onSave,
  onRemove,
  onOpenDetail,
}: {
  block: Block;
  onTimeChange: (v: string) => void;
  onTimeCommit: (v: string) => void;
  onSave: (patch: BlockPatch) => void;
  onRemove: () => void;
  // スポット由来（spot_id あり）のカード本体クリックで詳細モーダルを開く。
  // 自由項目・移動区間では undefined（開く手段を出さない）。
  onOpenDetail?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(block.id),
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const [editing, setEditing] = useState(false);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm ${
        isDragging ? "z-10 opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="no-print cursor-grab touch-none rounded p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
          aria-label="ドラッグして並べ替え"
        >
          <FaGripVertical />
        </button>
        <input
          value={block.time}
          onChange={(e) => onTimeChange(e.target.value)}
          onBlur={(e) => onTimeCommit(e.target.value)}
          placeholder="時刻"
          className="w-14 shrink-0 rounded-md border border-slate-200 px-1.5 py-1 text-center text-xs tabular-nums focus:border-cyan-500 focus:outline-none"
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
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg text-left transition-colors hover:bg-slate-50"
            aria-label={`${block.title} の詳細を見る`}
          >
            <BlockBody block={block} />
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BlockBody block={block} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className={`no-print shrink-0 rounded p-1.5 hover:bg-slate-100 ${
            editing ? "text-cyan-700" : "text-slate-300 hover:text-slate-600"
          }`}
          aria-label="この予定を編集"
        >
          <FaPen className="text-xs" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="no-print shrink-0 rounded p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
          aria-label="旅程から外す"
        >
          <FaXmark />
        </button>
      </div>
      {editing && (
        <div className="no-print">
          <Editor block={block} onSave={onSave} onClose={() => setEditing(false)} />
        </div>
      )}
    </li>
  );
}
