import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api, type Me } from "../api";
import { LandingPage } from "./LandingPage";

interface AuthCtx {
  me: Me;
  logout: () => Promise<void>;
  /** プロフィール更新後などに、現在のユーザー情報を差し替える（サイドバー等へ即時反映）。 */
  applyMe: (me: Me) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

/** ログイン中のユーザー情報とログアウトを提供する（AuthGate 配下でのみ有効）。 */
export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthGate");
  return c;
}

/**
 * 認証ゲート。マウント時に /auth/me を叩き、
 *   - ローディング中: スピナー
 *   - 未認証: ランディングページ（LP）
 *   - 認証済み: 子（アプリ本体）を描画
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
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
    return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-400">{t("common:state.loading")}</div>;
  }
  if (!state.me) return <LandingPage />;

  const logout = async () => {
    await api.logout();
    window.location.reload();
  };

  const applyMe = (me: Me) => setState((s) => ({ ...s, me }));

  return <Ctx.Provider value={{ me: state.me, logout, applyMe }}>{children}</Ctx.Provider>;
}
