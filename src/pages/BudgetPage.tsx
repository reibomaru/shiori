import { useTrip } from "../store";
import Expenses from "../components/Expenses";

/** 実費（確定した予約・領収書）を記録・集計するページ。 */
export default function BudgetPage() {
  const { data, edit, reload } = useTrip();
  if (!data) return null;
  return <Expenses expenses={data.expenses} edit={edit} reload={reload} />;
}
