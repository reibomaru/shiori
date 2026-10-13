import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaGlobe, FaCheck } from "react-icons/fa6";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, LANGUAGE_SHORT, type Language } from "../i18n";

/** メニューの概算サイズ（配置の上下判定用）。1 行 32px + 上下 padding。 */
const MENU_W = 144; // min-w-[9rem]
const ROW_H = 32;
const MENU_H = SUPPORTED_LANGUAGES.length * ROW_H + 8;

/**
 * 言語切り替え（日本語 / English / Français / 简体中文）のカスタムドロップダウン。
 * CLAUDE.md の規約に従い、ネイティブ <select> は使わず自前実装にしている。
 * メニューは portal + fixed で描画し、ダイアログ等の overflow（スクロール領域・角丸の
 * clip）に見切れないようにする。下に収まらなければ上開きにする。
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  /** トリガーの位置からメニューの fixed 座標を決める（右端揃え・下に入らなければ上開き）。 */
  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    const openUp = r.bottom + 4 + MENU_H > window.innerHeight && r.top - 4 - MENU_H > 0;
    setPos(openUp ? { left, bottom: window.innerHeight - r.top + 4 } : { left, top: r.bottom + 4 });
  }

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const reposition = () => place();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reposition);
    // ダイアログ内などスクロール可能な祖先が動いても追従させる（capture で全スクロールを拾う）。
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
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
    <div className={`no-print relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("language.label")}
        aria-label={t("language.label")}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors ${trigger}`}
      >
        <FaGlobe className="shrink-0 opacity-70" size={13} />
        <span>{LANGUAGE_SHORT[current]}</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            aria-label={t("language.label")}
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: MENU_W }}
            className={`z-[700] overflow-hidden rounded-lg border py-1 shadow-xl ${menu}`}
          >
            {SUPPORTED_LANGUAGES.map((lng) => {
              const selected = lng === current;
              return (
                <li key={lng} role="option" aria-selected={selected}>
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
          </ul>,
          document.body,
        )}
    </div>
  );
}
