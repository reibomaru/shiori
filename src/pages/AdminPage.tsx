import { useCallback, useEffect, useState } from "react";
import { FaUserShield, FaArrowsRotate } from "react-icons/fa6";
import { api, type AdminUser, type Role } from "../api";
import { useAuth } from "../components/AuthGate";

/** "YYYY-MM-DDTHH:MM:SS..." から日付＋時刻を短く表示する。 */
function fmtDate(s?: string): string {
  if (!s) return "—";
  return s.replace("T", " ").slice(0, 16);
}

/**
 * 管理者画面。users 台帳（Firestore）を一覧し、各ユーザーの利用許可（allowed）と
 * ロール（admin/user）を変更する。変更は対象ユーザーの次回ログインで反映される。
 * 自分自身の行は誤操作防止のため変更不可。
 */
export default function AdminPage() {
  const { me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySub, setBusySub] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.listUsers());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // allowed / role を変更する（楽観更新し、失敗したら再取得で戻す）。
  const patch = async (u: AdminUser, body: { allowed?: boolean; role?: Role }) => {
    setBusySub(u.sub);
    setUsers((prev) => prev.map((x) => (x.sub === u.sub ? { ...x, ...body } : x)));
    try {
      const updated = await api.updateUser(u.sub, body);
      setUsers((prev) => prev.map((x) => (x.sub === u.sub ? updated : x)));
      setError(null);
    } catch (e) {
      setError(String(e));
      await load();
    } finally {
      setBusySub(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <FaUserShield className="text-cyan-700" />
          ユーザー管理
        </h1>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          <FaArrowsRotate className={loading ? "animate-spin" : ""} />
          再読み込み
        </button>
      </header>

      <p className="mb-4 text-xs text-slate-500">
        利用許可・ロールの変更は、対象ユーザーの<b>次回ログイン</b>で反映されます。自分自身の権限は変更できません。
      </p>

      {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">ユーザー</th>
              <th className="px-4 py-3">ロール</th>
              <th className="px-4 py-3">利用許可</th>
              <th className="px-4 py-3">更新</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  読み込み中…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  ユーザーがいません。
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.email === me.email;
                const disabled = isSelf || busySub === u.sub;
                return (
                  <tr key={u.sub} className={isSelf ? "bg-cyan-50/40" : ""}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">
                        {u.name || "（名前未設定）"}
                        {isSelf && <span className="ml-2 text-xs text-cyan-700">（自分）</span>}
                      </div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      {/* 見た目を揃えるためネイティブ select ではなくセグメントボタンにする。 */}
                      <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
                        {(["user", "admin"] as Role[]).map((r) => (
                          <button
                            key={r}
                            disabled={disabled}
                            onClick={() => u.role !== r && patch(u, { role: r })}
                            className={`px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                              u.role === r ? "bg-cyan-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {r === "admin" ? "管理者" : "一般"}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        disabled={disabled}
                        onClick={() => patch(u, { allowed: !u.allowed })}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                          u.allowed
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {u.allowed ? "許可中" : "停止中"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(u.updatedAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
