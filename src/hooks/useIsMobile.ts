import { useEffect, useState } from "react";

// md ブレークポイント（Tailwind 既定 768px）未満をモバイル扱いにする。
// パネル系（地図の工程・スポットのチャット・旅程のパレット）は、
// デスクトップの「横並び＋幅ドラッグ」とモバイルの「全画面オーバーレイ」を
// この判定で切り替える。CSS だけでは表現しづらいインライン幅・スプリッターの
// 有効/無効を制御するために JS 側でも持つ。
const QUERY = "(max-width: 767px)";

function initial(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(initial);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
