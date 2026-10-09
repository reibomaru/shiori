// 実費の費目。DB（expenses.category / budget.category）には日本語の正規値をそのまま保存し、
// 画面表示だけを翻訳する（既存データと AI 抽出（server/agent/extract.ts）の出力を変えないため）。

/** 費目の正規値（保存値）。順序は選択チップの並び順。 */
export const EXPENSE_CATEGORIES = ["宿泊", "交通", "食事", "観光", "買い物", "その他"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** 既定の費目（新規作成時）。 */
export const DEFAULT_EXPENSE_CATEGORY: ExpenseCategory = "宿泊";

const KEY_BY_VALUE: Record<ExpenseCategory, string> = {
  宿泊: "hotel",
  交通: "transport",
  食事: "meal",
  観光: "sightseeing",
  買い物: "shopping",
  その他: "other",
};

/**
 * 保存値 → 翻訳キー（budget 名前空間の `category.*`）。
 * 正規値以外（旧データや手入力の自由な費目）は翻訳せずそのまま表示するため、
 * 呼び出し側は `t(key, { defaultValue: value })` のように使う。
 */
export function expenseCategoryKey(value: string): string {
  const k = KEY_BY_VALUE[value as ExpenseCategory];
  return k ? `category.${k}` : value;
}
