// ============================================================
//  アップロードされた画像（じゃらん等の宿・スポット紹介ページの
//  スクリーンショットや写真）を読み取り、後から見返しやすい HTML に
//  整形する 1 ショットの抽出処理。
//
//  runner.ts と同じ pi-coding-agent / Gemini の設定を使うが、ツールは
//  一切与えず（noTools: "all"）、応答テキスト（HTML）だけを収集して返す。
//  無害化・平文化は呼び出し側（route）で html.ts を使って行う。
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
import { getModel } from "@earendil-works/pi-ai/compat";
import { MissingApiKeyError } from "./runner.ts";
import type { AgentImage, TurnUsage } from "./runner.ts";
import type { MemoGraph } from "../../shared/types.ts";

/** turn_end メッセージから 1 ターン分の usage を取り出す（runner.ts と同形）。 */
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const SESSION_DIR = process.env.AGENT_SESSIONS_DIR || join(ROOT, "data", "agent-sessions");

const PROVIDER = process.env.GEMINI_PROVIDER ?? "google";
const MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

const EXTRACT_SYSTEM_PROMPT = `あなたは旅行のしおりアプリのメモ機能を支援するアシスタントです。
ユーザーがアップロードした画像（じゃらん・楽天トラベル等の宿/スポット紹介ページのスクリーンショットや写真、パンフレットなど）を読み取り、
そこに書かれた情報を、後から見返しやすい 1 枚の HTML に整形します。

# 出力ルール（厳守）
- 出力は HTML の本文断片のみ。前置き・説明文・コードフェンス(\`\`\`)は一切付けず、HTML タグから直接書き始める。
- <script> / <iframe> / <link> / <meta> や on〜 属性・javascript: は絶対に含めない。
- 見出し(h2/h3)・段落(p)・箇条書き(ul/li)・表(table) など意味的なタグで構造化する。
- 画像から実際に読み取れた事実だけを書く。推測で埋めない。読めない項目は省略する。
- 宿名・プラン名・料金・住所・電話番号・チェックイン/アウト・食事・アクセス・部屋・特徴・注意事項などがあれば漏れなく拾う。
- 日本語で出力する。

# 図表・グラフの再現
- 画像に図表（表・料金カレンダー・比較表など）が含まれる場合は、<table> で構造まで忠実に再現する。
- 画像にグラフ（棒グラフ・折れ線・円グラフ・混雑度カレンダーなど）が含まれる場合は、そのデータを読み取り、HTML+インライン CSS で見た目を再現する。
  - 棒グラフ: 各項目を横棒(<div>)で表し、値に比例した幅(width:○○%)と数値ラベルを付ける。<style> タグは使わず style 属性で色・幅を指定する。
  - 折れ線・散布図: 難しければ、読み取った系列の値を <table> にして併記する。
  - 円グラフ・割合: 各区分の割合(%)を横棒＋数値で表す。
  - グラフの軸ラベル・凡例・単位・タイトルも文章や見出しで補う。
- 読み取れた数値は必ず本文にも明記し、後からテキストとして検索・参照できるようにする。`;

const GRAPH_SYSTEM_PROMPT = `あなたは旅行のしおりアプリのメモ機能を支援するアシスタントです。
ユーザーがアップロードした画像に「グラフ構造の図」が含まれるかを判定し、含まれる場合はその構造を JSON で書き出します。

# グラフ構造の図とは
ノード（箱・円・項目）を線や矢印でつないで関係を表す図のこと。例:
- フローチャート / 手順図 / 分岐図
- 組織図 / 系統図 / ツリー
- 相関図 / 人物関係図 / 概念のつながり
- マインドマップ / ネットワーク図 / 状態遷移図
※ 棒グラフ・折れ線・円グラフ・表・料金カレンダーなどは「グラフ構造」ではない。これらは対象外。

# 出力ルール（厳守）
- 出力は JSON オブジェクトのみ。前置き・説明・コードフェンス(\`\`\`)は一切付けない。
- スキーマ:
  {"nodes":[{"id":"n1","label":"表示名"}, ...],
   "edges":[{"from":"n1","to":"n2","label":"関係名(任意)","undirected":false}, ...]}
- id は "n1","n2" のような短い一意の文字列。label は画像から読み取れた実際のテキスト。
- edges の from / to は必ず nodes に存在する id を指す。
- 矢印がある向きは from→to にする。矢印の無い（向きのない）つながりは "undirected": true を付ける。線の脇に関係名があれば label に入れる。
- グラフ構造の図が画像に無い場合は、必ず {"nodes":[],"edges":[]} だけを出力する。
- 推測でノードやエッジを作らない。読み取れたものだけを書く。日本語のテキストはそのまま日本語で。`;

interface OneShotOptions {
  /** 解決済みの API キー（BYOK or 共有キー。呼び出し側が resolveAiKey で渡す）。 */
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  images: AgentImage[];
  signal?: AbortSignal;
  /** 1 ターンの usage を受け取るコールバック（共有キー利用時の集計用）。 */
  onUsage?: (u: TurnUsage) => void;
}

/**
 * 画像を添えた 1 ショットのプロンプトを実行し、応答テキストを返す共通処理。
 * ツールは全無効（noTools: "all"）で、テキスト応答だけを収集する。
 * @throws MissingApiKeyError API キー未設定 / モデル解決失敗時
 */
async function runOneShot({ apiKey, systemPrompt, userPrompt, images, signal, onUsage }: OneShotOptions): Promise<string> {
  if (!apiKey) {
    throw new MissingApiKeyError("API キーが解決できませんでした。");
  }

  mkdirSync(SESSION_DIR, { recursive: true });

  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(PROVIDER, apiKey);
  const modelRegistry = ModelRegistry.create(authStorage);
  const model = modelRegistry.find(PROVIDER, MODEL_ID) ?? getModel(PROVIDER as never, MODEL_ID as never);
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

  const sessionManager = SessionManager.create(ROOT, SESSION_DIR);

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
      // 抽出のみでツールは不要。"all" で組み込みツールも含め全て無効化する。
      noTools: "all",
    });
    session = created.session;

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    let out = "";
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_update") {
        const ame = event.assistantMessageEvent as { type?: string; delta?: string };
        if (ame?.type === "text_delta" && typeof ame.delta === "string") out += ame.delta;
      } else if (event.type === "turn_end" && onUsage) {
        onUsage(extractUsage(event.message));
      }
    });

    const imageContents = images
      .filter((im) => im && typeof im.data === "string" && typeof im.mimeType === "string")
      .map((im) => ({ type: "image" as const, data: im.data, mimeType: im.mimeType }));

    try {
      await session.prompt(userPrompt, imageContents.length ? { images: imageContents } : undefined);
    } finally {
      unsubscribe();
      signal?.removeEventListener?.("abort", onAbort);
    }

    return out.trim();
  } finally {
    session?.dispose();
  }
}

/**
 * 画像から情報を抽出し、整形済みの HTML 文字列（無害化前）を返す。
 * @throws MissingApiKeyError API キー未設定 / モデル解決失敗時
 */
export function extractHtmlFromImages(args: {
  apiKey: string;
  images: AgentImage[];
  signal?: AbortSignal;
  onUsage?: (u: TurnUsage) => void;
}): Promise<string> {
  return runOneShot({
    systemPrompt: EXTRACT_SYSTEM_PROMPT,
    userPrompt: "添付画像から情報を読み取り、指示どおり HTML に整形して出力してください。",
    ...args,
  });
}

/** モデル応答（```json フェンス等が付くことがある）から JSON 本体を取り出す。 */
function stripJsonFence(s: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  const body = (fenced ? fenced[1] : s).trim();
  // 最初の { から最後の } までを対象にする（前後の混入テキストに強くする）。
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start !== -1 && end !== -1 && end > start ? body.slice(start, end + 1) : body;
}

/** モデル出力を検証済みの MemoGraph に整える。エッジは存在するノードだけを残す。 */
function parseGraphResponse(raw: string): MemoGraph | null {
  let data: unknown;
  try {
    data = JSON.parse(stripJsonFence(raw));
  } catch {
    return null;
  }
  const obj = data as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(obj.nodes)) return null;

  const nodes: MemoGraph["nodes"] = [];
  const ids = new Set<string>();
  for (const n of obj.nodes) {
    const node = n as { id?: unknown; label?: unknown };
    const id = typeof node.id === "string" ? node.id : "";
    if (!id || ids.has(id)) continue;
    ids.add(id);
    nodes.push({ id, label: typeof node.label === "string" && node.label.trim() ? node.label : id });
  }
  if (nodes.length === 0) return null;

  const edges: MemoGraph["edges"] = [];
  if (Array.isArray(obj.edges)) {
    for (const e of obj.edges) {
      const edge = e as { from?: unknown; to?: unknown; label?: unknown; undirected?: unknown };
      if (typeof edge.from !== "string" || typeof edge.to !== "string") continue;
      if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
      edges.push({
        from: edge.from,
        to: edge.to,
        ...(typeof edge.label === "string" && edge.label.trim() ? { label: edge.label } : {}),
        ...(edge.undirected === true ? { undirected: true } : {}),
      });
    }
  }
  return { nodes, edges };
}

/**
 * 画像に「グラフ構造の図」（フローチャート・組織図・相関図など）が含まれる場合、
 * そのノード＋エッジを構造化して返す。含まれない/読み取れない場合は null。
 * @throws MissingApiKeyError API キー未設定 / モデル解決失敗時
 */
export async function extractGraphFromImages(args: {
  apiKey: string;
  images: AgentImage[];
  signal?: AbortSignal;
  onUsage?: (u: TurnUsage) => void;
}): Promise<MemoGraph | null> {
  const raw = await runOneShot({
    systemPrompt: GRAPH_SYSTEM_PROMPT,
    userPrompt: "添付画像にグラフ構造の図が含まれるか判定し、含まれる場合は指示どおり JSON で出力してください。",
    ...args,
  });
  return parseGraphResponse(raw);
}
