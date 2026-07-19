// heic-convert は型定義を同梱していないため、使う分だけ最小の宣言を用意する。
declare module "heic-convert" {
  interface HeicConvertOptions {
    /** 入力の HEIC/HEIF バイナリ。 */
    buffer: Buffer | Uint8Array;
    /** 出力フォーマット。 */
    format: "JPEG" | "PNG";
    /** JPEG のみ有効な品質（0〜1）。 */
    quality?: number;
  }
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export default convert;
}
