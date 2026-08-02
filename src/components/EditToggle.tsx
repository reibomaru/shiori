import { FaCheck, FaPen } from "react-icons/fa6";
import { useTranslation } from "react-i18next";
import { useTrip } from "../store";

/** 編集モードの ON/OFF を切り替えるボタン。旅程・予算ページのヘッダーで使う。 */
export default function EditToggle() {
  const { edit, setEdit } = useTrip();
  const { t } = useTranslation("misc");
  return (
    <button
      onClick={() => setEdit(!edit)}
      className={`no-print flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        edit
          ? "bg-amber-400 text-amber-950 hover:bg-amber-300"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-700"
      }`}
    >
      {edit ? <FaCheck className="text-xs" /> : <FaPen className="text-xs" />}
      {edit ? t("editToggle.on") : t("editToggle.off")}
    </button>
  );
}
