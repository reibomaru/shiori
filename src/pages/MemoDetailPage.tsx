import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FaChevronLeft, FaTrash, FaWandMagicSparkles } from "react-icons/fa6";
import { useMemoPages } from "../hooks/useMemoPages";
import { useMemoChat } from "../hooks/useMemoChat";
import { useIsMobile } from "../hooks/useIsMobile";
import { useVisualViewport } from "../hooks/useVisualViewport";
import MemoDetail from "../components/memo/MemoDetail";
import MemoChat from "../components/memoChat/MemoChat";
import ConfirmDialog from "../components/ConfirmDialog";

/** メモの詳細・編集ページ（/memo/:id）。 */
export default function MemoDetailPage() {
  const { id = "" } = useParams();
  const { pages, loading, error, update, remove, reload } = useMemoPages();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const vp = useVisualViewport();
  const chat = useMemoChat();
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const page = pages.find((p) => p.id === id) ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link
          to="/memo"
          className="no-print flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <FaChevronLeft className="text-xs" /> メモ一覧
        </Link>
        {page && (
          <div className="no-print flex items-center gap-2">
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-600"
            >
              <FaWandMagicSparkles className="text-xs" /> AI で編集
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              title="このメモを削除"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <FaTrash className="text-xs" />
            </button>
          </div>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}

      {loading ? (
        <div className="p-10 text-center text-sm text-slate-400">読み込み中…</div>
      ) : !page ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm text-slate-400">メモが見つかりませんでした。</p>
          <Link
            to="/memo"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200"
          >
            <FaChevronLeft className="text-xs" /> 一覧へ戻る
          </Link>
        </div>
      ) : (
        <MemoDetail key={page.id} page={page} onUpdate={(patch) => update(page.id, patch)} />
      )}

      {/* AI 編集チャット（右からのドロワー / モバイルは全画面オーバーレイ）。印刷には出さない。 */}
      {chatOpen && page && (
        <div className="no-print fixed inset-0 z-[580]">
          {/* 背景（クリックで閉じる。モバイルは全画面のため見えない） */}
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setChatOpen(false)} />
          <div
            className={
              isMobile
                ? "absolute inset-0 bg-white"
                : "absolute right-0 top-0 h-full w-[min(440px,90vw)] bg-white shadow-2xl"
            }
          >
            <div
              className={isMobile ? "absolute inset-x-0 overflow-hidden" : "h-full"}
              style={isMobile ? { top: vp.offsetTop, height: vp.height } : undefined}
            >
              <MemoChat chat={chat} reload={reload} onClose={() => setChatOpen(false)} pageId={page.id} />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="メモページを削除しますか？"
        message={page ? `「${page.title || "無題のメモ"}」を削除します。取り込んだ元画像も含め、この操作は取り消せません。` : undefined}
        busy={deleting}
        onConfirm={async () => {
          if (!page) return;
          setDeleting(true);
          try {
            await remove(page.id);
            navigate("/memo");
          } finally {
            setDeleting(false);
          }
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
