import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  FaMapLocationDot,
  FaRegCalendarDays,
  FaWallet,
  FaCompass,
  FaRegNoteSticky,
  FaPrint,
  FaRegCalendar,
  FaUserGroup,
  FaYenSign,
  FaBars,
} from "react-icons/fa6";
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand } from "react-icons/tb";
import { useTrip } from "../store";
import { yen } from "../itemMeta";
import type { Day, TripMeta } from "../types";

/** 期間は旅程（各日の日付）の最小〜最大から算出。日付が無ければ trip メタにフォールバック。 */
function tripPeriod(days: Day[], trip: TripMeta) {
  const dates = days.map((d) => d.date).filter((d): d is string => !!d).sort();
  const start = dates[0] ?? trip.start_date;
  const end = dates[dates.length - 1] ?? trip.end_date;
  return `${start ?? ""} 〜 ${end ?? ""}`;
}

const NAV = [
  { to: "/map", label: "地図", Icon: FaMapLocationDot },
  { to: "/itinerary", label: "旅程", Icon: FaRegCalendarDays },
  { to: "/budget", label: "予算", Icon: FaWallet },
  { to: "/spots", label: "スポット", Icon: FaCompass },
  { to: "/memo", label: "メモ", Icon: FaRegNoteSticky },
];

export default function Layout() {
  const { data, error } = useTrip();
  const { pathname } = useLocation();
  // 地図・候補・旅程（ビルダー）・メモ詳細（AI 編集パネル併設）は全画面（余白なし）。
  // メモ一覧(/memo)は従来どおり中央寄せ。詳細(/memo/:id)のみ全画面にする。
  const fullBleed =
    pathname.startsWith("/map") ||
    pathname.startsWith("/spots") ||
    pathname.startsWith("/itinerary") ||
    pathname.startsWith("/memo/");
  // navOpen: デスクトップ（md+）でのサイドバー折りたたみ。
  // mobileOpen: モバイル（md 未満）でのドロワー開閉。
  const [navOpen, setNavOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ページ遷移したらモバイルのドロワーは閉じる。
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* ===== モバイル用トップバー（md 未満のみ・ハンバーガー） ===== */}
      <header className="no-print fixed inset-x-0 top-0 z-[550] flex h-14 items-center gap-3 bg-gradient-to-r from-cyan-800 to-blue-900 px-4 text-white md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="メニューを開く"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
        >
          <FaBars size={18} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-bold">{data?.trip?.title ?? "しおり"}</h1>
        <button
          onClick={() => window.print()}
          aria-label="PDF出力"
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
        >
          <FaPrint size={16} />
        </button>
      </header>

      {/* ===== サイドバーを開くボタン（デスクトップの折りたたみ時のみ・左端中央） ===== */}
      {!navOpen && (
        <button
          onClick={() => setNavOpen(true)}
          aria-label="メニューを開く"
          className="no-print fixed left-0 top-1/2 z-[600] hidden -translate-y-1/2 items-center rounded-r-lg bg-cyan-800 py-3 pl-1.5 pr-2 text-white shadow-lg transition-colors hover:bg-cyan-700 md:flex"
        >
          <TbLayoutSidebarLeftExpand size={20} />
        </button>
      )}

      {/* ===== モバイルのドロワー背景 ===== */}
      {mobileOpen && (
        <div
          className="no-print fixed inset-0 z-[560] bg-slate-900/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ===== 左サイドメニュー（印刷時は非表示） =====
          モバイル: 左からのドロワー（fixed + translate）。デスクトップ: 静的に横並び（navOpen で折りたたみ）。 */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-[570] flex w-72 max-w-[80vw] flex-col overflow-hidden bg-gradient-to-b from-cyan-800 via-sky-800 to-blue-900 text-white transition-transform duration-200 md:sticky md:top-0 md:z-[500] md:h-screen md:max-w-none md:translate-x-0 md:transition-all ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${navOpen ? "md:flex md:w-60" : "md:hidden md:w-0"}`}
      >
        <div className="relative border-b border-white/10 px-5 py-5">
          <button
            onClick={() => {
              setNavOpen(false);
              setMobileOpen(false);
            }}
            aria-label="メニューを閉じる"
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-cyan-100/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <TbLayoutSidebarLeftCollapse size={20} />
          </button>
          <p className="text-[10px] uppercase tracking-widest text-cyan-200/70">open-expedia</p>
          <h1 className="mt-1 text-base font-bold leading-snug">{data?.trip?.title ?? "しおり"}</h1>
          {data?.trip && (
            <dl className="mt-3 space-y-1.5 text-xs text-cyan-50/80">
              <div className="flex items-center gap-2">
                <FaRegCalendar className="shrink-0 opacity-70" />
                <span>{tripPeriod(data.days, data.trip)}</span>
              </div>
              <div className="flex items-center gap-2">
                <FaUserGroup className="shrink-0 opacity-70" />
                <span>{data.trip.travelers}（{data.trip.party_size}名）</span>
              </div>
              <div className="flex items-center gap-2">
                <FaYenSign className="shrink-0 opacity-70" />
                <span>1人 {yen(data.budget.reduce((s, b) => s + b.per_person, 0))}</span>
              </div>
            </dl>
          )}
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-white/15 text-white shadow-sm" : "text-cyan-50/80 hover:bg-white/10"
                }`
              }
            >
              <Icon className="text-base" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-white/10 px-3 py-4">
          <button
            onClick={() => window.print()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-cyan-800 hover:bg-cyan-50"
          >
            <FaPrint />
            PDF出力
          </button>
        </div>
      </aside>

      {/* ===== メイン（ページ） =====
          モバイルは固定トップバー（h-14）分だけ下げ、余白も控えめにする。 */}
      <main className={`mt-14 h-[calc(100dvh-3.5rem)] min-w-0 flex-1 overflow-y-auto md:mt-0 md:h-screen ${
        fullBleed ? "" : "px-4 py-4 md:px-6 md:py-6"
      } print:mt-0 print:h-auto print:overflow-visible print:px-0 print:py-0`}>
        {error ? (
          <div className="mx-auto max-w-xl p-10 text-center">
            <p className="text-rose-600">API に接続できません: {error}</p>
            <p className="mt-2 text-sm text-slate-500">
              別ターミナルで <code className="rounded bg-slate-200 px-1">pnpm dev</code> を起動してください。
            </p>
          </div>
        ) : !data ? (
          <div className="p-10 text-center text-slate-400">読み込み中…</div>
        ) : fullBleed ? (
          <Outlet />
        ) : (
          <div className="mx-auto max-w-4xl">
            <Outlet />
          </div>
        )}
      </main>
    </div>
  );
}
