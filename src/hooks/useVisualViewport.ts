import { useEffect, useState } from "react";

// モバイルでソフトキーボードが開くと、レイアウトビューポート（100dvh 等）は縮まず
// visualViewport だけが縮む。全画面オーバーレイ（スポットのチャット等）を
// h-full=100dvh で敷くと、下端の入力欄がキーボードに隠れ、ブラウザがページを
// スクロールして固定ヘッダーごと崩れる。
// このフックはキーボードで縮んだ「見えている領域」の高さと上端オフセットを返し、
// オーバーレイをその領域にぴったり合わせられるようにする。
export type Viewport = { height: number; offsetTop: number };

function initial(): Viewport {
  if (typeof window === "undefined") return { height: 0, offsetTop: 0 };
  const vv = window.visualViewport;
  return { height: vv?.height ?? window.innerHeight, offsetTop: vv?.offsetTop ?? 0 };
}

export function useVisualViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(initial);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setVp({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return vp;
}
