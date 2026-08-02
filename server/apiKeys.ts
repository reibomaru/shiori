// ============================================================
//  BYOK（ユーザー自身の Gemini API キー）と共有キーのキー解決（#93）。
//
//  AI 呼び出しのキーは次の 2 段構えで解決する:
//    1. BYOK 登録あり → そのユーザーのキーを使う（上限なし・コストはユーザー負担）
//    2. BYOK 未登録   → 共有キー（GEMINI_API_KEY）にフォールバック。ただし
//                       ユーザーごとの月次コスト上限を適用し、超過したら遮断する。
//
//  キー本体の保管:
//    - 本番       : GCP Secret Manager（ユーザーごとに 1 シークレット）。DB/Firestore に
//                   平文で置かない。
//    - ローカル開発: Secret Manager はエミュレータが無いため、AES-256-GCM で
//                   暗号化したファイル（data/byok/*.enc）に保存するローカルバックエンド。
//    バックエンドは環境で自動選択する（Firestore エミュレータ使用時＝ローカル開発は
//    ローカルバックエンド、それ以外は Secret Manager）。BYOK_KEY_BACKEND で明示指定も可能。
//
//  利用量・上限は users ドキュメント（server/users.ts）で per-user・月次に集計する。
// ============================================================
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  currentUsageMonth,
  getAiUsageState,
  recordAiUsage,
  setByokKeyFlag,
  type AiUsageState,
} from "./users.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** API キーが 1 つも解決できない（BYOK 未登録かつ共有キー未設定）。 */
export class MissingApiKeyError extends Error {}

/** 共有キーの月次上限に達した（BYOK 登録を促す）。 */
export class UsageLimitExceededError extends Error {
  readonly costUsd: number;
  readonly limitUsd: number;
  readonly month: string;
  constructor(costUsd: number, limitUsd: number, month: string) {
    super(
      `今月の無料利用上限（$${limitUsd.toFixed(2)}）に達しました。自分の API キー（BYOK）を登録すると継続してご利用いただけます。`,
    );
    this.name = "UsageLimitExceededError";
    this.costUsd = costUsd;
    this.limitUsd = limitUsd;
    this.month = month;
  }
}

/** 使ったキーの出所（利用量集計を共有キー利用時だけ行うため）。 */
export type KeySource = "byok" | "shared";

// ---- 月次上限（共有キー利用時）------------------------------------------
const DEFAULT_MONTHLY_LIMIT_USD = Number(process.env.SHARED_KEY_MONTHLY_LIMIT_USD || 0.5);

/** ユーザーの月次上限（USD）。per-user 上書きがあればそれ、無ければ環境変数の既定。 */
export function monthlyLimitFor(state: AiUsageState): number {
  return state.limitUsd != null && state.limitUsd >= 0 ? state.limitUsd : DEFAULT_MONTHLY_LIMIT_USD;
}

/** 当月ぶんの消費（記録月が当月でなければ 0 とみなす）。source で共有/BYOK を切替。 */
function currentMonthCost(state: AiUsageState, source: KeySource): number {
  if (state.usageMonth !== currentUsageMonth()) return 0;
  return source === "byok" ? state.byokUsageCostUsd : state.usageCostUsd;
}

// ============================================================
//  キー保管バックエンド
// ============================================================
interface KeyBackend {
  set(sub: string, apiKey: string): Promise<void>;
  get(sub: string): Promise<string | null>;
  remove(sub: string): Promise<void>;
}

/** Secret Manager / ファイル名として安全な ID（Google sub は数字だが保険で丸める）。 */
function safeId(sub: string): string {
  const s = sub.replace(/[^A-Za-z0-9_-]/g, "_");
  return s.length ? s.slice(0, 200) : "_";
}

// ---- ローカル開発用: AES-256-GCM 暗号化ファイル ------------------------
const BYOK_DIR = join(ROOT, "data", "byok");

/** 32byte の暗号鍵を導出（BYOK_ENCRYPTION_KEY を SHA-256 で正規化）。 */
function localEncKey(): Buffer {
  const raw = process.env.BYOK_ENCRYPTION_KEY || "shiori-dev-byok-key";
  if (!process.env.BYOK_ENCRYPTION_KEY) {
    console.warn("⚠ BYOK_ENCRYPTION_KEY が未設定です。ローカル開発用の既定鍵で暗号化します（本番では設定必須）。");
  }
  return createHash("sha256").update(raw).digest();
}

const localBackend: KeyBackend = {
  async set(sub, apiKey) {
    mkdirSync(BYOK_DIR, { recursive: true });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", localEncKey(), iv);
    const enc = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    // iv:tag:ciphertext（いずれも base64）を 1 行で保存。
    writeFileSync(join(BYOK_DIR, `${safeId(sub)}.enc`), [iv, tag, enc].map((b) => b.toString("base64")).join(":"), "utf8");
  },
  async get(sub) {
    try {
      const raw = readFileSync(join(BYOK_DIR, `${safeId(sub)}.enc`), "utf8");
      const [ivB64, tagB64, encB64] = raw.split(":");
      if (!ivB64 || !tagB64 || !encB64) return null;
      const decipher = createDecipheriv("aes-256-gcm", localEncKey(), Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
    } catch {
      return null; // ファイル無し・復号失敗
    }
  },
  async remove(sub) {
    try {
      rmSync(join(BYOK_DIR, `${safeId(sub)}.enc`), { force: true });
    } catch {
      /* noop */
    }
  },
};

// ---- 本番: GCP Secret Manager -----------------------------------------
const SECRET_PREFIX = process.env.BYOK_SECRET_PREFIX || "byok-gemini";

// SecretManagerServiceClient は遅延生成する（ローカル開発では import すらしたくない）。
let _smClient: import("@google-cloud/secret-manager").SecretManagerServiceClient | null = null;
let _smProject: string | null = null;

async function sm(): Promise<{
  client: import("@google-cloud/secret-manager").SecretManagerServiceClient;
  project: string;
}> {
  if (!_smClient) {
    const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
    _smClient = new SecretManagerServiceClient();
  }
  if (!_smProject) {
    _smProject =
      process.env.GOOGLE_CLOUD_PROJECT || process.env.FIRESTORE_PROJECT_ID || (await _smClient.getProjectId());
  }
  return { client: _smClient, project: _smProject };
}

const secretManagerBackend: KeyBackend = {
  async set(sub, apiKey) {
    const { client, project } = await sm();
    const secretId = `${SECRET_PREFIX}-${safeId(sub)}`;
    const name = `projects/${project}/secrets/${secretId}`;
    // シークレットが無ければ作成してからバージョンを追加する（latest が最新キーを指す）。
    try {
      await client.getSecret({ name });
    } catch (e) {
      if ((e as { code?: number }).code === 5 /* NOT_FOUND */) {
        await client.createSecret({
          parent: `projects/${project}`,
          secretId,
          secret: { replication: { automatic: {} } },
        });
      } else {
        throw e;
      }
    }
    await client.addSecretVersion({ parent: name, payload: { data: Buffer.from(apiKey, "utf8") } });
  },
  async get(sub) {
    const { client, project } = await sm();
    const name = `projects/${project}/secrets/${SECRET_PREFIX}-${safeId(sub)}/versions/latest`;
    try {
      const [res] = await client.accessSecretVersion({ name });
      const data = res.payload?.data;
      return data ? Buffer.from(data).toString("utf8") : null;
    } catch (e) {
      if ((e as { code?: number }).code === 5 /* NOT_FOUND */) return null;
      throw e;
    }
  },
  async remove(sub) {
    const { client, project } = await sm();
    const name = `projects/${project}/secrets/${SECRET_PREFIX}-${safeId(sub)}`;
    try {
      await client.deleteSecret({ name });
    } catch (e) {
      if ((e as { code?: number }).code !== 5 /* NOT_FOUND は無視 */) throw e;
    }
  },
};

/** 使用するバックエンドを環境から選ぶ。Firestore エミュレータ使用時＝ローカル開発。 */
function pickBackend(): KeyBackend {
  const forced = (process.env.BYOK_KEY_BACKEND || "").toLowerCase();
  if (forced === "local") return localBackend;
  if (forced === "secret-manager") return secretManagerBackend;
  return process.env.FIRESTORE_EMULATOR_HOST ? localBackend : secretManagerBackend;
}
const backend = pickBackend();

// ============================================================
//  公開 API
// ============================================================

/** 登録時の疎通確認: Gemini API キーが有効か（models 一覧の 200 で判定）。 */
export async function validateGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: "GET" },
    );
    return res.ok;
  } catch {
    return false; // ネットワーク不通などは無効扱い
  }
}

/** BYOK キーを登録/更新する。疎通確認に失敗したら false を返し保存しない。 */
export async function setUserApiKey(sub: string, apiKey: string): Promise<boolean> {
  const key = apiKey.trim();
  if (!key) return false;
  if (!(await validateGeminiKey(key))) return false;
  await backend.set(sub, key);
  await setByokKeyFlag(sub, true);
  return true;
}

/** BYOK キーを削除する（以降は共有キー＋上限にフォールバック）。 */
export async function deleteUserApiKey(sub: string): Promise<void> {
  await backend.remove(sub);
  await setByokKeyFlag(sub, false);
}

/** 画面表示用の BYOK 状態（キー有無・当月の消費・上限）。 */
export interface ByokStatus {
  hasKey: boolean;
  /** 次のリクエストで使われるキーの出所。 */
  source: KeySource;
  usage: { month: string; costUsd: number; limitUsd: number };
  /** 共有キーが 1 つも設定されていない（未登録ユーザーは AI を使えない）。 */
  sharedKeyConfigured: boolean;
}

/** ユーザーの BYOK 状態を返す。 */
export async function getByokStatus(sub: string): Promise<ByokStatus> {
  const state = await getAiUsageState(sub);
  const source: KeySource = state.hasByokKey ? "byok" : "shared";
  return {
    hasKey: state.hasByokKey,
    source,
    usage: {
      month: currentUsageMonth(),
      // BYOK 登録時は BYOK 分、未登録時は共有キー分の当月コストを表示する。
      costUsd: currentMonthCost(state, source),
      limitUsd: monthlyLimitFor(state),
    },
    sharedKeyConfigured: !!process.env.GEMINI_API_KEY,
  };
}

/**
 * リクエスト時のキー解決。BYOK があればそれ、無ければ共有キー（上限チェック付き）。
 * @throws MissingApiKeyError    どのキーも解決できない
 * @throws UsageLimitExceededError 共有キーの月次上限に達している
 */
export async function resolveAiKey(sub: string): Promise<{ apiKey: string; source: KeySource }> {
  const state = await getAiUsageState(sub);

  // 1) BYOK 登録あり → そのキーを使う（上限なし）。
  if (state.hasByokKey) {
    const key = await backend.get(sub);
    if (key) return { apiKey: key, source: "byok" };
    // フラグは立っているが実体が読めない場合は共有キーへフォールバックする。
  }

  // 2) 共有キーへフォールバック（上限チェック）。
  const shared = process.env.GEMINI_API_KEY;
  if (!shared) {
    throw new MissingApiKeyError(
      "AI 機能を利用できません。自分の API キー（BYOK）を登録してください（共有キーは未設定です）。",
    );
  }
  const cost = currentMonthCost(state, "shared");
  const limit = monthlyLimitFor(state);
  if (cost >= limit) {
    throw new UsageLimitExceededError(cost, limit, currentUsageMonth());
  }
  return { apiKey: shared, source: "shared" };
}

/**
 * 消費コストを当月集計へ加算する。共有キー分と BYOK 分を別々に積む
 * （BYOK 分は表示用で上限判定には使わない）。
 */
export async function recordUsage(sub: string, source: KeySource, costUsd: number): Promise<void> {
  try {
    await recordAiUsage(sub, costUsd, source);
  } catch (e) {
    console.error("AI 利用量の記録に失敗しました:", e);
  }
}
