// ============================================================
//  Gmail 連携（購入完了メール→実費の取り込み）。
//
//  このアプリは 2 人用・Basic 認証下の単一利用想定なので、単一の Google
//  アカウントを OAuth（オフライン）で連携し、リフレッシュトークンを DB に
//  1 行だけ持つ（gmail_auth）。アクセストークンは都度リフレッシュして取得する。
//
//  依存を増やさないため googleapis は使わず、Google の OAuth / Gmail REST を
//  グローバル fetch で直接叩く。GEMINI_API_KEY 等と同様、環境変数
//  （GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）が未設定なら機能は無効化する。
// ============================================================
import type { DatabaseSync } from "node:sqlite";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
// 読み取り専用。購入完了メールの検索と本文取得にのみ使う。
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";

export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface GmailMessageBody {
  id: string;
  subject: string;
  from: string;
  date: string;
  text: string;
}

const CLIENT_ID = () => process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = () => process.env.GOOGLE_CLIENT_SECRET ?? "";

/** OAuth クライアントの資格情報がサーバに設定されているか。 */
export function isConfigured(): boolean {
  return !!CLIENT_ID() && !!CLIENT_SECRET();
}

/**
 * OAuth のリダイレクト URI。環境変数を優先し、無ければリクエスト元 origin から組み立てる。
 * Google Cloud の「承認済みリダイレクト URI」にこの値を登録しておく必要がある。
 */
export function redirectUri(origin: string): string {
  return process.env.GMAIL_REDIRECT_URI || `${origin}/api/gmail/oauth/callback`;
}

/** 同意画面へ送る認可 URL を組み立てる（offline + consent で refresh_token を確実に得る）。 */
export function buildAuthUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID(),
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/** 認可コードをトークンに交換する。 */
export async function exchangeCode(code: string, origin: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      redirect_uri: redirectUri(origin),
      grant_type: "authorization_code",
    }),
  });
  return (await res.json()) as TokenResponse;
}

/** リフレッシュトークンからアクセストークンを取得する。 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) {
    throw new Error(json.error_description || json.error || "アクセストークンの取得に失敗しました。");
  }
  return json.access_token;
}

/** 連携先アカウントのメールアドレスを取得する（表示用）。 */
export async function fetchEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
    const json = (await res.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

// ---- 認証情報の永続化（gmail_auth に 1 行） -----------------

export function saveAuth(db: DatabaseSync, refreshToken: string, email: string | null): void {
  db.prepare(
    `INSERT INTO gmail_auth (id, refresh_token, email, connected_at) VALUES (1, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET refresh_token = excluded.refresh_token, email = excluded.email, connected_at = datetime('now')`,
  ).run(refreshToken, email);
}

export function clearAuth(db: DatabaseSync): void {
  db.prepare("DELETE FROM gmail_auth WHERE id = 1").run();
}

function getRefreshToken(db: DatabaseSync): string | null {
  const row = db.prepare("SELECT refresh_token FROM gmail_auth WHERE id = 1").get() as
    | { refresh_token: string | null }
    | undefined;
  return row?.refresh_token ?? null;
}

/** 連携状態（設定済みか・接続済みか・アカウント）を返す。 */
export function getStatus(db: DatabaseSync): { configured: boolean; connected: boolean; email: string | null } {
  const row = db.prepare("SELECT email, refresh_token FROM gmail_auth WHERE id = 1").get() as
    | { email: string | null; refresh_token: string | null }
    | undefined;
  return {
    configured: isConfigured(),
    connected: !!row?.refresh_token,
    email: row?.email ?? null,
  };
}

/** 保存済みリフレッシュトークンからアクセストークンを得る。未連携なら例外。 */
async function accessTokenFor(db: DatabaseSync): Promise<string> {
  const rt = getRefreshToken(db);
  if (!rt) throw new Error("Gmail が未連携です。先に連携してください。");
  return refreshAccessToken(rt);
}

// ---- メッセージの検索・取得 --------------------------------

/** ヘッダー配列から名前で値を取り出す。 */
function header(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

/** 購入/予約完了メールを検索して要約一覧を返す。 */
export async function searchMessages(db: DatabaseSync, query: string, max = 15): Promise<GmailMessageSummary[]> {
  const token = await accessTokenFor(db);
  const listRes = await fetch(
    `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const list = (await listRes.json()) as { messages?: Array<{ id: string }>; error?: { message: string } };
  if (list.error) throw new Error(list.error.message);
  const ids = (list.messages ?? []).map((m) => m.id);

  // 各メッセージのメタ情報だけ（metadata format）を取得して一覧を作る。
  const summaries = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(
        `${GMAIL_API}/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const m = (await r.json()) as {
        snippet?: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const hs = m.payload?.headers ?? [];
      return {
        id,
        subject: header(hs, "Subject") || "(件名なし)",
        from: header(hs, "From"),
        date: header(hs, "Date"),
        snippet: m.snippet ?? "",
      } satisfies GmailMessageSummary;
    }),
  );
  return summaries;
}

/** base64url をデコードして UTF-8 文字列にする。 */
function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/** MIME パートを再帰的に走査し、text/plain（無ければ text/html を粗く平文化）を集める。 */
function extractText(payload: unknown): string {
  const parts: string[] = [];
  const walk = (node: {
    mimeType?: string;
    body?: { data?: string };
    parts?: unknown[];
  }): void => {
    if (!node) return;
    if (node.body?.data && node.mimeType?.startsWith("text/")) {
      const raw = decodeB64Url(node.body.data);
      parts.push(node.mimeType === "text/html" ? raw.replace(/<[^>]+>/g, " ") : raw);
    }
    for (const child of node.parts ?? []) walk(child as Parameters<typeof walk>[0]);
  };
  walk(payload as Parameters<typeof walk>[0]);
  // 余分な空白を圧縮しつつ、長すぎる本文は抽出コスト削減のため切り詰める。
  return parts.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
}

/** メッセージ 1 通の本文（平文）とヘッダーを取得する。 */
export async function getMessage(db: DatabaseSync, id: string): Promise<GmailMessageBody> {
  const token = await accessTokenFor(db);
  const res = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const m = (await res.json()) as {
    payload?: { headers?: Array<{ name: string; value: string }> };
    error?: { message: string };
  };
  if (m.error) throw new Error(m.error.message);
  const hs = m.payload?.headers ?? [];
  return {
    id,
    subject: header(hs, "Subject") || "(件名なし)",
    from: header(hs, "From"),
    date: header(hs, "Date"),
    text: extractText(m.payload),
  };
}
