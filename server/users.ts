// ============================================================
//  ユーザー台帳 + Firestore クライアント。
//
//  認証（Google SSO）で解決した Google `sub` をキーに、ユーザーの
//  プロフィール（email/name）とロールを Firestore の users コレクションで
//  管理する。ログインはオープン（誰でも可）で、アクセス境界はプロジェクト
//  メンバーシップ（server/projects.ts）が担う。role は将来のプラットフォーム
//  管理用に保持する（現状は未使用）。
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
 * ログイン時に users を JIT upsert し、ロールを返す。
 * - 新規: role=user で作成。
 * - 既存: email / name / updatedAt を更新し、既存の role を返す。
 * オープンログインなので利用可否ゲートは無い（アクセス境界はプロジェクト側）。
 */
export async function upsertUserOnLogin(sub: string, email: string, name: string): Promise<UserRecord> {
  const ref = firestore().collection(COLLECTION).doc(sub);
  const snap = await ref.get();
  const now = new Date().toISOString();

  if (!snap.exists) {
    await ref.set({ sub, email, name, role: "user", createdAt: now, updatedAt: now });
    return { sub, email, name, role: "user" };
  }

  const data = snap.data() ?? {};
  await ref.set({ email, name, updatedAt: now }, { merge: true });
  return { sub, email, name, role: toRole(data.role) };
}
