// ============================================================
//  HTML の無害化・平文化ヘルパー。
//
//  メモ機能では画像から抽出した HTML を保存し iframe(sandbox) で表示する。
//  表示側の sandbox が主防御だが、保存前にもここで危険な要素を落として
//  多層防御にする（script/style/iframe/on* ハンドラ/javascript: など）。
// ============================================================

/** モデルが返しがちなコードフェンス（```html … ```）を取り除く。 */
function stripCodeFence(s: string): string {
  return s
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * 保存・表示に使えるよう HTML を無害化する。
 * iframe の sandbox と合わせた多層防御（ここではタグ/属性レベルで危険物を除去）。
 */
export function sanitizeHtml(html: string): string {
  return stripCodeFence(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, "")
    // on〜= のインラインイベントハンドラ属性を除去
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    // javascript: スキームを無効化
    .replace(/javascript:/gi, "")
    .trim();
}

/** HTML をざっくりプレーンテキストへ（エージェント連携・検索用）。 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
