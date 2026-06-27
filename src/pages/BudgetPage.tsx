import { useTrip } from "../store";
import Budget from "../components/Budget";

export default function BudgetPage() {
  const { data, edit, reload } = useTrip();
  if (!data) return null;
  return <Budget budget={data.budget} partySize={data.trip?.party_size || 2} edit={edit} reload={reload} />;
}
