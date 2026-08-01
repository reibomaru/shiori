// ユーザーのアバター表示。画像があれば丸く表示し、無ければ頭文字を色付き背景で出す。
// 画像の読み込み失敗時も頭文字にフォールバックする。
import { useState } from "react";

/** 名前/メールから頭文字（1 文字）を取り出す。 */
function initialOf(name?: string | null, email?: string): string {
  const base = (name && name.trim()) || email || "?";
  return Array.from(base.trim())[0]?.toUpperCase() ?? "?";
}

// 頭文字の背景色（文字列ハッシュで決定・毎回同じ色になる）。
const COLORS = ["#0e7490", "#4f7cff", "#a06bff", "#c9613f", "#6f8f7a", "#c69a4a", "#3f6f8f", "#ff5d8f"];
function colorOf(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function Avatar({
  src,
  name,
  email,
  size = 32,
  className = "",
}: {
  src?: string | null;
  name?: string | null;
  email?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  const dim = { width: size, height: size };

  if (showImg) {
    return (
      <img
        src={src}
        alt={name || email || "avatar"}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={dim}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ ...dim, backgroundColor: colorOf(email || name || "?"), fontSize: Math.round(size * 0.45) }}
    >
      {initialOf(name, email)}
    </span>
  );
}
