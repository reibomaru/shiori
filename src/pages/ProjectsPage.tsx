import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaMapLocationDot, FaUsers, FaTrash, FaPen, FaArrowRightFromBracket } from "react-icons/fa6";
import { api, displayNameOf, type Project } from "../api";
import { useAuth } from "../components/AuthGate";
import { Avatar } from "../components/Avatar";
import { Tooltip } from "../components/Tooltip";
import ProfileDialog from "../components/ProfileDialog";
import MembersDialog from "../components/MembersDialog";
import RenameProjectDialog from "../components/RenameProjectDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { Logo } from "../components/Logo";

/**
 * プロジェクト一覧・作成画面（ログイン後のトップ `/`）。
 * 自分がメンバーのプロジェクトを一覧し、開く・作成・（オーナーは）削除・メンバー管理を行う。
 */
export default function ProjectsPage() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [membersOf, setMembersOf] = useState<Project | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await api.listProjects());
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const p = await api.createProject(name.trim());
      navigate(`/projects/${p.id}/itinerary`);
    } finally {
      setCreating(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteProject(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mesh-light min-h-screen">
      <header className="tech-mesh flex items-center justify-between border-b border-cyan-400/10 px-6 py-4 text-white">
        <div className="flex items-center gap-2.5">
          <Logo size={26} className="text-cyan-300" />
          <h1 className="brand-wordmark font-mono-tech text-xl font-bold lowercase tracking-wide">shiori</h1>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <button
            onClick={() => setProfileOpen(true)}
            title="プロフィールを編集"
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-slate-300 transition-colors hover:bg-white/10"
          >
            <Avatar src={me.avatarUrl} name={me.displayName ?? me.name} email={me.email} size={26} />
            <span className="max-w-[12rem] truncate">{displayNameOf(me)}</span>
          </button>
          <Tooltip label="ログアウト" side="bottom">
            <button
              onClick={() => void logout()}
              aria-label="ログアウト"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <FaArrowRightFromBracket size={14} />
            </button>
          </Tooltip>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="mb-4 text-xl font-bold text-slate-800">プロジェクト</h2>

        {/* 新規作成 */}
        <div className="mb-6 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            // 日本語変換確定の Enter では作成しない（変換中は isComposing=true）。
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) create();
            }}
            placeholder="新しいプロジェクト名（例: 台湾旅行 2026）"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
          />
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 disabled:opacity-50"
          >
            <FaPlus /> 作成
          </button>
        </div>

        {loading ? (
          <p className="py-16 text-center text-slate-400">読み込み中…</p>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <p className="text-slate-500">まだプロジェクトがありません。</p>
            <p className="mt-1 text-sm text-slate-400">上の入力欄から最初のプロジェクトを作成しましょう。</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => {
              const owner = me.email.toLowerCase() === p.ownerEmail.toLowerCase();
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <button
                    onClick={() => navigate(`/projects/${p.id}/itinerary`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <FaMapLocationDot className="shrink-0 text-cyan-700" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">{p.name}</span>
                      <span className="text-xs text-slate-400">{p.memberEmails.length} 人のメンバー{owner ? "・オーナー" : ""}</span>
                    </span>
                  </button>
                  <button
                    onClick={() => setMembersOf(p)}
                    title="メンバー"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <FaUsers />
                  </button>
                  {owner && (
                    <button
                      onClick={() => setRenameTarget(p)}
                      title="名前を変更"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                    >
                      <FaPen size={13} />
                    </button>
                  )}
                  {owner && (
                    <button
                      onClick={() => setDeleteTarget(p)}
                      title="削除"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <FaTrash size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      {membersOf && <MembersDialog project={membersOf} onClose={() => setMembersOf(null)} />}
      {renameTarget && (
        <RenameProjectDialog
          project={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={(updated) => setProjects((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="プロジェクトを削除しますか？"
        message={deleteTarget ? `「${deleteTarget.name}」の旅程・スポット・予算・会話履歴がすべて削除されます。元に戻せません。` : undefined}
        busy={deleting}
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
