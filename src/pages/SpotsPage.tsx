import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PanelRightOpen } from "lucide-react";
import { useTrip } from "../store";
import { useIsMobile } from "../hooks/useIsMobile";
import { useVisualViewport } from "../hooks/useVisualViewport";
import { useSpotChat } from "../hooks/useSpotChat";
import Spots from "../components/Spots";
import SpotChat from "../components/spotChat/SpotChat";

const CHAT_MIN = 320; // チャットパネルの最小幅
const SPOTS_MIN = 360; // 候補一覧に残す最小幅
const CHAT_DEFAULT = 440;
const STORAGE_KEY = "spotChatWidth";

export default function SpotsPage() {
  const { t } = useTranslation("spots");
  const { data, reload } = useTrip();
  const isMobile = useIsMobile();
  // モバイルはチャットを全画面オーバーレイで出す。キーボードで縮む可視領域に
  // 合わせて高さ・上端を決め、入力欄がキーボードに隠れて崩れるのを防ぐ。
  const vp = useVisualViewport();
  const chat = useSpotChat();
  // モバイルはチャットが全画面を覆うため、初期は閉じて候補一覧を見せる。
  const [chatOpen, setChatOpen] = useState(() => !isMobile);
  const [chatWidth, setChatWidth] = useState(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return saved >= CHAT_MIN ? saved : CHAT_DEFAULT;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // スプリッターのドラッグで幅を調整。チャットは右側なので「右端 - カーソルX」が幅。
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const next = Math.round(rect.right - e.clientX);
      setChatWidth(Math.max(CHAT_MIN, Math.min(rect.width - SPOTS_MIN, next)));
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(chatWidth));
  }, [chatWidth]);

  if (!data) return null;

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div ref={containerRef} className="relative flex h-full bg-slate-100 dark:bg-slate-900">
      {/* 左: 行きたいスポット候補（囲いなし・スクロール）。
          デスクトップで閉じているときだけ、右上の開くボタン分の余白を空ける。
          モバイルはチャットが全画面オーバーレイで、開くボタンは右下に浮かせるため余白不要。 */}
      <div
        className={`min-w-0 flex-1 overflow-y-auto p-5 pb-[calc(9rem+env(safe-area-inset-bottom))] md:pb-5 ${
          !chatOpen && !isMobile ? "pr-14" : ""
        }`}
      >
        <Spots
          spots={data.spots}
          reload={reload}
          // モバイルは全画面オーバーレイでチャットを開く。フローティングだと下部の
          // ブラウザツールバーに隠れるため、見出し右（件数バッジの隣）に置く。
          headerAction={
            isMobile && !chatOpen ? (
              <button
                onClick={() => setChatOpen(true)}
                title={t("chat.open")}
                aria-label={t("chat.open")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 ring-1 ring-slate-200 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <PanelRightOpen size={16} />
              </button>
            ) : null
          }
        />
      </div>

      {/* スプリッター（ドラッグで幅調整・デスクトップのみ） */}
      {chatOpen && !isMobile && (
        <div
          onMouseDown={startDrag}
          title={t("splitter")}
          className="group relative w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-cyan-400 dark:bg-slate-700"
        >
          {/* 当たり判定を広げる透明な掴みしろ */}
          <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
        </div>
      )}

      {/* 右: チャット（会話履歴はヘッダーのセレクトボックスで選択）。モバイルは全画面オーバーレイ。
          外側は画面全体を白で覆って背後の一覧が覗かないようにし、
          中身（チャット）だけをキーボードで縮む可視領域に収める。 */}
      {chatOpen && (
        <div
          className={isMobile ? "fixed inset-0 z-[560] bg-white dark:bg-slate-900" : "shrink-0"}
          style={isMobile ? undefined : { width: chatWidth }}
        >
          <div
            className={isMobile ? "absolute inset-x-0 overflow-hidden" : "h-full"}
            style={isMobile ? { top: vp.offsetTop, height: vp.height } : undefined}
          >
            <SpotChat chat={chat} reload={reload} onClose={() => setChatOpen(false)} />
          </div>
        </div>
      )}

      {/* チャットを開くボタン（デスクトップで閉じているとき・右上のさりげないトーン）。
          モバイルは Spots 見出し内の headerAction に置く。 */}
      {!chatOpen && !isMobile && (
        <button
          onClick={() => setChatOpen(true)}
          title={t("chat.open")}
          aria-label={t("chat.open")}
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <PanelRightOpen size={16} />
        </button>
      )}
    </div>
  );
}
