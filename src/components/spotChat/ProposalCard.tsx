import { useState } from "react";
import { FaPlus, FaPen, FaTrash, FaCheck, FaXmark } from "react-icons/fa6";
import type { Proposal, ProposalStatus } from "../../hooks/useSpotChat";

const OP_META = {
  create: { label: "追加の提案", Icon: FaPlus, color: "text-emerald-700", ring: "ring-emerald-200", bg: "bg-emerald-50" },
  update: { label: "更新の提案", Icon: FaPen, color: "text-cyan-700", ring: "ring-cyan-200", bg: "bg-cyan-50" },
  delete: { label: "削除の提案", Icon: FaTrash, color: "text-rose-700", ring: "ring-rose-200", bg: "bg-rose-50" },
} as const;

/** 編集フォームで扱うフィールド（文字列で保持し、保存時に数値へ変換）。 */
type Draft = Record<string, string>;

const TEXT_FIELDS: { key: string; label: string; wide?: boolean }[] = [
  { key: "name", label: "名称" },
  { key: "name_en", label: "英語名" },
  { key: "category", label: "カテゴリ" },
  { key: "city", label: "都市" },
  { key: "country", label: "国" },
  { key: "url", label: "URL", wide: true },
  { key: "source", label: "出典", wide: true },
];

function toDraft(p: Proposal): Draft {
  const base = { ...(p.current ?? {}), ...(p.spot ?? {}) } as Record<string, unknown>;
  const d: Draft = {};
  for (const k of [...TEXT_FIELDS.map((f) => f.key), "note", "lat", "lng", "want_level"]) {
    const v = base[k];
    d[k] = v === null || v === undefined ? "" : String(v);
  }
  return d;
}

/** 文字列ドラフト → API へ送る本文。 */
function toBody(d: Draft): Record<string, unknown> {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: d.name?.trim() || "（無題）",
    name_en: d.name_en?.trim() || null,
    category: d.category?.trim() || null,
    city: d.city?.trim() || null,
    country: d.country?.trim() || null,
    url: d.url?.trim() || null,
    source: d.source?.trim() || null,
    note: d.note?.trim() || null,
    lat: num(d.lat),
    lng: num(d.lng),
    want_level: d.want_level?.trim() === "" ? 3 : Math.max(1, Math.min(5, Number(d.want_level) || 3)),
  };
}

export default function ProposalCard({
  proposal,
  status,
  busy,
  onSave,
  onDismiss,
}: {
  proposal: Proposal;
  status: ProposalStatus;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onDismiss: () => void;
}) {
  const meta = OP_META[proposal.op];
  const [draft, setDraft] = useState<Draft>(() => toDraft(proposal));
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const resolved = status === "saved" || status === "dismissed";

  return (
    <div className={`mt-2 rounded-xl ${meta.bg} p-3 ring-1 ${meta.ring}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-xs font-bold ${meta.color}`}>
          <meta.Icon className="text-xs" /> {meta.label}
          {proposal.op !== "create" && proposal.current && (
            <span className="font-normal text-slate-500">（#{proposal.id} {proposal.current.name}）</span>
          )}
        </span>
        {status === "saved" && <span className="text-xs font-semibold text-emerald-600">✓ 反映済み</span>}
        {status === "dismissed" && <span className="text-xs text-slate-400">破棄しました</span>}
      </div>

      {proposal.op === "delete" ? (
        <p className="text-sm text-slate-700">
          「{proposal.current?.name}」を候補から削除します。よろしいですか？
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {TEXT_FIELDS.map((f) => (
            <label key={f.key} className={f.wide ? "col-span-2" : ""}>
              <span className="block text-[10px] font-medium text-slate-500">{f.label}</span>
              <input
                value={draft[f.key] ?? ""}
                disabled={resolved}
                onChange={(e) => set(f.key, e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>
          ))}
          <label>
            <span className="block text-[10px] font-medium text-slate-500">緯度 (lat)</span>
            <input
              value={draft.lat ?? ""}
              disabled={resolved}
              onChange={(e) => set("lat", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
          <label>
            <span className="block text-[10px] font-medium text-slate-500">経度 (lng)</span>
            <input
              value={draft.lng ?? ""}
              disabled={resolved}
              onChange={(e) => set("lng", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
          <label>
            <span className="block text-[10px] font-medium text-slate-500">行きたい度 (1-5)</span>
            <select
              value={draft.want_level || "3"}
              disabled={resolved}
              onChange={(e) => set("want_level", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{"★".repeat(n)}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2">
            <span className="block text-[10px] font-medium text-slate-500">メモ</span>
            <textarea
              value={draft.note ?? ""}
              disabled={resolved}
              rows={2}
              onChange={(e) => set("note", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
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
            onClick={() => onSave(proposal.op === "delete" ? {} : toBody(draft))}
            disabled={busy}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-white disabled:opacity-50 ${
              proposal.op === "delete" ? "bg-rose-600 hover:bg-rose-500" : "bg-cyan-700 hover:bg-cyan-600"
            }`}
          >
            {proposal.op === "delete" ? <><FaTrash /> 削除する</> : <><FaCheck /> 保存する</>}
          </button>
        </div>
      )}
    </div>
  );
}
