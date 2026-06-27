import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SessionOption = { id: string; title?: string | null };

/**
 * 会話履歴を選ぶためのカスタムドロップダウン。
 * ネイティブ <select> だと OS 依存の見た目になり一覧が読みづらいため、自前で実装している。
 */
export default function SessionSelect({
  value,
  options,
  onSelect,
}: {
  value: string;
  options: SessionOption[];
  onSelect: (id: string) => void;
}) {
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
  const label = current?.title ?? "（無題）";

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="会話履歴を選択"
        className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 transition-colors hover:border-slate-300 focus:border-cyan-500 focus:outline-none"
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
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
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-cyan-50 ${
                    selected ? "text-cyan-800" : "text-slate-700"
                  }`}
                >
                  <Check size={13} className={`shrink-0 ${selected ? "text-cyan-600" : "text-transparent"}`} />
                  <span className="min-w-0 flex-1 truncate">{o.title ?? "（無題）"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
