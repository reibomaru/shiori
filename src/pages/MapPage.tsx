import { useTrip } from "../store";
import MapView from "../components/MapView";
import MoveProcess from "../components/MoveProcess";

export default function MapPage() {
  const { data } = useTrip();
  if (!data) return null;
  return (
    <div className="flex min-h-screen flex-col">
      {/* 地図：全画面（横幅いっぱい・高さは画面の約8割） */}
      <div className="relative h-[82vh] w-full shrink-0">
        <MapView route={data.route} legs={data.legs} />
      </div>
      {/* 下に移動の工程 */}
      <MoveProcess legs={data.legs} />
    </div>
  );
}
