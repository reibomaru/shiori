import type { IconType } from "react-icons";
import { FaTrain, FaPlane, FaCableCar, FaCar, FaPersonWalking, FaRoute } from "react-icons/fa6";
import type { LegFeature } from "../types";

const MODE: Record<string, { Icon: IconType; label: string; color: string }> = {
  train: { Icon: FaTrain, label: "鉄道", color: "#0e7490" },
  flight: { Icon: FaPlane, label: "飛行機", color: "#2563eb" },
  bus: { Icon: FaCableCar, label: "バス・登山", color: "#0891b2" },
  car: { Icon: FaCar, label: "車", color: "#d97706" },
  walk: { Icon: FaPersonWalking, label: "徒歩", color: "#16a34a" },
};

export default function MoveProcess({ legs }: { legs: LegFeature[] }) {
  const ordered = [...legs].sort((a, b) => a.properties.order_index - b.properties.order_index);

  return (
    <section className="border-t border-slate-200 bg-white px-6 py-5">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
        <FaRoute className="text-cyan-700" /> 移動の工程
      </h2>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((f, i) => {
          const p = f.properties;
          const m = MODE[p.mode] ?? MODE.train;
          const pts = f.geometry?.coordinates.length ?? 0;
          return (
            <li key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
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
            </li>
          );
        })}
      </ol>
    </section>
  );
}
