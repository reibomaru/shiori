// BYOK（自分の Gemini API キー）の登録・変更・削除セクション。
// プロフィールダイアログ内で使う。削除は ConfirmDialog を挟む（CLAUDE.md 準拠）。
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaCheck, FaKey, FaArrowUpRightFromSquare } from "react-icons/fa6";
import { api, type ByokStatus } from "../api";
import ConfirmDialog from "./ConfirmDialog";

const AI_STUDIO_URL = "https://aistudio.google.com/apikey";

export default function ByokSettings() {
  const { t } = useTranslation(["dialogs", "common"]);
  const [status, setStatus] = useState<ByokStatus | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [editing, setEditing] = useState(false); // 登録済みでも「変更」を押したら入力欄を出す
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getByok()
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setError(t("byok.loadError")));
    return () => {
      alive = false;
    };
  }, [t]);

  const save = async () => {
    const key = keyInput.trim();
    if (!key) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const s = await api.setByok(key);
      setStatus(s);
      setKeyInput("");
      setEditing(false);
      setSaved(true);
    } catch {
      // http() は 400 でも throw する。疎通確認 NG を無効キーとして案内する。
      setError(t("byok.invalid"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await api.deleteByok();
      setStatus(s);
      setEditing(false);
      setKeyInput("");
    } catch {
      setError(t("byok.removeError"));
    } finally {
      setBusy(false);
      setConfirmRemove(false);
    }
  };

  const showInput = !status?.hasKey || editing;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700" id="byok-section">
      <div className="mb-2 flex items-center gap-2">
        <FaKey className="text-slate-400" size={13} />
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t("byok.title")}</span>
      </div>

      {!status ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">{t("byok.loading")}</p>
      ) : (
        <>
          {/* 状態表示 */}
          {status.hasKey ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <FaCheck size={12} /> {t("byok.registered")}
            </p>
          ) : (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <p>{t("byok.usingShared")}</p>
              <UsageBar cost={status.usage.costUsd} limit={status.usage.limitUsd} />
              {status.usage.costUsd >= status.usage.limitUsd && (
                <p className="mt-1 text-rose-600 dark:text-rose-400">{t("byok.overLimit")}</p>
              )}
              {!status.sharedKeyConfigured && (
                <p className="mt-1 text-rose-600 dark:text-rose-400">{t("byok.sharedNotConfigured")}</p>
              )}
            </div>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{t("byok.benefit")}</p>

          {/* 入力欄（未登録、または変更時）*/}
          {showInput && (
            <div className="mt-2">
              <input
                type="password"
                value={keyInput}
                autoComplete="off"
                placeholder={t("byok.keyPlaceholder")}
                onChange={(e) => setKeyInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
              />
              <a
                href={AI_STUDIO_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 hover:underline dark:text-cyan-400"
              >
                {t("byok.getKeyLink")} <FaArrowUpRightFromSquare size={9} />
              </a>
            </div>
          )}

          {error && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>
          )}
          {saved && !error && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">{t("byok.saved")}</p>
          )}

          {/* 操作ボタン */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {showInput && (
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || !keyInput.trim()}
                className="rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
              >
                {busy ? t("common:state.saving") : status.hasKey ? t("byok.update") : t("byok.register")}
              </button>
            )}
            {status.hasKey && !editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {t("byok.replace")}
              </button>
            )}
            {status.hasKey && editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setKeyInput("");
                  setError(null);
                }}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                {t("common:actions.cancel")}
              </button>
            )}
            {status.hasKey && (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
              >
                {t("byok.remove")}
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title={t("byok.confirmRemoveTitle")}
        message={t("byok.confirmRemoveMessage")}
        confirmLabel={t("common:actions.delete")}
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

/** 当月の消費量バー（共有キー利用時）。 */
function UsageBar({ cost, limit }: { cost: number; limit: number }) {
  const { t } = useTranslation("dialogs");
  const pct = limit > 0 ? Math.min(100, Math.round((cost / limit) * 100)) : 0;
  const over = cost >= limit;
  return (
    <div className="mt-1.5">
      <div className="mb-0.5 flex justify-between text-[11px] text-slate-400 dark:text-slate-500">
        <span>{t("byok.usageLabel", { cost: cost.toFixed(2), limit: limit.toFixed(2) })}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-cyan-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
