// ============================================================
//  AI 利用量の「月初リセット」挙動の結合テスト（#93）。
//
//  リセットは cron ではなく、usageMonth（"YYYY-MM"・UTC）と現在月の比較による
//  遅延リセットで実現している。ここでは「時刻を偽装せず」古い usageMonth を
//  直接書き込むことで、月替わり分岐（記録・表示・上限判定）を確定的に検証する。
//
//  実行前提: Firestore エミュレータが起動していること（pnpm emulator / pnpm dev）。
//    FIRESTORE_EMULATOR_HOST=localhost:8085 FIRESTORE_PROJECT_ID=demo node --test
//  package.json の `pnpm test` がこの env を付けて実行する。
// ============================================================
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  firestore,
  currentUsageMonth,
  recordAiUsage,
  getAiUsageState,
} from "./users.ts";
import { getByokStatus, resolveAiKey, UsageLimitExceededError } from "./apiKeys.ts";

const COLLECTION = process.env.FIRESTORE_USERS_COLLECTION || "users";
const SUB = "test-ai-usage-reset"; // テスト専用ドキュメント（前後で必ず削除する）
const STALE_MONTH = "2000-01"; // 「先月以前」を表す明らかに古い月

// エミュレータ未起動時に本番 Firestore を触らないための保険。
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST;

function ref() {
  return firestore().collection(COLLECTION).doc(SUB);
}

/** ドキュメントを与えたフィールドだけで置き換える（merge せず、古い残骸を残さない）。 */
async function seed(fields: Record<string, unknown>) {
  await ref().set(fields);
}

async function readRaw(): Promise<Record<string, unknown>> {
  const snap = await ref().get();
  return (snap.exists ? snap.data() : {}) ?? {};
}

function approx(actual: number, expected: number, msg?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, msg ?? `${actual} ≒ ${expected} でない`);
}

before(async () => {
  await ref().delete().catch(() => {});
});
beforeEach(async () => {
  await ref().delete().catch(() => {});
});
after(async () => {
  await ref().delete().catch(() => {});
});

test(
  "recordAiUsage: 古い月の消費は 0 に戻してから当月分を積む（shared）",
  { skip: EMULATOR ? false : "Firestore エミュレータ未起動" },
  async () => {
    await seed({ usageMonth: STALE_MONTH, usageCostUsd: 999, byokUsageCostUsd: 888 });

    await recordAiUsage(SUB, 0.1, "shared");

    const state = await getAiUsageState(SUB);
    assert.equal(state.usageMonth, currentUsageMonth(), "usageMonth が当月に更新される");
    approx(state.usageCostUsd, 0.1, "先月分 999 に加算されず 0 からの当月分になる");
    approx(state.byokUsageCostUsd, 0, "書き込まない側(byok)の古い値もリセットされる");
  },
);

test(
  "recordAiUsage: 同一月内は累積される（shared）",
  { skip: EMULATOR ? false : "Firestore エミュレータ未起動" },
  async () => {
    await seed({ usageMonth: currentUsageMonth(), usageCostUsd: 0.1, byokUsageCostUsd: 0 });

    await recordAiUsage(SUB, 0.05, "shared");

    const state = await getAiUsageState(SUB);
    approx(state.usageCostUsd, 0.15, "同月なので 0.1 + 0.05 に累積される");
  },
);

test(
  "recordAiUsage: byok と shared は別フィールドに積む",
  { skip: EMULATOR ? false : "Firestore エミュレータ未起動" },
  async () => {
    await seed({ usageMonth: currentUsageMonth(), usageCostUsd: 0.1, byokUsageCostUsd: 0 });

    await recordAiUsage(SUB, 0.2, "byok");

    const state = await getAiUsageState(SUB);
    approx(state.byokUsageCostUsd, 0.2, "byok 分は byokUsageCostUsd へ");
    approx(state.usageCostUsd, 0.1, "shared 分(上限判定用)は変わらない");
  },
);

test(
  "getByokStatus: 古い月の消費は当月 0 として表示される",
  { skip: EMULATOR ? false : "Firestore エミュレータ未起動" },
  async () => {
    await seed({ usageMonth: STALE_MONTH, usageCostUsd: 999, hasByokKey: false });

    const status = await getByokStatus(SUB);
    assert.equal(status.usage.month, currentUsageMonth());
    approx(status.usage.costUsd, 0, "先月の 999 ではなく 0 が表示される");

    // 表示は 0 でも、生値は次アクセスまで残る（害なし）ことも確認しておく。
    const raw = await readRaw();
    assert.equal(raw.usageCostUsd, 999, "生値は物理的には残っている（usageMonth とセットで無効化）");
  },
);

test(
  "resolveAiKey: 古い月の超過は上限に数えず共有キーを返す",
  { skip: EMULATOR ? false : "Firestore エミュレータ未起動" },
  async () => {
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "shared-key-for-test";
    try {
      // 先月に大幅超過していても、当月消費は 0 とみなされ遮断されない。
      await seed({ usageMonth: STALE_MONTH, usageCostUsd: 999, hasByokKey: false });

      const res = await resolveAiKey(SUB);
      assert.equal(res.source, "shared");
      assert.equal(res.apiKey, "shared-key-for-test");
    } finally {
      if (prev === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prev;
    }
  },
);

test(
  "resolveAiKey: 当月の超過は上限に達し遮断される（月ゲートの対照）",
  { skip: EMULATOR ? false : "Firestore エミュレータ未起動" },
  async () => {
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "shared-key-for-test";
    try {
      // 当月に超過している場合は、上と同じ値でも UsageLimitExceededError になる。
      await seed({ usageMonth: currentUsageMonth(), usageCostUsd: 999, hasByokKey: false });

      await assert.rejects(resolveAiKey(SUB), UsageLimitExceededError);
    } finally {
      if (prev === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prev;
    }
  },
);
