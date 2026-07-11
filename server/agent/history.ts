// ============================================================
//  pi-coding-agent の JSONL セッションファイルから会話履歴を読み出し、
//  フロントの ChatMessage 形に変換する（resume 時の表示用）。
//
//  提案カード（proposal）は SSE の副作用で会話メッセージとしては保存されないが、
//  発生元の propose_* ツール呼び出しは JSONL に残る。そこで履歴復元では、
//  その toolCall の引数から提案カードを作り直して表示する（リロードしても消えない）。
//  current（既存スポット）は実行時点の値が分からないため DB の最新値を引く。
// ============================================================
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { Spot } from "../../shared/types.ts";
import * as spotsRepo from "../../db/spots-repo.ts";
import { summarizeToolInput } from "./runner.ts";

/** メッセージ内の content ブロック（テキスト / 画像 / ツール呼び出し）。 */
interface ContentBlock {
  type?: string;
  text?: string;
  data?: string;
  mimeType?: string;
  id?: string;
  name?: string;
  arguments?: unknown;
}

/** ツール実行 chip（フロント表示用）。 */
interface ChatTool {
  id: string;
  name: string;
  detail: string | undefined;
}

/** 復元した提案カード（フロントの Proposal と同形）。 */
interface Proposal {
  tempId: string;
  op: "create" | "update" | "delete";
  id: string | null;
  spot: Record<string, unknown> | null;
  current: Spot | null;
  /** 保存/破棄の解決状態（永続化済みのもの）。未解決なら省略。 */
  status?: "saved" | "dismissed";
}

/** フロントに返す会話メッセージ。 */
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools: ChatTool[];
  proposals: Proposal[];
  images: string[];
}

/** AssistantMessage.content / UserMessage.content からテキストを連結。 */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as ContentBlock[])
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text ?? "")
    .join("");
}

/** UserMessage.content から画像（data URL）を取り出す。 */
function extractImages(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return (content as ContentBlock[])
    .filter((b) => b && b.type === "image" && typeof b.data === "string")
    .map((b) => `data:${b.mimeType || "image/png"};base64,${b.data}`);
}

/** AssistantMessage.content から ToolCall を chip 用に取り出す。 */
function extractTools(content: unknown): ChatTool[] {
  if (!Array.isArray(content)) return [];
  return (content as ContentBlock[])
    .filter((b) => b && b.type === "toolCall")
    .map((b) => ({ id: b.id ?? "", name: b.name ?? "", detail: summarizeToolInput(b.name ?? "", b.arguments) }));
}

/** スポット下書きから、提案に載せるフィールドだけ抜き出す（tools.ts の pickDraft と同じ）。 */
function pickDraft(args: Record<string, unknown>): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const k of spotsRepo.SPOT_FIELDS) {
    if (args[k] !== undefined && args[k] !== null) draft[k] = args[k];
  }
  return draft;
}

/**
 * propose_* の toolCall から提案カードを作り直す。tempId は toolCall id 由来で
 * live と一致するため、resolutions（保存/破棄）を突き合わせて status を復元できる。
 */
function extractProposals(
  db: DatabaseSync,
  content: unknown,
  resolutions: Record<string, "saved" | "dismissed">,
): Proposal[] {
  if (!Array.isArray(content)) return [];
  const out: Proposal[] = [];
  for (const b of content as ContentBlock[]) {
    if (!b || b.type !== "toolCall") continue;
    const args = (b.arguments && typeof b.arguments === "object" ? b.arguments : {}) as Record<string, unknown>;
    const tempId = `prop-${b.id ?? ""}`;
    const status = resolutions[tempId];
    if (b.name === "propose_upsert_spot") {
      const id = typeof args.id === "string" ? args.id : null;
      const current = id != null ? spotsRepo.getSpot(db, id) : null;
      out.push({ tempId, op: id != null ? "update" : "create", id, spot: pickDraft(args), current, status });
    } else if (b.name === "propose_delete_spot") {
      const id = typeof args.id === "string" ? args.id : null;
      if (id == null) continue;
      out.push({ tempId, op: "delete", id, spot: null, current: spotsRepo.getSpot(db, id), status });
    }
  }
  return out;
}

/**
 * セッションファイルを読み、ChatMessage[] を返す。
 * ファイルが無い / 壊れている場合は空配列。
 */
export function readSessionMessages(
  db: DatabaseSync,
  sessionFile: string | undefined,
  resolutions: Record<string, "saved" | "dismissed"> = {},
): ChatMessage[] {
  if (!sessionFile || !existsSync(sessionFile)) return [];
  let entries: Array<{ type?: string; message?: { role?: string; content?: unknown } }>;
  try {
    entries = SessionManager.open(sessionFile).getBranch() as typeof entries;
  } catch {
    return [];
  }

  const messages: ChatMessage[] = [];
  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const m = entry.message;
    if (m.role === "user") {
      const text = extractText(m.content);
      const images = extractImages(m.content);
      if (!text && images.length === 0) continue; // tool_result 等は除外
      messages.push({ role: "user", text, tools: [], proposals: [], images });
    } else if (m.role === "assistant") {
      const text = extractText(m.content);
      const tools = extractTools(m.content);
      const proposals = extractProposals(db, m.content, resolutions);
      if (!text && tools.length === 0 && proposals.length === 0) continue;
      messages.push({ role: "assistant", text, tools, proposals, images: [] });
    }
  }
  return messages;
}
