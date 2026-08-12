import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FaXmark, FaUpload, FaWandMagicSparkles, FaTrash, FaCheck, FaFilePdf } from "react-icons/fa6";
import type { Expense, ExpenseExtraction } from "../../types";
import { api, expenseImageUrl } from "../../api";
import { readAttachedImage, isHeic, isPdf } from "../../lib/readAttachedImage";
import { CURRENCIES } from "../../lib/money";
import type { AttachedImage } from "../../hooks/useSpotChat";
import FilePreview, { type PreviewFile } from "./FilePreview";

/** base64 → 表示用の Blob URL（添付 PDF を iframe で確実にプレビューするため）。 */
function base64ToBlobUrl(base64: string, mimeType: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

/** 実費の費目（budget の費目と揃える想定）。DB に保存する値なので翻訳せず日本語のまま扱う。 */
export const EXPENSE_CATEGORIES = ["宿泊", "交通", "食事", "観光", "買い物", "その他"];

const MAX_IMAGES = 8;
const MAX_BYTES = 12 * 1024 * 1024;

/** 実費フォームで編集する下書き（保存前の値）。 */
interface Draft {
  category: string;
  title: string;
  vendor: string;
  amount: number;
  currency: string;
  paid: boolean;
  incurred_on: string;
  source_url: string;
  note: string;
}

function toDraft(e: Expense | null): Draft {
  return {
    category: e?.category ?? "宿泊",
    title: e?.title ?? "",
    vendor: e?.vendor ?? "",
    amount: e?.amount ?? 0,
    currency: e?.currency ?? "JPY",
    paid: e ? e.paid === 1 : false,
    incurred_on: e?.incurred_on ?? "",
    source_url: e?.source_url ?? "",
    note: e?.note ?? "",
  };
}

/**
 * 実費（確定した予約・領収書）を追加・編集するモーダル。
 * 領収書/予約完了画面のスクショをアップロード→抽出でフォームを埋め、
 * ユーザーが確認・修正してから保存する（自動保存はしない）。
 */
export default function ExpenseFormDialog({
  open,
  expense,
  onClose,
  onSaved,
}: {
  open: boolean;
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation("budget");
  const [draft, setDraft] = useState<Draft>(() => toDraft(expense));
  // 新規に添付した（まだ保存していない）領収書画像。
  const [attached, setAttached] = useState<AttachedImage[]>([]);
  // 編集時: 既存の領収書画像メタ（削除は即時 API 反映）。
  const [existing, setExisting] = useState(expense?.images ?? []);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // プレビュー対象（画像/PDF）。添付ファイルは blob URL を作るので閉じるとき revoke する。
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const revokeRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function openExistingPreview(im: (typeof existing)[number]) {
    setPreview({ src: expenseImageUrl(im.id, im.updated_at), mimeType: im.mime_type, name: im.filename });
  }
  function openAttachedPreview(a: AttachedImage) {
    // 画像は dataUrl で十分。PDF は iframe で確実に表示するため blob URL を作る。
    if (a.mimeType === "application/pdf") {
      const url = base64ToBlobUrl(a.base64, a.mimeType);
      revokeRef.current = url;
      setPreview({ src: url, mimeType: a.mimeType, name: a.name ?? null });
    } else {
      setPreview({ src: a.dataUrl, mimeType: a.mimeType, name: a.name ?? null });
    }
  }
  function closePreview() {
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }
    setPreview(null);
  }

  // ダイアログを開き直すたびに対象の実費で初期化する。
  useEffect(() => {
    if (!open) return;
    setDraft(toDraft(expense));
    setExisting(expense?.images ?? []);
    setAttached([]);
    setWarning(null);
    setError(null);
  }, [open, expense]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  /** 抽出結果をフォームに反映する（null 以外だけ上書き）。 */
  function applyExtraction(x: ExpenseExtraction) {
    setDraft((d) => ({
      ...d,
      title: x.title ?? d.title,
      vendor: x.vendor ?? d.vendor,
      amount: x.amount ?? d.amount,
      currency: x.currency ?? d.currency,
      paid: x.paid ?? d.paid,
      incurred_on: x.incurred_on ?? d.incurred_on,
      category: x.category ?? d.category,
      note: x.note ?? d.note,
    }));
  }

  async function addFiles(files: File[]) {
    const accepted = files.filter(
      (f) => (f.type.startsWith("image/") || isHeic(f) || isPdf(f)) && f.size <= MAX_BYTES,
    );
    if (accepted.length === 0) return;
    const read = await Promise.all(accepted.map(readAttachedImage));
    setAttached((prev) => [...prev, ...read].slice(0, MAX_IMAGES));
  }

  /** 添付画像から金額・日付・予約先などを抽出してフォームに反映する（null 以外だけ上書き）。 */
  async function extract() {
    if (attached.length === 0) return;
    setExtracting(true);
    setWarning(null);
    setError(null);
    try {
      const images = attached.map((a) => ({ data: a.base64, mimeType: a.mimeType }));
      const { extraction: x, warning: w } = await api.extractReceipt(images);
      applyExtraction(x);
      if (w) setWarning(w);
    } catch (e) {
      setError(t("form.error.extractFailed", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setExtracting(false);
    }
  }

  async function removeExisting(id: string) {
    await api.deleteExpenseImage(id);
    setExisting((prev) => prev.filter((im) => im.id !== id));
  }

  async function save() {
    if (!draft.title.trim()) {
      setError(t("form.error.titleRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        category: draft.category,
        title: draft.title.trim(),
        vendor: draft.vendor.trim() || null,
        amount: Math.round(draft.amount) || 0,
        currency: draft.currency,
        paid: draft.paid,
        incurred_on: draft.incurred_on || null,
        source_url: draft.source_url.trim() || null,
        note: draft.note.trim() || null,
      };
      const id = expense
        ? ((await api.updateExpense(expense.id, body))?.id ?? expense.id)
        : (await api.createExpense(body))?.id;
      const images = attached.map((a) => ({ data: a.base64, mimeType: a.mimeType, filename: a.name ?? null }));
      if (id && images.length > 0) await api.addExpenseImages(id, images);
      onSaved();
      onClose();
    } catch (e) {
      setError(t("form.error.saveFailed", { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || extracting;
  const fieldCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500";
  const labelCls = "mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400";
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium transition ${
      active
        ? "bg-cyan-600 text-white"
        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
    }`;

  return createPortal(
    <>
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800 dark:ring-1 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-slate-700">
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            {expense ? t("form.editTitle") : t("form.addTitle")}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          >
            <FaXmark />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {/* 領収書アップロード（複数ファイル・ペースト・D&D）→ 抽出 */}
          <section
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(Array.from(e.dataTransfer.files));
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) void addFiles(files);
            }}
            className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-slate-600 dark:bg-slate-900/40"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t("form.upload.hint")}</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-700"
              >
                <FaUpload className="text-[10px]" /> {t("form.upload.select")}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.heic,.heif,application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>

            {(existing.length > 0 || attached.length > 0) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {existing.map((im) => (
                  <div key={im.id} className="group relative w-16">
                    <button
                      type="button"
                      onClick={() => openExistingPreview(im)}
                      className="block h-16 w-16 overflow-hidden rounded-lg ring-1 ring-slate-200 transition hover:ring-cyan-400 dark:ring-slate-700"
                      title={t("form.upload.preview")}
                    >
                      {im.mime_type === "application/pdf" ? (
                        <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white text-rose-500 dark:bg-slate-800">
                          <FaFilePdf className="text-xl" />
                          <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">PDF</span>
                        </span>
                      ) : (
                        <img
                          src={expenseImageUrl(im.id, im.updated_at)}
                          alt={t("form.upload.attachedAlt")}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </button>
                    <span className="mt-1 block w-16 truncate text-[10px] text-slate-500 dark:text-slate-400" title={im.filename ?? undefined}>
                      {im.filename || t("form.upload.filenameFallback")}
                    </span>
                    <button
                      onClick={() => void removeExisting(im.id)}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white opacity-0 transition group-hover:opacity-100"
                      title={t("form.upload.removeImage")}
                    >
                      <FaTrash className="text-[9px]" />
                    </button>
                  </div>
                ))}
                {attached.map((a, i) => (
                  <div key={i} className="group relative w-16">
                    <button
                      type="button"
                      onClick={() => openAttachedPreview(a)}
                      className="block h-16 w-16 overflow-hidden rounded-lg ring-1 ring-cyan-300 transition hover:ring-cyan-400 dark:ring-cyan-500/50"
                      title={t("form.upload.preview")}
                    >
                      {a.mimeType === "application/pdf" ? (
                        <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-white text-rose-500 dark:bg-slate-800">
                          <FaFilePdf className="text-xl" />
                          <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">PDF</span>
                        </span>
                      ) : (
                        <img src={a.dataUrl} alt={t("form.upload.attachedAlt")} className="h-full w-full object-cover" />
                      )}
                    </button>
                    <span className="mt-1 block w-16 truncate text-[10px] text-slate-500 dark:text-slate-400" title={a.name}>
                      {a.name || t("form.upload.filenameFallback")}
                    </span>
                    <button
                      onClick={() => setAttached((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white opacity-0 transition group-hover:opacity-100"
                      title={t("form.upload.removeAttach")}
                    >
                      <FaXmark className="text-[9px]" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {attached.length > 0 && (
              <button
                onClick={() => void extract()}
                disabled={busy}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                <FaWandMagicSparkles className="text-xs" /> {extracting ? t("form.upload.extracting") : t("form.upload.extract")}
              </button>
            )}
            {warning && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{warning}</p>}
          </section>

          {/* 費目 */}
          <div>
            <label className={labelCls}>{t("form.field.category")}</label>
            <div className="flex flex-wrap gap-1.5">
              {EXPENSE_CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => set("category", cat)} className={chip(draft.category === cat)}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 概要 */}
          <div>
            <label className={labelCls}>{t("form.field.title")}</label>
            <input
              className={fieldCls}
              value={draft.title}
              placeholder={t("form.field.titlePlaceholder")}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>

          {/* 予約先 */}
          <div>
            <label className={labelCls}>{t("form.field.vendor")}</label>
            <input
              className={fieldCls}
              value={draft.vendor}
              placeholder={t("form.field.vendorPlaceholder")}
              onChange={(e) => set("vendor", e.target.value)}
            />
          </div>

          {/* 金額 + 通貨 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelCls}>{t("form.field.amount")}</label>
              <input
                type="number"
                className={`${fieldCls} text-right tabular-nums`}
                value={draft.amount}
                onChange={(e) => set("amount", Number(e.target.value))}
              />
            </div>
            <div>
              <label className={labelCls}>{t("form.field.currency")}</label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {CURRENCIES.map((cur) => (
                  <button key={cur} onClick={() => set("currency", cur)} className={chip(draft.currency === cur)}>
                    {cur}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 支払状況 + 日付 */}
          <div className="flex items-end gap-3">
            <div>
              <label className={labelCls}>{t("form.field.paidStatus")}</label>
              <button
                onClick={() => set("paid", !draft.paid)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  draft.paid
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                }`}
              >
                {draft.paid ? t("status.paid") : t("status.unpaid")}
              </button>
            </div>
            <div className="flex-1">
              <label className={labelCls}>{t("form.field.date")}</label>
              <input
                type="date"
                className={fieldCls}
                value={draft.incurred_on}
                onChange={(e) => set("incurred_on", e.target.value)}
              />
            </div>
          </div>

          {/* 参考リンク */}
          <div>
            <label className={labelCls}>{t("form.field.sourceUrl")}</label>
            <input
              className={fieldCls}
              value={draft.source_url}
              placeholder="https://…"
              onChange={(e) => set("source_url", e.target.value)}
            />
          </div>

          {/* メモ */}
          <div>
            <label className={labelCls}>{t("form.field.note")}</label>
            <textarea
              className={`${fieldCls} min-h-[3rem] resize-y`}
              value={draft.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-700">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            {t("form.cancel")}
          </button>
          <button
            onClick={() => void save()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
          >
            <FaCheck className="text-xs" /> {saving ? t("form.saving") : t("form.save")}
          </button>
        </div>
      </div>
    </div>
    <FilePreview file={preview} onClose={closePreview} />
    </>,
    document.body,
  );
}
