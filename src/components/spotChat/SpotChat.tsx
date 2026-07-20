import { useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaStop, FaWandMagicSparkles, FaImage, FaXmark, FaTrash } from "react-icons/fa6";
import { PanelRightClose } from "lucide-react";
import { api } from "../../api";
import { type AttachedImage, type Proposal, type UseSpotChat } from "../../hooks/useSpotChat";
import { readAttachedImage, isHeic } from "../../lib/readAttachedImage";
import ProposalCard from "./ProposalCard";
import SessionSelect from "./SessionSelect";
import ConfirmDialog from "../ConfirmDialog";
import Markdown from "./Markdown";

const MAX_IMAGES = 4;
const MAX_BYTES = 12 * 1024 * 1024; // 1 枚あたり 12MB まで（HEIC の元ファイルは大きめ）

const TOOL_LABELS: Record<string, string> = {
  list_spots: "候補一覧を確認",
  web_search: "Web 検索",
  fetch_url: "ページ取得",
  geocode: "座標を取得",
  propose_upsert_spot: "追加/更新を提案",
  propose_delete_spot: "削除を提案",
};

const SUGGESTIONS = [
  "ツェルマットでマッターホルンが見えるおすすめスポットを3つ追加して",
  "ニースの海沿いで朝食できるカフェを調べて候補に入れて",
  "今ある候補の重複を確認して整理を提案して",
];

export default function SpotChat({ chat, reload, onClose }: { chat: UseSpotChat; reload: () => void; onClose?: () => void }) {
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

  async function saveProposal(p: Proposal, body: Record<string, unknown>) {
    setSavingId(p.tempId);
    setSaveError(null);
    try {
      if (p.op === "create") await api.createSpot(body);
      else if (p.op === "update" && p.id != null) await api.updateSpot(p.id, body);
      else if (p.op === "delete" && p.id != null) await api.deleteSpot(p.id);
      setProposalStatus(p.tempId, "saved");
      // リロード後も再保存させないようサーバへ解決状態を永続化（失敗は致命的でない）。
      void api.resolveProposal(activeId, p.tempId, "saved").catch(() => {});
      reload();
    } catch (e) {
      setSaveError(`保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingId(null);
    }
  }

  function dismissProposal(p: Proposal) {
    setProposalStatus(p.tempId, "dismissed");
    void api.resolveProposal(activeId, p.tempId, "dismissed").catch(() => {});
  }

  function submit(text: string) {
    if ((!text.trim() && attached.length === 0) || streaming) return;
    setInput("");
    void send(text, attached);
    setAttached([]);
  }

  const activeTitle = sessions.find((s) => s.id === activeId)?.title ?? "この会話";

  return (
    <div className="flex h-full flex-col bg-white">
      <ConfirmDialog
        open={confirmDelete}
        title="会話を削除しますか？"
        message={`「${activeTitle}」の会話履歴を削除します。この操作は取り消せません。`}
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
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        {onClose && (
          <button
            onClick={onClose}
            title="チャットを閉じる"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <PanelRightClose size={16} />
          </button>
        )}
        <SessionSelect
          value={activeId}
          options={[
            ...(activeSaved ? [] : [{ id: activeId, title: "新しい会話" }]),
            ...sessions,
          ]}
          onSelect={(id) => {
            const s = sessions.find((x) => x.id === id);
            if (s) void selectSession(s);
          }}
          onCreate={newSession}
        />
        {activeSaved && (
          <button
            onClick={() => setConfirmDelete(true)}
            title="この会話を削除"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <FaTrash className="text-xs" />
          </button>
        )}
      </div>
      {usage.costUSD > 0 && (
        <div className="flex justify-end border-b border-slate-100 px-3 py-1">
          <span className="text-[11px] text-slate-400" title="このセッションの累計コスト">
            {usage.inputTokens + usage.outputTokens > 0 && `${(usage.inputTokens + usage.outputTokens).toLocaleString()} tok · `}
            ${usage.costUSD.toFixed(4)}
          </span>
        </div>
      )}

      {/* メッセージ */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loadingHistory && <p className="py-6 text-center text-xs text-slate-400">履歴を読み込み中…</p>}
        {!loadingHistory && messages.length === 0 && (
          <div className="mx-auto max-w-md py-6 text-center">
            <FaWandMagicSparkles className="mx-auto mb-2 text-2xl text-cyan-600" />
            <p className="text-sm text-slate-500">
              行きたいスポットを言葉で伝えると、AI が情報を調べて候補への追加・更新・削除を提案します。
              保存はあなたが確認してから確定します。
            </p>
            <div className="mt-4 space-y-2 text-left">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  className="block w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 ring-1 ring-slate-200 transition-colors hover:bg-cyan-50 hover:text-cyan-800"
                >
                  {s}
                </button>
              ))}
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
                  {/* ツール実行チップ */}
                  {m.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.tools.map((t, j) => (
                        <span
                          key={t.id + j}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
                        >
                          <span className="font-medium text-slate-600">{TOOL_LABELS[t.name] ?? t.name}</span>
                          {t.detail && <span className="max-w-[200px] truncate text-slate-400">{t.detail}</span>}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.text && <Markdown>{m.text}</Markdown>}
                  {/* 提案カード */}
                  {m.proposals.map((p) => (
                    <ProposalCard
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
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" /> 考え中…
          </div>
        )}
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
        {saveError && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{saveError}</div>}
      </div>

      {/* 入力（メッセージ欄と地続きに見せるため区切り線は置かない） */}
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
        {/* 一体型の入力カード：テキストと操作ボタンを 1 つの角丸にまとめる */}
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-colors focus-within:border-cyan-400">
          {/* 添付画像のプレビュー */}
          {attached.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attached.map((im, i) => (
                <div key={i} className="relative">
                  <img src={im.dataUrl} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200" />
                  <button
                    onClick={() => setAttached((a) => a.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[10px] text-white hover:bg-slate-900"
                    title="削除"
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
              // IME 変換中（日本語入力の確定 Enter など）は送信しない。
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder="メッセージを入力…"
            className="max-h-32 min-h-[24px] w-full resize-none border-0 bg-transparent p-0 text-sm leading-6 placeholder:text-slate-400 focus:outline-none focus:ring-0"
          />
          {/* 操作ボタン：カード内下段（左＝添付 / 右＝送信・中断） */}
          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={streaming || attached.length >= MAX_IMAGES}
              title="画像を添付"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            >
              <FaImage />
            </button>
            {streaming ? (
              <button
                onClick={stop}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300"
                title="中断"
              >
                <FaStop />
              </button>
            ) : (
              <button
                onClick={() => submit(input)}
                disabled={!input.trim() && attached.length === 0}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-700 text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
                title="送信"
              >
                <FaPaperPlane />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-slate-400">Enter で送信 / Shift+Enter で改行</p>
      </div>
    </div>
  );
}
