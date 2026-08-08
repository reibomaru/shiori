import { useEffect, useRef, useState } from "react";
import { FaGlobe, FaCheck } from "react-icons/fa6";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_SHORT, type Language } from "../i18n";

/**
 * 言語切り替え（日本語 / English）のカスタムドロップダウン。
 * CLAUDE.md の規約に従い、ネイティブ <select> は使わず自前実装にしている。
 * surface="dark": 常時ダーク面（tech-mesh 等）向けの半透明配色。
 * surface="card": 白/ダークいずれのカード面でも読めるテーマ追従配色（既定）。
 * 印刷には出さない。
 */
export function LanguageSwitcher({
  className = "",
  surface = "card",
}: {
  className?: string;
  surface?: "dark" | "card";
}) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const current = (SUPPORTED_LANGUAGES.find((l) => i18n.language?.startsWith(l)) ?? "ja") as Language;

  const trigger =
    surface === "dark"
      ? "bg-white/5 text-slate-300 ring-white/10 hover:bg-white/10 hover:text-white"
      : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200 hover:text-slate-800 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/10 dark:hover:text-white";
  const menu =
    surface === "dark"
      ? "border-slate-700 bg-slate-900"
      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";

  return (
    <div ref={rootRef} className={`no-print relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("language.label")}
        aria-label={t("language.label")}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${trigger}`}
      >
        <FaGlobe className="shrink-0 opacity-70" size={13} />
        <span>{LANGUAGE_SHORT[current]}</span>
      </button>
      {open && (
        <ul className={`absolute right-0 top-full z-[620] mt-1 min-w-[9rem] overflow-hidden rounded-lg border py-1 shadow-xl ${menu}`}>
          {SUPPORTED_LANGUAGES.map((lng) => {
            const selected = lng === current;
            return (
              <li key={lng}>
                <button
                  type="button"
                  onClick={() => {
                    void i18n.changeLanguage(lng);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-100 dark:hover:bg-white/10 ${
                    selected ? "text-cyan-700 dark:text-cyan-300" : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  <FaCheck size={11} className={`shrink-0 ${selected ? "text-cyan-600 dark:text-cyan-400" : "text-transparent"}`} />
                  <span>{LANGUAGE_LABELS[lng]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
