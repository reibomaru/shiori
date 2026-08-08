import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("memo");
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
    const next = title.trim() || t("list.untitled");
    if (next !== page.title) void onUpdate({ title: next });
    setTitle(next);
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
        placeholder={t("editor.titlePlaceholder")}
        className="w-full border-0 border-b border-transparent bg-transparent pb-1 text-xl font-bold text-slate-800 focus:border-cyan-300 focus:outline-none dark:text-slate-100 dark:placeholder-slate-500"
      />

      {/* 本文（Markdown） */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{t("editor.sectionLabel")}</h3>
          {!editBody && (
            <button
              onClick={() => {
                setBodyDraft(page.body ?? "");
                setEditBody(true);
              }}
              className="no-print flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700"
            >
              <FaPen className="text-[10px]" /> {t("common:actions.edit")}
            </button>
          )}
        </div>
        {editBody ? (
          <div className="space-y-2">
            {/* Markdown を直接編集。右（広い画面）／下（狭い画面）にライブプレビューを出す。 */}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <textarea
                value={bodyDraft}
                onChange={(e) => setBodyDraft(e.target.value)}
                placeholder={t("editor.bodyPlaceholder")}
                className="min-h-[20rem] w-full resize-y rounded-xl border border-slate-200 bg-white p-4 font-mono text-sm leading-relaxed text-slate-700 shadow-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
              />
              <div className="min-h-[20rem] overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{t("editor.preview")}</p>
                {bodyDraft.trim() ? (
                  <Markdown>{bodyDraft}</Markdown>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t("editor.previewEmpty")}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setBodyDraft(page.body ?? "");
                  setEditBody(false);
                }}
                disabled={savingBody}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={saveBody}
                disabled={savingBody}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
              >
                <FaCheck className="text-xs" /> {savingBody ? t("common:state.saving") : t("common:actions.save")}
              </button>
            </div>
          </div>
        ) : page.body && page.body.trim() ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <Markdown>{page.body}</Markdown>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
            {t("editor.empty")}
          </div>
        )}
      </section>
    </div>
  );
}
