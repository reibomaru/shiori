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

const SESSION_COOKIE = "session";
const IS_PROD = process.env.NODE_ENV === "production";
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const SESSION_TTL_SEC = 60 * 60 * 24 * 7; // 7 日

/** JWT に載せるセッションクレーム。 */
interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  exp: number;
}

/** カンマ区切り env を小文字トリム済み配列にする。 */
function parseList(v: string | undefined): string[] {
  return (v || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ALLOWED_EMAILS = parseList(process.env.ALLOWED_EMAILS);
const ALLOWED_EMAIL_DOMAINS = parseList(process.env.ALLOWED_EMAIL_DOMAINS);

/**
 * allowlist 判定（招待制）。許可メール完全一致 or 許可ドメイン一致で true。
 * 両方未設定なら deny-all（誰も入れない安全側）。
 */
export function isEmailAllowed(email: string): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  if (ALLOWED_EMAILS.length === 0 && ALLOWED_EMAIL_DOMAINS.length === 0) return false;
  if (ALLOWED_EMAILS.includes(e)) return true;
  const domain = e.split("@")[1] ?? "";
  return domain !== "" && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

/** JWT を署名して session Cookie にセットする。 */
async function issueSession(c: Context, user: { sub: string; email: string; name: string }): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  const token = await sign({ sub: user.sub, email: user.email, name: user.name, exp }, SESSION_SECRET, "HS256");
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
  return next();
};

/** Hono アプリに /auth/* ルートを登録する。 */
export function registerAuthRoutes(app: Hono): void {
  if (!SESSION_SECRET) {
    console.warn("⚠ SESSION_SECRET が未設定です。ログインは機能しません（Cookie 署名鍵が無い）。");
  }
  if (ALLOWED_EMAILS.length === 0 && ALLOWED_EMAIL_DOMAINS.length === 0) {
    console.warn(
      "⚠ ALLOWED_EMAILS / ALLOWED_EMAIL_DOMAINS が未設定です。招待制のため、このままでは誰もログインできません。",
    );
  }

  // ---- 現在のユーザー（フロントの認証ゲート用）----
  app.get("/auth/me", async (c) => {
    const s = await getSession(c);
    if (!s) return c.json({ error: "unauthenticated" }, 401);
    return c.json({ email: s.email, name: s.name });
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
      await issueSession(c, {
        sub,
        email: process.env.DEV_LOGIN_EMAIL || `${sub}@example.com`,
        name: process.env.DEV_LOGIN_NAME || "Dev User",
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
      if (!isEmailAllowed(email)) {
        return c.html(
          `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;line-height:1.7;color:#334155">
           <h2>ログインできませんでした</h2>
           <p>このアカウント（<b>${email}</b>）はまだ許可されていません。<br>管理者に招待を依頼してください。</p>
           <p><a href="/">トップへ戻る</a></p></body>`,
          403,
        );
      }
      await issueSession(c, { sub: String(sub), email, name: gUser.name || email });
      return c.redirect("/");
    });
  } else {
    console.warn("⚠ GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET が未設定です。Google ログインは無効です。");
  }
}
