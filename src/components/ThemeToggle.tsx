import { FaSun, FaMoon, FaDesktop } from "react-icons/fa6";
import { useTranslation } from "react-i18next";
import { useTheme, type ThemeMode } from "../theme";

const OPTIONS: { mode: ThemeMode; Icon: typeof FaSun; labelKey: string }[] = [
  { mode: "light", Icon: FaSun, labelKey: "theme.light" },
  { mode: "dark", Icon: FaMoon, labelKey: "theme.dark" },
  { mode: "system", Icon: FaDesktop, labelKey: "theme.system" },
];

/** テーマ切り替え（ライト / ダーク / システム）のセグメント型トグル。
 *  ヘッダーやサイドバー（tech-mesh のダーク面）に置く前提で、半透明の
 *  ダーク向け配色にしている。印刷には出さない（no-print）。 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation();

  return (
    <div
      role="radiogroup"
      aria-label={t("theme.label")}
      className={`no-print inline-flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5 ring-1 ring-inset ring-white/10 ${className}`}
    >
      {OPTIONS.map(({ mode: m, Icon, labelKey }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(labelKey)}
            aria-label={t(labelKey)}
            onClick={() => setMode(m)}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
              active
                ? "bg-cyan-400/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/30"
                : "text-slate-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
