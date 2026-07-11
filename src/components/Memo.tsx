import { useState } from "react";
import { FaCheck, FaPen } from "react-icons/fa6";
import { api } from "../api";
import Markdown from "./spotChat/Markdown";

/**
 * 旅全体のフリーテキストメモ（Markdown 1つ）。
 * 閲覧モードは Markdown レンダリング、編集モードは textarea。
 * 編集モードは旅程・予算とは独立した、このページ内のローカル state で持つ。
 */
export default function Memo({ memo, reload }: { memo: string | null; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(memo ?? "");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(memo ?? "");
    setEdit(true);
  };

  const cancel = () => {
    setDraft(memo ?? "");
    setEdit(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateTrip({ memo: draft });
      await reload();
      setEdit(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <FaPen className="text-cyan-700" /> メモ
        </h2>
        {!edit && (
          <button
            onClick={startEdit}
            className="no-print flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200"
          >
            <FaPen className="text-xs" /> 編集
          </button>
        )}
      </div>

      {edit ? (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="持ち物リスト、両替メモ、思いつき、リンクなどを Markdown で自由に書けます。"
            className="min-h-[24rem] w-full resize-y rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-relaxed text-slate-700 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={cancel}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
            >
              <FaCheck className="text-xs" /> {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      ) : memo && memo.trim() ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Markdown>{memo}</Markdown>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          まだメモがありません。「編集」から自由に書き込めます。
        </div>
      )}
    </div>
  );
}
