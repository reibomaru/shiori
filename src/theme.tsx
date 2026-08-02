import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** テーマの選択モード。system は OS の prefers-color-scheme に追従する。 */
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "shiori-theme";

function getStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage 不可（プライベートモード等）は system 扱い */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 選択モードから、実際に dark を適用するかを解決する。 */
function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && systemPrefersDark());
}

function applyDarkClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

interface ThemeCtx {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  /** 現在ダークが適用されているか（system 解決後の実効値）。 */
  isDark: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);
  const [isDark, setIsDark] = useState(() => resolveDark(getStoredMode()));

  const setMode = useCallback((m: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* 保存不可でもテーマ自体は反映する */
    }
    setModeState(m);
  }, []);

  useEffect(() => {
    const dark = resolveDark(mode);
    applyDarkClass(dark);
    setIsDark(dark);

    // system 選択時は OS のダーク設定変更に追従する。
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (mode === "system") {
        const d = resolveDark(mode);
        applyDarkClass(d);
        setIsDark(d);
      }
    };
    mq.addEventListener("change", onSystemChange);

    // 印刷（PDF 出力）中は常にライトで出力する。印刷が終わったら元のテーマへ戻す。
    const onBeforePrint = () => applyDarkClass(false);
    const onAfterPrint = () => applyDarkClass(resolveDark(mode));
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    return () => {
      mq.removeEventListener("change", onSystemChange);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [mode]);

  return <Ctx.Provider value={{ mode, setMode, isDark }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme must be used within ThemeProvider");
  return c;
}
