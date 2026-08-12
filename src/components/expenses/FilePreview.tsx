import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FaXmark, FaArrowUpRightFromSquare } from "react-icons/fa6";

/** プレビュー対象のファイル（配信 URL or blob/data URL）。 */
export interface PreviewFile {
  src: string;
  mimeType: string;
  name: string | null;
}

/**
 * 領収書/請求書ファイルのプレビュー（lightbox）。画像は img、PDF は iframe で表示する。
 * 実費フォーム（z-[600]）の上に出すため、より高い z-index の portal で描画する。
 */
export default function FilePreview({ file, onClose }: { file: PreviewFile | null; onClose: () => void }) {
  const { t } = useTranslation("budget");

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  if (!file) return null;
  const isPdf = file.mimeType === "application/pdf";

  return createPortal(
    <div
      className="fixed inset-0 z-[700] flex flex-col bg-slate-900/80 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div className="mx-auto flex w-full max-w-4xl items-center gap-2 pb-2 text-white">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {file.name || t("preview.untitled")}
        </span>
        <a
          href={file.src}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
        >
          <FaArrowUpRightFromSquare className="text-[11px]" /> {t("preview.openNewTab")}
        </a>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
          aria-label={t("preview.close")}
        >
          <FaXmark />
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        {isPdf ? (
          <iframe title={file.name || "PDF"} src={file.src} className="h-full w-full rounded-lg bg-white" />
        ) : (
          <img
            src={file.src}
            alt={file.name || t("preview.untitled")}
            className="m-auto max-h-full max-w-full rounded-lg object-contain"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
