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

/** users ドキュメント（KV 的な 1 レコード）。 */
export interface UserRecord {
  sub: string;
  email: string;
  name: string;
  allowed: boolean;
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
 * 初回ログイン時に users を JIT 登録し、その利用許可状態を返す。
 * - 新規: allowed=false（承認待ち）で作成する。
 * - 既存: email / name / updatedAt を更新し、既存の allowed をそのまま返す。
 */
export async function upsertUserOnLogin(sub: string, email: string, name: string): Promise<UserRecord> {
  const ref = fs().collection(COLLECTION).doc(sub);
  const snap = await ref.get();
  const now = new Date().toISOString();

  if (!snap.exists) {
    await ref.set({ sub, email, name, allowed: false, createdAt: now, updatedAt: now });
    return { sub, email, name, allowed: false };
  }

  const data = snap.data() ?? {};
  await ref.set({ email, name, updatedAt: now }, { merge: true });
  return { sub, email, name, allowed: data.allowed === true };
}
