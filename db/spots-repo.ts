// ============================================================
//  spots（行きたいスポット）のデータアクセスを 1 か所に集約。
//  REST ハンドラ（server/index.ts）と AI エージェントのツール
//  （server/agent/tools.ts）の両方から呼び出して、同じ正規化・
//  バリデーションを共有する。
// ============================================================
import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { Spot } from "../shared/types.ts";
import type { SpotRow } from "./types.ts";

/** 書き込み時に受け取るスポットの入力（部分更新可・instagram は配列でも可）。 */
export type SpotBody = {
  [K in keyof Omit<SpotRow, "id" | "created_at">]?: SpotRow[K];
} & { instagram?: string | string[] | null };

/** spots テーブルで部分更新を許可するカラム。 */
export const SPOT_FIELDS: readonly string[] = [
  "name", "name_en", "category", "city", "country",
  "lat", "lng", "url", "google_maps_url", "note", "source", "icon", "instagram",
];

/** spots 行: instagram(JSON文字列) を配列にパースして返す。 */
export function spotRow(s: SpotRow): Spot;
export function spotRow(s: SpotRow | null): Spot | null;
export function spotRow(s: SpotRow | null): Spot | null {
  if (!s) return s;
  let instagram: string[] = [];
  if (s.instagram) {
    try {
      const v: unknown = JSON.parse(s.instagram);
      if (Array.isArray(v)) instagram = v.filter((u): u is string => typeof u === "string");
    } catch {
      /* 不正な JSON は空配列として扱う */
    }
  }
  return { ...s, instagram };
}

/** 書き込み前: instagram が配列なら JSON 文字列に正規化する。 */
export function normalizeSpotBody(b: SpotBody): SpotBody & { instagram?: string | null } {
  if (Array.isArray(b.instagram)) b.instagram = JSON.stringify(b.instagram);
  return b as SpotBody & { instagram?: string | null };
}

/** 全候補を取得（新しい順）。 */
export function listSpots(db: DatabaseSync): Spot[] {
  return (db
    .prepare("SELECT * FROM spots ORDER BY created_at DESC, id DESC")
    .all() as SpotRow[])
    .map((s) => spotRow(s));
}

/** 1 件取得（無ければ null）。 */
export function getSpot(db: DatabaseSync, id: SQLInputValue): Spot | null {
  return spotRow((db.prepare("SELECT * FROM spots WHERE id = ?").get(id) as SpotRow | undefined) ?? null);
}

/** 新規登録して、作成後の行を返す。 */
export function createSpot(db: DatabaseSync, body: SpotBody & { id?: string }): Spot | null {
  const b = normalizeSpotBody({ ...body });
  const id = body.id ?? randomUUID();
  db.prepare(`INSERT INTO spots (id, name, name_en, category, city, country, lat, lng, url, google_maps_url, note, source, icon, instagram)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id, b.name ?? "（無題）", b.name_en ?? null, b.category ?? null, b.city ?? null, b.country ?? null,
      b.lat ?? null, b.lng ?? null, b.url ?? null, b.google_maps_url ?? null, b.note ?? null, b.source ?? null,
      b.icon ?? null, b.instagram ?? null,
    );
  return getSpot(db, id);
}

/** 部分更新して更新後の行を返す（許可カラムのみ反映）。 */
export function updateSpot(db: DatabaseSync, id: SQLInputValue, patch: SpotBody): Spot | null {
  const b = normalizeSpotBody({ ...patch }) as Record<string, SQLInputValue | undefined>;
  const keys = Object.keys(b).filter((k) => SPOT_FIELDS.includes(k));
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => b[k] ?? null);
    db.prepare(`UPDATE spots SET ${setClause} WHERE id = ?`).run(...values, id);
  }
  return getSpot(db, id);
}

/** 削除する。 */
export function deleteSpot(db: DatabaseSync, id: SQLInputValue): { ok: true } {
  db.prepare("DELETE FROM spots WHERE id = ?").run(id);
  return { ok: true };
}
