import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// mermaid はモジュール全体で 1 度だけ初期化する。
let initialized = false;
// render の第 1 引数に渡す一意な ID。DOM に一時要素を作るため衝突を避ける。
let idSeq = 0;

/**
 * ```mermaid コードブロックを図としてレンダリングする。
 * 解析に失敗したら元のソースをコードとして表示するフォールバックを持つ。
 */
export default function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "neutral",
        fontFamily: "inherit",
        // 解析エラー時に mermaid が DOM へ「爆弾」エラー図を注入するのを抑止する。
        // フォールバック表示は自前の error state で行う。
        suppressErrorRendering: true,
      });
      initialized = true;
    }

    let cancelled = false;
    // 入力のたびに描画が走らないようデバウンスする（ライブプレビュー対策）。
    const timer = setTimeout(() => {
      const id = `mermaid-${idSeq++}`;
      mermaid
        .render(id, chart)
        .then(({ svg }) => {
          if (cancelled || !ref.current) return;
          ref.current.innerHTML = svg;
          setError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chart]);

  if (error) {
    return (
      <pre className="mb-2 overflow-x-auto rounded-lg bg-rose-50 p-2.5 text-[12px] text-rose-700 ring-1 ring-rose-100 last:mb-0 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20">
        {chart}
      </pre>
    );
  }

  // mermaid の SVG は light 固定（neutral テーマ）で描画されるため、ダークでも
  // 図が読めるよう地色は白のまま保ち、暗所で浮くよう薄いリングだけ足す。
  return (
    <div
      ref={ref}
      className="my-2 flex justify-center overflow-x-auto rounded-xl bg-white p-2 dark:ring-1 dark:ring-white/10 [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}
