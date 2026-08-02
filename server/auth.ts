// ============================================================
//  認証（Google SSO / OpenID Connect）。
//
//  - Google の OAuth 2.0 / OIDC でログインし、安定した一意 ID（`sub`）を
//    ユーザー識別子として採用する（storage 分離の選択キー）。
//  - 認証セッションはステートレスな署名付き JWT を HttpOnly Cookie で持つ
//    （グローバル DB を持たず鶏卵問題を回避）。
//  - allowlist（許可メール／ドメイン）に一致した場合のみログインを許す。
//
//  ルート:
//    GET  /auth/google            Google 認可 → コールバック（同一パス）
//    GET  /auth/me                現在のユーザー（未ログインは 401）
//    POST /auth/logout            Cookie 破棄
//    GET  /auth/dev-login         開発専用バイパス（本番では無効）
// ============================================================
import type { Context, Hono, MiddlewareHandler } from "hono";
import { googleAuth } from "@hono/oauth-providers/google";
import { sign, verify } from "hono/jwt";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { upsertUserOnLogin, getUserProfile, avatarUrlOf, type Role } from "./users.ts";

const SESSION_COOKIE = "session";
const IS_PROD = process.env.NODE_ENV === "production";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 日

/** JWT に載せるセッションクレーム。 */
interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  role: Role;
  exp: number;
}

/** HTML 埋め込み前のエスケープ（メール等のユーザー由来文字列用）。 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** shiori ロゴ（ノードグラフ）の SVG。確定経路を破線が流れるアニメーションも React 版 Logo と揃える。 */
const LOGO_SVG = `<svg width="34" height="34" viewBox="0 0 32 32" fill="none" role="img" aria-label="shiori" style="color:#22d3ee">
  <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#a06bff"/></linearGradient></defs>
  <g stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity="0.35"><line x1="7" y1="14" x2="11" y2="23"/><line x1="11" y1="23" x2="19" y2="25"/><line x1="14" y1="10" x2="11" y2="23"/><line x1="21" y1="15" x2="19" y2="25"/><line x1="19" y1="25" x2="26" y2="22"/></g>
  <g fill="currentColor" opacity="0.45"><circle cx="11" cy="23" r="1.3"/><circle cx="19" cy="25" r="1.3"/></g>
  <path d="M7 14 L14 10 L21 15 L26 22" stroke="url(#lg)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 5">
    <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.4s" repeatCount="indefinite"/>
  </path>
  <g fill="url(#lg)"><circle cx="7" cy="14" r="2"/><circle cx="14" cy="10" r="2"/><circle cx="21" cy="15" r="2"/><circle cx="26" cy="22" r="2"/></g>
</svg>`;

/**
 * 認証系の素の HTML ページ（React 外）を、アプリのテッキーテーマで描画する共通シェル。
 * フロントの Tailwind に依存しないよう、テーマ（Ubuntu フォント / メッシュ背景 /
 * shiori ワードマーク）は inline で完結させる。
 */
function authPage(opts: { heading: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(opts.heading)} · shiori</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&family=Ubuntu+Mono:wght@400;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 24px;
    display: grid; place-items: center;
    font-family: "Ubuntu", "Noto Sans JP", system-ui, -apple-system, "Hiragino Sans", sans-serif;
    color: #e2e8f0;
    background-color: #0b1120;
    background-image:
      radial-gradient(680px 340px at 100% -10%, rgba(160,107,255,.10), transparent 60%),
      radial-gradient(680px 340px at 0% 0%, rgba(34,211,238,.08), transparent 55%),
      linear-gradient(rgba(148,163,184,.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148,163,184,.05) 1px, transparent 1px);
    background-size: auto, auto, 28px 28px, 28px 28px;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%; max-width: 30rem; padding: 32px; border-radius: 16px;
    background: rgba(255,255,255,.05); line-height: 1.8;
    box-shadow: inset 0 0 0 1px rgba(34,211,238,.15), 0 18px 40px rgba(0,0,0,.4);
    backdrop-filter: blur(6px);
  }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
  .wordmark {
    font-family: "Ubuntu Mono", ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 28px; font-weight: 700; letter-spacing: .04em;
    background-image: linear-gradient(120deg, #22d3ee, #a06bff);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  h1 { font-size: 20px; margin: 0 0 14px; color: #f1f5f9; }
  p { margin: 0 0 12px; font-size: 14px; color: #cbd5e1; }
  b { color: #f1f5f9; font-weight: 600; }
  a.btn {
    display: inline-block; margin-top: 10px; padding: 10px 18px; border-radius: 10px;
    background: #22d3ee; color: #0b1120; font-weight: 600; text-decoration: none;
    transition: background-color .15s ease;
  }
  a.btn:hover { background: #67e8f9; }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">${LOGO_SVG}<span class="wordmark">shiori</span></div>
    <h1>${escapeHtml(opts.heading)}</h1>
    ${opts.bodyHtml}
  </div>
</body>
</html>`;
}

/** 承認待ちユーザーに見せる HTML（利用申請は受理済み・承認待ちである旨）。 */
function pendingHtml(email: string): string {
  return authPage({
    heading: "利用申請を受け付けました",
    bodyHtml: `
    <p>アカウント（<b>${escapeHtml(email)}</b>）の利用申請を受け付けました。<br />管理者の承認後にご利用いただけます。</p>
    <p>承認されたら、もう一度ログインしてください。</p>
    <p><a class="btn" href="/">トップへ戻る</a></p>`,
  });
}

/** 認証エラー時に見せる HTML。 */
function authErrorHtml(message: string): string {
  return authPage({
    heading: "ログインできませんでした",
    bodyHtml: `
    <p>${escapeHtml(message)}</p>
    <p><a class="btn" href="/">トップへ戻る</a></p>`,
  });
}

/** JWT を署名して session Cookie にセットする。 */
async function issueSession(c: Context, user: { sub: string; email: string; name: string; role: Role }): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const token = await sign(
    { sub: user.sub, email: user.email, name: user.name, role: user.role, exp },
    SESSION_SECRET,
    "HS256",
  );
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

/** Cookie の JWT を検証してクレームを返す（無効・失効・未提供は null）。 */
export async function getSession(c: Context): Promise<SessionClaims | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !SESSION_SECRET) return null;
  try {
    return (await verify(token, SESSION_SECRET, "HS256")) as unknown as SessionClaims;
  } catch {
    return null; // 署名不一致・期限切れなど
  }
}

/**
 * 認証必須ミドルウェア。検証済みの `sub` を c.set("userId") に立てる。
 * 未認証は 401（フロントがログイン画面へ誘導する）。
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const s = await getSession(c);
  if (!s || !s.sub) return c.json({ error: "unauthenticated" }, 401);
  c.set("userId", String(s.sub));
  c.set("userEmail", s.email ?? "");
  c.set("userName", s.name ?? "");
  c.set("userRole", s.role === "admin" ? "admin" : "user");
  return next();
};

/** Hono アプリに /auth/* ルートを登録する。 */
export function registerAuthRoutes(app: Hono): void {
  if (!SESSION_SECRET) {
    console.warn("⚠ SESSION_SECRET が未設定です。ログインは機能しません（Cookie 署名鍵が無い）。");
  }

  // ---- 現在のユーザー（フロントの認証ゲート用）----
  // 表示名・アバターは Firestore のプロフィールを毎回読み出して反映する
  // （本人が編集しても JWT を再発行せずに済ませるため）。台帳が読めない場合も
  // 認証情報（JWT クレーム）だけで最低限のログイン状態を返す。
  app.get("/auth/me", async (c) => {
    const s = await getSession(c);
    if (!s) return c.json({ error: "unauthenticated" }, 401);
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const rec = await getUserProfile(s.sub);
      if (rec) {
        displayName = rec.displayName ?? null;
        avatarUrl = avatarUrlOf(rec);
      }
    } catch (e) {
      console.error("プロフィールの取得に失敗しました:", e);
    }
    return c.json({
      email: s.email,
      name: s.name,
      role: s.role === "admin" ? "admin" : "user",
      displayName,
      avatarUrl,
    });
  });

  // ---- ログアウト（Cookie 破棄）----
  app.post("/auth/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // ---- 開発専用バイパス（Google 資格情報なしで storage 分離を検証）----
  // 本番では無効。DEV_LOGIN_SUB を設定したときのみ有効化する。
  if (!IS_PROD && process.env.DEV_LOGIN_SUB) {
    app.get("/auth/dev-login", async (c) => {
      const sub = process.env.DEV_LOGIN_SUB as string;
      // 管理者画面もオフラインで検証できるよう既定は admin（DEV_LOGIN_ROLE=user で切替）。
      await issueSession(c, {
        sub,
        email: process.env.DEV_LOGIN_EMAIL || `${sub}@example.com`,
        name: process.env.DEV_LOGIN_NAME || "Dev User",
        role: process.env.DEV_LOGIN_ROLE === "user" ? "user" : "admin",
      });
      return c.redirect("/");
    });
  }

  // ---- Google SSO（認可 + コールバックは同一パス）----
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (clientId && clientSecret) {
    app.use(
      "/auth/google",
      googleAuth({
        client_id: clientId,
        client_secret: clientSecret,
        scope: ["openid", "email", "profile"],
        // 承認済みリダイレクト URI は既定でこのルート自身（<origin>/auth/google）。
        // 明示したい場合は APP_BASE_URL から組み立てて上書きする。
        redirect_uri: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL.replace(/\/$/, "")}/auth/google` : undefined,
      }),
    );
    app.get("/auth/google", async (c) => {
      const gUser = c.get("user-google");
      const email = gUser?.email;
      const sub = gUser?.id;
      if (!gUser || !email || !sub) {
        return c.html(authErrorHtml("Google 認証に失敗しました。もう一度お試しください。"), 401);
      }
      // 台帳へ JIT 登録し、利用可否は「ログイン時のみ」ここで判定する（許可制）。
      // 新規ユーザーは allowed=false（承認待ち）で作られ、セッションは発行しない。
      // 承認済みユーザーの中で、どのプロジェクトを見られるかはメンバーシップ側で担保。
      let user;
      try {
        const picture = (gUser as { picture?: string }).picture;
        user = await upsertUserOnLogin(String(sub), email, gUser.name || email, picture);
      } catch (e) {
        console.error("Firestore users への登録に失敗しました:", e);
        return c.html(authErrorHtml("ログイン処理でエラーが発生しました。時間をおいて再度お試しください。"), 500);
      }
      if (!user.allowed) {
        return c.html(pendingHtml(email), 403);
      }
      await issueSession(c, { sub: String(sub), email, name: gUser.name || email, role: user.role });
      return c.redirect("/");
    });
  } else {
    console.warn("⚠ GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET が未設定です。Google ログインは無効です。");
  }
}
