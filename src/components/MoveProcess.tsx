import type { IconType } from "react-icons";
import { FaTrain, FaPlane, FaCableCar, FaCar, FaPersonWalking, FaRoute } from "react-icons/fa6";
import { TbLayoutSidebarRightCollapse } from "react-icons/tb";
import type { LegFeature } from "../types";

const MODE: Record<string, { Icon: IconType; label: string; color: string }> = {
  train: { Icon: FaTrain, label: "鉄道", color: "#0e7490" },
  flight: { Icon: FaPlane, label: "飛行機", color: "#2563eb" },
  bus: { Icon: FaCableCar, label: "バス・登山", color: "#0891b2" },
  car: { Icon: FaCar, label: "車", color: "#d97706" },
  walk: { Icon: FaPersonWalking, label: "徒歩", color: "#16a34a" },
};

export default function MoveProcess({
  legs,
  selectedLeg = null,
  onSelectLeg,
  onClose,
}: {
  legs: LegFeature[];
  selectedLeg?: number | null;
  onSelectLeg?: (order: number | null) => void;
  onClose?: () => void;
}) {
  const ordered = [...legs].sort((a, b) => a.properties.order_index - b.properties.order_index);

  return (
    <aside className="flex h-full w-72 flex-col bg-white/45 shadow-[-8px_0_24px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:w-80">
      <div className="flex items-center gap-2 px-3 pt-3">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="移動の工程を閉じる"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-white/60 hover:text-slate-900 [filter:drop-shadow(0_1px_2px_rgba(255,255,255,0.9))]"
          >
            <TbLayoutSidebarRightCollapse size={20} />
          </button>
        )}
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-800 [text-shadow:0_1px_3px_rgba(255,255,255,0.9)]">
          <FaRoute className="text-cyan-700" /> 移動の工程
        </h2>
      </div>
      <p className="px-4 pt-2 text-[11px] text-slate-500 [text-shadow:0_1px_3px_rgba(255,255,255,0.9)]">
        カードをクリックで地図上のルートを強調
      </p>
      <ol className="flex-1 space-y-3 overflow-y-auto p-3 pt-2">
        {ordered.map((f, i) => {
          const p = f.properties;
          const m = MODE[p.mode] ?? MODE.train;
          const pts = f.geometry?.coordinates.length ?? 0;
          const active = selectedLeg === p.order_index;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelectLeg?.(active ? null : p.order_index)}
                aria-pressed={active}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left shadow-sm backdrop-blur transition-colors ${
                  active
                    ? "border-cyan-500 bg-cyan-50/95 ring-2 ring-cyan-500/40"
                    : "border-white/70 bg-white/85 hover:border-cyan-300 hover:bg-white/95"
                }`}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                  style={{ background: m.color }}
                >
                  <m.Icon />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-500">区間 {i + 1}</span>
                    <span>· {m.label}</span>
                    <span>· {pts > 0 ? `ルート${pts}点` : "直線"}</span>
                  </div>
                  <div className="font-semibold text-slate-800">
                    {p.from} <span className="text-slate-400">→</span> {p.to}
                  </div>
                  {p.note && <p className="mt-0.5 text-xs text-slate-500">{p.note}</p>}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
