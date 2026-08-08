// AI エラーの表示。キー未登録 / 上限超過のときは BYOK 登録導線（設定を開く）を出す。
import { useTranslation } from "react-i18next";
import { FaKey } from "react-icons/fa6";
import type { ChatErrorCode } from "../hooks/useSpotChat";

/** プロフィール設定（BYOK セクション）を開くよう Layout に通知するイベント名。 */
export const OPEN_BYOK_EVENT = "shiori:open-byok";

/** どこからでもプロフィール設定を開く（Layout が購読して開く）。 */
export function openByokSettings(): void {
  window.dispatchEvent(new CustomEvent(OPEN_BYOK_EVENT));
}

export default function ByokErrorNotice({ error, code }: { error: string | null; code: ChatErrorCode }) {
  const { t } = useTranslation("spotChat");
  if (!error) return null;

  // 通常のエラーはそのまま表示する。
  if (code !== "missing_key" && code !== "limit_exceeded") {
    return (
      <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>
    );
  }

  // BYOK 登録で解消できるエラーは案内 + 導線を出す。
  return (
    <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <p>{error}</p>
      <button
        type="button"
        onClick={openByokSettings}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
      >
        <FaKey size={11} /> {t("byokCta")}
      </button>
    </div>
  );
}
