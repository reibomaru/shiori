// ============================================================
//  memo_pages（複数ページのメモ）と memo_images（取り込んだ元画像）の
//  データアクセスを 1 か所に集約。
//  REST ハンドラ（server/index.ts）と AI エージェントのツール
//  （server/agent/tools.ts）の両方から呼び出す。
// ============================================================
import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { MemoGraph, MemoImageMeta, MemoPage } from "../shared/types.ts";

/** memo_pages で部分更新を許可するカラム。 */
export const MEMO_FIELDS: readonly string[] = ["title", "body", "html", "text", "graph", "sort_order"];

/** memo_pages 書き込み時の入力（部分更新可）。graph はオブジェクトでも可。 */
export type MemoPageBody = Partial<Omit<MemoPage, "created_at" | "updated_at" | "images">>;

/** memo_pages の生の行（images は別テーブルから組み立てる。graph は JSON 文字列）。 */
type MemoPageRow = Omit<MemoPage, "images" | "graph"> & { graph: string | null };

/** graph(JSON 文字列) を安全にパースする。nodes が空なら null 扱い。 */
function parseGraph(raw: string | null): MemoGraph | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<MemoGraph>;
    if (v && Array.isArray(v.nodes) && v.nodes.length > 0) {
      return { nodes: v.nodes, edges: Array.isArray(v.edges) ? v.edges : [] };
    }
  } catch {
    /* 不正な JSON は無し扱い */
  }
  return null;
}

/** 生の行を MemoPage 形（graph をオブジェクト化）へ整える。images は呼び出し側で付与。 */
function rowToPage(row: MemoPageRow, images: MemoImageMeta[]): MemoPage {
  const { graph, ...rest } = row;
  return { ...rest, graph: parseGraph(graph), images };
}

/**
 * 既存グラフに新規グラフを統合する。新規ノードの id には一意な prefix を付け、
 * 既存ノードとの衝突を避ける（1 ページに複数の図を貯められるようにする）。
 */
export function mergeMemoGraph(existing: MemoGraph | null, added: MemoGraph, prefix: string): MemoGraph {
  const nodes = added.nodes.map((n) => ({ ...n, id: prefix + n.id }));
  const edges = added.edges.map((e) => ({ ...e, from: prefix + e.from, to: prefix + e.to }));
  return existing
    ? { nodes: [...existing.nodes, ...nodes], edges: [...existing.edges, ...edges] }
    : { nodes, edges };
}

/** 書き込み前: graph がオブジェクトなら JSON 文字列へ正規化する。 */
function normalizeMemoBody(body: MemoPageBody): Omit<MemoPageBody, "graph"> & { graph?: string | null } {
  if (body.graph !== undefined && body.graph !== null && typeof body.graph !== "string") {
    return { ...body, graph: JSON.stringify(body.graph) };
  }
  return body as Omit<MemoPageBody, "graph"> & { graph?: string | null };
}

/** 画像メタ（実体 data を除く）用の共通 SELECT 句。 */
const IMAGE_META_COLS = "id, page_id, mime_type, sort_order, created_at, updated_at";

/** ページに紐づく画像メタ（実体 data は含まない）を表示順で取得する。 */
export function listMemoImages(db: DatabaseSync, pageId: SQLInputValue): MemoImageMeta[] {
  return db
    .prepare(`SELECT ${IMAGE_META_COLS} FROM memo_images WHERE page_id = ? ORDER BY sort_order, created_at`)
    .all(pageId) as unknown as MemoImageMeta[];
}

/** 全ページを表示順で取得する（各ページに画像メタを付与）。 */
export function listMemoPages(db: DatabaseSync): MemoPage[] {
  const rows = db.prepare("SELECT * FROM memo_pages ORDER BY sort_order, created_at").all() as unknown as MemoPageRow[];
  const metas = db
    .prepare(`SELECT ${IMAGE_META_COLS} FROM memo_images ORDER BY sort_order, created_at`)
    .all() as unknown as MemoImageMeta[];
  const byPage = new Map<string, MemoImageMeta[]>();
  for (const m of metas) {
    const arr = byPage.get(m.page_id);
    if (arr) arr.push(m);
    else byPage.set(m.page_id, [m]);
  }
  return rows.map((r) => rowToPage(r, byPage.get(r.id) ?? []));
}

/** 1 件取得（無ければ null）。画像メタも付与する。 */
export function getMemoPage(db: DatabaseSync, id: SQLInputValue): MemoPage | null {
  const row = (db.prepare("SELECT * FROM memo_pages WHERE id = ?").get(id) as unknown as MemoPageRow | undefined) ?? null;
  if (!row) return null;
  return rowToPage(row, listMemoImages(db, row.id));
}

/** 新規ページを作成して、作成後の行を返す。 */
export function createMemoPage(db: DatabaseSync, body: MemoPageBody & { id?: string }): MemoPage | null {
  const id = body.id ?? randomUUID();
  const b = normalizeMemoBody(body);
  const maxOrder = (db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM memo_pages").get() as { m: number }).m;
  db.prepare(
    "INSERT INTO memo_pages (id, title, body, html, text, graph, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    b.title ?? "無題のメモ",
    b.body ?? null,
    b.html ?? null,
    b.text ?? null,
    b.graph ?? null,
    b.sort_order ?? maxOrder + 1,
  );
  return getMemoPage(db, id);
}

/** 部分更新して更新後の行を返す（許可カラムのみ反映）。 */
export function updateMemoPage(db: DatabaseSync, id: SQLInputValue, patch: MemoPageBody): MemoPage | null {
  const b = normalizeMemoBody(patch);
  const keys = Object.keys(b).filter((k) => MEMO_FIELDS.includes(k));
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => (b as Record<string, unknown>)[k] as SQLInputValue);
    db.prepare(`UPDATE memo_pages SET ${setClause}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
  }
  return getMemoPage(db, id);
}

/** 削除する（memo_images は CASCADE で連動削除）。 */
export function deleteMemoPage(db: DatabaseSync, id: SQLInputValue): { ok: true } {
  db.prepare("DELETE FROM memo_pages WHERE id = ?").run(id);
  return { ok: true };
}

// ---- 画像（元画像）----------------------------------------

/** アップロード原本（base64）をページに追加保存する。追加後のメタ一覧を返す。 */
export function addMemoImages(
  db: DatabaseSync,
  pageId: string,
  images: Array<{ data: string; mimeType: string }>,
): MemoImageMeta[] {
  const maxOrder = (
    db.prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM memo_images WHERE page_id = ?").get(pageId) as { m: number }
  ).m;
  const stmt = db.prepare(
    "INSERT INTO memo_images (id, page_id, mime_type, data, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
  );
  images.forEach((im, i) => {
    // base64 → バイナリ（BLOB）へ。Buffer は Uint8Array なので BLOB にそのまま束縛できる。
    const buf = Buffer.from(im.data, "base64");
    stmt.run(randomUUID(), pageId, im.mimeType || "image/png", buf, maxOrder + 1 + i);
  });
  return listMemoImages(db, pageId);
}

/** 画像 1 枚の実体（配信用）を取得する。無ければ null。 */
export function getMemoImageData(db: DatabaseSync, id: SQLInputValue): { mime_type: string; data: Uint8Array } | null {
  return (
    (db.prepare("SELECT mime_type, data FROM memo_images WHERE id = ?").get(id) as
      | { mime_type: string; data: Uint8Array }
      | undefined) ?? null
  );
}

/** 画像 1 枚のメタ（実体を除く）を取得する。無ければ null。 */
export function getMemoImageMeta(db: DatabaseSync, id: SQLInputValue): MemoImageMeta | null {
  return (
    (db.prepare(`SELECT ${IMAGE_META_COLS} FROM memo_images WHERE id = ?`).get(id) as unknown as
      | MemoImageMeta
      | undefined) ?? null
  );
}

/** 画像 1 枚の実体を差し替える（回転保存など）。更新後のメタを返す。 */
export function replaceMemoImageData(
  db: DatabaseSync,
  id: SQLInputValue,
  image: { data: string; mimeType: string },
): MemoImageMeta | null {
  const buf = Buffer.from(image.data, "base64");
  db.prepare("UPDATE memo_images SET data = ?, mime_type = ?, updated_at = datetime('now') WHERE id = ?").run(
    buf,
    image.mimeType || "image/png",
    id,
  );
  return getMemoImageMeta(db, id);
}

/** 画像 1 枚を削除する。 */
export function deleteMemoImage(db: DatabaseSync, id: SQLInputValue): { ok: true } {
  db.prepare("DELETE FROM memo_images WHERE id = ?").run(id);
  return { ok: true };
}
