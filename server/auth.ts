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
import { upsertUserOnLogin, type Role } from "./users.ts";

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

/**
 * 承認待ちユーザーに見せる HTML。
 * - isNew=true: 初回ログイン（今まさに申請を受け付けた）
 * - isNew=false: すでに申請済み（承認待ち）で再びログインを試みた
 */
function pendingHtml(email: string, isNew: boolean): string {
  const title = isNew ? "利用申請を受け付けました" : "承認待ちです";
  const lead = isNew
    ? `アカウント（<b>${email}</b>）の利用申請を受け付けました。<br>管理者の承認後にご利用いただけます。`
    : `アカウント（<b>${email}</b>）は申請済みです。<br>現在、管理者の承認待ちの状態です。`;
  const badge = isNew
    ? `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:#ecfdf5;color:#047857;font-size:12px;font-weight:600">申請を受け付けました</span>`
    : `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;background:#fffbeb;color:#b45309;font-size:12px;font-weight:600">承認待ち</span>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} — shiori</title></head>
    <body style="margin:0;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;color:#334155">
      <div style="max-width:30rem;margin:6vh auto;padding:0 16px">
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px 28px 24px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
          <div style="margin-bottom:12px">${badge}</div>
          <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${title}</h1>
          <p style="margin:0 0 12px;line-height:1.8">${lead}</p>
          <p style="margin:0 0 20px;line-height:1.8;color:#64748b;font-size:14px">承認されたら、もう一度ログインしてください。</p>
          <a href="/auth/google" style="display:inline-block;padding:10px 16px;border-radius:10px;background:#0e7490;color:#fff;font-weight:600;text-decoration:none;font-size:14px">ログインし直す</a>
          <a href="/" style="display:inline-block;margin-left:8px;padding:10px 12px;color:#64748b;text-decoration:none;font-size:14px">トップへ戻る</a>
        </div>
      </div>
    </body></html>`;
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
  app.get("/auth/me", async (c) => {
    const s = await getSession(c);
    if (!s) return c.json({ error: "unauthenticated" }, 401);
    return c.json({ email: s.email, name: s.name, role: s.role === "admin" ? "admin" : "user" });
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
        return c.text("Google 認証に失敗しました。もう一度お試しください。", 401);
      }
      // 台帳へ JIT 登録し、利用可否は「ログイン時のみ」ここで判定する（許可制）。
      // 新規ユーザーは allowed=false（承認待ち）で作られ、セッションは発行しない。
      // 承認済みユーザーの中で、どのプロジェクトを見られるかはメンバーシップ側で担保。
      let user;
      try {
        user = await upsertUserOnLogin(String(sub), email, gUser.name || email);
      } catch (e) {
        console.error("Firestore users への登録に失敗しました:", e);
        return c.text("ログイン処理でエラーが発生しました。時間をおいて再度お試しください。", 500);
      }
      if (!user.allowed) {
        // 初回申請と「すでに申請済み（承認待ち）」で文言を出し分ける。
        return c.html(pendingHtml(email, user.isNew), 403);
      }
      await issueSession(c, { sub: String(sub), email, name: gUser.name || email, role: user.role });
      return c.redirect("/");
    });
  } else {
    console.warn("⚠ GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET が未設定です。Google ログインは無効です。");
  }
}
