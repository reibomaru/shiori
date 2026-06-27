import { FaRegCalendarDays } from "react-icons/fa6";
import { useTrip } from "../store";
import Itinerary from "../components/Itinerary";

export default function ItineraryPage() {
  const { data, edit, reload } = useTrip();
  if (!data) return null;
  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-800">
        <FaRegCalendarDays className="text-cyan-700" /> 旅程（{data.days.length}日間）
      </h2>
      <Itinerary days={data.days} edit={edit} reload={reload} />
    </div>
  );
}
