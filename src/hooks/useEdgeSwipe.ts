import { useEffect, useRef } from "react";

type Edge = "left" | "right";

interface Options {
  /** ドロワーが接している画面の端。left=左サイドバー、right=右パネル。 */
  edge: Edge;
  /** 現在開いているか。開/閉でジェスチャーの向きを切り替える。 */
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** モバイルのみ有効化する想定（useIsMobile を渡す）。false の間はリスナを張らない。 */
  enabled?: boolean;
  /** 端から何 px 以内で始めた横スワイプを「開く」と見なすか。 */
  edgeSize?: number;
  /** 開閉を確定する横移動量のしきい値(px)。 */
  threshold?: number;
}

/**
 * モバイルでサイドメニュー/ドロワーを横スワイプで開閉するフック。
 *
 * - 開く: 画面端（edge）から edgeSize 以内で始め、内側へ threshold 超スワイプ。
 * - 閉じる: 開いている間に端へ向かって threshold 超スワイプ（開始位置は問わない）。
 *
 * 縦方向が優勢なジェスチャーはスクロールとみなして無視する。リスナは passive で
 * 張り、preventDefault はしない（＝指追従ではなく閾値超えで開閉するスナップ方式）。
 * これにより既存の縦スクロール・地図パン・dnd を阻害しない。
 */
export function useEdgeSwipe({
  edge,
  isOpen,
  onOpen,
  onClose,
  enabled = true,
  edgeSize = 28,
  threshold = 60,
}: Options): void {
  // effect を張り直さずに最新の値を参照するための ref。
  const latest = useRef({ isOpen, onOpen, onClose });
  latest.current = { isOpen, onOpen, onClose };

  useEffect(() => {
    if (!enabled) return;
    // inward: ドロワーが出てくる向きの符号。left は右(+1)、right は左(-1)。
    const inward = edge === "left" ? 1 : -1;

    let active = false; // 追跡中の単一指ジェスチャーか
    let startX = 0;
    let startY = 0;
    let fromEdge = false; // 端から始めたか（開く判定に使う）
    let decided = false; // 横方向ジェスチャーと確定したか
    let locked = false; // 縦スクロールと判断して無効化したか

    const onStart = (e: TouchEvent) => {
      // マルチタッチ（ピンチ等）は対象外。
      if (e.touches.length !== 1) {
        active = false;
        return;
      }
      const touch = e.touches[0];
      active = true;
      decided = false;
      locked = false;
      startX = touch.clientX;
      startY = touch.clientY;
      const w = window.innerWidth;
      fromEdge = edge === "left" ? startX <= edgeSize : startX >= w - edgeSize;
    };

    const onMove = (e: TouchEvent) => {
      if (!active || locked) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!decided) {
        // 進行方向が定まるまで（10px 未満）は保留。
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          locked = true; // 縦スクロール優先
          return;
        }
        decided = true;
      }

      const { isOpen } = latest.current;
      if (!isOpen) {
        // 閉じている: 端から内側へ threshold 超で開く。
        if (fromEdge && dx * inward > threshold) {
          active = false;
          latest.current.onOpen();
        }
      } else {
        // 開いている: 端へ向かって threshold 超で閉じる。
        if (dx * inward < -threshold) {
          active = false;
          latest.current.onClose();
        }
      }
    };

    const onEnd = () => {
      active = false;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, edge, edgeSize, threshold]);
}
