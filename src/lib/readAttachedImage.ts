// 添付画像の読み込みユーティリティ（スポット/メモ両チャットで共有）。
// iPhone 標準の HEIC/HEIF はブラウザが <img> で表示できず、モデルも読み取れないため、
// 添付時にクライアントで JPEG へ変換する（プレビュー・送信の両方に効く）。
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
 * HEIC/HEIF は heic2any（動的 import・重いので必要時のみ）で JPEG に変換する。
 * 変換に失敗した場合は元データのまま返す（送信は試みる）。
 */
export async function readAttachedImage(file: File): Promise<AttachedImage> {
  let blob: Blob = file;
  let mimeType = file.type || "image/jpeg";
  if (isHeic(file)) {
    try {
      const heic2any = (await import("heic2any")).default;
      const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      blob = Array.isArray(out) ? out[0] : out;
      mimeType = "image/jpeg";
    } catch {
      /* 変換失敗時は元データのまま（プレビューは崩れるが送信は試みる） */
    }
  }
  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, base64: dataUrl.split(",")[1] ?? "", mimeType };
}
