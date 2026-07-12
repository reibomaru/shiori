import { useTrip } from "../store";
import Memo from "../components/Memo";

export default function MemoPage() {
  const { data, reload } = useTrip();
  if (!data) return null;
  return <Memo memo={data.trip?.memo ?? null} reload={reload} />;
}
