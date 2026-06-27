import { useTrip } from "../store";
import Spots from "../components/Spots";

export default function SpotsPage() {
  const { data, edit, reload } = useTrip();
  if (!data) return null;
  return <Spots spots={data.spots} edit={edit} reload={reload} />;
}
