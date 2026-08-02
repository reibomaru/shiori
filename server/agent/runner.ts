// ============================================================
//  pi-coding-agent を使ってスポット編集エージェントを 1 ターン走らせ、
//  テキスト/ツール/コストの各イベントを emit でストリームする。
//
//  open-cowork の server/src/agent-query.ts を、スポット編集ドメインに
//  特化して簡略化したもの。組み込みの file/bash ツールは無効化し、
//  customTools（list_spots / propose_* / geocode / fetch_url / web_search）
//  だけを与える。
// ============================================================
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { getModel } from "@earendil-works/pi-ai/compat";
import { MissingApiKeyError } from "../apiKeys.ts";

// キー解決（BYOK / 共有キー）は apiKeys.ts に集約。ここは渡されたキーで動くだけ。
export { MissingApiKeyError } from "../apiKeys.ts";

/** SSE 送出関数（route.ts から渡される）。 */
export type EmitFn = (event: string, data: unknown) => Promise<void> | void;

/** 添付画像（base64）。 */
export interface AgentImage {
  data: string;
  mimeType: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

const PROVIDER = process.env.GEMINI_PROVIDER ?? "google";
const MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

export const SPOT_SYSTEM_PROMPT = `あなたは旅行のしおりアプリの「行きたいスポット候補」を管理する日本語アシスタントです。

# もっとも重要なルール
- あなたは DB を直接書き換えません。スポットの追加・更新・削除は必ず propose_* ツールで「提案」として出すだけです。
- 実際の保存／削除はユーザーが画面のボタンを押して確定します。あなたが確定することはありません。
- 提案を出したら「画面の保存ボタンで確定してください」と一言添えてください。

# 使えるツール
- list_spots(): 既存候補の一覧。重複確認や、更新・削除の対象 id の特定に使う。
- list_memo_pages(): ユーザーがメモ機能に保存した情報（じゃらん等の画像から抽出したテキストや自由記述メモ）を取得する。ユーザーが「メモから」「保存した情報を元に」などと言ったときや、宿・スポットの詳細を補完したいときに参照する。
- resolve_map_url(url): Google マップの共有リンク（maps.app.goo.gl 等の短縮URL）を辿って地名・緯度経度を取得する。
- web_search(query): URL が分からないスポットを名前だけで調べる。
- fetch_url(url): ユーザーが貼った URL や検索で見つけた公式ページの本文を読む。
- geocode(query): 施設名・住所から緯度経度を取得する。
- propose_upsert_spot({id?, name, ...}): 追加(id 省略)/更新(id 指定)の提案。
- propose_delete_spot({id}): 削除の提案。

# 進め方
1. ユーザーがスポットを追加したいときは、必要なら web_search / fetch_url で英名・カテゴリ・概要・出典を補い、geocode で緯度経度を取得してから propose_upsert_spot で提案する。
   - 画像（ガイドブックの写真・地図のスクショ・店の外観など）が添付されたら、そこから施設名・地名・特徴を読み取り、必要に応じて web_search / geocode で補完してから提案する。
2. geocode / web_search は英語・現地語の名称（例:「モンサンミッシェル」→ "Mont-Saint-Michel"）の方が当たりやすい。日本語で結果が得られなければ英語名で 1 回は再試行する。
   - web_search の結果が「おすすめ◯選」のような一覧記事でも諦めない。fetch_url でそのページを読み、具体的なスポット名を 1〜数件まで特定してから提案する。検索を何度も繰り返すより、ヒットしたページを開いて中身を読むこと。
3. 緯度経度が分からなければ lat/lng は省略してよい（必須ではない）。
4. source には情報の出典（URL やサイト名）をできるだけ入れる。
5. Google マップのリンクを貼られたら resolve_map_url で地名・座標を取り出し、そのリンクを google_maps_url に入れて提案する。口コミ・星評価はリンク先で見られるので shiori には保存しない。
6. 既存候補の更新・削除は、先に list_spots で対象 id を特定してから提案する。
7. 複数スポットの提案は propose_upsert_spot を複数回呼ぶ。
8. 応答は日本語で簡潔に。`;

/** 1 ターン分の usage。 */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  costUSD: number;
}

/** turn_end メッセージから 1 ターン分の usage を取り出す。 */
function extractUsage(message: unknown): TurnUsage {
  const u = (message as { usage?: { input?: number; output?: number; cacheRead?: number; cost?: { total?: number } } } | undefined)?.usage;
  if (!u) return { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 };
  return {
    inputTokens: u.input ?? 0,
    outputTokens: u.output ?? 0,
    cacheReadInputTokens: u.cacheRead ?? 0,
    costUSD: u.cost?.total ?? 0,
  };
}

/** tool 引数を chip 用に 1 行へ要約。 */
export function summarizeToolInput(name: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const s = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
  switch (name) {
    case "web_search":
      return s(o.query);
    case "geocode":
      return s(o.query);
    case "fetch_url":
      return s(o.url);
    case "propose_upsert_spot":
      return s(o.name);
    case "propose_delete_spot":
      return o.id != null ? `#${o.id}` : undefined;
    case "get_memo_page":
      return o.id != null ? `#${o.id}` : undefined;
    case "propose_upsert_memo_page":
      return s(o.title);
    case "propose_delete_memo_page":
      return o.id != null ? `#${o.id}` : undefined;
    default:
      return undefined;
  }
}

/** runChatAgent のパラメータ。 */
export interface RunChatAgentParams {
  /** 解決済みの API キー（BYOK or 共有キー。呼び出し側が resolveAiKey で解決して渡す）。 */
  apiKey: string;
  /** ユーザー入力 */
  prompt: string;
  /** システムプロンプト（ドメインごとに切り替える） */
  systemPrompt: string;
  /** 前ターンの pi セッションファイル */
  resumeSessionFile?: string;
  /** リクエスト用ツール一式 */
  customTools: ToolDefinition[];
  /** 会話履歴 JSONL の保存先（ユーザーごとに分離: agent-sessions/{userId}）。 */
  sessionDir: string;
  /** SSE 送出 */
  emit: EmitFn;
  /** 添付画像（base64） */
  images?: AgentImage[];
  signal?: AbortSignal;
}

/**
 * 1 プロンプト分のエージェント応答をストリームする。
 * systemPrompt / customTools を差し替えることで、スポット編集・メモ編集など
 * 異なるドメインのエージェントとして動かせる。
 * @returns 次回 resume 用の pi セッションファイルパス
 */
export async function runChatAgent({
  apiKey,
  prompt,
  systemPrompt,
  resumeSessionFile,
  customTools,
  sessionDir,
  emit,
  images,
  signal,
}: RunChatAgentParams): Promise<string | undefined> {
  if (!apiKey) {
    throw new MissingApiKeyError("API キーが解決できませんでした。");
  }

  mkdirSync(sessionDir, { recursive: true });

  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(PROVIDER, apiKey);
  const modelRegistry = ModelRegistry.create(authStorage);
  // getModel は静的なモデルカタログに対する強い generic 型を持つため、
  // 環境変数由来の動的な文字列では型が合わない。実行時の解決に委ねて never で渡す。
  const model = modelRegistry.find(PROVIDER, MODEL_ID) ?? getModel(PROVIDER as never, MODEL_ID as never);
  // モデルが解決できないと createAgentSession が既定プロバイダ（amazon-bedrock）に
  // 黙ってフォールバックし「No API key found for amazon-bedrock」になる。
  // 原因が分かりにくいので、ここで明示的に弾く。
  if (!model) {
    throw new MissingApiKeyError(
      `モデル "${PROVIDER}/${MODEL_ID}" を解決できません。GEMINI_MODEL に有効なモデル ID を設定してください（例: gemini-3-flash-preview, gemini-2.5-flash, gemini-flash-latest）。`,
    );
  }

  const loader = new DefaultResourceLoader({
    cwd: ROOT,
    agentDir: getAgentDir(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt,
  });
  await loader.reload();

  const sessionManager = resumeSessionFile
    ? SessionManager.open(resumeSessionFile)
    : SessionManager.create(ROOT, sessionDir);

  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  const onAbort = (): void => void session?.abort();
  try {
    const created = await createAgentSession({
      cwd: ROOT,
      agentDir: getAgentDir(),
      model,
      authStorage,
      modelRegistry,
      resourceLoader: loader,
      sessionManager,
      // "builtin" は read/bash/edit/write を無効化しつつ customTools は有効に保つ
      // （"all" だと customTools まで無効になる）。
      noTools: "builtin",
      customTools,
    });
    session = created.session;

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const unsubscribe = session.subscribe((event) => {
      void (async () => {
        try {
          if (event.type === "message_update") {
            const ame = event.assistantMessageEvent as { type?: string; delta?: string };
            if (ame?.type === "text_delta" && typeof ame.delta === "string" && ame.delta) {
              await emit("text_delta", { chunk: ame.delta });
            }
          } else if (event.type === "tool_execution_start") {
            await emit("tool_use", {
              id: event.toolCallId,
              name: event.toolName,
              detail: summarizeToolInput(event.toolName, event.args),
            });
          } else if (event.type === "turn_end") {
            await emit("usage", extractUsage(event.message));
          }
        } catch {
          /* SSE 書き込み失敗は無視（クライアント切断など） */
        }
      })();
    });

    const imageContents = (images ?? [])
      .filter((im) => im && typeof im.data === "string" && typeof im.mimeType === "string")
      .map((im) => ({ type: "image" as const, data: im.data, mimeType: im.mimeType }));

    try {
      await session.prompt(prompt, imageContents.length ? { images: imageContents } : undefined);
    } finally {
      unsubscribe();
      signal?.removeEventListener?.("abort", onAbort);
    }

    return session.sessionFile;
  } finally {
    session?.dispose();
  }
}
