// 添付画像の読み込みユーティリティ（スポット/メモ両チャットで共有）。
// iPhone 標準の HEIC/HEIF はブラウザが <img> で表示できず、モデルも読み取れない。
// ブラウザ内変換（heic2any 等）は環境依存で不安定なため、サーバの
// /api/image/normalize（heic-convert）で確実に PNG へ変換し、プレビュー・送信の
// 両方でその PNG を使う。
import type { AttachedImage } from "../hooks/useSpotChat";

const HEIC_RE = /hei[cf]/i;

/** MIME か拡張子のどちらかで HEIC/HEIF を判定する（HEIC は type が空のこともある）。 */
export function isHeic(file: File): boolean {
  return HEIC_RE.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * 添付画像を AttachedImage（プレビュー用 dataUrl + 送信用 base64）へ読み込む。
 * HEIC/HEIF はサーバで PNG へ変換する。変換に失敗した場合は元データのまま返す。
 */
export async function readAttachedImage(file: File): Promise<AttachedImage> {
  const dataUrl = await blobToDataUrl(file);
  const base64 = dataUrl.split(",")[1] ?? "";
  const mimeType = file.type || "image/jpeg";

  if (isHeic(file)) {
    try {
      const res = await fetch("/api/image/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: base64, mimeType: file.type || "image/heic" }),
      });
      if (res.ok) {
        const out = (await res.json()) as { data: string; mimeType: string };
        if (out.data) {
          return { dataUrl: `data:${out.mimeType};base64,${out.data}`, base64: out.data, mimeType: out.mimeType };
        }
      }
    } catch {
      /* 変換失敗時は元データのまま（プレビューは崩れるが送信は試みる） */
    }
  }
  return { dataUrl, base64, mimeType };
}
