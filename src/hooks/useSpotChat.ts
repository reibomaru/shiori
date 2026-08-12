// スポット編集エージェントとのチャットを管理するフック。
// POST /api/spots/chat の SSE（fetch + ReadableStream）を読み、
// 本文・ツール実行・提案・コストを state へ反映する。
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Spot } from "../types";
import { api, projectHeader, type ChatSessionSummary } from "../api";
import { uuid } from "../uuid";

export type ProposalOp = "create" | "update" | "delete";

export interface Proposal {
  tempId: string;
  op: ProposalOp;
  id: string | null;
  /** create/update の下書き（許可フィールドのみ）。delete では null。 */
  spot: Partial<Spot> | null;
  /** update/delete 時の既存の値。create では null。 */
  current: Spot | null;
  /** 履歴復元時に付与される解決状態（保存/破棄）。live では未設定。 */
  status?: ProposalStatus;
}

export interface ToolChip {
  id: string;
  name: string;
  detail?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools: ToolChip[];
  proposals: Proposal[];
  /** ユーザーが添付した画像のプレビュー（data URL）。表示用。 */
  images: string[];
}

/** 添付画像。dataUrl は表示用、base64 は API 送信用（プレフィックス無し）。 */
export interface AttachedImage {
  dataUrl: string;
  base64: string;
  mimeType: string;
  /** 元のファイル名（費用の領収書/請求書で表示・保存に使う。チャット添付では未設定）。 */
  name?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  costUSD: number;
}

export type ProposalStatus = "pending" | "saved" | "dismissed";

/** AI エラーの区別（BYOK 登録導線の出し分け用）。 */
export type ChatErrorCode = "missing_key" | "limit_exceeded" | null;

const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 };

/** SSE のテキストを `{event, data}` の列へ分解しながら順に渡す。 */
async function readSSE(
  res: Response,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    // SSE フレームは空行（\n\n）区切り。
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      try {
        onEvent(event, JSON.parse(dataLines.join("\n")));
      } catch {
        /* パースできないフレームは無視 */
      }
    }
  }
}

export function useSpotChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [usage, setUsage] = useState<Usage>(EMPTY_USAGE);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // AI キー未登録 / 上限超過はフロントで BYOK 登録導線を出すため区別する。
  const [errorCode, setErrorCode] = useState<ChatErrorCode>(null);
  const [statuses, setStatuses] = useState<Record<string, ProposalStatus>>({});

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  // アクティブな会話は URL クエリ（?chat=<sessionId>）で保持し、リロードや共有で復元できるようにする。
  const [searchParams, setSearchParams] = useSearchParams();
  const restoreId = useRef(searchParams.get("chat")).current; // 初回マウント時の ?chat=（復元対象）
  const [activeId, setActiveId] = useState<string>(() => restoreId || uuid());
  const [loadingHistory, setLoadingHistory] = useState(false);

  // send 内で参照する最新の sessionId（state のクロージャ陳腐化を避ける）。
  const sessionIdRef = useRef<string>(activeId);
  const abortRef = useRef<AbortController | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const list = await api.listChatSessions();
      setSessions(list);
      // アクティブな会話のコストを一覧から反映（URL 復元時に表示できるように）。
      const cur = list.find((s) => s.id === sessionIdRef.current);
      if (cur) setUsage((u) => (u.costUSD === 0 ? { ...u, costUSD: cur.cost_usd } : u));
    } catch {
      /* 一覧取得失敗は致命的でない */
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // activeId が変わったら URL の ?chat= に反映（履歴は汚さないよう replace）。
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("chat", activeId);
        return p;
      },
      { replace: true },
    );
  }, [activeId, setSearchParams]);

  // 初回マウント時、URL に ?chat= があればその会話履歴を復元する。
  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current || !restoreId) return;
    didRestore.current = true;
    setLoadingHistory(true);
    setError(null);
    api
      .getChatSessionMessages(restoreId)
      .then((msgs) => setMessages(msgs))
      .catch((e) => setError(String(e instanceof Error ? e.message : e)))
      .finally(() => setLoadingHistory(false));
  }, [restoreId]);

  /** 最後の assistant メッセージを更新するヘルパー。 */
  const patchLastAssistant = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "assistant") {
          next[i] = fn(next[i]);
          break;
        }
      }
      return next;
    });
  }, []);

  const send = useCallback(
    async (text: string, images: AttachedImage[] = []) => {
      const message = text.trim();
      if ((!message && images.length === 0) || streaming) return;
      setError(null);
      setErrorCode(null);
      setMessages((prev) => [
        ...prev,
        { role: "user", text: message, tools: [], proposals: [], images: images.map((i) => i.dataUrl) },
        { role: "assistant", text: "", tools: [], proposals: [], images: [] },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/spots/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...projectHeader() },
          credentials: "same-origin",
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            message,
            images: images.map((i) => ({ data: i.base64, mimeType: i.mimeType })),
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        await readSSE(res, (event, data) => {
          const d = data as Record<string, unknown>;
          switch (event) {
            case "text_delta":
              patchLastAssistant((m) => ({ ...m, text: m.text + (d.chunk as string) }));
              break;
            case "tool_use":
              patchLastAssistant((m) => ({
                ...m,
                tools: [...m.tools, { id: d.id as string, name: d.name as string, detail: d.detail as string | undefined }],
              }));
              break;
            case "proposal":
              patchLastAssistant((m) => ({ ...m, proposals: [...m.proposals, d as unknown as Proposal] }));
              break;
            case "usage":
              setUsage((u) => ({
                inputTokens: u.inputTokens + (Number(d.inputTokens) || 0),
                outputTokens: u.outputTokens + (Number(d.outputTokens) || 0),
                cacheReadInputTokens: u.cacheReadInputTokens + (Number(d.cacheReadInputTokens) || 0),
                costUSD: u.costUSD + (Number(d.costUSD) || 0),
              }));
              break;
            case "error":
              setError(String(d.message ?? "不明なエラー"));
              setErrorCode((d.code as ChatErrorCode) ?? null);
              break;
          }
        });
        // タイトル・更新時刻・コストが変わるので一覧を更新。
        void loadSessions();
      } catch (e) {
        if (!controller.signal.aborted) setError(String(e instanceof Error ? e.message : e));
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, patchLastAssistant, loadSessions],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const setProposalStatus = useCallback((tempId: string, status: ProposalStatus) => {
    setStatuses((s) => ({ ...s, [tempId]: status }));
  }, []);

  /** 新しい会話を始める（未保存の表示をクリアし、新しい sessionId を採番）。 */
  const newSession = useCallback(() => {
    abortRef.current?.abort();
    const id = uuid();
    sessionIdRef.current = id;
    setActiveId(id);
    setMessages([]);
    setUsage(EMPTY_USAGE);
    setStatuses({});
    setError(null);
    setErrorCode(null);
  }, []);

  /** 既存セッションを開いて履歴を復元（resume）。 */
  const selectSession = useCallback(
    async (summary: ChatSessionSummary) => {
      abortRef.current?.abort();
      sessionIdRef.current = summary.id;
      setActiveId(summary.id);
      setMessages([]);
      setStatuses({});
      setError(null);
      setErrorCode(null);
      setUsage({ ...EMPTY_USAGE, costUSD: summary.cost_usd });
      setLoadingHistory(true);
      try {
        setMessages(await api.getChatSessionMessages(summary.id));
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setLoadingHistory(false);
      }
    },
    [],
  );

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await api.deleteChatSession(id);
      } catch {
        /* 削除失敗は無視 */
      }
      await loadSessions();
      if (id === sessionIdRef.current) newSession();
    },
    [loadSessions, newSession],
  );

  return {
    messages,
    usage,
    streaming,
    error,
    errorCode,
    statuses,
    sessions,
    activeId,
    loadingHistory,
    send,
    stop,
    setProposalStatus,
    newSession,
    selectSession,
    deleteSession,
  };
}

/** useSpotChat の戻り値型（セッション一覧・チャット本体で共有するため）。 */
export type UseSpotChat = ReturnType<typeof useSpotChat>;
