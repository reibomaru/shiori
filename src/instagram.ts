// Instagram 埋め込み（公式 embed.js）の共有ヘルパー。
//
// 埋め込みは iframe 実体。公式 oEmbed はトークン必須＆CORSで JSON 取得できないので、
// 「フロントでキャッシュして再フェッチしない」は次の方針で実現する:
//   - 埋め込み（blockquote → iframe）を一度マウントしたら **DOM から外さない/動かさない**
//     （iframe は DOM 移動・再マウントのたびに再読込されるため）。
//   - スポット一覧表示中に全スポットの埋め込みを（不可視で）マウントしておく＝prefetch。
//   - モーダルは開閉で表示/非表示を切り替えるだけ。再フェッチも再 process も起きない。
// この util はスクリプトの単一ロードと process() のスロットリング、URL 正規化を担う。

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

/** 投稿 URL を埋め込み用パーマリンク（クエリ除去・末尾スラッシュ）に正規化。 */
export function normalizePermalink(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/instagram\.com$/.test(u.hostname.replace(/^www\./, ""))) return null;
    const m = u.pathname.match(/\/(p|reel|tv)\/([^/]+)/);
    if (!m) return null;
    return `https://www.instagram.com/${m[1]}/${m[2]}/`;
  } catch {
    return null;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.instgrm) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.id = "instagram-embed-js";
    s.async = true;
    s.src = "https://www.instagram.com/embed.js";
    s.addEventListener("load", () => resolve(), { once: true });
    document.body.appendChild(s);
  });
  return scriptPromise;
}

// process() はページ上の未処理 blockquote をまとめて iframe 化する。複数ギャラリーが
// 同時にマウントされても 1 回にまとめるため軽くスロットリングする。
let scheduled = false;
export function processEmbeds(): void {
  if (scheduled) return;
  scheduled = true;
  loadScript().then(() => {
    scheduled = false;
    window.instgrm?.Embeds.process();
  });
}
