import { useEffect, useRef, useState } from "react";
import { PanelRightOpen } from "lucide-react";
import { useTrip } from "../store";
import { useIsMobile } from "../hooks/useIsMobile";
import { useSpotChat } from "../hooks/useSpotChat";
import Spots from "../components/Spots";
import SpotChat from "../components/spotChat/SpotChat";

const CHAT_MIN = 320; // チャットパネルの最小幅
const SPOTS_MIN = 360; // 候補一覧に残す最小幅
const CHAT_DEFAULT = 440;
const STORAGE_KEY = "spotChatWidth";

export default function SpotsPage() {
  const { data, reload } = useTrip();
  const isMobile = useIsMobile();
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
    <div ref={containerRef} className="relative flex h-full bg-slate-100">
      {/* 左: 行きたいスポット候補（囲いなし・スクロール）。閉じているときは開くボタン分だけ右に余白。 */}
      <div className={`min-w-0 flex-1 overflow-y-auto p-5 ${!chatOpen ? "pr-14" : ""}`}>
        <Spots spots={data.spots} reload={reload} />
      </div>

      {/* スプリッター（ドラッグで幅調整・デスクトップのみ） */}
      {chatOpen && !isMobile && (
        <div
          onMouseDown={startDrag}
          title="ドラッグで幅を調整"
          className="group relative w-1 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-cyan-400"
        >
          {/* 当たり判定を広げる透明な掴みしろ */}
          <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
        </div>
      )}

      {/* 右: チャット（会話履歴はヘッダーのセレクトボックスで選択）。モバイルは全画面オーバーレイ。 */}
      {chatOpen && (
        <div
          className={isMobile ? "absolute inset-0 z-30 bg-white" : "shrink-0"}
          style={isMobile ? undefined : { width: chatWidth }}
        >
          <SpotChat chat={chat} reload={reload} onClose={() => setChatOpen(false)} />
        </div>
      )}

      {/* チャットを開くボタン（閉じているとき・右上・閉じるボタンと同じさりげないトーン） */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="チャットを開く"
          className="absolute right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
        >
          <PanelRightOpen size={16} />
        </button>
      )}
    </div>
  );
}
