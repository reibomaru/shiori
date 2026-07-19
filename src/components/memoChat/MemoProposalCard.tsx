import { useState } from "react";
import { FaPlus, FaPen, FaTrash, FaCheck, FaXmark, FaEye } from "react-icons/fa6";
import type { MemoProposal } from "../../hooks/useMemoChat";
import type { ProposalStatus } from "../../hooks/useSpotChat";
import Markdown from "../spotChat/Markdown";

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
  const [draft, setDraft] = useState<Draft>(() => toDraft(proposal));
  const [editing, setEditing] = useState(false);
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const resolved = status === "saved" || status === "dismissed";
  const isDelete = proposal.op === "delete";
  const body = toBody(draft);

  // update 時に変わったフィールドを列挙。
  const current = (proposal.current ?? {}) as Record<string, unknown>;
  const diffs =
    proposal.op === "update"
      ? [
          { key: "title", label: "タイトル", before: norm(current.title), after: norm(body.title) },
          { key: "body", label: "本文", before: norm(current.body), after: norm(body.body) },
        ].filter((f) => f.before !== f.after)
      : [];

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
          {!isDelete && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200/60"
            >
              {editing ? <><FaEye /> プレビュー</> : <><FaPen /> 編集</>}
            </button>
          )}
          {status === "saved" && <span className="text-xs font-semibold text-emerald-600">✓ 反映済み</span>}
          {status === "dismissed" && <span className="text-xs text-slate-400">破棄しました</span>}
        </div>
      </div>

      {isDelete ? (
        <p className="text-sm text-slate-700">「{proposal.current?.title}」を削除します。よろしいですか？</p>
      ) : editing ? (
        <div className="space-y-2">
          <label className="block">
            <span className="block text-[10px] font-medium text-slate-500">タイトル</span>
            <input
              value={draft.title}
              disabled={resolved}
              onChange={(e) => set("title", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-medium text-slate-500">本文（Markdown）</span>
            <textarea
              value={draft.body}
              disabled={resolved}
              rows={8}
              onChange={(e) => set("body", e.target.value)}
              className="mt-0.5 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
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
          {proposal.op === "update" && (
            <div className="text-xs">
              {diffs.length === 0 ? (
                <p className="text-slate-400">変更点はありません。</p>
              ) : (
                <ul className="space-y-1">
                  {diffs.map((d) => (
                    <li key={d.key} className="space-y-0.5">
                      <span className="font-medium text-slate-500">{d.label}:</span>
                      <div className="flex flex-wrap items-baseline gap-1">
                        <span className="text-slate-400 line-through">{shorten(d.before) || "（空）"}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-medium text-cyan-700">{shorten(d.after) || "（空）"}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
