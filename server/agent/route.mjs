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
import { streamSSE } from "hono/streaming";
import { createSpotTools } from "./tools.mjs";
import { runSpotAgent, MissingApiKeyError } from "./runner.mjs";
import {
  upsertSession,
  getSessionFile,
  recordTurn,
  listSessions,
  getSession,
  deleteSession,
} from "./sessions.mjs";
import { readSessionMessages } from "./history.mjs";

const WEBSEARCH_API_KEY = process.env.WEBSEARCH_API_KEY ?? "";

/** Hono アプリにチャット関連ルートを登録する。 */
export function registerSpotChatRoute(app, db) {
  // ---- セッション一覧 -------------------------------------
  app.get("/api/spots/chat/sessions", (c) => c.json(listSessions(db)));

  // ---- 履歴（resume 時に表示する会話を JSONL から復元）------
  app.get("/api/spots/chat/sessions/:id/messages", (c) => {
    const file = getSessionFile(db, c.req.param("id"));
    return c.json(readSessionMessages(file));
  });

  // ---- セッション削除（行 + JSONL ファイル）----------------
  app.delete("/api/spots/chat/sessions/:id", (c) => {
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
    const body = await c.req.json().catch(() => ({}));
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    let message = typeof body.message === "string" ? body.message.trim() : "";
    const images = Array.isArray(body.images)
      ? body.images
          .filter((im) => im && typeof im.data === "string" && typeof im.mimeType === "string")
          .slice(0, 4)
      : [];

    return streamSSE(c, async (stream) => {
      let costUSD = 0;
      const emit = (event, data) => {
        if (event === "usage" && data && typeof data.costUSD === "number") costUSD += data.costUSD;
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

      try {
        const sessionFile = await runSpotAgent({
          prompt: message,
          resumeSessionFile: getSessionFile(db, sessionId),
          customTools: tools,
          emit,
          images,
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
