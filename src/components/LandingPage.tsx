import {
  FaGoogle,
  FaMapLocationDot,
  FaRegCalendarDays,
  FaCompass,
  FaWallet,
  FaRegNoteSticky,
  FaFilePdf,
  FaGithub,
  FaArrowRightLong,
  FaRobot,
} from "react-icons/fa6";
import { useTranslation, Trans } from "react-i18next";
import type { TFunction } from "i18next";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

/** サービス紹介の各機能。key は landing:features.{key}、phase は landing:phase.{phase} を参照する。 */
const FEATURES: { key: string; icon: React.ReactNode; phase: string }[] = [
  { key: "agent", icon: <FaRobot />, phase: "all" },
  { key: "spots", icon: <FaCompass />, phase: "discovery" },
  { key: "map", icon: <FaMapLocationDot />, phase: "planning" },
  { key: "itinerary", icon: <FaRegCalendarDays />, phase: "planning" },
  { key: "budget", icon: <FaWallet />, phase: "booking" },
  { key: "export", icon: <FaFilePdf />, phase: "booklet" },
  { key: "memo", icon: <FaRegNoteSticky />, phase: "all" },
];

/** 使い方の 3 ステップ（landing:steps.{key}）。 */
const STEP_KEYS = ["s1", "s2", "s3"] as const;

const GITHUB_URL = "https://github.com/reibomaru/shiori";

type FlowStep = {
  n: string;
  x: number;
  title: string;
  /** アイコン付きのひとことラベル（例: AI エージェント）。 */
  icon?: "robot";
  note?: string;
  /** ノード内に並べるタグ（観点・情報源・出力形式など）。幅は文言から見積もる。 */
  tags?: string[];
  /** タグを使わないノードの説明 2 行。 */
  desc?: string[];
};

/**
 * 旅づくりの 4 フェーズ（すべて shiori のサービス内空間で進む）。
 * - 01 ディスカバリー: AI エージェントが歴史・食・文化・自然を調べる
 * - 02 プランニング: 01 と行き来しながら効率の良い旅程を組む
 * - 03 予約・費用の管理: 予約と費用をまとめて把握する
 * - 04 しおりづくり: 旅のしおりを仕上げる
 * 入力元（ネット検索・書類/領収書/請求書の OCR）と出力元（PDF・HTML）は
 * サービス外のものとして FLOW_INPUTS / FLOW_OUTPUTS に分ける。
 */
function flowSteps(t: TFunction): FlowStep[] {
  return [
    {
      n: "01",
      x: 62,
      title: t("flow.step1.title"),
      icon: "robot",
      note: t("flow.step1.note"),
      tags: t("flow.step1.tags", { returnObjects: true }) as string[],
    },
    { n: "02", x: 337, title: t("flow.step2.title"), desc: [t("flow.step2.desc1"), t("flow.step2.desc2")] },
    {
      n: "03",
      x: 612,
      title: t("flow.step3.title"),
      tags: t("flow.step3.tags", { returnObjects: true }) as string[],
    },
    { n: "04", x: 887, title: t("flow.step4.title"), icon: "robot", note: t("flow.step4.note") },
  ];
}

/**
 * SVG 内のチップ幅を文言から見積もる（全角文字 ≒ 12.5px、半角 ≒ 7px、左右余白 20px）。
 * 言語ごとに文字数が大きく変わるため、固定幅ではなく文言から算出する。
 */
function chipWidth(label: string, fontSize = 12): number {
  let w = 0;
  for (const ch of label) {
    const code = ch.codePointAt(0) ?? 0;
    const wide = code > 0x2e80; // CJK・全角記号など
    w += wide ? fontSize * 1.05 : fontSize * 0.58;
  }
  return Math.ceil(w + 20);
}

const FLOW_BOX = { w: 250, h: 144, y: 124 };

/** 1〜4 を囲う shiori のサービス内空間。 */
const FLOW_CONTAINER = { x: 40, y: 100, w: 1120, h: 180 };

type FlowChip = { label: string; w: number; cx: number; tx: number };

/**
 * 同じノードへ向かう入力チップを、グループ中心 `center` を挟んで左右に並べる。
 * 文言の長さは言語で変わるため、幅を見積もってから中心位置を決める。
 */
function layoutChipGroup(items: { label: string; tx: number }[], center: number, gap = 10): FlowChip[] {
  const widths = items.map((i) => chipWidth(i.label, 13));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = center - total / 2;
  return items.map((it, i) => {
    const w = widths[i];
    const chip = { label: it.label, w, cx: x + w / 2, tx: it.tx };
    x += w + gap;
    return chip;
  });
}

/** サービス外の入力元。矢印で該当ノードへ取り込む（cx=チップ中心 / tx=着地点）。 */
function flowInputs(t: TFunction): FlowChip[] {
  return [
    ...layoutChipGroup(
      [
        { label: t("flow.inputs.webSearch"), tx: 168 },
        { label: t("flow.inputs.docOcr"), tx: 208 },
      ],
      189,
    ),
    ...layoutChipGroup(
      [
        { label: t("flow.inputs.receiptOcr"), tx: 705 },
        { label: t("flow.inputs.invoiceOcr"), tx: 768 },
      ],
      736,
    ),
  ];
}

/** サービス外への出力元（しおりの成果物）。 */
function flowOutputs(t: TFunction): { label: string; w: number; cx: number }[] {
  const pdf = t("flow.outputs.pdf");
  const html = t("flow.outputs.html");
  const wp = chipWidth(pdf, 13);
  const wh = chipWidth(html, 13);
  const gap = 10;
  const start = 1013 - (wp + gap + wh) / 2;
  return [
    { label: pdf, w: wp, cx: start + wp / 2 },
    { label: html, w: wh, cx: start + wp + gap + wh / 2 },
  ];
}

/**
 * コネクタ線の上を移動する「データパケット」の光点。
 * 線に沿って animateMotion で往復ではなく片道に繰り返し流し、
 * フェーズ間をデータが流れていく様子を表す。begin をずらして数珠つなぎに見せる。
 */
function FlowPulse({
  x1,
  y1,
  x2,
  y2,
  color = "#38bdf8",
  dur = 1.8,
  begin = 0,
  r = 2.6,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  dur?: number;
  begin?: number;
  r?: number;
}) {
  const d = `M${x1},${y1} L${x2},${y2}`;
  return (
    <circle r={r} fill={color}>
      <animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={d} />
      {/* 端で唐突に消えないよう、出入りをフェードさせる */}
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.15;0.85;1"
        dur={`${dur}s`}
        begin={`${begin}s`}
        repeatCount="indefinite"
      />
    </circle>
  );
}

/**
 * 機能紹介の主役。旅づくりを 4 フェーズのフローチャートで表現する。
 * 1〜4 のノードは shiori のサービス内空間を表す枠で囲む。
 * 入力元（ネット検索・書類 OCR・領収書/請求書 OCR）は枠の外から矢印で取り込み、
 * 出力元（PDF・HTML）は枠の外へ矢印で書き出す。01⇄02 は行き来しながら固める。
 */
function FlowChart() {
  const { t } = useTranslation("landing");
  const FLOW_STEPS = flowSteps(t);
  const FLOW_INPUTS = flowInputs(t);
  const FLOW_OUTPUTS = flowOutputs(t);
  const { w, y } = FLOW_BOX;
  // タグの x 位置を幅から積み上げ、maxRight を超えたら次の行へ折り返す。
  const layoutTags = (tags: string[], startX: number, maxRight: number) => {
    const gap = 6;
    let x = startX;
    let row = 0;
    return tags.map((label) => {
      const tw = chipWidth(label);
      if (x > startX && x + tw > maxRight) {
        row += 1;
        x = startX;
      }
      const placed = { label, w: tw, x, row };
      x += tw + gap;
      return placed;
    });
  };
  // 言語によってタグの行数が変わるため、ノードの高さ（＝枠・全体の高さ）は行数から決める。
  const layouts = FLOW_STEPS.map((s) => {
    const tags = s.tags ? layoutTags(s.tags, s.x + 18, s.x + w - 12) : null;
    const tagsTop = s.note ? y + 104 : y + 86;
    const rows = tags && tags.length ? Math.max(...tags.map((tg) => tg.row)) + 1 : 0;
    const bottom = rows ? tagsTop + (rows - 1) * 28 + 24 + 16 : y + FLOW_BOX.h;
    return { tags, tagsTop, bottom };
  });
  const h = Math.max(FLOW_BOX.h, ...layouts.map((l) => l.bottom - y));
  const extra = h - FLOW_BOX.h;
  const container = { ...FLOW_CONTAINER, h: FLOW_CONTAINER.h + extra };
  const cy = y + h / 2;
  const cx = (s: { x: number }) => s.x + w / 2;
  return (
    <svg
      viewBox={`0 0 1200 ${348 + extra}`}
      className="h-auto w-full"
      role="img"
      aria-label={t("flow.aria")}
    >
      <defs>
        <marker id="flow-arrow-cyan" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#38bdf8" />
        </marker>
        <marker id="flow-arrow-slate" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L7,3 L0,6 Z" fill="#64748b" />
        </marker>
      </defs>

      {/* shiori のサービス内空間（1〜4 を囲う枠） */}
      <rect
        x={container.x}
        y={container.y}
        width={container.w}
        height={container.h}
        rx={20}
        fill="rgba(56,189,248,0.03)"
        stroke="rgba(56,189,248,0.25)"
      />
      <g transform="translate(52, 71)">
        <Logo size={16} className="text-cyan-300" animated={false} />
      </g>
      <text x={74} y={85} className="font-mono-tech" fontSize={15} fontWeight={700} fill="#e2e8f0">
        shiori
      </text>

      {/* サービス外の入力元 → ノードへ取り込み */}
      {FLOW_INPUTS.map((src) => (
        <g key={src.label}>
          <rect
            x={src.cx - src.w / 2}
            y={20}
            width={src.w}
            height={30}
            rx={15}
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(148,163,184,0.35)"
          />
          <text
            x={src.cx}
            y={35}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={13}
            fill="#cbd5e1"
          >
            {src.label}
          </text>
          <line
            x1={src.cx}
            y1={52}
            x2={src.tx}
            y2={y - 2}
            stroke="#64748b"
            strokeWidth={1.3}
            strokeDasharray="4 4"
            markerEnd="url(#flow-arrow-slate)"
          >
            {/* 破線がノードへ向かって流れ、取り込み中であることを示す */}
            <animate
              attributeName="stroke-dashoffset"
              from="0"
              to="-16"
              dur="1s"
              repeatCount="indefinite"
            />
          </line>
          <FlowPulse x1={src.cx} y1={52} x2={src.tx} y2={y - 2} color="#94a3b8" dur={1.6} r={2.2} />
        </g>
      ))}

      {/* 前進の矢印（各フェーズを順につなぐ）。カード間の状態遷移エッジはアニメーションしない。 */}
      {FLOW_STEPS.slice(0, -1).map((s, i) => {
        const next = FLOW_STEPS[i + 1];
        return (
          <line
            key={`f-${s.n}`}
            x1={s.x + w + 3}
            y1={cy}
            x2={next.x - 3}
            y2={cy}
            stroke="#38bdf8"
            strokeWidth={1.8}
            markerEnd="url(#flow-arrow-cyan)"
          />
        );
      })}

      {/* 01 ⇄ 02 の往復（前進の青矢印のすぐ下に、戻りの青矢印を短く描く） */}
      <line
        x1={FLOW_STEPS[1].x - 3}
        y1={cy + 14}
        x2={FLOW_STEPS[0].x + w + 3}
        y2={cy + 14}
        stroke="#38bdf8"
        strokeWidth={1.8}
        markerEnd="url(#flow-arrow-cyan)"
      />

      {/* 各フェーズのノード */}
      {FLOW_STEPS.map((s, i) => {
        const { tags, tagsTop } = layouts[i];
        return (
          <g key={s.n}>
            <rect
              x={s.x}
              y={y}
              width={w}
              height={h}
              rx={14}
              fill="rgba(255,255,255,0.03)"
              stroke={s.n === "01" ? "rgba(56,189,248,0.35)" : "rgba(255,255,255,0.12)"}
            />
            <text
              x={s.x + 22}
              y={y + 32}
              className="font-mono-tech"
              fontSize={13}
              fill="#22d3ee"
              opacity={0.6}
            >
              {s.n}
            </text>
            <text x={s.x + 22} y={y + 70} fontSize={20} fontWeight={600} fill="#f1f5f9">
              {s.title}
            </text>

            {s.note && (
              <>
                {s.icon === "robot" && (
                  <g transform={`translate(${s.x + 22}, ${y + 83})`}>
                    <FaRobot size={16} color="#7dd3fc" />
                  </g>
                )}
                <text x={s.x + (s.icon ? 44 : 22)} y={y + 96} fontSize={12} fill="#7dd3fc">
                  {s.note}
                </text>
              </>
            )}

            {tags?.map((tag) => (
              <g key={tag.label}>
                <rect
                  x={tag.x}
                  y={tagsTop + tag.row * 28}
                  width={tag.w}
                  height={24}
                  rx={12}
                  fill="rgba(56,189,248,0.12)"
                  stroke="rgba(56,189,248,0.3)"
                />
                <text
                  x={tag.x + tag.w / 2}
                  y={tagsTop + tag.row * 28 + 12}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fill="#7dd3fc"
                >
                  {tag.label}
                </text>
              </g>
            ))}

            {s.desc && (
              <>
                <text x={s.x + 22} y={y + 102} fontSize={13} fill="#94a3b8">
                  {s.desc[0]}
                </text>
                <text x={s.x + 22} y={y + 122} fontSize={13} fill="#94a3b8">
                  {s.desc[1]}
                </text>
              </>
            )}

            {/* 02 の右余白に、地図の俯瞰を示す小さなルート図を添える */}
            {s.n === "02" && (
              <g>
                <polyline
                  points={`${s.x + 163},${y + 108} ${s.x + 191},${y + 78} ${s.x + 223},${y + 100}`}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={1.6}
                  strokeDasharray="4 4"
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-16"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                </polyline>
                {[
                  [163, 108],
                  [191, 78],
                  [223, 100],
                ].map(([dx, dy]) => (
                  <circle key={dx} cx={s.x + dx} cy={y + dy} r={3.5} fill="#38bdf8" />
                ))}
              </g>
            )}
          </g>
        );
      })}

      {/* ノード 04 → サービス外へ書き出し */}
      {FLOW_OUTPUTS.map((o) => (
        <g key={o.label}>
          <line
            x1={cx(FLOW_STEPS[3])}
            y1={y + h}
            x2={o.cx}
            y2={container.y + container.h + 18}
            stroke="#38bdf8"
            strokeWidth={1.5}
            markerEnd="url(#flow-arrow-cyan)"
          />
          <FlowPulse
            x1={cx(FLOW_STEPS[3])}
            y1={y + h}
            x2={o.cx}
            y2={container.y + container.h + 18}
            dur={1.6}
            r={2.2}
          />
          <rect
            x={o.cx - o.w / 2}
            y={container.y + container.h + 20}
            width={o.w}
            height={30}
            rx={15}
            fill="rgba(56,189,248,0.1)"
            stroke="rgba(56,189,248,0.4)"
          />
          <text
            x={o.cx}
            y={container.y + container.h + 35}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={13}
            fill="#7dd3fc"
          >
            {o.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** 未認証時のトップ（`/`）に表示するランディングページ。CTA から Google ログインへ誘導する。 */
export function LandingPage() {
  const { t } = useTranslation("landing");
  return (
    <div className="tech-mesh min-h-screen text-slate-100">
      {/* ===== ヘッダー ===== */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[var(--base)]/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3.5 lg:px-10">
          <div className="flex items-center gap-2">
            <Logo size={28} className="text-cyan-300" />
            <span className="brand-wordmark font-mono-tech text-xl font-bold lowercase tracking-wide">
              shiori
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher surface="dark" />
            <a
              href="/auth/google"
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold text-slate-100 ring-1 ring-inset ring-white/15 transition hover:bg-white/15"
            >
              <FaGoogle className="text-cyan-300" />
              {t("header.login")}
            </a>
          </div>
        </div>
      </header>

      {/* ===== ヒーロー ===== */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="mx-auto grid max-w-[1440px] items-center gap-14 px-6 py-20 sm:py-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:px-10">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-cyan-200 ring-1 ring-inset ring-cyan-400/20">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-neon)]" />
              {t("hero.badge")}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              <Trans
                t={t}
                i18nKey="hero.title"
                components={[<br key="br" className="hidden sm:block" />, <span key="brand" className="brand-wordmark" />]}
              />
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg lg:mx-0">
              {t("hero.lead")}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row lg:items-start lg:justify-start">
              <a
                href="/auth/google"
                className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-white px-5 py-3 font-semibold text-slate-800 shadow-lg shadow-cyan-500/10 transition hover:bg-slate-100 sm:w-auto"
              >
                <FaGoogle className="text-lg" />
                {t("hero.ctaGoogle")}
              </a>
              <a
                href="#features"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 font-semibold text-slate-200 ring-1 ring-inset ring-white/15 transition hover:bg-white/5 sm:w-auto"
              >
                {t("hero.ctaFeatures")}
                <FaArrowRightLong className="text-sm" />
              </a>
            </div>
          </div>

          {/* 実際のアプリ画面（スポット候補 × AI チャット）をブラウザ風フレームに収め、
              利用イメージをそのまま伝える。 */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-cyan-500/15 via-transparent to-violet-500/15 blur-2xl" />
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl ring-1 ring-inset ring-white/10 backdrop-blur">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              </div>
              <img
                src="/app-preview.jpg"
                alt={t("hero.previewAlt")}
                width={1400}
                height={790}
                loading="eager"
                className="block w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== 機能の紹介：利用の流れをシーケンス図で表現 ===== */}
      <section id="features" className="border-b border-white/10">
        <div className="mx-auto max-w-[1440px] px-6 py-20 sm:py-28 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="font-mono-tech text-xs uppercase tracking-[0.25em] text-cyan-300/70">
              {t("workflow.eyebrow")}
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{t("workflow.title")}</h2>
            <p className="mt-4 text-slate-300">{t("workflow.lead")}</p>
          </div>

          <div className="mx-auto mt-16 w-full max-w-5xl overflow-x-auto">
            <div className="min-w-[760px]">
              <FlowChart />
            </div>
          </div>

          {/* 含まれる機能（カードにせず、罫線区切りの一覧で示す） */}
          <dl className="mx-auto mt-16 grid max-w-5xl gap-x-10 border-t border-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.key} className="flex items-start gap-3.5 border-b border-white/10 py-5">
                <span className="mt-0.5 text-lg text-cyan-300/80">{f.icon}</span>
                <div className="min-w-0">
                  <dt className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                    {t(`features.${f.key}.title`)}
                    <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-cyan-200">
                      {t(`phase.${f.phase}`)}
                    </span>
                  </dt>
                  <dd className="mt-1 text-xs leading-relaxed text-slate-400">{t(`features.${f.key}.desc`)}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ===== 使い方：3 ステップ（罫線で仕切り、カードにしない） ===== */}
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-[1440px] px-6 py-20 sm:py-28 lg:px-10">
          <div>
            <span className="font-mono-tech text-xs uppercase tracking-[0.25em] text-cyan-300/70">
              {t("steps.eyebrow")}
            </span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{t("steps.title")}</h2>
          </div>
          <div className="mt-14 grid border-t border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-white/10">
            {STEP_KEYS.map((k, i) => (
              <div
                key={k}
                className="border-b border-white/10 py-8 sm:border-b-0 sm:px-10 sm:first:pl-0 sm:last:pr-0"
              >
                <span className="brand-wordmark font-mono-tech text-5xl font-bold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-5 text-xl font-semibold text-slate-100">{t(`steps.${k}.title`)}</h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">{t(`steps.${k}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 最終 CTA：全幅バンド ===== */}
      <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-cyan-500/10 via-transparent to-violet-500/10">
        <div className="mx-auto flex max-w-[1440px] flex-col items-start gap-10 px-6 py-24 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div>
            <div className="mb-5 flex items-center gap-2.5">
              <Logo size={36} className="text-cyan-300" />
              <span className="brand-wordmark font-mono-tech text-2xl font-bold lowercase tracking-wide">
                shiori
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("cta.title")}</h2>
            <p className="mt-4 max-w-lg text-slate-300">{t("cta.lead")}</p>
          </div>
          <a
            href="/auth/google"
            className="inline-flex shrink-0 items-center justify-center gap-3 rounded-lg bg-white px-6 py-3.5 font-semibold text-slate-800 shadow-lg shadow-cyan-500/10 transition hover:bg-slate-100"
          >
            <FaGoogle className="text-lg" />
            {t("cta.button")}
          </a>
        </div>
      </section>

      {/* ===== フッター ===== */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-400 sm:flex-row lg:px-10">
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
              {t("footer.github")}
            </a>
          </nav>
          <p className="text-slate-500">{t("footer.copyright")}</p>
        </div>
      </footer>
    </div>
  );
}
