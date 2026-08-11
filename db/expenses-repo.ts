// ============================================================
//  expenses（実費＝確定した予約・領収書）と expense_images（領収書の元画像）の
//  データアクセスを 1 か所に集約する。REST ハンドラ（server/index.ts）から使う。
//  画像 BLOB の扱いは memo-repo.ts（memo_images）と同型。
// ============================================================
import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Expense, ExpenseImageMeta } from "../shared/types.ts";

/** expenses で部分更新を許可するカラム。 */
export const EXPENSE_FIELDS: readonly string[] = [
  "sort_order",
  "category",
  "title",
  "vendor",
  "amount",
  "currency",
  "paid",
  "incurred_on",
  "source_url",
  "item_id",
  "note",
];

/** expenses 書き込み時の入力（部分更新可）。 */
export type ExpenseBody = Partial<Omit<Expense, "created_at" | "updated_at" | "images">> & { id?: string };

/** expenses の生の行（images は別テーブルから組み立てる）。 */
type ExpenseRow = Omit<Expense, "images">;

/** 画像メタ（実体 data を除く）用の共通 SELECT 句。 */
const IMAGE_META_COLS = "id, expense_id, mime_type, sort_order, created_at, updated_at";

/** ある実費に紐づく画像メタ（実体 data は含まない）を表示順で取得する。 */
export function listExpenseImages(db: DatabaseSync, expenseId: SQLInputValue): ExpenseImageMeta[] {
  return db
    .prepare(`SELECT ${IMAGE_META_COLS} FROM expense_images WHERE expense_id = ? ORDER BY sort_order, created_at`)
    .all(expenseId) as unknown as ExpenseImageMeta[];
}

/** 全実費を表示順で取得する（各件に画像メタを付与）。 */
export function listExpenses(db: DatabaseSync): Expense[] {
  const rows = db
    .prepare("SELECT * FROM expenses ORDER BY sort_order, created_at")
    .all() as unknown as ExpenseRow[];
  const metas = db
    .prepare(`SELECT ${IMAGE_META_COLS} FROM expense_images ORDER BY sort_order, created_at`)
    .all() as unknown as ExpenseImageMeta[];
  const byExpense = new Map<string, ExpenseImageMeta[]>();
  for (const m of metas) {
    const arr = byExpense.get(m.expense_id);
    if (arr) arr.push(m);
    else byExpense.set(m.expense_id, [m]);
  }
  return rows.map((r) => ({ ...r, images: byExpense.get(r.id) ?? [] }));
}

/** 1 件取得（無ければ null）。画像メタも付与する。 */
export function getExpense(db: DatabaseSync, id: SQLInputValue): Expense | null {
  const row = (db.prepare("SELECT * FROM expenses WHERE id = ?").get(id) as unknown as ExpenseRow | undefined) ?? null;
  if (!row) return null;
  return { ...row, images: listExpenseImages(db, row.id) };
}

/** 新規実費を作成して、作成後の行を返す。 */
export function createExpense(db: DatabaseSync, body: ExpenseBody): Expense | null {
  const id = body.id ?? randomUUID();
  const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM expenses").get() as { m: number }).m;
  db.prepare(
    `INSERT INTO expenses (id, sort_order, category, title, vendor, amount, currency, paid, incurred_on, source_url, item_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    body.sort_order ?? maxOrder + 1,
    body.category ?? "その他",
    body.title ?? "新しい実費",
    body.vendor ?? null,
    body.amount ?? 0,
    body.currency ?? "JPY",
    body.paid ? 1 : 0,
    body.incurred_on ?? null,
    body.source_url ?? null,
    body.item_id ?? null,
    body.note ?? null,
  );
  return getExpense(db, id);
}

/** 部分更新して更新後の行を返す（許可カラムのみ反映）。 */
export function updateExpense(db: DatabaseSync, id: SQLInputValue, patch: ExpenseBody): Expense | null {
  const keys = Object.keys(patch).filter((k) => EXPENSE_FIELDS.includes(k));
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => {
      const v = (patch as Record<string, unknown>)[k];
      // paid は真偽値でも数値でも受け取り 0/1 に正規化する。
      if (k === "paid") return (v ? 1 : 0) as SQLInputValue;
      return v as SQLInputValue;
    });
    db.prepare(`UPDATE expenses SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  }
  return getExpense(db, id);
}

/** 削除する（expense_images は CASCADE で連動削除）。 */
export function deleteExpense(db: DatabaseSync, id: SQLInputValue): { ok: true } {
  db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  return { ok: true };
}

// ---- 画像（領収書の元画像）--------------------------------

/** アップロード原本（base64）を実費に追加保存する。追加後のメタ一覧を返す。 */
export function addExpenseImages(
  db: DatabaseSync,
  expenseId: string,
  images: Array<{ data: string; mimeType: string }>,
): ExpenseImageMeta[] {
  const maxOrder = (
    db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM expense_images WHERE expense_id = ?").get(expenseId) as {
      m: number;
    }
  ).m;
  const stmt = db.prepare(
    "INSERT INTO expense_images (id, expense_id, mime_type, data, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
  );
  images.forEach((im, i) => {
    // base64 → バイナリ（BLOB）。Buffer は Uint8Array なので BLOB にそのまま束縛できる。
    const buf = Buffer.from(im.data, "base64");
    stmt.run(randomUUID(), expenseId, im.mimeType || "image/png", buf, maxOrder + 1 + i);
  });
  return listExpenseImages(db, expenseId);
}

/** 画像 1 枚の実体（配信用）を取得する。無ければ null。 */
export function getExpenseImageData(
  db: DatabaseSync,
  id: SQLInputValue,
): { mime_type: string; data: Uint8Array } | null {
  return (
    (db.prepare("SELECT mime_type, data FROM expense_images WHERE id = ?").get(id) as
      | { mime_type: string; data: Uint8Array }
      | undefined) ?? null
  );
}

/** 画像 1 枚を削除する。 */
export function deleteExpenseImage(db: DatabaseSync, id: SQLInputValue): { ok: true } {
  db.prepare("DELETE FROM expense_images WHERE id = ?").run(id);
  return { ok: true };
}
