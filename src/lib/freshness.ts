/** Tuổi tương đối tiếng Việt của một mốc ISO so với nowMs. null nếu thiếu/không hợp lệ. */
export function timeAgo(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (sec < 60) return "vừa xong";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  return `${day} ngày trước`;
}

/** Vàng thế giới (GC=F) đóng cửa: T7 cả ngày + CN trước ~22:00 UTC (giờ mở lại;
 *  23:00 UTC vào mùa đông — lệch 1h chấp nhận được cho PWA). */
export function isGoldMarketClosed(nowMs: number): boolean {
  const d = new Date(nowMs);
  const dow = d.getUTCDay(); // 0=CN, 6=T7
  if (dow === 6) return true;
  if (dow === 0 && d.getUTCHours() < 22) return true;
  return false;
}