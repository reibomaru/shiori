// ============================================================
//  スポット編集エージェントのチャット API。
//
//  POST   /api/spots/chat                      会話（SSE ストリーム）
//  GET    /api/spots/chat/sessions             セッション一覧
//  GET    /api/spots/chat/sessions/:id/messages 履歴（resume 用）
//  DELETE /api/spots/chat/sessions/:id          セッション削除
//
//  会話本体は pi の JSONL（session_file）に永続化し、一覧・resume 用の
//  メタ情報は SQLite（chat_sessions）で管理する。
//
//  SSE イベント:
//    text_delta { chunk } / tool_use { id, name, detail }
//    proposal { tempId, op, id, spot, current } / usage {...}
//    done {} / error { message }
// ============================================================
import { existsSync, rmSync } from "node:fs";
import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { DatabaseSync } from "node:sqlite";
import { createSpotTools, createMemoTools } from "./tools.ts";
import { runChatAgent, MissingApiKeyError, SPOT_SYSTEM_PROMPT } from "./runner.ts";
import type { AgentImage, EmitFn } from "./runner.ts";
import * as memoRepo from "../../db/memo-repo.ts";
import {
  upsertSession,
  getSessionFile,
  recordTurn,
  listSessions,
  getSession,
  deleteSession,
  recordResolution,
  getResolutions,
} from "./sessions.ts";
import { readSessionMessages } from "./history.ts";
import { normalizeImageForWeb } from "./images.ts";

const MEMO_SYSTEM_PROMPT = `あなたは旅行のしおりアプリの「メモ」を編集する日本語アシスタントです。
メモは 1 つの Markdown 文書（タイトル + 本文 body）です。ユーザーの自由記述も、画像から読み取った情報も、すべてこの 1 つの本文にまとめます（別々の欄はありません）。

# もっとも重要なルール
- あなたは DB を直接書き換えません。メモの作成・編集・削除は必ず propose_* ツールで「提案」として出すだけです。
- 実際の保存／削除はユーザーが画面のボタンを押して確定します。あなたが確定することはありません。
- 提案を出したら「画面の保存ボタンで確定してください」と一言添えてください。

# 使えるツール
- list_memo_pages(): 全メモの id・タイトル・内容の一覧。対象メモの id を特定するのに使う。
- get_memo_page({id}): 指定メモの現在の内容（タイトル・本文）を正確に取得する。
- propose_upsert_memo_page({id?, title?, body?}): 作成(id 省略)/編集(id 指定)の提案。変更するフィールドだけを渡し、body を変更するときは「変更後の全文」を渡す。
- propose_delete_memo_page({id}): 削除の提案。

# 進め方
1. ユーザーは通常、特定のメモを開いた状態で話しかけてきます。その場合は下に現在のメモの内容が渡されるので、それを対象に編集を提案してください（id も渡されます）。
2. 画像が添付されたら、あなた自身が画像を読み取り（マルチモーダル）、その内容を Markdown 本文に反映する提案を出します。表は Markdown の表、箇条書きはリストで表現します。
3. 誤字修正・要約・整形・追記など、指示に沿って本文(body)を編集します。既存の内容を誤って消さないよう、必要なら get_memo_page で現在値を確認してから「変更後の全文」を組み立てます。
4. 行程の流れ・乗り継ぎ・位置関係など、図で表した方が分かりやすい情報は Mermaid の図を使ってよいです。\`\`\`mermaid コードブロック（flowchart / sequenceDiagram / gantt など）で本文に埋め込むと、画面では図として表示されます。ラベルに日本語を使うときは "..." で囲みます。
5. 応答は日本語で簡潔に。`;

/** 現在開いているメモの内容を、エージェントへのプロンプト前置きに整形する。 */
function memoContextPreamble(db: DatabaseSync, pageId: string): string {
  const page = memoRepo.getMemoPage(db, pageId);
  if (!page) return "";
  // 旧データ（画像から取り込んだ情報）が残っていれば、本文へまとめる参考として併記する。
  const legacy = (page.text ?? "").trim().slice(0, 3000);
  const lines = [
    `【現在ユーザーが開いているメモ】`,
    `id: ${page.id}`,
    `タイトル: ${page.title}`,
    `本文(body):\n${page.body?.trim() || "（空）"}`,
  ];
  if (legacy) lines.push(`参考（過去に画像から取り込んだ情報。必要なら本文へまとめてよい）:\n${legacy}`);
  lines.push(`※ 特に指定がなければ、このメモ（上記 id）を対象に編集を提案してください。\n\n`);
  return lines.join("\n");
}

const WEBSEARCH_API_KEY = process.env.WEBSEARCH_API_KEY ?? "";

/** Hono アプリにチャット関連ルートを登録する。 */
export function registerSpotChatRoute(app: Hono): void {
  // ---- セッション一覧 -------------------------------------
  app.get("/api/spots/chat/sessions", (c) => c.json(listSessions(c.get("db"))));

  // ---- 履歴（resume 時に表示する会話を JSONL から復元）------
  app.get("/api/spots/chat/sessions/:id/messages", (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const file = getSessionFile(db, id);
    return c.json(readSessionMessages(db, file, getResolutions(db, id)));
  });

  // ---- 提案カードの解決状態（保存/破棄）を永続化 -----------
  // 一度保存・破棄したカードはリロード後も同じ状態で復元され、再保存できない。
  app.post("/api/spots/chat/sessions/:id/resolutions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { proposalId?: unknown; status?: unknown };
    const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
    const status = body.status === "saved" || body.status === "dismissed" ? body.status : null;
    if (!proposalId || !status) return c.json({ error: "proposalId と status（saved/dismissed）が必要です。" }, 400);
    recordResolution(c.get("db"), c.req.param("id"), proposalId, status);
    return c.json({ ok: true });
  });

  // ---- セッション削除（行 + JSONL ファイル）----------------
  app.delete("/api/spots/chat/sessions/:id", (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const session = getSession(db, id);
    if (session?.session_file && existsSync(session.session_file)) {
      try {
        rmSync(session.session_file);
      } catch {
        /* ファイル削除失敗は致命的でない */
      }
    }
    deleteSession(db, id);
    return c.json({ ok: true });
  });

  // ---- 会話（SSE）-----------------------------------------
  app.post("/api/spots/chat", async (c) => {
    const db = c.get("db");
    const sessionDir = c.get("sessionDir");
    const body = (await c.req.json().catch(() => ({}))) as {
      sessionId?: unknown;
      message?: unknown;
      images?: unknown;
    };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    let message = typeof body.message === "string" ? body.message.trim() : "";
    const images: AgentImage[] = Array.isArray(body.images)
      ? (body.images as Array<{ data?: unknown; mimeType?: unknown }>)
          .filter((im): im is AgentImage => !!im && typeof im.data === "string" && typeof im.mimeType === "string")
          .slice(0, 4)
      : [];

    return streamSSE(c, async (stream) => {
      let costUSD = 0;
      const emit: EmitFn = (event, data) => {
        if (event === "usage" && data && typeof (data as { costUSD?: unknown }).costUSD === "number") {
          costUSD += (data as { costUSD: number }).costUSD;
        }
        return stream.writeSSE({ event, data: JSON.stringify(data) });
      };

      if (!sessionId) {
        await emit("error", { message: "sessionId が指定されていません。" });
        return;
      }
      if (!message && images.length === 0) {
        await emit("error", { message: "メッセージが空です。" });
        return;
      }
      // 画像のみ送られた場合の既定指示。
      if (!message) message = "添付画像から行きたいスポットを読み取って、候補への追加を提案してください。";

      // セッション行を用意（初回はタイトルも設定）。
      upsertSession(db, sessionId, message);

      // クライアント切断時はエージェントを中断する。
      const controller = new AbortController();
      stream.onAbort(() => controller.abort());

      const tools = createSpotTools({ db, emit, webSearchApiKey: WEBSEARCH_API_KEY });
      // モデルが読めるよう HEIC/HEIF は PNG へ正規化（クライアント変換の保険）。
      const modelImages = await Promise.all(images.map(normalizeImageForWeb));

      try {
        const sessionFile = await runChatAgent({
          prompt: message,
          systemPrompt: SPOT_SYSTEM_PROMPT,
          resumeSessionFile: getSessionFile(db, sessionId),
          customTools: tools,
          sessionDir,
          emit,
          images: modelImages,
          signal: controller.signal,
        });
        recordTurn(db, sessionId, { sessionFile, costUSD });
        await emit("done", {});
      } catch (err) {
        const msg =
          err instanceof MissingApiKeyError
            ? err.message
            : `エージェントの実行中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;
        await emit("error", { message: msg });
      }
    });
  });
}

/** Hono アプリにメモ編集チャット関連ルートを登録する。 */
export function registerMemoChatRoute(app: Hono): void {
  // ---- セッション一覧（memo のみ）-------------------------
  app.get("/api/memo/chat/sessions", (c) => c.json(listSessions(c.get("db"), "memo")));

  // ---- 履歴（resume 時に表示する会話を JSONL から復元）------
  app.get("/api/memo/chat/sessions/:id/messages", (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const file = getSessionFile(db, id);
    return c.json(readSessionMessages(db, file, getResolutions(db, id), "memo"));
  });

  // ---- 提案カードの解決状態（保存/破棄）を永続化 -----------
  app.post("/api/memo/chat/sessions/:id/resolutions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { proposalId?: unknown; status?: unknown };
    const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";
    const status = body.status === "saved" || body.status === "dismissed" ? body.status : null;
    if (!proposalId || !status) return c.json({ error: "proposalId と status（saved/dismissed）が必要です。" }, 400);
    recordResolution(c.get("db"), c.req.param("id"), proposalId, status);
    return c.json({ ok: true });
  });

  // ---- セッション削除（行 + JSONL ファイル）----------------
  app.delete("/api/memo/chat/sessions/:id", (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const session = getSession(db, id);
    if (session?.session_file && existsSync(session.session_file)) {
      try {
        rmSync(session.session_file);
      } catch {
        /* ファイル削除失敗は致命的でない */
      }
    }
    deleteSession(db, id);
    return c.json({ ok: true });
  });

  // ---- 会話（SSE）-----------------------------------------
  app.post("/api/memo/chat", async (c) => {
    const db = c.get("db");
    const sessionDir = c.get("sessionDir");
    const body = (await c.req.json().catch(() => ({}))) as {
      sessionId?: unknown;
      message?: unknown;
      images?: unknown;
      pageId?: unknown;
    };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    let message = typeof body.message === "string" ? body.message.trim() : "";
    const pageId = typeof body.pageId === "string" ? body.pageId : "";
    const images: AgentImage[] = Array.isArray(body.images)
      ? (body.images as Array<{ data?: unknown; mimeType?: unknown }>)
          .filter((im): im is AgentImage => !!im && typeof im.data === "string" && typeof im.mimeType === "string")
          .slice(0, 4)
      : [];

    return streamSSE(c, async (stream) => {
      let costUSD = 0;
      const emit: EmitFn = (event, data) => {
        if (event === "usage" && data && typeof (data as { costUSD?: unknown }).costUSD === "number") {
          costUSD += (data as { costUSD: number }).costUSD;
        }
        return stream.writeSSE({ event, data: JSON.stringify(data) });
      };

      if (!sessionId) {
        await emit("error", { message: "sessionId が指定されていません。" });
        return;
      }
      if (!message && images.length === 0) {
        await emit("error", { message: "メッセージが空です。" });
        return;
      }
      if (!message) message = "添付画像の内容を読み取って、開いているメモへの追記・整形を提案してください。";

      // セッション行を用意（初回はタイトルも設定・kind='memo'）。
      upsertSession(db, sessionId, message, "memo");

      // クライアント切断時はエージェントを中断する。
      const controller = new AbortController();
      stream.onAbort(() => controller.abort());

      const tools = createMemoTools({ db, emit });
      // 開いているメモがあれば、その内容をプロンプト前置きとして与える（毎回 get 不要にする）。
      const prompt = pageId ? memoContextPreamble(db, pageId) + message : message;
      // モデルが読めるよう HEIC/HEIF は PNG へ正規化（クライアント変換の保険）。
      const modelImages = await Promise.all(images.map(normalizeImageForWeb));

      try {
        const sessionFile = await runChatAgent({
          prompt,
          systemPrompt: MEMO_SYSTEM_PROMPT,
          resumeSessionFile: getSessionFile(db, sessionId),
          customTools: tools,
          sessionDir,
          emit,
          images: modelImages,
          signal: controller.signal,
        });
        recordTurn(db, sessionId, { sessionFile, costUSD });
        await emit("done", {});
      } catch (err) {
        const msg =
          err instanceof MissingApiKeyError
            ? err.message
            : `エージェントの実行中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`;
        await emit("error", { message: msg });
      }
    });
  });
}
