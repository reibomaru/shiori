import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FaUserPlus, FaXmark, FaTrash } from "react-icons/fa6";
import { api, type Project } from "../api";
import { useAuth } from "./AuthGate";
import ConfirmDialog from "./ConfirmDialog";

/**
 * プロジェクトのメンバー管理モーダル。メンバーはメール一覧を閲覧でき、
 * オーナーはメール招待・削除ができる。参加はメール招待制。
 */
export default function MembersDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useTranslation(["dialogs", "common"]);
  const { me } = useAuth();
  const isOwner = me.email.toLowerCase() === project.ownerEmail.toLowerCase();
  const [members, setMembers] = useState<string[]>(project.memberEmails);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMembers(project.id)
      .then((m) => setMembers(m.members))
      .catch(() => {});
  }, [project.id]);

  const invite = async () => {
    const e = email.trim();
    if (!e) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api.addMember(project.id, e);
      setMembers(m.members);
      setEmail("");
    } catch {
      setError(t("members.inviteError"));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (target: string) => {
    setBusy(true);
    try {
      const m = await api.removeMember(project.id, target);
      setMembers(m.members);
    } catch {
      setError(t("members.removeError"));
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{t("members.title", { name: project.name })}</h3>
          <button onClick={onClose} aria-label={t("common:actions.close")} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200">
            <FaXmark />
          </button>
        </div>

        {isOwner && (
          <div className="mb-4 flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
              placeholder={t("members.invitePlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
            />
            <button
              onClick={invite}
              disabled={busy || !email.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
            >
              <FaUserPlus /> {t("members.invite")}
            </button>
          </div>
        )}
        {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {members.map((m) => {
            const owner = m.toLowerCase() === project.ownerEmail.toLowerCase();
            return (
              <li key={m} className="flex items-center justify-between py-2.5 text-sm">
                <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">
                  {m}
                  {owner && <span className="ml-2 rounded bg-cyan-100 px-1.5 py-0.5 text-xs text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">{t("members.owner")}</span>}
                </span>
                {isOwner && !owner && (
                  <button
                    onClick={() => setRemoving(m)}
                    disabled={busy}
                    aria-label={t("members.removeMember")}
                    className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                  >
                    <FaTrash size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {!isOwner && <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">{t("members.ownerOnly")}</p>}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title={t("members.confirmTitle")}
        message={removing ? t("members.confirmMessage", { email: removing }) : undefined}
        busy={busy}
        onConfirm={() => removing && doRemove(removing)}
        onCancel={() => setRemoving(null)}
      />
    </div>,
    document.body,
  );
}
