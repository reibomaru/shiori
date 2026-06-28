import { useEffect, useState } from "react";
import { FaInstagram } from "react-icons/fa6";
import { normalizePermalink, processEmbeds } from "../instagram";

export { normalizePermalink };

const DEFAULT_LIMIT = 6;

/**
 * スポットに紐づく Instagram 投稿の埋め込みギャラリー。
 *
 * 重要: 親（モーダル）がこのギャラリーを「常時マウントしたまま表示/非表示だけ切替」する
 * 前提で作る。blockquote を一度 process して iframe 化したら DOM から外さない＝
 * 再フェッチが起きない（iframe は再マウント・移動で再読込されるため）。
 */
export default function InstagramGallery({ urls }: { urls: string[] }) {
  const permalinks = Array.from(
    new Set(urls.map(normalizePermalink).filter((u): u is string => !!u))
  );
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? permalinks : permalinks.slice(0, DEFAULT_LIMIT);

  // 表示対象が変わったら未処理 blockquote を iframe 化（追加分のみ処理される）
  useEffect(() => {
    if (shown.length) processEmbeds();
  }, [shown.join("|")]);

  if (permalinks.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-400">
        <FaInstagram className="text-base text-slate-300" />
        関連する Instagram 投稿はまだありません。
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {shown.map((url) => (
          <blockquote
            key={url}
            className="instagram-media"
            data-instgrm-permalink={url}
            data-instgrm-version="14"
            style={{ background: "#fff", border: 0, margin: 0, minWidth: 0, maxWidth: "100%", width: "100%" }}
          >
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-cyan-700">
              {url}
            </a>
          </blockquote>
        ))}
      </div>
      {permalinks.length > DEFAULT_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-cyan-700 hover:underline"
        >
          {expanded ? "閉じる" : `他 ${permalinks.length - DEFAULT_LIMIT} 件を表示`}
        </button>
      )}
    </div>
  );
}
