import { useEffect, useState } from "react";
import { FaCheck, FaPen } from "react-icons/fa6";
import type { MemoPage } from "../../types";
import Markdown from "../spotChat/Markdown";

/**
 * メモ 1 ページの詳細（タイトル + 自由記述の Markdown 本文）。
 * 画像の読み取り・取り込みは「AI で編集」チャット（マルチモーダル）に一本化したため、
 * ここは 1 つのメモ文書だけを表示・編集する。
 */
export default function MemoDetail({
  page,
  onUpdate,
}: {
  page: MemoPage;
  onUpdate: (patch: Partial<MemoPage>) => Promise<void>;
}) {
  const [title, setTitle] = useState(page.title);
  const [editBody, setEditBody] = useState(false);
  const [bodyDraft, setBodyDraft] = useState(page.body ?? "");
  const [savingBody, setSavingBody] = useState(false);

  // ページを切り替えたらローカルの下書きを同期する。
  useEffect(() => {
    setTitle(page.title);
    setBodyDraft(page.body ?? "");
    setEditBody(false);
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTitle = () => {
    const t = title.trim() || "無題のメモ";
    if (t !== page.title) void onUpdate({ title: t });
    setTitle(t);
  };

  const saveBody = async () => {
    setSavingBody(true);
    try {
      await onUpdate({ body: bodyDraft });
      setEditBody(false);
    } finally {
      setSavingBody(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* タイトル */}
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="メモのタイトル"
        className="w-full border-0 border-b border-transparent bg-transparent pb-1 text-xl font-bold text-slate-800 focus:border-cyan-300 focus:outline-none"
      />

      {/* 本文（Markdown） */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-500">メモ</h3>
          {!editBody && (
            <button
              onClick={() => {
                setBodyDraft(page.body ?? "");
                setEditBody(true);
              }}
              className="no-print flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200"
            >
              <FaPen className="text-[10px]" /> 編集
            </button>
          )}
        </div>
        {editBody ? (
          <div className="space-y-2">
            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              placeholder="持ち物リスト、思いつき、リンク、画像から読み取った情報などを Markdown で自由に書けます。「AI で編集」から画像を渡して書いてもらうこともできます。"
              className="min-h-[16rem] w-full resize-y rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-relaxed text-slate-700 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setBodyDraft(page.body ?? "");
                  setEditBody(false);
                }}
                disabled={savingBody}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={saveBody}
                disabled={savingBody}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
              >
                <FaCheck className="text-xs" /> {savingBody ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        ) : page.body && page.body.trim() ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <Markdown>{page.body}</Markdown>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            まだメモがありません。「編集」から自由に書き込むか、「AI で編集」で画像を渡して書いてもらえます。
          </div>
        )}
      </section>
    </div>
  );
}
