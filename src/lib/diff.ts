// 2 つのテキストを行単位で比較して git 風の差分行を返す軽量ユーティリティ。
// メモ本文（Markdown）程度のサイズを想定するため、LCS の DP をそのまま使う。

export type DiffRow =
  | { type: "context"; text: string; a: number; b: number }
  | { type: "del"; text: string; a: number; b: null }
  | { type: "add"; text: string; a: null; b: number };

/** before → after の行差分。改行区切りで比較する。 */
export function diffLines(before: string, after: string): DiffRow[] {
  const A = before.length ? before.split("\n") : [];
  const B = after.length ? after.split("\n") : [];
  const n = A.length;
  const m = B.length;

  // LCS の長さテーブル（末尾から埋める）。
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      rows.push({ type: "context", text: A[i], a: i + 1, b: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: "del", text: A[i], a: i + 1, b: null });
      i++;
    } else {
      rows.push({ type: "add", text: B[j], a: null, b: j + 1 });
      j++;
    }
  }
  while (i < n) rows.push({ type: "del", text: A[i], a: i + 1, b: null }), i++;
  while (j < m) rows.push({ type: "add", text: B[j], a: null, b: j + 1 }), j++;
  return rows;
}

/** 追加・削除の行数を数える（見出しの +N / -N 表示用）。 */
export function countChanges(rows: DiffRow[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    if (r.type === "add") added++;
    else if (r.type === "del") removed++;
  }
  return { added, removed };
}
