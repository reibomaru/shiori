// アバター用に画像をブラウザ側で正方形リサイズし、data URL(JPEG) を返す。
// Firestore の 1MB ドキュメント制限に収めるため、サーバへ送る前に必ず縮小する。

/**
 * 画像ファイルを一辺 `size` px の正方形（センタークロップ）に縮小して
 * JPEG の data URL を返す。デコードできない形式（例: 一部ブラウザの HEIC）は例外。
 */
export async function resizeToSquareDataUrl(file: File, size = 256, quality = 0.85): Promise<string> {
  const bitmap = await loadBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context を取得できませんでした。");

    // センタークロップ（cover）: 短辺に合わせて正方形に切り出す。
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}

type Decoded = ImageBitmap | HTMLImageElement;

async function loadBitmap(file: File): Promise<Decoded> {
  // createImageBitmap が使えれば高速。未対応環境は <img> にフォールバック。
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* フォールバックへ */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
