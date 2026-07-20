// ============================================================
//  アップロード画像を Web 表示可能な形式へ正規化する。
//
//  iPhone 標準の HEIC/HEIF は多くのブラウザが <img> で表示できないため、
//  取り込み時に PNG へ変換して保存・表示・抽出のすべてで使う。
// ============================================================
import convert from "heic-convert";
import type { AgentImage } from "./runner.ts";

/** HEIC / HEIF（拡張子・MIME いずれの表記でも）を検出する。 */
const HEIC_RE = /hei[cf]/i;

/**
 * ブラウザで表示できる形式へ正規化する。
 * HEIC/HEIF は PNG に変換し、それ以外はそのまま返す。
 * 変換に失敗しても元データは失わない（保存は継続する）。
 */
export async function normalizeImageForWeb(image: AgentImage): Promise<AgentImage> {
  if (!HEIC_RE.test(image.mimeType)) return image;
  try {
    const input = Buffer.from(image.data, "base64");
    const out = await convert({ buffer: input, format: "PNG" });
    return { data: Buffer.from(out).toString("base64"), mimeType: "image/png" };
  } catch {
    return image;
  }
}
