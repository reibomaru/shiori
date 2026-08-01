// メモ編集エージェントとのチャットを管理するフック。
// POST /api/memo/chat の SSE（fetch + ReadableStream）を読み、
// 本文・ツール実行・提案・コストを state へ反映する。
// useSpotChat と対になる実装（対象がスポット候補ではなくメモページ）。
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { MemoPage } from "../types";
import { api, projectHeader, type ChatSessionSummary } from "../api";
import { uuid } from "../uuid";
import type { AttachedImage, ProposalOp, ProposalStatus, ToolChip, Usage } from "./useSpotChat";

export interface MemoProposal {
  tempId: string;
  op: ProposalOp;
  id: string | null;
  /** create/update の下書き（title/body/html のみ）。delete では null。 */
  page: Partial<MemoPage> | null;
  /** update/delete 時の既存メモ。create では null。 */
  current: MemoPage | null;
  /** 履歴復元時に付与される解決状態（保存/破棄）。live では未設定。 */
  status?: ProposalStatus;
}

export interface MemoChatMessage {
  role: "user" | "assistant";
  text: string;
  tools: ToolChip[];
  proposals: MemoProposal[];
  /** ユーザーが添付した画像のプレビュー（data URL）。表示用。 */
  images: string[];
}

const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, costUSD: 0 };

/** SSE のテキストを `{event, data}` の列へ分解しながら順に渡す。 */
async function readSSE(res: Response, onEvent: (event: string, data: unknown) => void): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
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

/**
 * メモ編集チャット。send には対象メモの pageId を渡し、開いているメモを
 * エージェントに文脈として与える（提案の既定対象になる）。
 */
export function useMemoChat() {
  const [messages, setMessages] = useState<MemoChatMessage[]>([]);
  const [usage, setUsage] = useState<Usage>(EMPTY_USAGE);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ProposalStatus>>({});

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  // アクティブな会話は URL クエリ（?mchat=<sessionId>）で保持する（spot の ?chat= と分ける）。
  const [searchParams, setSearchParams] = useSearchParams();
  const restoreId = useRef(searchParams.get("mchat")).current;
  const [activeId, setActiveId] = useState<string>(() => restoreId || uuid());
  const [loadingHistory, setLoadingHistory] = useState(false);

  const sessionIdRef = useRef<string>(activeId);
  const abortRef = useRef<AbortController | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const list = await api.listMemoChatSessions();
      setSessions(list);
      const cur = list.find((s) => s.id === sessionIdRef.current);
      if (cur) setUsage((u) => (u.costUSD === 0 ? { ...u, costUSD: cur.cost_usd } : u));
    } catch {
      /* 一覧取得失敗は致命的でない */
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("mchat", activeId);
        return p;
      },
      { replace: true },
    );
  }, [activeId, setSearchParams]);

  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current || !restoreId) return;
    didRestore.current = true;
    setLoadingHistory(true);
    setError(null);
    api
      .getMemoChatSessionMessages(restoreId)
      .then((msgs) => setMessages(msgs))
      .catch((e) => setError(String(e instanceof Error ? e.message : e)))
      .finally(() => setLoadingHistory(false));
  }, [restoreId]);

  const patchLastAssistant = useCallback((fn: (m: MemoChatMessage) => MemoChatMessage) => {
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
    async (text: string, images: AttachedImage[] = [], pageId?: string) => {
      const message = text.trim();
      if ((!message && images.length === 0) || streaming) return;
      setError(null);
      setMessages((prev) => [
        ...prev,
        { role: "user", text: message, tools: [], proposals: [], images: images.map((i) => i.dataUrl) },
        { role: "assistant", text: "", tools: [], proposals: [], images: [] },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/memo/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...projectHeader() },
          credentials: "same-origin",
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            message,
            pageId: pageId ?? "",
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
              patchLastAssistant((m) => ({ ...m, proposals: [...m.proposals, d as unknown as MemoProposal] }));
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
              break;
          }
        });
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

  const newSession = useCallback(() => {
    abortRef.current?.abort();
    const id = uuid();
    sessionIdRef.current = id;
    setActiveId(id);
    setMessages([]);
    setUsage(EMPTY_USAGE);
    setStatuses({});
    setError(null);
  }, []);

  const selectSession = useCallback(async (summary: ChatSessionSummary) => {
    abortRef.current?.abort();
    sessionIdRef.current = summary.id;
    setActiveId(summary.id);
    setMessages([]);
    setStatuses({});
    setError(null);
    setUsage({ ...EMPTY_USAGE, costUSD: summary.cost_usd });
    setLoadingHistory(true);
    try {
      setMessages(await api.getMemoChatSessionMessages(summary.id));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await api.deleteMemoChatSession(id);
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

/** useMemoChat の戻り値型（セッション一覧・チャット本体で共有するため）。 */
export type UseMemoChat = ReturnType<typeof useMemoChat>;
