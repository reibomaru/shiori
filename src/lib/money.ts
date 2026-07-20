// 実費（複数通貨あり得る）の金額表示ヘルパー。
// budget（概算）は円のみなので itemMeta.ts の yen() を使う。こちらは通貨コード付き。

/** よく使う通貨コードの表示記号。無いものはコードをそのまま前置する。 */
const SYMBOLS: Record<string, string> = { JPY: "¥", USD: "$", EUR: "€", GBP: "£" };

/** 実費で選べる通貨コード（旅先に合わせてスイス・南仏を優先）。 */
export const CURRENCIES = ["JPY", "CHF", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number] | string;

/** 金額を通貨付きで整形する（例: ¥12,300 / CHF 45 / €38）。 */
export function money(amount: number, currency: string): string {
  const n = amount.toLocaleString("ja-JP");
  const sym = SYMBOLS[currency];
  return sym ? `${sym}${n}` : `${currency} ${n}`;
}
