import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { countChanges, diffLines, type DiffRow } from "../../lib/diff";

// 変更行の前後に残す文脈行数。これを超える連続の一致行はまとめて折りたたむ。
const CONTEXT = 3;

/** 折りたたみ後の行（差分行 or 「N 行省略」プレースホルダ）。 */
type Segment = { kind: "row"; row: DiffRow } | { kind: "gap"; count: number };

/** 変更のない長い区間を git の hunk のように折りたたむ。 */
function collapse(rows: DiffRow[]): Segment[] {
  // 各 context 行について、近くに変更行があるか（=表示する）を判定する。
  const keep = rows.map((r) => r.type !== "context");
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type !== "context") {
      for (let d = 1; d <= CONTEXT; d++) {
        if (i - d >= 0) keep[i - d] = true;
        if (i + d < rows.length) keep[i + d] = true;
      }
    }
  }
  const out: Segment[] = [];
  let gap = 0;
  for (let i = 0; i < rows.length; i++) {
    if (keep[i]) {
      if (gap > 0) {
        out.push({ kind: "gap", count: gap });
        gap = 0;
      }
      out.push({ kind: "row", row: rows[i] });
    } else {
      gap++;
    }
  }
  if (gap > 0) out.push({ kind: "gap", count: gap });
  return out;
}

const ROW_STYLE: Record<DiffRow["type"], string> = {
  context: "bg-white text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  del: "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300",
  add: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
};
const SIGN: Record<DiffRow["type"], string> = { context: " ", del: "-", add: "+" };

/**
 * git 風の行単位 diff（unified）。チャットパネルは幅が狭いため side-by-side ではなく
 * インライン表示にする。変更のない長い区間は折りたたむ。
 */
export default function DiffView({ before, after }: { before: string; after: string }) {
  const { t } = useTranslation("memo");
  const rows = useMemo(() => diffLines(before, after), [before, after]);
  const segments = useMemo(() => collapse(rows), [rows]);
  const { added, removed } = countChanges(rows);

  if (added === 0 && removed === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500">{t("diff.noChanges")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold dark:border-slate-700 dark:bg-slate-900">
        <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>
        <span className="text-rose-500 dark:text-rose-400">-{removed}</span>
      </div>
      <div className="overflow-x-auto font-mono text-[11px] leading-relaxed">
        {segments.map((seg, idx) =>
          seg.kind === "gap" ? (
            <div
              key={idx}
              className="select-none border-y border-slate-100 bg-slate-50 px-2.5 py-0.5 text-[10px] text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
            >
              {t("diff.omitted", { count: seg.count })}
            </div>
          ) : (
            <div key={idx} className={`flex ${ROW_STYLE[seg.row.type]}`}>
              <span className="w-8 shrink-0 select-none border-r border-slate-100 px-1 text-right text-slate-300 dark:border-slate-700 dark:text-slate-600">
                {seg.row.a ?? ""}
              </span>
              <span className="w-8 shrink-0 select-none border-r border-slate-100 px-1 text-right text-slate-300 dark:border-slate-700 dark:text-slate-600">
                {seg.row.b ?? ""}
              </span>
              <span className="w-4 shrink-0 select-none text-center text-slate-400 dark:text-slate-500">{SIGN[seg.row.type]}</span>
              <span className="whitespace-pre-wrap break-words pr-2">{seg.row.text || " "}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
