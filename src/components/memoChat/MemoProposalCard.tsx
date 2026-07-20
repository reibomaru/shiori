import { useState } from "react";
import { FaPlus, FaPen, FaTrash, FaCheck, FaXmark } from "react-icons/fa6";
import type { MemoProposal } from "../../hooks/useMemoChat";
import type { ProposalStatus } from "../../hooks/useSpotChat";
import Markdown from "../spotChat/Markdown";
import DiffView from "../memo/DiffView";

const OP_META = {
  create: { label: "作成の提案", Icon: FaPlus, color: "text-emerald-700", ring: "ring-emerald-200", bg: "bg-emerald-50" },
  update: { label: "編集の提案", Icon: FaPen, color: "text-cyan-700", ring: "ring-cyan-200", bg: "bg-cyan-50" },
  delete: { label: "削除の提案", Icon: FaTrash, color: "text-rose-700", ring: "ring-rose-200", bg: "bg-rose-50" },
} as const;

interface Draft {
  title: string;
  body: string;
}

function toDraft(p: MemoProposal): Draft {
  const base = { ...(p.current ?? {}), ...(p.page ?? {}) } as Record<string, unknown>;
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return { title: s(base.title), body: s(base.body) };
}

/** 文字列ドラフト → メモ更新 API へ送る本文。 */
function toBody(d: Draft): Record<string, unknown> {
  return {
    title: d.title.trim() || "無題のメモ",
    body: d.body.trim() ? d.body : null,
  };
}

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v));
function shorten(s: string, n = 160): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export default function MemoProposalCard({
  proposal,
  status,
  busy,
  onSave,
  onDismiss,
}: {
  proposal: MemoProposal;
  status: ProposalStatus;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onDismiss: () => void;
}) {
  const meta = OP_META[proposal.op];
  const draft = toDraft(proposal);
  // update 提案の閲覧モード。既定はプレビュー（反映後の見た目）。差分に切り替えられる。
  const [viewMode, setViewMode] = useState<"diff" | "preview">("preview");

  const resolved = status === "saved" || status === "dismissed";
  const isDelete = proposal.op === "delete";
  const body = toBody(draft);

  // update 時に変わったフィールドを判定。
  const current = (proposal.current ?? {}) as Record<string, unknown>;
  const titleBefore = norm(current.title);
  const titleAfter = norm(body.title);
  const titleChanged = proposal.op === "update" && titleBefore !== titleAfter;
  const bodyChanged = proposal.op === "update" && norm(current.body) !== norm(body.body);

  return (
    <div className={`mt-2 rounded-xl ${meta.bg} p-3 ring-1 ${meta.ring}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-xs font-bold ${meta.color}`}>
          <meta.Icon className="text-xs" /> {meta.label}
          {proposal.op !== "create" && proposal.current && (
            <span className="font-normal text-slate-500">（{proposal.current.title}）</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {/* update の閲覧モード切り替え（プレビュー / 差分）。 */}
          {proposal.op === "update" && (
            <div className="flex overflow-hidden rounded-md ring-1 ring-slate-200">
              {(["preview", "diff"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2 py-0.5 text-[11px] font-medium transition ${
                    viewMode === mode ? "bg-cyan-700 text-white" : "bg-white text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {mode === "diff" ? "差分" : "プレビュー"}
                </button>
              ))}
            </div>
          )}
          {status === "saved" && <span className="text-xs font-semibold text-emerald-600">✓ 反映済み</span>}
          {status === "dismissed" && <span className="text-xs text-slate-400">破棄しました</span>}
        </div>
      </div>

      {isDelete ? (
        <p className="text-sm text-slate-700">「{proposal.current?.title}」を削除します。よろしいですか？</p>
      ) : proposal.op === "update" && viewMode === "diff" ? (
        <div className="space-y-2">
          {/* タイトルは 1 行なのでインラインの before → after で示す。 */}
          {titleChanged && (
            <div className="flex flex-wrap items-baseline gap-1 text-xs">
              <span className="font-medium text-slate-500">タイトル:</span>
              <span className="text-slate-400 line-through">{shorten(titleBefore) || "（空）"}</span>
              <span className="text-slate-400">→</span>
              <span className="font-medium text-cyan-700">{shorten(titleAfter) || "（空）"}</span>
            </div>
          )}
          {/* 本文は git 風の行単位 diff。 */}
          {bodyChanged ? (
            <DiffView before={norm(current.body)} after={norm(body.body)} />
          ) : (
            !titleChanged && <p className="text-xs text-slate-400">変更点はありません。</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* 保存後の見た目に近いプレビュー。 */}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="mb-1 text-sm font-bold text-slate-800">{body.title as string}</p>
            {draft.body.trim() ? (
              <Markdown>{draft.body}</Markdown>
            ) : (
              <p className="text-xs text-slate-400">（本文なし）</p>
            )}
          </div>
        </div>
      )}

      {!resolved && (
        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onDismiss}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200/60 disabled:opacity-50"
          >
            <FaXmark /> 破棄
          </button>
          <button
            onClick={() => onSave(isDelete ? {} : toBody(draft))}
            disabled={busy}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-white disabled:opacity-50 ${
              isDelete ? "bg-rose-600 hover:bg-rose-500" : "bg-cyan-700 hover:bg-cyan-600"
            }`}
          >
            {isDelete ? <><FaTrash /> 削除する</> : <><FaCheck /> 保存する</>}
          </button>
        </div>
      )}
    </div>
  );
}
