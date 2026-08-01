import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { FaGoogle } from "react-icons/fa6";
import { api, type Me } from "../api";
import { Logo } from "./Logo";

interface AuthCtx {
  me: Me;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/** ログイン中のユーザー情報とログアウトを提供する（AuthGate 配下でのみ有効）。 */
export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthGate");
  return c;
}

/** ログイン画面（未認証時に表示）。 */
function LoginScreen() {
  return (
    <div className="tech-mesh flex min-h-screen items-center justify-center p-6 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-white/5 p-8 text-center shadow-xl ring-1 ring-inset ring-cyan-400/15 backdrop-blur">
        <div className="mb-4 flex items-center justify-center gap-2.5">
          <Logo size={40} className="text-cyan-300" />
          <span className="brand-wordmark font-mono-tech text-3xl font-bold lowercase tracking-wide">shiori</span>
        </div>
        <h1 className="mb-2 text-lg font-semibold text-slate-100">旅の計画をはじめる</h1>
        <p className="mb-8 text-sm text-slate-400">Google アカウントでログインして、あなたの旅程を作成しましょう。</p>
        {/* トップレベル遷移で OAuth を開始する（fetch ではない）。 */}
        <a
          href="/auth/google"
          className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-semibold text-slate-800 transition hover:bg-slate-100"
        >
          <FaGoogle className="text-lg" />
          Google でログイン
        </a>
      </div>
    </div>
  );
}

/**
 * 認証ゲート。マウント時に /auth/me を叩き、
 *   - ローディング中: スピナー
 *   - 未認証: ログイン画面
 *   - 認証済み: 子（アプリ本体）を描画
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ loading: boolean; me: Me | null }>({ loading: true, me: null });

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((me) => alive && setState({ loading: false, me }))
      .catch(() => alive && setState({ loading: false, me: null }));
    return () => {
      alive = false;
    };
  }, []);

  if (state.loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-400">読み込み中…</div>;
  }
  if (!state.me) return <LoginScreen />;

  const logout = async () => {
    await api.logout();
    window.location.reload();
  };

  return <Ctx.Provider value={{ me: state.me, logout }}>{children}</Ctx.Provider>;
}
