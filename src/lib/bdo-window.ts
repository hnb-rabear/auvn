/**
 * Dải chỉ số phiên đang hiển thị trong khung cuộn, suy từ vị trí cuộn hiện tại.
 * scrollLeft/clientWidth: đơn vị px của phần tử cuộn; pxPerSession: mật độ cố định
 * (VIEWPORT_PX / WINDOW_SESSIONS[winKey]); len: tổng số phiên (prices.length).
 */
export function visibleRange(
  scrollLeft: number,
  clientWidth: number,
  pxPerSession: number,
  len: number
): { start: number; end: number } {
  if (len < 1 || pxPerSession <= 0) return { start: 0, end: Math.max(0, len) };
  const start = Math.max(0, Math.min(len - 1, Math.floor(scrollLeft / pxPerSession)));
  const end = Math.max(start + 1, Math.min(len, Math.ceil((scrollLeft + clientWidth) / pxPerSession)));
  return { start, end };
}

/**
 * min/max trên dải [start, end). Dải quá hẹp (<2 phần tử, ví dụ trước lần đo cuộn đầu tiên)
 * fallback về toàn mảng để tránh đường phẳng/giả.
 */
export function localMinMax(prices: number[], start: number, end: number): { min: number; max: number } {
  const slice = end - start >= 2 ? prices.slice(start, end) : prices;
  let min = Infinity, max = -Infinity;
  for (const v of slice) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}
