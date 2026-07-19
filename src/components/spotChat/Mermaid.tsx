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
      });
      initialized = true;
    }

    let cancelled = false;
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

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <pre className="mb-2 overflow-x-auto rounded-lg bg-rose-50 p-2.5 text-[12px] text-rose-700 ring-1 ring-rose-100 last:mb-0">
        {chart}
      </pre>
    );
  }

  return (
    <div
      ref={ref}
      className="my-2 flex justify-center overflow-x-auto rounded-xl bg-white p-2 [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}
