import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FaChevronLeft, FaTrash } from "react-icons/fa6";
import { PanelRightOpen } from "lucide-react";
import { useMemoPages } from "../hooks/useMemoPages";
import { useMemoChat } from "../hooks/useMemoChat";
import { useIsMobile } from "../hooks/useIsMobile";
import { useVisualViewport } from "../hooks/useVisualViewport";
import MemoDetail from "../components/memo/MemoDetail";
import MemoChat from "../components/memoChat/MemoChat";
import ConfirmDialog from "../components/ConfirmDialog";

const CHAT_MIN = 320; // チャットパネルの最小幅
const MEMO_MIN = 360; // メモ本文に残す最小幅
const CHAT_DEFAULT = 440;
const WIDTH_KEY = "memoChatWidth";
const OPEN_KEY = "memoChatOpen"; // AI 編集パネルの表示状態（オプトアウトを記憶）

/** メモの詳細・編集ページ（/memo/:id）。AI 編集パネルを既定で右側に表示する。 */
export default function MemoDetailPage() {
  const { t } = useTranslation("memo");
  const { id = "", projectId = "" } = useParams();
  const memoBase = `/p/${projectId}/memo`;
  const { pages, loading, error, update, remove, reload } = useMemoPages();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const vp = useVisualViewport();
  const chat = useMemoChat();

  // AI 編集パネルは既定で表示。ユーザーが閉じたら記憶する（オプトアウト）。
  const [chatOpen, setChatOpen] = useState(() => {
    const saved = localStorage.getItem(OPEN_KEY);
    if (saved === null) return !isMobile; // 既定: デスクトップは表示、モバイルは全画面を避けて非表示
    return saved === "1";
  });
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    return saved >= CHAT_MIN ? saved : CHAT_DEFAULT;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    localStorage.setItem(OPEN_KEY, chatOpen ? "1" : "0");
  }, [chatOpen]);
  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(chatWidth));
  }, [chatWidth]);

  // スプリッターのドラッグで幅を調整（チャットは右側なので「右端 - カーソルX」が幅）。
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = Math.round(rect.right - e.clientX);
      setChatWidth(Math.max(CHAT_MIN, Math.min(rect.width - MEMO_MIN, next)));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const page = pages.find((p) => p.id === id) ?? null;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div ref={containerRef} className="relative flex h-full bg-slate-100 dark:bg-slate-900">
      {/* 左: メモ本文（スクロール）。デスクトップで閉じているときは開くボタン分の余白を空ける。 */}
      <div
        className={`min-w-0 flex-1 overflow-y-auto p-5 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-5 ${
          !chatOpen && !isMobile ? "pr-14" : ""
        }`}
      >
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link
              to={memoBase}
              className="no-print flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <FaChevronLeft className="text-xs" /> {t("detail.backToList")}
            </Link>
            {page && (
              <div className="no-print flex items-center gap-2">
                {/* モバイルで閉じているときは、見出し右に AI 編集を開くボタンを置く。 */}
                {isMobile && !chatOpen && (
                  <button
                    onClick={() => setChatOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-600"
                  >
                    <PanelRightOpen size={15} /> {t("detail.openAiEditMobile")}
                  </button>
                )}
                <button
                  onClick={() => setConfirmDelete(true)}
                  title={t("detail.deleteTitle")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                >
                  <FaTrash className="text-xs" />
                </button>
              </div>
            )}
          </div>

          {error && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}

          {loading ? (
            <div className="p-10 text-center text-sm text-slate-400 dark:text-slate-500">{t("common:state.loading")}</div>
          ) : !page ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-800">
              <p className="text-sm text-slate-400 dark:text-slate-500">{t("detail.notFound")}</p>
              <Link
                to={memoBase}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700"
              >
                <FaChevronLeft className="text-xs" /> {t("detail.backToListLink")}
              </Link>
            </div>
          ) : (
            <MemoDetail key={page.id} page={page} onUpdate={(patch) => update(page.id, patch)} />
          )}
        </div>
      </div>

      {/* スプリッター（ドラッグで幅調整・デスクトップのみ） */}
      {chatOpen && !isMobile && (
        <div
          onMouseDown={startDrag}
          title={t("detail.resizeHint")}
          className="no-print group relative w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-cyan-400 dark:bg-slate-700"
        >
          <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
        </div>
      )}

      {/* 右: AI 編集チャット。モバイルは全画面オーバーレイ。 */}
      {chatOpen && page && (
        <div
          className={isMobile ? "fixed inset-0 z-[560] bg-white dark:bg-slate-900" : "no-print shrink-0"}
          style={isMobile ? undefined : { width: chatWidth }}
        >
          <div
            className={isMobile ? "absolute inset-x-0 overflow-hidden" : "h-full"}
            style={isMobile ? { top: vp.offsetTop, height: vp.height } : undefined}
          >
            <MemoChat chat={chat} reload={reload} onClose={() => setChatOpen(false)} pageId={page.id} />
          </div>
        </div>
      )}

      {/* AI 編集を開くボタン（デスクトップで閉じているとき・右上のさりげないトーン）。 */}
      {!chatOpen && !isMobile && (
        <button
          onClick={() => setChatOpen(true)}
          title={t("detail.openAiEdit")}
          aria-label={t("detail.openAiEdit")}
          className="no-print absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <PanelRightOpen size={16} />
        </button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("confirm.deleteTitle")}
        message={page ? t("confirm.deleteMessageDetail", { title: page.title || t("list.untitled") }) : undefined}
        busy={deleting}
        onConfirm={async () => {
          if (!page) return;
          setDeleting(true);
          try {
            await remove(page.id);
            navigate(memoBase);
          } finally {
            setDeleting(false);
          }
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
