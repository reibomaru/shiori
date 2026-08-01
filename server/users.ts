// ============================================================
//  ユーザー台帳 + Firestore クライアント。
//
//  認証（Google SSO）で解決した Google `sub` をキーに、ユーザーの
//  プロフィール（email/name とロール、表示名・アバター）を Firestore の
//  users コレクションで管理する。ログインはオープン（誰でも可）で、アクセス
//  境界はプロジェクトメンバーシップ（server/projects.ts）が担う。role は
//  将来のプラットフォーム管理用に保持する（現状は未使用）。
//
//  プロフィール（displayName / avatar）は本人が随時編集でき、/auth/me が
//  毎回読み出して反映する（セッション JWT は再発行しない）。
//
//  Firestore クライアントは projects.ts と共有する（firestore() を export）。
//  認証情報は Cloud Run では ADC（実行 SA）、ローカルでは
//  GOOGLE_APPLICATION_CREDENTIALS か Firestore エミュレータを使う。
// ============================================================
import { Firestore, FieldValue } from "@google-cloud/firestore";

const COLLECTION = process.env.FIRESTORE_USERS_COLLECTION || "users";

/** ユーザーのロール（将来のプラットフォーム管理用）。 */
export type Role = "admin" | "user";

/** ログインユーザーの識別情報 + プロフィール。 */
export interface UserRecord {
  sub: string;
  email: string;
  name: string;
  role: Role;
  /** 本人が設定した表示名（未設定なら name を使う）。 */
  displayName?: string;
  /** Google プロフィール写真 URL（ログイン時に取得・アバター初期値）。 */
  picture?: string;
  /** 本人がアップロードしたアバター（リサイズ済みの data URL）。 */
  avatar?: string;
}

/** 不明値を安全に Role へ丸める（既定 user）。 */
function toRole(v: unknown): Role {
  return v === "admin" ? "admin" : "user";
}

/** Firestore ドキュメントを UserRecord へマップする。 */
function toUserRecord(id: string, x: Record<string, unknown>): UserRecord {
  return {
    sub: id,
    email: typeof x.email === "string" ? x.email : "",
    name: typeof x.name === "string" ? x.name : "",
    role: toRole(x.role),
    displayName: typeof x.displayName === "string" ? x.displayName : undefined,
    picture: typeof x.picture === "string" ? x.picture : undefined,
    avatar: typeof x.avatar === "string" ? x.avatar : undefined,
  };
}

/** アバター表示用 URL（アップロード優先、無ければ Google 写真）。 */
export function avatarUrlOf(rec: Pick<UserRecord, "avatar" | "picture">): string | null {
  return rec.avatar || rec.picture || null;
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
 * - 既存: email / name / picture / updatedAt を更新し、既存の role を返す。
 * オープンログインなので利用可否ゲートは無い（アクセス境界はプロジェクト側）。
 */
export async function upsertUserOnLogin(
  sub: string,
  email: string,
  name: string,
  picture?: string,
): Promise<UserRecord> {
  const ref = firestore().collection(COLLECTION).doc(sub);
  const snap = await ref.get();
  const now = new Date().toISOString();
  const pic = picture ? { picture } : {};

  if (!snap.exists) {
    const doc = { sub, email, name, role: "user", createdAt: now, updatedAt: now, ...pic };
    await ref.set(doc);
    return toUserRecord(sub, doc);
  }

  const data = snap.data() ?? {};
  const patch = { email, name, updatedAt: now, ...pic };
  await ref.set(patch, { merge: true });
  return toUserRecord(sub, { ...data, ...patch });
}

/** 本人のプロフィール（表示名・アバター等）を取得する。未登録は null。 */
export async function getUserProfile(sub: string): Promise<UserRecord | null> {
  const snap = await firestore().collection(COLLECTION).doc(sub).get();
  if (!snap.exists) return null;
  return toUserRecord(sub, snap.data() ?? {});
}

/**
 * 本人のプロフィールを更新する（存在必須）。
 * - displayName: 空文字 / null はフィールド削除（＝name にフォールバック）。
 * - avatar: null はフィールド削除（＝Google 写真にフォールバック）。
 * undefined のフィールドは変更しない。更新後のレコードを返す。
 */
export async function updateOwnProfile(
  sub: string,
  patch: { displayName?: string | null; avatar?: string | null },
): Promise<UserRecord | null> {
  const ref = firestore().collection(COLLECTION).doc(sub);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.displayName !== undefined) {
    update.displayName = patch.displayName ? patch.displayName : FieldValue.delete();
  }
  if (patch.avatar !== undefined) {
    update.avatar = patch.avatar === null ? FieldValue.delete() : patch.avatar;
  }
  await ref.set(update, { merge: true });

  // FieldValue.delete() の反映後の正確な状態を返すため読み直す。
  const fresh = await ref.get();
  return toUserRecord(sub, fresh.data() ?? {});
}
