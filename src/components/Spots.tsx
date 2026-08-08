import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { FaCompass, FaTableCellsLarge, FaList, FaLink, FaInstagram } from "react-icons/fa6";
import type { Spot } from "../types";
import { api, type SpotRating } from "../api";
import { SPOT_ICONS, resolveSpotIcon } from "../spotIcons";
import { RatingBadge, GoogleMapsLink } from "./SpotDetailContent";
import ConfirmDialog from "./ConfirmDialog";
import SpotDetailModal from "./SpotDetailModal";
import SpotCard from "./SpotCard";

type ViewMode = "card" | "list";
const VIEW_STORAGE_KEY = "spots.viewMode";

function loadViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "card";
  } catch {
    return "card";
  }
}

/**
 * スポットのアイコンを選ぶボタン＋ドロップダウン。
 * カードは overflow-hidden なので、メニューは portal + fixed で外に出して見切れを防ぐ。
 * 下に収まらなければ上開きにフォールバックする。
 */
function IconPicker({ spot, reload }: { spot: Spot; reload: () => void }) {
  const { t } = useTranslation("spots");
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
        title={t("iconPicker.change")}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg leading-none ring-1 ring-slate-200 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:ring-slate-600 dark:hover:bg-slate-600"
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
              className="z-[460] max-h-[60vh] w-44 overflow-y-auto rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
            >
              <div className="grid grid-cols-4 gap-1">
                {SPOT_ICONS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => pick(d.key)}
                    title={d.label}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg leading-none transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${
                      spot.icon === d.key ? "bg-cyan-100 ring-1 ring-cyan-500 dark:bg-cyan-500/20" : ""
                    }`}
                  >
                    {d.emoji}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => pick(null)}
                className="mt-1 w-full rounded-lg px-2 py-1 text-left text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                {t("iconPicker.resetToCategory", { category: spot.category || t("iconPicker.none") })}
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

export default function Spots({
  spots,
  reload,
  headerAction,
}: {
  spots: Spot[];
  reload: () => void;
  /** 見出し右（件数バッジの隣）に置くアクション。モバイルのチャット開くボタン等。 */
  headerAction?: React.ReactNode;
}) {
  const { t } = useTranslation("spots");
  const [openId, setOpenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Spot | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 表示モード（カード / リスト）。選択は localStorage に保存し次回も維持する。
  const [view, setView] = useState<ViewMode>(loadViewMode);
  function changeView(next: ViewMode) {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* 保存できなくても表示は切り替える */
    }
  }

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
        title={t("delete.title")}
        message={pendingDelete ? t("delete.message", { name: pendingDelete.name }) : undefined}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-slate-100">
          <FaCompass className="text-cyan-700 dark:text-cyan-400" /> {t("title")}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t("count", { count: spots.length })}</span>
          {spots.length > 0 && (
            <div className="no-print flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800" role="group" aria-label={t("view.group")}>
              <button
                type="button"
                onClick={() => changeView("card")}
                aria-pressed={view === "card"}
                title={t("view.card")}
                className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors ${
                  view === "card" ? "bg-white text-cyan-700 shadow-sm dark:bg-slate-700 dark:text-cyan-400" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <FaTableCellsLarge />
              </button>
              <button
                type="button"
                onClick={() => changeView("list")}
                aria-pressed={view === "list"}
                title={t("view.list")}
                className={`flex h-7 w-7 items-center justify-center rounded-md text-sm transition-colors ${
                  view === "list" ? "bg-white text-cyan-700 shadow-sm dark:bg-slate-700 dark:text-cyan-400" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <FaList />
              </button>
            </div>
          )}
          {headerAction}
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
        {t("description")}
      </p>
      {spots.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-400 dark:bg-slate-800 dark:text-slate-500">
          {t("empty")}
        </p>
      ) : view === "card" ? (
        <ul className="flex flex-wrap gap-3">
          {spots.map((s) => (
            <li
              key={s.id}
              onClick={() => setOpenId(s.id)}
              className="flex min-w-0 basis-full max-w-md cursor-pointer flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition-colors hover:border-cyan-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-cyan-500/50 dark:hover:bg-slate-700/50 sm:basis-[calc(50%-0.375rem)]"
            >
              <SpotCard
                spot={s}
                coverUrl={ratings[s.id]?.photoUrls?.[0]}
                rating={ratings[s.id]}
                iconSlot={
                  <div onClick={(e) => e.stopPropagation()}>
                    <IconPicker spot={s} reload={reload} />
                  </div>
                }
                onLinkClick={(e) => e.stopPropagation()}
                footerTrailing={<span className="ml-auto text-cyan-700 dark:text-cyan-400">{t("detail")}</span>}
                trailing={
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(s);
                    }}
                    className="shrink-0 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    {t("common:actions.delete")}
                  </button>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
          {spots.map((s) => {
            const cover = ratings[s.id]?.photoUrls?.[0];
            const rating = ratings[s.id];
            const igCount = s.instagram?.length ?? 0;
            return (
              <li
                key={s.id}
                onClick={() => setOpenId(s.id)}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                {/* サムネ（なければ種別アイコン）。 */}
                {cover ? (
                  <img
                    src={cover}
                    alt={s.name}
                    loading="lazy"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-lg leading-none ring-1 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600">
                    {resolveSpotIcon(s).emoji}
                  </span>
                )}
                {/* 名称・英名 */}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-800 dark:text-slate-100">
                    {s.name}
                    {s.name_en && <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">{s.name_en}</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {s.country && <span>{s.country}</span>}
                    {s.city && <span>· {s.city}</span>}
                    {s.category && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">{s.category}</span>}
                    {rating && <RatingBadge rating={rating.rating} count={rating.userRatingCount} />}
                  </div>
                </div>
                {/* 操作（リンク / 詳細 / 削除）。行クリックと競合しないよう stopPropagation。 */}
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  {s.google_maps_url && (
                    <GoogleMapsLink url={s.google_maps_url} onClick={(e) => e.stopPropagation()} />
                  )}
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hidden items-center gap-1 font-medium text-cyan-700 hover:underline dark:text-cyan-400 sm:inline-flex"
                    >
                      <FaLink className="text-[10px]" /> {t("links.link")}
                    </a>
                  )}
                  {igCount > 0 && (
                    <span className="hidden items-center gap-1 font-medium text-pink-500 sm:inline-flex">
                      <FaInstagram /> {igCount}
                    </span>
                  )}
                  <span className="text-cyan-700 dark:text-cyan-400">{t("detail")}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(s);
                    }}
                    className="rounded px-2 py-1 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                  >
                    {t("common:actions.delete")}
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
