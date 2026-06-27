import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaCompass, FaLink, FaStar, FaRegStar, FaInstagram, FaXmark } from "react-icons/fa6";
import type { Spot } from "../types";
import { api } from "../api";
import { SPOT_ICONS, resolveSpotIcon } from "../spotIcons";
import InstagramGallery, { normalizePermalink } from "./InstagramGallery";
import ConfirmDialog from "./ConfirmDialog";

function Stars({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, n));
  return (
    <span className="inline-flex items-center text-amber-400">
      {Array.from({ length: 5 }, (_, i) =>
        i < v ? <FaStar key={i} className="text-xs" /> : <FaRegStar key={i} className="text-xs" />
      )}
    </span>
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
    <div ref={rootRef}>
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
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {spots.map((s) => {
            const igCount = s.instagram?.length ?? 0;
            return (
              <li
                key={s.id}
                onClick={() => setOpenId(s.id)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-cyan-300 hover:bg-slate-50"
              >
                <div className="flex items-start gap-2">
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
                      <Stars n={s.want_level} />
                    </div>
                    {s.note && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{s.note}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
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
                        <Stars n={openSpot.want_level} />
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
                {(openSpot.note || openSpot.url || openSpot.source) && (
                  <div className="space-y-3 px-5 pt-4">
                    {openSpot.note && <p className="text-sm text-slate-600">{openSpot.note}</p>}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
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
