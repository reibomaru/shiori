import { useState } from "react";
import { TbLayoutSidebarRightExpand } from "react-icons/tb";
import { useTrip } from "../store";
import MapView from "../components/MapView";
import MoveProcess from "../components/MoveProcess";

export default function MapPage() {
  const { data } = useTrip();
  const [selectedLeg, setSelectedLeg] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  if (!data) return null;
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 地図：全面 */}
      <div className="absolute inset-0">
        <MapView route={data.route} legs={data.legs} spots={data.spots} selectedLeg={selectedLeg} onSelectLeg={setSelectedLeg} />
      </div>

      {/* 移動の工程：地図上にオーバーレイ（背景は透過） */}
      {panelOpen ? (
        <div className="absolute right-0 top-0 z-10 h-full">
          <MoveProcess
            legs={data.legs}
            selectedLeg={selectedLeg}
            onSelectLeg={setSelectedLeg}
            onClose={() => setPanelOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label="移動の工程を開く"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-white/95 text-slate-600 shadow-md ring-1 ring-black/5 backdrop-blur transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <TbLayoutSidebarRightExpand size={20} />
        </button>
      )}
    </div>
  );
}
