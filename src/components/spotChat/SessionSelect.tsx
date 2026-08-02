import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Plus } from "lucide-react";

export type SessionOption = { id: string; title?: string | null };

/**
 * 会話履歴を選ぶためのカスタムドロップダウン。
 * ネイティブ <select> だと OS 依存の見た目になり一覧が読みづらいため、自前で実装している。
 * onCreate を渡すと、先頭に「新しい会話」を作成する項目を表示する（追加可能なセレクト）。
 */
export default function SessionSelect({
  value,
  options,
  onSelect,
  onCreate,
}: {
  value: string;
  options: SessionOption[];
  onSelect: (id: string) => void;
  onCreate?: () => void;
}) {
  const { t } = useTranslation("spotChat");
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

  const current = options.find((o) => o.id === value);
  const label = current?.title ?? t("session.untitled");

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("session.select")}
        className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 transition-colors hover:border-slate-300 focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500"
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:shadow-none dark:ring-1 dark:ring-white/10">
          {onCreate && (
            <>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onCreate();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-500/10"
                >
                  <Plus size={13} className="shrink-0" />
                  <span>{t("session.create")}</span>
                </button>
              </li>
              <li aria-hidden className="my-1 border-t border-slate-100 dark:border-slate-700" />
            </>
          )}
          {options.map((o) => {
            const selected = o.id === value;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(o.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-500/10 ${
                    selected ? "text-cyan-800 dark:text-cyan-300" : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  <Check size={13} className={`shrink-0 ${selected ? "text-cyan-600 dark:text-cyan-400" : "text-transparent"}`} />
                  <span className="min-w-0 flex-1 truncate">{o.title ?? t("session.untitled")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
