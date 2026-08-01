// ============================================================
//  ユーザー台帳 + Firestore クライアント。
//
//  認証（Google SSO）で解決した Google `sub` をキーに、ユーザーの
//  プロフィール（email/name）と利用許可（allowed）・ロールを Firestore の
//  users コレクションで管理する。ログインは許可制: 新規ユーザーは
//  allowed=false（承認待ち）で登録され、承認（allowed=true）されるまで
//  アプリを使えない。承認済みユーザーの中で、どのプロジェクトを見られるかは
//  プロジェクトメンバーシップ（server/projects.ts）が担う。role は将来の
//  プラットフォーム管理用に保持する（現状は未使用）。
//
//  承認は Firestore の該当ドキュメントを allowed=true にする
//  （初期は GCP コンソール / gcloud で直接編集）。
//
//  Firestore クライアントは projects.ts と共有する（firestore() を export）。
//  認証情報は Cloud Run では ADC（実行 SA）、ローカルでは
//  GOOGLE_APPLICATION_CREDENTIALS か Firestore エミュレータを使う。
// ============================================================
import { Firestore } from "@google-cloud/firestore";

const COLLECTION = process.env.FIRESTORE_USERS_COLLECTION || "users";

/** ユーザーのロール（将来のプラットフォーム管理用）。 */
export type Role = "admin" | "user";

/** ログインユーザーの識別情報。 */
export interface UserRecord {
  sub: string;
  email: string;
  name: string;
  /** アプリの利用許可（承認制）。新規は false、承認で true。 */
  allowed: boolean;
  role: Role;
}

/** 不明値を安全に Role へ丸める（既定 user）。 */
function toRole(v: unknown): Role {
  return v === "admin" ? "admin" : "user";
}

let _fs: Firestore | null = null;
/** 共有 Firestore クライアント（users / projects で使う）。 */
export function firestore(): Firestore {
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
 * ログイン時に users を JIT upsert し、利用許可とロールを返す。
 * - 新規: allowed=false（承認待ち）/ role=user で作成。
 * - 既存: email / name / updatedAt を更新し、既存の allowed / role を返す。
 * 利用可否は「ログイン時のみ」判定する（server/auth.ts のコールバック）。
 */
export async function upsertUserOnLogin(sub: string, email: string, name: string): Promise<UserRecord> {
  const ref = firestore().collection(COLLECTION).doc(sub);
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
