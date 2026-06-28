import { useState } from "react";
import {
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
import { resolveSpotIcon } from "../spotIcons";
import InstagramGallery, { normalizePermalink } from "./InstagramGallery";

/** Google マップの評価バッジ（Places API でライブ取得した rating を表示）。 */
export function RatingBadge({ rating, count }: { rating: number; count: number }) {
  return (
    <span className="inline-flex items-center gap-1" title="Google マップの評価（クチコミはリンク先で確認）">
      <FaStar className="text-[11px] text-amber-400" />
      <span className="font-semibold text-slate-700">{rating.toFixed(1)}</span>
      {count > 0 && <span className="text-slate-400">({count.toLocaleString()})</span>}
    </span>
  );
}

/** Google マップへのリンク。口コミ・評価はリンク先で確認する（shiori には保存しない）。 */
export function GoogleMapsLink({ url, onClick }: { url: string; onClick?: (e: React.MouseEvent) => void }) {
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
      <img src={urls[idx]} alt={`${alt} の写真 ${idx + 1}`} className="mx-auto h-64 w-full object-contain" />
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
        className="block h-64 w-full border-0"
      />
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

/**
 * 候補スポットの詳細本体。一覧ページのモーダル（SpotDetailModal）と
 * 地図パネルのインライン展開（MoveProcess）で共有し、表示項目に乖離が出ないようにする。
 * 角丸・枠は呼び出し側のコンテナで付ける（このコンポーネントは中身のみ）。
 */
export default function SpotDetailContent({
  spot,
  rating,
  reload,
  onClose,
}: {
  spot: Spot;
  rating: SpotRating | null;
  reload: () => void;
  onClose?: () => void;
}) {
  const photos = rating?.photoUrls ?? [];
  return (
    <div>
      {/* トップ画像は 1 枚目を幅いっぱいに表示（縦は多少切れてよい）。 */}
      {photos[0] && (
        <img
          src={photos[0]}
          alt={spot.name}
          onError={(e) => (e.currentTarget.style.display = "none")}
          className="h-44 w-full object-cover"
        />
      )}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-2xl leading-none">
            {resolveSpotIcon(spot).emoji}
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-800">
              {spot.name}
              {spot.name_en && <span className="ml-1.5 text-sm font-normal text-slate-400">{spot.name_en}</span>}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
              {spot.country && <span>{spot.country}</span>}
              {spot.city && <span>· {spot.city}</span>}
              {spot.category && <span className="rounded bg-slate-100 px-1.5 py-0.5">{spot.category}</span>}
              {rating && <RatingBadge rating={rating.rating} count={rating.userRatingCount} />}
            </div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <FaXmark size={20} />
          </button>
        )}
      </div>
      {(spot.note || spot.url || spot.google_maps_url || spot.source) && (
        <div className="space-y-3 px-4 pt-4">
          {spot.note && <p className="text-sm text-slate-600">{spot.note}</p>}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {spot.google_maps_url && <GoogleMapsLink url={spot.google_maps_url} />}
            {spot.url && (
              <a
                href={spot.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:underline"
              >
                <FaLink className="text-[10px]" /> リンク
              </a>
            )}
            {spot.source && <span className="text-slate-400">出典: {spot.source}</span>}
          </div>
        </div>
      )}
      {/* Google の写真（2 枚目以降）を、縦が切れないカルーセルで表示。 */}
      {photos.length > 1 && (
        <div className="space-y-1.5 p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <FaImages className="text-amber-500" /> Google の写真
          </h4>
          <PhotoCarousel key={spot.id} urls={photos.slice(1)} alt={spot.name} />
        </div>
      )}
      {/* Google マップ（埋め込み地図＋場所カード）。 */}
      <div className="space-y-1.5 p-4">
        <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <FaMapLocationDot className="text-emerald-700" /> Google マップ
        </h4>
        <GoogleMapEmbed spot={spot} />
        <p className="text-xs text-slate-400">
          星評価・写真はカード内に表示されます。クチコミ本文は{" "}
          {spot.google_maps_url ? (
            <a href={spot.google_maps_url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:underline">
              Google マップ
            </a>
          ) : (
            "Google マップ"
          )}{" "}
          で確認できます。
        </p>
      </div>
      {/* Instagram */}
      <div className="p-4">
        <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <FaInstagram className="text-pink-500" /> Instagram
        </h4>
        <InstagramEditor spot={spot} reload={reload} />
        <InstagramGallery urls={spot.instagram ?? []} />
      </div>
    </div>
  );
}
