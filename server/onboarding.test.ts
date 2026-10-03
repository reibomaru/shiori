// ============================================================
//  初回オンボーディング案内の表示済みフラグ（users.onboardingDone）の結合テスト（#123）。
//
//  実行前提: Firestore エミュレータが起動していること（pnpm emulator / pnpm dev）。
//  package.json の `pnpm test` がエミュレータ用の env を付けて実行する。
// ============================================================
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { firestore, getUserProfile, markOnboardingDone, upsertUserOnLogin } from "./users.ts";

const COLLECTION = process.env.FIRESTORE_USERS_COLLECTION || "users";
const SUB = "test-onboarding-flag"; // テスト専用ドキュメント（前後で必ず削除する）

// エミュレータ未起動時に本番 Firestore を触らないための保険。
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;
const opts = { skip: EMULATOR ? false : "Firestore エミュレータ未起動" };

function ref() {
  return firestore().collection(COLLECTION).doc(SUB);
}

beforeEach(async () => {
  await ref().delete().catch(() => {});
});
after(async () => {
  await ref().delete().catch(() => {});
});

test("新規ユーザーは onboardingDone=false", opts, async () => {
  const rec = await upsertUserOnLogin(SUB, "a@example.com", "A");
  assert.equal(rec.onboardingDone, false);
  assert.equal((await getUserProfile(SUB))?.onboardingDone, false);
});

test("markOnboardingDone で true になり、再ログインしても維持される", opts, async () => {
  await upsertUserOnLogin(SUB, "a@example.com", "A");
  await markOnboardingDone(SUB);
  assert.equal((await getUserProfile(SUB))?.onboardingDone, true);

  const again = await upsertUserOnLogin(SUB, "a@example.com", "A");
  assert.equal(again.onboardingDone, true, "ログイン時の upsert でフラグが消えない");
});
