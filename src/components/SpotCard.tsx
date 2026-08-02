import { useTranslation } from "react-i18next";
import { FaLink, FaInstagram } from "react-icons/fa6";
import type { Spot } from "../types";
import type { SpotRating } from "../api";
import { resolveSpotIcon } from "../spotIcons";
import { RatingBadge, GoogleMapsLink, PhotoCarousel } from "./SpotDetailContent";

/** カードに必要な最小限のフィールド。提案プレビューは保存前なので Partial を許容する。 */
export type SpotCardData = Partial<Spot> & { name: string };

/**
 * スポットカードの中身（カバー画像＋本文）。一覧（Spots.tsx）と提案プレビュー
 * （spotChat/ProposalCard.tsx）で共有し、表示の二重実装を避ける。
 * 角丸・枠・クリック等の外枠は呼び出し側のコンテナで付ける（中身のみを描画）。
 */
export default function SpotCard({
  spot,
  coverUrl,
  photoUrls,
  rating,
  iconSlot,
  trailing,
  footerTrailing,
  onLinkClick,
}: {
  spot: SpotCardData;
  /** カバー画像（Google マップ写真の 1 枚目）。なければ非表示。 */
  coverUrl?: string | null;
  /** 複数枚の写真。指定時はカバー画像の代わりにカルーセルを表示。 */
  photoUrls?: string[];
  /** Google マップ評価（★）。なければ非表示。 */
  rating?: SpotRating | null;
  /** 左上のアイコン。省略時はカテゴリ既定の絵文字を静的表示。 */
  iconSlot?: React.ReactNode;
  /** 右上のアクション（削除ボタン等）。 */
  trailing?: React.ReactNode;
  /** リンク行の末尾（「詳細 ›」等）。 */
  footerTrailing?: React.ReactNode;
  /** リンククリック時のハンドラ（一覧ではカードの onClick を止める用）。 */
  onLinkClick?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation("spots");
  const igCount = spot.instagram?.length ?? 0;
  const hasFooter = spot.google_maps_url || spot.url || igCount > 0 || footerTrailing;

  // 複数枚あればカルーセル、1 枚（カバー）だけならそのまま表示。
  const media =
    photoUrls && photoUrls.length > 0 ? (
      <PhotoCarousel urls={photoUrls} alt={spot.name} heightClass="h-44" rounded={false} />
    ) : coverUrl ? (
      <img
        src={coverUrl}
        alt={spot.name}
        loading="lazy"
        onError={(e) => (e.currentTarget.style.display = "none")}
        className="aspect-video w-full object-cover"
      />
    ) : null;

  const icon = iconSlot ?? (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg leading-none ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
      {resolveSpotIcon({ icon: spot.icon ?? null, category: spot.category ?? null }).emoji}
    </span>
  );

  return (
    <>
      {/* 写真があるときはアイコンを写真の左上にオーバーレイ表示する。 */}
      {media && (
        <div className="relative">
          {media}
          <div className="absolute left-2 top-2 z-10 drop-shadow-md">{icon}</div>
        </div>
      )}
      <div className="flex items-start gap-2 p-3">
        {/* 写真が無いカードはアイコンを本文の左に表示する（従来どおり）。 */}
        {!media && icon}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-800 dark:text-slate-100">
            {spot.name}
            {spot.name_en && <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">{spot.name_en}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            {spot.country && <span>{spot.country}</span>}
            {spot.city && <span>· {spot.city}</span>}
            {spot.category && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">{spot.category}</span>}
            {rating && <RatingBadge rating={rating.rating} count={rating.userRatingCount} />}
          </div>
          {spot.note && <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{spot.note}</p>}
          {hasFooter && (
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              {spot.google_maps_url && <GoogleMapsLink url={spot.google_maps_url} onClick={onLinkClick} />}
              {spot.url && (
                <a
                  href={spot.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={onLinkClick}
                  className="inline-flex items-center gap-1 font-medium text-cyan-700 hover:underline dark:text-cyan-400"
                >
                  <FaLink className="text-[10px]" /> {t("links.link")}
                </a>
              )}
              {igCount > 0 && (
                <span className="inline-flex items-center gap-1 font-medium text-pink-500">
                  <FaInstagram /> {igCount}
                </span>
              )}
              {footerTrailing}
            </div>
          )}
        </div>
        {trailing}
      </div>
    </>
  );
}
