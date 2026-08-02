import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FaPaperPlane, FaStop, FaWandMagicSparkles, FaImage, FaXmark, FaTrash } from "react-icons/fa6";
import { PanelRightClose } from "lucide-react";
import { api } from "../../api";
import type { MemoProposal, UseMemoChat } from "../../hooks/useMemoChat";
import type { AttachedImage } from "../../hooks/useSpotChat";
import { readAttachedImage, isHeic } from "../../lib/readAttachedImage";
import MemoProposalCard from "./MemoProposalCard";
import SessionSelect from "../spotChat/SessionSelect";
import ConfirmDialog from "../ConfirmDialog";
import Markdown from "../spotChat/Markdown";

const MAX_IMAGES = 4;
const MAX_BYTES = 12 * 1024 * 1024; // 1 枚あたり 12MB まで（HEIC の元ファイルは大きめ）

// ツール名 → i18n キー。ラベル文言は locale 側で管理する。
const TOOL_LABEL_KEYS: Record<string, string> = {
  list_memo_pages: "chat.tools.list_memo_pages",
  get_memo_page: "chat.tools.get_memo_page",
  propose_upsert_memo_page: "chat.tools.propose_upsert_memo_page",
  propose_delete_memo_page: "chat.tools.propose_delete_memo_page",
};

const SUGGESTION_KEYS = ["chat.suggestions.fixTypos", "chat.suggestions.summarize", "chat.suggestions.packingList"];

export default function MemoChat({
  chat,
  reload,
  onClose,
  pageId,
}: {
  chat: UseMemoChat;
  reload: () => void;
  onClose?: () => void;
  /** 現在開いているメモの id（提案の既定対象としてエージェントに渡す）。 */
  pageId?: string;
}) {
  const { t } = useTranslation("memo");
  const {
    messages, usage, streaming, error, statuses, loadingHistory,
    sessions, activeId, send, stop, setProposalStatus, newSession, selectSession, deleteSession,
  } = chat;
  const activeSaved = sessions.some((s) => s.id === activeId);
  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<AttachedImage[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(files: File[]) {
    // HEIC は type が空のこともあるため、拡張子でも画像として受け付ける。
    const imgs = files.filter((f) => (f.type.startsWith("image/") || isHeic(f)) && f.size <= MAX_BYTES);
    if (imgs.length === 0) return;
    const read = await Promise.all(imgs.map(readAttachedImage));
    setAttached((prev) => [...prev, ...read].slice(0, MAX_IMAGES));
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function saveProposal(p: MemoProposal, body: Record<string, unknown>) {
    setSavingId(p.tempId);
    setSaveError(null);
    try {
      if (p.op === "create") await api.createMemoPage(body);
      else if (p.op === "update" && p.id != null) await api.updateMemoPage(p.id, body);
      else if (p.op === "delete" && p.id != null) await api.deleteMemoPage(p.id);
      setProposalStatus(p.tempId, "saved");
      // リロード後も再保存させないようサーバへ解決状態を永続化（失敗は致命的でない）。
      void api.resolveMemoProposal(activeId, p.tempId, "saved").catch(() => {});
      reload();
    } catch (e) {
      setSaveError(t("chat.saveError", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSavingId(null);
    }
  }

  function dismissProposal(p: MemoProposal) {
    setProposalStatus(p.tempId, "dismissed");
    void api.resolveMemoProposal(activeId, p.tempId, "dismissed").catch(() => {});
  }

  function submit(text: string) {
    if ((!text.trim() && attached.length === 0) || streaming) return;
    setInput("");
    void send(text, attached, pageId);
    setAttached([]);
  }

  const activeTitle = sessions.find((s) => s.id === activeId)?.title ?? t("chat.defaultSessionName");

  return (
    <div className="mesh-light flex h-full flex-col">
      <ConfirmDialog
        open={confirmDelete}
        title={t("confirm.deleteSessionTitle")}
        message={t("confirm.deleteSessionMessage", { title: activeTitle })}
        busy={deletingSession}
        onConfirm={async () => {
          setDeletingSession(true);
          try {
            await deleteSession(activeId);
            setConfirmDelete(false);
          } finally {
            setDeletingSession(false);
          }
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      {/* ヘッダ: 会話履歴はセレクトボックスで選択 */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-700">
        {onClose && (
          <button
            onClick={onClose}
            title={t("detail.closeChat")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <PanelRightClose size={16} />
          </button>
        )}
        <SessionSelect
          value={activeId}
          options={[...(activeSaved ? [] : [{ id: activeId, title: t("chat.newSession") }]), ...sessions]}
          onSelect={(id) => {
            const s = sessions.find((x) => x.id === id);
            if (s) void selectSession(s);
          }}
          onCreate={newSession}
        />
        {activeSaved && (
          <button
            onClick={() => setConfirmDelete(true)}
            title={t("chat.deleteSession")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          >
            <FaTrash className="text-xs" />
          </button>
        )}
      </div>
      {usage.costUSD > 0 && (
        <div className="flex justify-end border-b border-slate-100 px-3 py-1 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 dark:text-slate-500" title={t("chat.sessionCostTitle")}>
            {usage.inputTokens + usage.outputTokens > 0 && `${(usage.inputTokens + usage.outputTokens).toLocaleString()} tok · `}
            ${usage.costUSD.toFixed(4)}
          </span>
        </div>
      )}

      {/* メッセージ */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loadingHistory && <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">{t("chat.loadingHistory")}</p>}
        {!loadingHistory && messages.length === 0 && (
          <div className="mx-auto max-w-md py-6 text-center">
            <FaWandMagicSparkles className="mx-auto mb-2 text-2xl text-cyan-600 dark:text-cyan-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("chat.introText")}
            </p>
            <div className="mt-4 space-y-2 text-left">
              {SUGGESTION_KEYS.map((key) => {
                const s = t(key);
                return (
                  <button
                    key={key}
                    onClick={() => submit(s)}
                    className="block w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-cyan-50 hover:text-cyan-800 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-300"
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={m.role === "user" ? "max-w-[85%]" : "w-full"}>
              {m.role === "user" ? (
                <div className="space-y-1">
                  {m.images.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {m.images.map((src, j) => (
                        <img key={j} src={src} alt="" className="h-24 w-24 rounded-lg object-cover ring-1 ring-cyan-200" />
                      ))}
                    </div>
                  )}
                  {m.text && (
                    <div className="rounded-2xl rounded-br-sm bg-cyan-700 px-3 py-2 text-sm text-white">{m.text}</div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {m.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.tools.map((tool, j) => (
                        <span
                          key={tool.id + j}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        >
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            {TOOL_LABEL_KEYS[tool.name] ? t(TOOL_LABEL_KEYS[tool.name]) : tool.name}
                          </span>
                          {tool.detail && <span className="max-w-[200px] truncate text-slate-400 dark:text-slate-500">{tool.detail}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.text && <Markdown>{m.text}</Markdown>}
                  {m.proposals.map((p) => (
                    <MemoProposalCard
                      key={p.tempId}
                      proposal={p}
                      status={statuses[p.tempId] ?? p.status ?? "pending"}
                      busy={savingId === p.tempId}
                      onSave={(body) => saveProposal(p, body)}
                      onDismiss={() => dismissProposal(p)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {streaming && (
          <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" /> {t("chat.thinking")}
          </div>
        )}
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
        {saveError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{saveError}</div>}
      </div>

      {/* 入力 */}
      <div className="p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-cyan-400 dark:border-slate-700 dark:bg-slate-800">
          {attached.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attached.map((im, i) => (
                <div key={i} className="relative">
                  <img src={im.dataUrl} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
                  <button
                    onClick={() => setAttached((a) => a.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[10px] text-white hover:bg-slate-900"
                    title={t("chat.removeImage")}
                  >
                    <FaXmark />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.some((f) => f.type.startsWith("image/"))) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder={t("chat.inputPlaceholder")}
            className="max-h-32 min-h-[24px] w-full resize-none border-0 bg-transparent p-0 text-sm leading-6 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={streaming || attached.length >= MAX_IMAGES}
              title={t("chat.attachImage")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            >
              <FaImage />
            </button>
            {streaming ? (
              <button
                onClick={stop}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                title={t("chat.stop")}
              >
                <FaStop />
              </button>
            ) : (
              <button
                onClick={() => submit(input)}
                disabled={!input.trim() && attached.length === 0}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-700 text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
                title={t("chat.sendTitle")}
              >
                <FaPaperPlane />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-slate-400 dark:text-slate-500">{t("chat.sendHint")}</p>
      </div>
    </div>
  );
}
