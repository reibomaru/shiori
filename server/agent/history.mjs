// ============================================================
//  pi-coding-agent の JSONL セッションファイルから会話履歴を読み出し、
//  フロントの ChatMessage 形に変換する（resume 時の表示用）。
//
//  注: 提案カード（proposal）は SSE の副作用であって会話メッセージとして
//  保存されないため、履歴復元では再現しない。過去のツール実行は chip と
//  して、本文はそのまま表示する。
// ============================================================
import { existsSync } from "node:fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { summarizeToolInput } from "./runner.mjs";

/** AssistantMessage.content / UserMessage.content からテキストを連結。 */
function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

/** UserMessage.content から画像（data URL）を取り出す。 */
function extractImages(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b && b.type === "image" && typeof b.data === "string")
    .map((b) => `data:${b.mimeType || "image/png"};base64,${b.data}`);
}

/** AssistantMessage.content から ToolCall を chip 用に取り出す。 */
function extractTools(content) {
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b && b.type === "toolCall")
    .map((b) => ({ id: b.id, name: b.name, detail: summarizeToolInput(b.name, b.arguments) }));
}

/**
 * セッションファイルを読み、ChatMessage[] を返す。
 * ファイルが無い / 壊れている場合は空配列。
 */
export function readSessionMessages(sessionFile) {
  if (!sessionFile || !existsSync(sessionFile)) return [];
  let entries;
  try {
    entries = SessionManager.open(sessionFile).getBranch();
  } catch {
    return [];
  }

  const messages = [];
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
      if (!text && tools.length === 0) continue;
      messages.push({ role: "assistant", text, tools, proposals: [], images: [] });
    }
  }
  return messages;
}
