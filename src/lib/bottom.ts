/** Engine xác suất đáy (Bottom Hunter). Dùng chung với scripts/bottom-study.ts. */

/**
 * Dán nhãn "gần đáy" cho ngày i: giá thấp nhất trong H phiên kế tiếp KHÔNG thấp
 * hơn close[i] quá eps%. Trả null nếu chưa đủ H phiên tương lai (không dán nhãn được).
 * CHỈ dùng để backtest/dán nhãn lịch sử — không bao giờ gọi trên ngày hiện tại ở live.
 */
export function labelNearBottom(
  closes: number[],
  i: number,
  horizonDays: number,
  epsPct: number
): boolean | null {
  if (i + horizonDays >= closes.length) return null;
  const floor = closes[i] * (1 - epsPct / 100);
  let minFwd = Infinity;
  for (let j = i + 1; j <= i + horizonDays; j++) {
    if (closes[j] < minFwd) minFwd = closes[j];
  }
  return minFwd >= floor;
}
