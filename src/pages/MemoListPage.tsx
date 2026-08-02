import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FaChevronRight, FaPlus, FaRegNoteSticky, FaTrash } from "react-icons/fa6";
import { useMemoPages } from "../hooks/useMemoPages";
import ConfirmDialog from "../components/ConfirmDialog";

/** "YYYY-MM-DD HH:MM:SS"（UTC）から日付部分だけを取り出す。 */
function fmtDate(s: string): string {
  return (s || "").slice(0, 10);
}

/** メモの一覧ページ。ページの作成・削除と、詳細（/memo/:id）への遷移を行う。 */
export default function MemoListPage() {
  const { pages, loading, error, create, remove } = useMemoPages();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const base = `/projects/${projectId}`;
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const onCreate = async () => {
    setCreating(true);
    try {
      const p = await create();
      if (p) navigate(`${base}/memo/${p.id}`);
    } finally {
      setCreating(false);
    }
  };

  const target = pages.find((p) => p.id === deleteId) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <FaRegNoteSticky className="text-cyan-700" /> メモ
        </h2>
        <button
          onClick={onCreate}
          disabled={creating}
          className="no-print flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
        >
          <FaPlus className="text-xs" /> ページを追加
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-sm text-slate-400">読み込み中…</div>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-400">まだメモがありません。</p>
          <button
            onClick={onCreate}
            disabled={creating}
            className="no-print mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
          >
            <FaPlus className="text-xs" /> 最初のメモを作成
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {pages.map((p) => (
            <li key={p.id}>
              <div className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-cyan-300 hover:shadow">
                <button
                  onClick={() => navigate(`${base}/memo/${p.id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
                    <FaRegNoteSticky />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-800">{p.title || "無題のメモ"}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
                      <span>更新 {fmtDate(p.updated_at)}</span>
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => setDeleteId(p.id)}
                  title="このメモを削除"
                  className="no-print flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <FaTrash className="text-xs" />
                </button>
                <FaChevronRight className="no-print shrink-0 text-slate-300" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="メモページを削除しますか？"
        message={target ? `「${target.title || "無題のメモ"}」を削除します。取り込んだ元画像も含め、この操作は取り消せません。` : undefined}
        busy={deleting}
        onConfirm={async () => {
          if (!deleteId) return;
          setDeleting(true);
          try {
            await remove(deleteId);
            setDeleteId(null);
          } finally {
            setDeleting(false);
          }
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
