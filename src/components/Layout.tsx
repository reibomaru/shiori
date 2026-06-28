import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  FaMapLocationDot,
  FaRegCalendarDays,
  FaWallet,
  FaCompass,
  FaPrint,
  FaRegCalendar,
  FaUserGroup,
  FaYenSign,
} from "react-icons/fa6";
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand } from "react-icons/tb";
import { useTrip } from "../store";
import { yen } from "../itemMeta";

const NAV = [
  { to: "/map", label: "地図", Icon: FaMapLocationDot },
  { to: "/itinerary", label: "旅程", Icon: FaRegCalendarDays },
  { to: "/budget", label: "予算", Icon: FaWallet },
  { to: "/spots", label: "スポット", Icon: FaCompass },
];

export default function Layout() {
  const { data, error } = useTrip();
  const { pathname } = useLocation();
  // 地図・候補・旅程（ビルダー）は全画面（余白なし）。
  const fullBleed =
    pathname.startsWith("/map") ||
    pathname.startsWith("/spots") ||
    pathname.startsWith("/itinerary");
  const [navOpen, setNavOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* ===== サイドバーを開くボタン（折りたたみ時のみ・左端中央） ===== */}
      {!navOpen && (
        <button
          onClick={() => setNavOpen(true)}
          aria-label="メニューを開く"
          className="no-print fixed left-0 top-1/2 z-[600] flex -translate-y-1/2 items-center rounded-r-lg bg-cyan-800 py-3 pl-1.5 pr-2 text-white shadow-lg transition-colors hover:bg-cyan-700"
        >
          <TbLayoutSidebarLeftExpand size={20} />
        </button>
      )}

      {/* ===== 左サイドメニュー（印刷時は非表示） ===== */}
      <aside
        className={`no-print sticky top-0 z-[500] h-screen shrink-0 flex-col overflow-hidden bg-gradient-to-b from-cyan-800 via-sky-800 to-blue-900 text-white transition-all duration-200 ${
          navOpen ? "flex w-60" : "hidden w-0"
        }`}
      >
        <div className="relative border-b border-white/10 px-5 py-5">
          <button
            onClick={() => setNavOpen(false)}
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
                <span>{data.trip.start_date} 〜 {data.trip.end_date}</span>
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

      {/* ===== メイン（ページ） ===== */}
      <main className={`min-w-0 flex-1 ${fullBleed ? "" : "px-6 py-6"} h-screen overflow-y-auto print:h-auto print:overflow-visible print:px-0 print:py-0`}>
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
