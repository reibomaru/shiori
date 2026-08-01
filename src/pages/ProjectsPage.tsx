import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaMapLocationDot, FaUsers, FaTrash, FaArrowRightFromBracket, FaCircleUser } from "react-icons/fa6";
import { api, type Project } from "../api";
import { useAuth } from "../components/AuthGate";
import MembersDialog from "../components/MembersDialog";
import ConfirmDialog from "../components/ConfirmDialog";

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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      navigate(`/p/${p.id}/itinerary`);
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
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-gradient-to-r from-cyan-800 to-blue-900 px-6 py-4 text-white">
        <h1 className="text-lg font-bold">旅のしおり</h1>
        <div className="flex items-center gap-2 text-sm">
          <FaCircleUser className="text-cyan-100/80" />
          <span className="max-w-[12rem] truncate text-cyan-50/90" title={me.email}>
            {me.name || me.email}
          </span>
          <button
            onClick={() => void logout()}
            aria-label="ログアウト"
            title="ログアウト"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-cyan-100/80 hover:bg-white/10 hover:text-white"
          >
            <FaArrowRightFromBracket size={14} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="mb-4 text-xl font-bold text-slate-800">プロジェクト</h2>

        {/* 新規作成 */}
        <div className="mb-6 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="新しいプロジェクト名（例: 台湾旅行 2026）"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-cyan-500 focus:outline-none"
          />
          <button
            onClick={create}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
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
                    onClick={() => navigate(`/p/${p.id}/itinerary`)}
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

      {membersOf && <MembersDialog project={membersOf} onClose={() => setMembersOf(null)} />}
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
