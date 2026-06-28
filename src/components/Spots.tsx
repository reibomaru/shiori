import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  FaCompass,
  FaLink,
  FaMapLocationDot,
  FaStar,
  FaImages,
  FaChevronLeft,
  FaChevronRight,
  FaInstagram,
  FaXmark,
} from "react-icons/fa6";
import type { Spot } from "../types";
import { api, type SpotRating } from "../api";
import { SPOT_ICONS, resolveSpotIcon } from "../spotIcons";
import InstagramGallery, { normalizePermalink } from "./InstagramGallery";
import ConfirmDialog from "./ConfirmDialog";

/** Google マップの評価バッジ（Places API でライブ取得した rating を表示）。 */
function RatingBadge({ rating, count }: { rating: number; count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      title="Google マップの評価（クチコミはリンク先で確認）"
    >
      <FaStar className="text-[11px] text-amber-400" />
      <span className="font-semibold text-slate-700">{rating.toFixed(1)}</span>
      {count > 0 && <span className="text-slate-400">({count.toLocaleString()})</span>}
    </span>
  );
}

/**
 * Google マップの写真カルーセル。縦が切れないよう object-contain で全体を表示し、
 * 横に余白が出てもよい（背景でレターボックス）。矢印・ドット・カウンターで切替。
 */
function PhotoCarousel({ urls, alt }: { urls: string[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  if (urls.length === 0) return null;
  const n = urls.length;
  const go = (d: number) => setIdx((i) => (i + d + n) % n);
  return (
    <div className="relative select-none overflow-hidden rounded-lg bg-slate-100">
      <img src={urls[idx]} alt={`${alt} の写真 ${idx + 1}`} className="mx-auto h-80 w-full object-contain" />
      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="前の写真"
            className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
          >
            <FaChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="次の写真"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
          >
            <FaChevronRight />
          </button>
          <div className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white">
            {idx + 1} / {n}
          </div>
          <div className="absolute inset-x-0 bottom-2 flex justify-center">
            <div className="flex gap-1.5 rounded-full bg-black/30 px-2 py-1">
              {urls.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-label={`${i + 1} 枚目へ`}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90"}`}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Google マップの埋め込み地図（API キー不要の output=embed 形式）。
 * 名称・都市・国から検索クエリを組み、地図＋場所カード（星評価）を表示する。
 * クチコミ本文は Google 側が iframe 埋め込みを禁止（X-Frame-Options）しているため、
 * カード内のリンクや「Google マップ」リンクから別タブで確認する。
 */
function GoogleMapEmbed({ spot }: { spot: Spot }) {
  const query = [spot.name, spot.city, spot.country].filter(Boolean).join(" ");
  if (!query) return null;
  const src = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=15&hl=ja&output=embed`;
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
      <iframe
        title={`${spot.name} の Google マップ`}
        src={src}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        className="block h-72 w-full border-0"
      />
    </div>
  );
}

/** Google マップへのリンク。口コミ・評価はリンク先で確認する（shiori には保存しない）。 */
function GoogleMapsLink({ url, onClick }: { url: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline"
    >
      <FaMapLocationDot className="text-[10px]" /> Google マップ
    </a>
  );
}

/** スポットのアイコンを選ぶボタン＋ドロップダウン。 */
function IconPicker({ spot, reload }: { spot: Spot; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const current = resolveSpotIcon(spot);

  async function pick(icon: string | null) {
    setOpen(false);
    await api.updateSpot(spot.id, { icon });
    reload();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="地図ピンのアイコンを変更"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg leading-none ring-1 ring-slate-200 transition-colors hover:bg-slate-200"
      >
        {current.emoji}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-44 rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200">
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
        </>
      )}
    </div>
  );
}

/** Instagram 投稿 URL を追加/削除する UI。変更は即保存。 */
function InstagramEditor({ spot, reload }: { spot: Spot; reload: () => void }) {
  const [input, setInput] = useState("");
  const urls = spot.instagram ?? [];

  async function save(next: string[]) {
    await api.updateSpot(spot.id, { instagram: next });
    reload();
  }
  async function add() {
    const norm = normalizePermalink(input);
    if (!norm) {
      alert("Instagram 投稿の URL（…/p/…, /reel/…, /tv/…）を入力してください");
      return;
    }
    setInput("");
    if (!urls.includes(norm)) await save([...urls, norm]);
  }

  return (
    <div className="mb-3 rounded-lg bg-slate-50 p-2">
      <div className="mb-1.5 text-xs font-medium text-slate-500">Instagram 投稿 URL（{urls.length}）</div>
      {urls.length > 0 && (
        <ul className="mb-1.5 space-y-1">
          {urls.map((u) => (
            <li key={u} className="flex items-center gap-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-slate-600">{u}</span>
              <button
                type="button"
                onClick={() => save(urls.filter((x) => x !== u))}
                title="削除"
                className="shrink-0 rounded p-1 text-rose-600 hover:bg-rose-50"
              >
                <FaXmark />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="https://www.instagram.com/p/..."
          className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded bg-cyan-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-cyan-800"
        >
          追加
        </button>
      </div>
    </div>
  );
}

export default function Spots({ spots, reload }: { spots: Spot[]; reload: () => void }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const openSpot = spots.find((s) => s.id === openId) ?? null;
  const close = () => setOpenId(null);
  const [pendingDelete, setPendingDelete] = useState<Spot | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Google マップの評価（★）。Places API でライブ取得し DB には保存しない。
  // キー未設定・取得失敗時は ★ を出さないだけ（地図やリンクはそのまま）。
  const [ratings, setRatings] = useState<Record<number, SpotRating | null>>({});
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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
                className="flex min-w-0 basis-[calc(50%-0.375rem)] max-w-md cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors hover:border-cyan-300 hover:bg-slate-50"
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

      {/*
        詳細モーダルは常時マウントし、開閉は visibility 切替のみ。
        全スポットの Instagram ギャラリーをマウントしたまま保持するので、
        ・一覧表示中に埋め込みが先読み（prefetch）され
        ・モーダルを開いても再フェッチ・再描画が起きない（iframe を動かさない）。
      */}
      {spots.length > 0 && createPortal(
        <div
          className="fixed top-0 bottom-0 z-[400] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8"
          style={{
            left: area?.left ?? 0,
            width: area?.width ?? "100%",
            visibility: openSpot ? "visible" : "hidden",
          }}
          onClick={close}
        >
          <div className="my-auto w-full max-w-3xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* ヘッダー＋基本情報（開いているスポットのもの） */}
            {openSpot && (
              <>
                {/* トップ画像は 1 枚目を幅いっぱいに表示（縦は多少切れてよい）。 */}
                {ratings[openSpot.id]?.photoUrls?.[0] && (
                  <img
                    src={ratings[openSpot.id]!.photoUrls[0]}
                    alt={openSpot.name}
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    className="h-48 w-full rounded-t-2xl object-cover"
                  />
                )}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl leading-none">
                      {resolveSpotIcon(openSpot).emoji}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-slate-800">
                        {openSpot.name}
                        {openSpot.name_en && (
                          <span className="ml-1.5 text-sm font-normal text-slate-400">{openSpot.name_en}</span>
                        )}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        {openSpot.country && <span>{openSpot.country}</span>}
                        {openSpot.city && <span>· {openSpot.city}</span>}
                        {openSpot.category && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">{openSpot.category}</span>
                        )}
                        {ratings[openSpot.id] && (
                          <RatingBadge
                            rating={ratings[openSpot.id]!.rating}
                            count={ratings[openSpot.id]!.userRatingCount}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="閉じる"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <FaXmark size={20} />
                  </button>
                </div>
                {(openSpot.note || openSpot.url || openSpot.google_maps_url || openSpot.source) && (
                  <div className="space-y-3 px-5 pt-4">
                    {openSpot.note && <p className="text-sm text-slate-600">{openSpot.note}</p>}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      {openSpot.google_maps_url && <GoogleMapsLink url={openSpot.google_maps_url} />}
                      {openSpot.url && (
                        <a
                          href={openSpot.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:underline"
                        >
                          <FaLink className="text-[10px]" /> リンク
                        </a>
                      )}
                      {openSpot.source && <span className="text-slate-400">出典: {openSpot.source}</span>}
                    </div>
                  </div>
                )}
                {/* Google の写真（2 枚目以降）を、縦が切れないカルーセルで表示。 */}
                {(ratings[openSpot.id]?.photoUrls?.length ?? 0) > 1 && (
                  <div className="space-y-1.5 p-5 pt-4">
                    <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                      <FaImages className="text-amber-500" /> Google の写真
                    </h4>
                    <PhotoCarousel
                      key={openSpot.id}
                      urls={ratings[openSpot.id]!.photoUrls.slice(1)}
                      alt={openSpot.name}
                    />
                  </div>
                )}
                {/* Google マップ（埋め込み地図＋場所カード）。開いているスポットの分だけ
                    マウントし、閉じれば iframe も破棄する（多数の地図を同時ロードしない）。 */}
                <div className="space-y-1.5 p-5 pt-4">
                  <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                    <FaMapLocationDot className="text-emerald-700" /> Google マップ
                  </h4>
                  <GoogleMapEmbed spot={openSpot} />
                  <p className="text-xs text-slate-400">
                    星評価・写真はカード内に表示されます。クチコミ本文は{" "}
                    {openSpot.google_maps_url ? (
                      <a
                        href={openSpot.google_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-700 hover:underline"
                      >
                        Google マップ
                      </a>
                    ) : (
                      "Google マップ"
                    )}{" "}
                    で確認できます。
                  </p>
                </div>
              </>
            )}

            {/* Instagram セクション */}
            <div className="p-5">
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
                <FaInstagram className="text-pink-500" /> Instagram
              </h4>
              {openSpot && <InstagramEditor spot={openSpot} reload={reload} />}
              {/* 全スポットのギャラリーを常時マウント。開いているスポットだけ表示し、
                  それ以外は高さ0で隠す（DOM には残るので iframe は再読込されない）。 */}
              {spots.map((s) => (
                <div
                  key={s.id}
                  className={s.id === openId ? "" : "h-0 overflow-hidden"}
                  aria-hidden={s.id !== openId}
                >
                  <InstagramGallery urls={s.instagram ?? []} />
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
