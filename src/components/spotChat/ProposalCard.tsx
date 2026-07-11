import { useEffect, useMemo, useState } from "react";
import { FaPlus, FaPen, FaTrash, FaCheck, FaXmark, FaEye } from "react-icons/fa6";
import type { Proposal, ProposalStatus } from "../../hooks/useSpotChat";
import { api, type SpotRating } from "../../api";
import SpotCard, { type SpotCardData } from "../SpotCard";

const OP_META = {
  create: { label: "追加の提案", Icon: FaPlus, color: "text-emerald-700", ring: "ring-emerald-200", bg: "bg-emerald-50" },
  update: { label: "更新の提案", Icon: FaPen, color: "text-cyan-700", ring: "ring-cyan-200", bg: "bg-cyan-50" },
  delete: { label: "削除の提案", Icon: FaTrash, color: "text-rose-700", ring: "ring-rose-200", bg: "bg-rose-50" },
} as const;

/** 編集フォームで扱うフィールド（文字列で保持し、保存時に数値へ変換）。 */
type Draft = Record<string, string>;

const TEXT_FIELDS: { key: string; label: string; wide?: boolean }[] = [
  { key: "name", label: "名称" },
  { key: "name_en", label: "英語名" },
  { key: "category", label: "カテゴリ" },
  { key: "city", label: "都市" },
  { key: "country", label: "国" },
  { key: "url", label: "URL", wide: true },
  { key: "google_maps_url", label: "Google マップ URL", wide: true },
  { key: "source", label: "出典", wide: true },
];

/** 差分表示の見出し（変更前→変更後）。 */
const DIFF_FIELDS: { key: string; label: string }[] = [
  ...TEXT_FIELDS.map((f) => ({ key: f.key, label: f.label })),
  { key: "note", label: "メモ" },
  { key: "lat", label: "緯度" },
  { key: "lng", label: "経度" },
];

function toDraft(p: Proposal): Draft {
  const base = { ...(p.current ?? {}), ...(p.spot ?? {}) } as Record<string, unknown>;
  const d: Draft = {};
  for (const k of [...TEXT_FIELDS.map((f) => f.key), "note", "lat", "lng"]) {
    const v = base[k];
    d[k] = v === null || v === undefined ? "" : String(v);
  }
  return d;
}

/** 文字列ドラフト → API へ送る本文。 */
function toBody(d: Draft): Record<string, unknown> {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: d.name?.trim() || "（無題）",
    name_en: d.name_en?.trim() || null,
    category: d.category?.trim() || null,
    city: d.city?.trim() || null,
    country: d.country?.trim() || null,
    url: d.url?.trim() || null,
    google_maps_url: d.google_maps_url?.trim() || null,
    source: d.source?.trim() || null,
    note: d.note?.trim() || null,
    lat: num(d.lat),
    lng: num(d.lng),
  };
}

/** ドラフト（編集中の値）から、保存後の見た目を再現するカード用データを組み立てる。 */
function toPreview(d: Draft, p: Proposal): SpotCardData {
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  return {
    name: d.name?.trim() || "（無題）",
    name_en: d.name_en?.trim() || null,
    category: d.category?.trim() || null,
    city: d.city?.trim() || null,
    country: d.country?.trim() || null,
    url: d.url?.trim() || null,
    google_maps_url: d.google_maps_url?.trim() || null,
    note: d.note?.trim() || null,
    source: d.source?.trim() || null,
    lat: num(d.lat),
    lng: num(d.lng),
    // アイコンはフォームで編集しないため、提案/既存の値を引き継ぐ（無ければカテゴリ既定）。
    icon: p.spot?.icon ?? p.current?.icon ?? null,
    instagram: p.current?.instagram ?? [],
  };
}

/** update 提案で「変更前→変更後」が分かるよう、変わったフィールドだけ列挙する。 */
function changedFields(current: Record<string, unknown>, body: Record<string, unknown>) {
  const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return DIFF_FIELDS.flatMap((f) => {
    const before = norm(current[f.key]);
    const after = norm(body[f.key]);
    return before === after ? [] : [{ ...f, before, after }];
  });
}

export default function ProposalCard({
  proposal,
  status,
  busy,
  onSave,
  onDismiss,
}: {
  proposal: Proposal;
  status: ProposalStatus;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onDismiss: () => void;
}) {
  const meta = OP_META[proposal.op];
  const [draft, setDraft] = useState<Draft>(() => toDraft(proposal));
  // 既定は「保存したらこう表示される」プレビュー。細かく直すときだけ編集へ。
  const [editing, setEditing] = useState(false);
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const resolved = status === "saved" || status === "dismissed";
  const isDelete = proposal.op === "delete";

  // 提案された場所の写真・評価を Google マップから取得してプレビューに表示する。
  // 保存前なので名称・都市・国のクエリでライブ検索（サーバ側でクエリ単位の短期キャッシュ）。
  const placeQuery = useMemo(() => {
    const base = { ...(proposal.current ?? {}), ...(proposal.spot ?? {}) } as Record<string, unknown>;
    return [base.name, base.city, base.country].filter(Boolean).join(" ").trim();
  }, [proposal]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [rating, setRating] = useState<SpotRating | null>(null);
  useEffect(() => {
    if (isDelete || !placeQuery) return;
    let cancelled = false;
    api
      .previewSpotPhotos(placeQuery)
      .then((r) => {
        if (cancelled) return;
        setPhotoUrls(r.rating?.photoUrls ?? []);
        setRating(r.rating ?? null);
      })
      .catch(() => {
        /* 取得失敗時は写真なしで続行 */
      });
    return () => {
      cancelled = true;
    };
  }, [placeQuery, isDelete]);
  const diffs =
    proposal.op === "update" && proposal.current
      ? changedFields(proposal.current as unknown as Record<string, unknown>, toBody(draft))
      : [];

  return (
    <div className={`mt-2 rounded-xl ${meta.bg} p-3 ring-1 ${meta.ring}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className={`flex items-center gap-1.5 text-xs font-bold ${meta.color}`}>
          <meta.Icon className="text-xs" /> {meta.label}
          {proposal.op !== "create" && proposal.current && (
            <span className="font-normal text-slate-500">（{proposal.current.name}）</span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {/* プレビュー ↔ 編集トグル（create/update のみ。delete は確認文のまま）。 */}
          {!isDelete && (
            <button
              onClick={() => setEditing((v) => !v)}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200/60"
            >
              {editing ? <><FaEye /> プレビュー</> : <><FaPen /> 編集</>}
            </button>
          )}
          {status === "saved" && <span className="text-xs font-semibold text-emerald-600">✓ 反映済み</span>}
          {status === "dismissed" && <span className="text-xs text-slate-400">破棄しました</span>}
        </div>
      </div>

      {isDelete ? (
        <p className="text-sm text-slate-700">
          「{proposal.current?.name}」を候補から削除します。よろしいですか？
        </p>
      ) : editing ? (
        <div className="grid grid-cols-2 gap-2">
          {TEXT_FIELDS.map((f) => (
            <label key={f.key} className={f.wide ? "col-span-2" : ""}>
              <span className="block text-[10px] font-medium text-slate-500">{f.label}</span>
              <input
                value={draft[f.key] ?? ""}
                disabled={resolved}
                onChange={(e) => set(f.key, e.target.value)}
                className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>
          ))}
          <label>
            <span className="block text-[10px] font-medium text-slate-500">緯度 (lat)</span>
            <input
              value={draft.lat ?? ""}
              disabled={resolved}
              onChange={(e) => set("lat", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
          <label>
            <span className="block text-[10px] font-medium text-slate-500">経度 (lng)</span>
            <input
              value={draft.lng ?? ""}
              disabled={resolved}
              onChange={(e) => set("lng", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
          <label className="col-span-2">
            <span className="block text-[10px] font-medium text-slate-500">メモ</span>
            <textarea
              value={draft.note ?? ""}
              disabled={resolved}
              rows={2}
              onChange={(e) => set("note", e.target.value)}
              className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
        </div>
      ) : (
        <>
          {/* 保存後の一覧カードに近い見た目のプレビュー（写真・評価は Google マップから）。 */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <SpotCard spot={toPreview(draft, proposal)} photoUrls={photoUrls} rating={rating} />
          </div>
          {/* update は変更前→変更後の差分も示す。 */}
          {proposal.op === "update" && (
            <div className="mt-2 text-xs">
              {diffs.length === 0 ? (
                <p className="text-slate-400">変更点はありません。</p>
              ) : (
                <ul className="space-y-0.5">
                  {diffs.map((d) => (
                    <li key={d.key} className="flex flex-wrap items-baseline gap-1">
                      <span className="font-medium text-slate-500">{d.label}:</span>
                      <span className="text-slate-400 line-through">{d.before || "（空）"}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-medium text-cyan-700">{d.after || "（空）"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {!resolved && (
        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onDismiss}
            disabled={busy}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200/60 disabled:opacity-50"
          >
            <FaXmark /> 破棄
          </button>
          <button
            onClick={() => onSave(isDelete ? {} : toBody(draft))}
            disabled={busy}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-white disabled:opacity-50 ${
              isDelete ? "bg-rose-600 hover:bg-rose-500" : "bg-cyan-700 hover:bg-cyan-600"
            }`}
          >
            {isDelete ? <><FaTrash /> 削除する</> : <><FaCheck /> 保存する</>}
          </button>
        </div>
      )}
    </div>
  );
}
