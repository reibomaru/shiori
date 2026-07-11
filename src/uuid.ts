// crypto.randomUUID() は secure context（HTTPS もしくは localhost）でしか使えない。
// スマホから http://<PCのLAN-IP>:5173 で開くと insecure context になり
// crypto.randomUUID が undefined → 呼び出しで例外 → 画面が真っ白になる。
// getRandomValues は insecure context でも使えるので、それを使った v4 生成に
// フォールバックする。
export function uuid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}
