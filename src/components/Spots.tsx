import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCompass, FaLink, FaInstagram } from "react-icons/fa6";
import type { Spot } from "../types";
import { api, type SpotRating } from "../api";
import { SPOT_ICONS, resolveSpotIcon } from "../spotIcons";
import ConfirmDialog from "./ConfirmDialog";
import SpotDetailModal from "./SpotDetailModal";
import { RatingBadge, GoogleMapsLink } from "./SpotDetailContent";

/**
 * スポットのアイコンを選ぶボタン＋ドロップダウン。
 * カードは overflow-hidden なので、メニューは portal + fixed で外に出して見切れを防ぐ。
 * 下に収まらなければ上開きにフォールバックする。
 */
function IconPicker({ spot, reload }: { spot: Spot; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const current = resolveSpotIcon(spot);

  const MENU_W = 176; // w-44
  const MENU_H = 240; // 概算（実高さがこれを超えても下端が画面内に収まるよう配置）

  function place() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const openUp = r.bottom + 4 + MENU_H > window.innerHeight && r.top - 4 - MENU_H > 0;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8)),
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  }

  function toggle() {
    if (!open) place();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  async function pick(icon: string | null) {
    setOpen(false);
    await api.updateSpot(spot.id, { icon });
    reload();
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title="地図ピンのアイコンを変更"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg leading-none ring-1 ring-slate-200 transition-colors hover:bg-slate-200"
      >
        {current.emoji}
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[450]" onClick={() => setOpen(false)} />
            <div
              style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom }}
              className="z-[460] max-h-[60vh] w-44 overflow-y-auto rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200"
            >
              <div className="grid grid-cols-4 gap-1">
                {SPOT_ICONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => pick(d.key)}
                    title={d.label}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none transition-colors hover:bg-slate-100 ${
                      spot.icon === d.key ? "bg-cyan-100 ring-1 ring-cyan-500" : ""
                    }`}
                  >
                    {d.emoji}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => pick(null)}
                className="mt-1 w-full rounded-lg px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-100"
              >
                カテゴリ既定に戻す（{spot.category || "なし"}）
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

export default function Spots({ spots, reload }: { spots: Spot[]; reload: () => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Spot | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Google マップの評価（★）。Places API でライブ取得し DB には保存しない。
  // キー未設定・取得失敗時は ★ を出さないだけ（地図やリンクはそのまま）。
  const [ratings, setRatings] = useState<Record<string, SpotRating | null>>({});
  const idsKey = spots.map((s) => s.id).join(",");
  useEffect(() => {
    if (spots.length === 0) return;
    let cancelled = false;
    api
      .getSpotRatings()
      .then((r) => {
        if (!cancelled) setRatings(r.ratings ?? {});
      })
      .catch(() => {
        /* 取得失敗時は ★ なしで続行 */
      });
    return () => {
      cancelled = true;
    };
  }, [idsKey, spots.length]);

  // モーダルはサイドバーを覆わず、本文（<main>）エリア内で中央寄せにする。
  // サイドバーの開閉で幅が変わるので main の位置・幅を実測して追従させる。
  const rootRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const main = rootRef.current?.closest("main");
    if (!main) return;
    const update = () => {
      const r = main.getBoundingClientRect();
      setArea({ left: r.left, width: r.width });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(main);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.deleteSpot(pendingDelete.id);
      if (openId === pendingDelete.id) setOpenId(null);
      setPendingDelete(null);
      reload();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div ref={rootRef} className="mx-auto max-w-5xl">
      <ConfirmDialog
        open={pendingDelete !== null}
        title="候補を削除しますか？"
        message={pendingDelete ? `「${pendingDelete.name}」を候補から削除します。この操作は取り消せません。` : undefined}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <FaCompass className="text-cyan-700" /> 行きたいスポット候補
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{spots.length} 件</span>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        ガイドブックを見ながら Skill で登録した候補。カードをクリックすると詳細と Instagram を表示します。
      </p>
      {spots.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
          まだ候補がありません。Skill から登録してみましょう。
        </p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {spots.map((s) => {
            const igCount = s.instagram?.length ?? 0;
            return (
              <li
                key={s.id}
                onClick={() => setOpenId(s.id)}
                className="flex min-w-0 basis-full max-w-md cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors hover:border-cyan-300 hover:bg-slate-50 sm:basis-[calc(50%-0.375rem)]"
              >
                {/* Google マップの写真の 1 枚目をカバーに（DB に30日キャッシュ）。 */}
                {ratings[s.id]?.photoUrls?.[0] && (
                  <img
                    src={ratings[s.id]!.photoUrls[0]}
                    alt={s.name}
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    className="aspect-video w-full object-cover"
                  />
                )}
                <div className="flex items-start gap-2 p-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <IconPicker spot={s} reload={reload} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">
                      {s.name}
                      {s.name_en && <span className="ml-1 text-xs font-normal text-slate-400">{s.name_en}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      {s.country && <span>{s.country}</span>}
                      {s.city && <span>· {s.city}</span>}
                      {s.category && <span className="rounded bg-slate-100 px-1.5 py-0.5">{s.category}</span>}
                      {ratings[s.id] && (
                        <RatingBadge rating={ratings[s.id]!.rating} count={ratings[s.id]!.userRatingCount} />
                      )}
                    </div>
                    {s.note && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{s.note}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      {s.google_maps_url && (
                        <GoogleMapsLink url={s.google_maps_url} onClick={(e) => e.stopPropagation()} />
                      )}
                      {s.url && (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:underline"
                        >
                          <FaLink className="text-[10px]" /> リンク
                        </a>
                      )}
                      {igCount > 0 && (
                        <span className="inline-flex items-center gap-1 font-medium text-pink-500">
                          <FaInstagram /> {igCount}
                        </span>
                      )}
                      <span className="ml-auto text-cyan-700">詳細 ›</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(s);
                    }}
                    className="shrink-0 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    削除
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SpotDetailModal
        spots={spots}
        openId={openId}
        ratings={ratings}
        reload={reload}
        onClose={() => setOpenId(null)}
        area={area}
      />
    </div>
  );
}
