import { FaSun, FaMoon, FaDesktop } from "react-icons/fa6";
import { useTranslation } from "react-i18next";
import { useTheme, type ThemeMode } from "../theme";

const OPTIONS: { mode: ThemeMode; Icon: typeof FaSun; labelKey: string }[] = [
  { mode: "light", Icon: FaSun, labelKey: "theme.light" },
  { mode: "dark", Icon: FaMoon, labelKey: "theme.dark" },
  { mode: "system", Icon: FaDesktop, labelKey: "theme.system" },
];

/** テーマ切り替え（ライト / ダーク / システム）のセグメント型トグル。
 *  surface="dark": 常時ダーク面（tech-mesh 等）向けの半透明配色。
 *  surface="card": 白/ダークいずれのカード面でも読めるテーマ追従配色（既定）。
 *  印刷には出さない（no-print）。 */
export function ThemeToggle({
  className = "",
  surface = "card",
}: {
  className?: string;
  surface?: "dark" | "card";
}) {
  const { mode, setMode } = useTheme();
  const { t } = useTranslation();

  const container =
    surface === "dark"
      ? "bg-white/5 ring-white/10"
      : "bg-slate-100 ring-slate-200 dark:bg-white/5 dark:ring-white/10";

  return (
    <div
      role="radiogroup"
      aria-label={t("theme.label")}
      className={`no-print inline-flex items-center gap-0.5 rounded-lg p-0.5 ring-1 ring-inset ${container} ${className}`}
    >
      {OPTIONS.map(({ mode: m, Icon, labelKey }) => {
        const active = mode === m;
        const tone = active
          ? surface === "dark"
            ? "bg-cyan-400/15 text-cyan-300 ring-1 ring-inset ring-cyan-400/30"
            : "bg-white text-cyan-700 shadow-sm ring-1 ring-inset ring-slate-200 dark:bg-cyan-400/15 dark:text-cyan-300 dark:ring-cyan-400/30"
          : surface === "dark"
            ? "text-slate-400 hover:bg-white/10 hover:text-white"
            : "text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white";
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(labelKey)}
            aria-label={t(labelKey)}
            onClick={() => setMode(m)}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${tone}`}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}
