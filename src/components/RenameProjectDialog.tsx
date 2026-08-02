// プロジェクト名を変更するダイアログ（オーナーのみ）。
// ネイティブ prompt は使わず、見た目を揃えた自前モーダルにする（CLAUDE.md 準拠）。
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FaXmark } from "react-icons/fa6";
import { api, type Project } from "../api";

export default function RenameProjectDialog({
  project,
  onClose,
  onRenamed,
}: {
  project: Project;
  onClose: () => void;
  onRenamed: (p: Project) => void;
}) {
  const { t } = useTranslation(["dialogs", "common"]);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.renameProject(project.id, trimmed);
      onRenamed(updated);
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("rename.aria")}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{t("rename.title")}</h3>
          <button
            onClick={onClose}
            aria-label={t("common:actions.close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <FaXmark />
          </button>
        </div>

        <input
          autoFocus
          type="text"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          // 日本語変換確定の Enter では送信しない（変換中は isComposing=true）。
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void save();
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
        />

        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            {t("common:actions.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {busy ? t("common:state.saving") : t("common:actions.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
