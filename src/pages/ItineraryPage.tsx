import { useTrip } from "../store";
import ItineraryBuilder from "../components/builder/ItineraryBuilder";

// 旅程は常にビルダー表示（閲覧専用モードは持たない）。
export default function ItineraryPage() {
  const { data } = useTrip();
  if (!data) return null;
  return (
    <div className="h-full p-4 md:p-6">
      <ItineraryBuilder days={data.days} spots={data.spots} legs={data.legs} route={data.route} expenses={data.expenses} />
    </div>
  );
}
