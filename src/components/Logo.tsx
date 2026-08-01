import { useId } from "react";

/**
 * shiori のロゴマーク（ノードグラフ）。
 * 候補スポットのネットワーク（薄い線＝currentColor）から、
 * 確定した旅程だけをグラデーションの経路として浮かび上がらせる意匠。
 * 薄い部分は currentColor を継承するので、置き場所の文字色に馴染む。
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="shiori"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#a06bff" />
        </linearGradient>
      </defs>
      {/* 候補ネットワーク（薄い） */}
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.35">
        <line x1="7" y1="14" x2="11" y2="23" />
        <line x1="11" y1="23" x2="19" y2="25" />
        <line x1="14" y1="10" x2="11" y2="23" />
        <line x1="21" y1="15" x2="19" y2="25" />
        <line x1="19" y1="25" x2="26" y2="22" />
      </g>
      <g fill="currentColor" opacity="0.45">
        <circle cx="11" cy="23" r="1.3" />
        <circle cx="19" cy="25" r="1.3" />
      </g>
      {/* 確定した旅程（ハイライト経路） */}
      <path
        d="M7 14 L14 10 L21 15 L26 22"
        stroke={`url(#${id})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill={`url(#${id})`}>
        <circle cx="7" cy="14" r="2" />
        <circle cx="14" cy="10" r="2" />
        <circle cx="21" cy="15" r="2" />
        <circle cx="26" cy="22" r="2" />
      </g>
    </svg>
  );
}
