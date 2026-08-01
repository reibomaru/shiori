// ============================================================
//  ユーザー台帳（Firestore・KV）。
//
//  認証（Google SSO）とは別に、「誰が利用を許可されているか」を
//  Firestore の users コレクション（doc id = Google `sub`）で管理する。
//
//  - 初回ログイン時に JIT 登録し、新規ユーザーは allowed=false（承認待ち）。
//  - 利用可否は「ログイン時のみ」判定する（server/auth.ts のコールバック）。
//    承認は Firestore の該当ドキュメントを allowed=true にする（初期は GCP
//    コンソール / gcloud で直接編集。将来は管理者画面）。
//
//  Firestore を選んだ理由: ログイン時のみの低頻度アクセスでコスト微小、
//  マネージドで単体でも永続（travel.db の Litestream 対応を待たずに承認
//  フラグが保全される）。認証情報は Cloud Run では ADC（実行 SA）、
//  ローカルでは GOOGLE_APPLICATION_CREDENTIALS か Firestore エミュレータを使う。
// ============================================================
import { Firestore } from "@google-cloud/firestore";

const COLLECTION = process.env.FIRESTORE_USERS_COLLECTION || "users";

/** ユーザーのロール。admin は管理者画面で他ユーザーを操作できる。 */
export type Role = "admin" | "user";

/** users ドキュメント（KV 的な 1 レコード）。 */
export interface UserRecord {
  sub: string;
  email: string;
  name: string;
  allowed: boolean;
  role: Role;
  updatedAt?: string;
}

/** 不明値を安全に Role へ丸める（既定 user）。 */
function toRole(v: unknown): Role {
  return v === "admin" ? "admin" : "user";
}

let _fs: Firestore | null = null;
function fs(): Firestore {
  if (!_fs) {
    _fs = new Firestore({
      // projectId は Cloud Run ではメタデータから自動解決される。ローカルは env で指定。
      projectId: process.env.FIRESTORE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || undefined,
      databaseId: process.env.FIRESTORE_DATABASE_ID || "(default)",
    });
  }
  return _fs;
}

/**
 * 初回ログイン時に users を JIT 登録し、その利用許可状態とロールを返す。
 * - 新規: allowed=false（承認待ち）/ role=user で作成する。
 * - 既存: email / name / updatedAt を更新し、既存の allowed / role をそのまま返す。
 *   （allowed / role は管理者画面 or 直接編集でのみ変わる）
 */
export async function upsertUserOnLogin(sub: string, email: string, name: string): Promise<UserRecord> {
  const ref = fs().collection(COLLECTION).doc(sub);
  const snap = await ref.get();
  const now = new Date().toISOString();

  if (!snap.exists) {
    await ref.set({ sub, email, name, allowed: false, role: "user", createdAt: now, updatedAt: now });
    return { sub, email, name, allowed: false, role: "user" };
  }

  const data = snap.data() ?? {};
  await ref.set({ email, name, updatedAt: now }, { merge: true });
  return { sub, email, name, allowed: data.allowed === true, role: toRole(data.role) };
}

/** 全ユーザーを一覧する（管理者画面用・更新の新しい順）。 */
export async function listUsers(): Promise<UserRecord[]> {
  const snap = await fs().collection(COLLECTION).get();
  return snap.docs
    .map((d): UserRecord => {
      const x = d.data();
      return {
        sub: d.id,
        email: typeof x.email === "string" ? x.email : "",
        name: typeof x.name === "string" ? x.name : "",
        allowed: x.allowed === true,
        role: toRole(x.role),
        updatedAt: typeof x.updatedAt === "string" ? x.updatedAt : undefined,
      };
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

/** 管理者操作: 指定ユーザーの allowed / role を更新する（存在必須）。 */
export async function setUserFlags(
  sub: string,
  patch: { allowed?: boolean; role?: Role },
): Promise<UserRecord | null> {
  const ref = fs().collection(COLLECTION).doc(sub);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof patch.allowed === "boolean") update.allowed = patch.allowed;
  if (patch.role === "admin" || patch.role === "user") update.role = patch.role;
  await ref.set(update, { merge: true });

  const x = { ...(snap.data() ?? {}), ...update };
  return {
    sub,
    email: typeof x.email === "string" ? x.email : "",
    name: typeof x.name === "string" ? x.name : "",
    allowed: x.allowed === true,
    role: toRole(x.role),
    updatedAt: typeof x.updatedAt === "string" ? x.updatedAt : undefined,
  };
}
