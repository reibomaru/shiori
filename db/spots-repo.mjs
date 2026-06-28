// ============================================================
//  spots（行きたいスポット）のデータアクセスを 1 か所に集約。
//  REST ハンドラ（server/index.mjs）と AI エージェントのツール
//  （server/agent/tools.mjs）の両方から呼び出して、同じ正規化・
//  バリデーションを共有する。
// ============================================================

/** spots テーブルで部分更新を許可するカラム。 */
export const SPOT_FIELDS = [
  "name", "name_en", "category", "city", "country",
  "lat", "lng", "url", "google_maps_url", "note", "source", "icon", "instagram",
];

/** spots 行: instagram(JSON文字列) を配列にパースして返す。 */
export function spotRow(s) {
  if (!s) return s;
  let instagram = [];
  if (s.instagram) {
    try {
      const v = JSON.parse(s.instagram);
      if (Array.isArray(v)) instagram = v.filter((u) => typeof u === "string");
    } catch {
      /* 不正な JSON は空配列として扱う */
    }
  }
  return { ...s, instagram };
}

/** 書き込み前: instagram が配列なら JSON 文字列に正規化する。 */
export function normalizeSpotBody(b) {
  if (Array.isArray(b.instagram)) b.instagram = JSON.stringify(b.instagram);
  return b;
}

/** 全候補を取得（新しい順）。 */
export function listSpots(db) {
  return db
    .prepare("SELECT * FROM spots ORDER BY created_at DESC, id DESC")
    .all()
    .map(spotRow);
}

/** 1 件取得（無ければ null）。 */
export function getSpot(db, id) {
  return spotRow(db.prepare("SELECT * FROM spots WHERE id = ?").get(id) ?? null);
}

/** 新規登録して、作成後の行を返す。 */
export function createSpot(db, body) {
  const b = normalizeSpotBody({ ...body });
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO spots (name, name_en, category, city, country, lat, lng, url, google_maps_url, note, source, icon, instagram)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      b.name ?? "（無題）", b.name_en ?? null, b.category ?? null, b.city ?? null, b.country ?? null,
      b.lat ?? null, b.lng ?? null, b.url ?? null, b.google_maps_url ?? null, b.note ?? null, b.source ?? null,
      b.icon ?? null, b.instagram ?? null,
    );
  return getSpot(db, lastInsertRowid);
}

/** 部分更新して更新後の行を返す（許可カラムのみ反映）。 */
export function updateSpot(db, id, patch) {
  const b = normalizeSpotBody({ ...patch });
  const keys = Object.keys(b).filter((k) => SPOT_FIELDS.includes(k));
  if (keys.length > 0) {
    const setClause = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => b[k]);
    db.prepare(`UPDATE spots SET ${setClause} WHERE id = ?`).run(...values, id);
  }
  return getSpot(db, id);
}

/** 削除する。 */
export function deleteSpot(db, id) {
  db.prepare("DELETE FROM spots WHERE id = ?").run(id);
  return { ok: true };
}
