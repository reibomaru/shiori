import {
  FaGoogle,
  FaMapLocationDot,
  FaRegCalendarDays,
  FaCompass,
  FaWallet,
  FaRegNoteSticky,
  FaWandMagicSparkles,
  FaFilePdf,
  FaGithub,
  FaArrowRightLong,
} from "react-icons/fa6";
import { Logo } from "./Logo";

/** サービス紹介の各機能。ロゴと同じシアン→パープルの語彙でアイコンを彩る。 */
const FEATURES: { icon: React.ReactNode; title: string; desc: string }[] = [
  {
    icon: <FaMapLocationDot />,
    title: "地図・移動ルート",
    desc: "経由地や交通手段を並べて、区間ごとの移動を地図上のルートとして可視化。鉄道・飛行機・徒歩まで区別して描けます。",
  },
  {
    icon: <FaRegCalendarDays />,
    title: "日ごとの旅程",
    desc: "Day ごとに予定を積み上げ、ドラッグで並べ替え。移動と滞在をひと目でつかめるタイムラインに。",
  },
  {
    icon: <FaCompass />,
    title: "スポット候補",
    desc: "行きたい場所をストックして、Instagram のギャラリーやメモと一緒に管理。旅程へそのまま組み込めます。",
  },
  {
    icon: <FaWallet />,
    title: "予算",
    desc: "費目ごとに見積もりと実費を記録。旅の全体像とお財布のバランスを保ちながら計画できます。",
  },
  {
    icon: <FaRegNoteSticky />,
    title: "メモ",
    desc: "持ち物・予約番号・現地の気づきまで、旅にまつわるメモを一箇所に。思いついたときにすぐ残せます。",
  },
  {
    icon: <FaWandMagicSparkles />,
    title: "AI アシスタント",
    desc: "AI と会話しながら、ルートの相談やスポット探し、旅程づくりを一緒に進行。ゼロからでも迷いません。",
  },
  {
    icon: <FaFilePdf />,
    title: "PDF 出力",
    desc: "できあがった旅のしおりは、そのまま印刷 / PDF に。オフラインでも手元で確認できる一冊になります。",
  },
];

/** 使い方の 3 ステップ。 */
const STEPS: { title: string; desc: string }[] = [
  {
    title: "ログインしてはじめる",
    desc: "Google アカウントで数秒でサインイン。すぐに最初の旅を作りはじめられます。",
  },
  {
    title: "旅を組み立てる",
    desc: "行きたいスポットを集め、移動ルートと日ごとの旅程を並べて、予算やメモを添えていきます。",
  },
  {
    title: "しおりにして持ち出す",
    desc: "仲間と共有したり、PDF に出力して手元に。当日はそのまま旅の相棒になります。",
  },
];

const GITHUB_URL = "https://github.com/reibomaru/shiori";

/** 未認証時のトップ（`/`）に表示するランディングページ。CTA から Google ログインへ誘導する。 */
export function LandingPage() {
  return (
    <div className="tech-mesh min-h-screen text-slate-100">
      {/* ===== ヘッダー ===== */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[var(--base)]/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Logo size={28} className="text-cyan-300" />
            <span className="brand-wordmark font-mono-tech text-xl font-bold lowercase tracking-wide">
              shiori
            </span>
          </div>
          <a
            href="/auth/google"
            className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold text-slate-100 ring-1 ring-inset ring-white/15 transition hover:bg-white/15"
          >
            <FaGoogle className="text-cyan-300" />
            ログイン
          </a>
        </div>
      </header>

      {/* ===== ヒーロー ===== */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:py-24 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-cyan-200 ring-1 ring-inset ring-cyan-400/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-neon)]" />
              AI と一緒につくる、旅のしおり
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              旅の計画を、
              <br className="hidden sm:block" />
              ひとつの
              <span className="brand-wordmark">しおり</span>に。
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg lg:mx-0">
              移動ルート・日ごとの旅程・行きたいスポット・予算・メモを
              まとめて編集し、そのまま PDF に。
              AI と話しながら、旅の計画をかたちにできます。
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start">
              <a
                href="/auth/google"
                className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-white px-5 py-3 font-semibold text-slate-800 shadow-lg shadow-cyan-500/10 transition hover:bg-slate-100 sm:w-auto"
              >
                <FaGoogle className="text-lg" />
                Google ではじめる
              </a>
              <a
                href="#features"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 font-semibold text-slate-200 ring-1 ring-inset ring-white/15 transition hover:bg-white/5 sm:w-auto"
              >
                機能を見る
                <FaArrowRightLong className="text-sm" />
              </a>
            </div>
          </div>

          {/* アプリのイメージ（軽量なモック）。ノードグラフのロゴを主役に、
              旅程カードを重ねて "しおり" の質感を伝える。 */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-cyan-500/15 via-transparent to-violet-500/15 blur-2xl" />
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur">
              <div className="mb-4 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              </div>
              <div className="flex items-center justify-center rounded-xl bg-[var(--base-2)] py-8">
                <Logo size={112} className="text-cyan-300" />
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  { icon: <FaMapLocationDot />, label: "チューリッヒ → ツェルマット", sub: "鉄道 3h20m" },
                  { icon: <FaRegCalendarDays />, label: "Day 2・氷河特急とマッターホルン", sub: "09:00 – 18:00" },
                  { icon: <FaWallet />, label: "予算 ¥42,000 / 見積 ¥50,000", sub: "順調" },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5 ring-1 ring-inset ring-white/5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-cyan-400/20 to-violet-400/20 text-cyan-200">
                      {row.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">{row.label}</p>
                      <p className="truncate text-xs text-slate-400">{row.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 機能紹介 ===== */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">旅づくりに必要なものを、ぜんぶ</h2>
          <p className="mt-3 text-slate-300">
            計画から当日まで。散らばりがちな旅の情報を、ひとつのしおりにまとめます。
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-white/10 bg-white/5 p-5 ring-1 ring-inset ring-white/5 transition hover:border-cyan-400/25 hover:bg-white/[0.07]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-cyan-400/15 to-violet-400/15 text-xl text-cyan-200 ring-1 ring-inset ring-white/10">
                {f.icon}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 使い方 3 ステップ ===== */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">3 ステップではじめる</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative rounded-xl border border-white/10 bg-white/5 p-6">
              <span className="brand-wordmark font-mono-tech text-4xl font-bold">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-slate-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 最終 CTA ===== */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 via-white/5 to-violet-500/10 px-6 py-14 text-center ring-1 ring-inset ring-white/10">
          <div className="mb-5 flex items-center justify-center gap-2.5">
            <Logo size={36} className="text-cyan-300" />
            <span className="brand-wordmark font-mono-tech text-2xl font-bold lowercase tracking-wide">
              shiori
            </span>
          </div>
          <h2 className="text-2xl font-bold sm:text-3xl">次の旅を、いまつくりはじめよう</h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-300">
            Google アカウントでログインして、あなたの旅程を作成しましょう。
          </p>
          <a
            href="/auth/google"
            className="mt-8 inline-flex items-center justify-center gap-3 rounded-lg bg-white px-6 py-3 font-semibold text-slate-800 shadow-lg shadow-cyan-500/10 transition hover:bg-slate-100"
          >
            <FaGoogle className="text-lg" />
            Google でログイン
          </a>
        </div>
      </section>

      {/* ===== フッター ===== */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-slate-400 sm:flex-row">
          <div className="flex items-center gap-2">
            <Logo size={20} className="text-cyan-300" animated={false} />
            <span className="font-mono-tech lowercase tracking-wide">shiori</span>
          </div>
          <nav className="flex items-center gap-5">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition hover:text-slate-100"
            >
              <FaGithub />
              GitHub
            </a>
          </nav>
          <p className="text-slate-500">© 2026 shiori</p>
        </div>
      </footer>
    </div>
  );
}
