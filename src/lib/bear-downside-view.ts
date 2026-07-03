// src/lib/bear-downside-view.ts
/** Helper thuần cho máy thời gian card Triển Vọng — không React, dễ test. */
import { furtherDrawdownPct } from "./bear-downside";
import type { TimelinePoint } from "./types";

/** % dưới đỉnh (ATH) tính tới ngày X, không nhìn tương lai. Trả số dương. */
export function ddAsOfPct(prices: number[], X: number): number {
  let ath = -Infinity;
  for (let i = 0; i <= X && i < prices.length; i++) if (prices[i] > ath) ath = prices[i];
  if (ath <= 0) return 0;
  return ((ath - prices[X]) / ath) * 100;
}

/** Đáy tệ nhất thực tế H phiên sau X: min(prices[X+1..X+H])/prices[X]-1 (%). null nếu chưa đáo hạn. */
export function actualWorstDipPct(prices: number[], X: number, H: number): number | null {
  return furtherDrawdownPct(prices, X, H);
}

/**
 * pUp % → bậc thô "X/10", clamp 1..9. Chống giả-chính-xác: sau recency-weighting
 * chỉ còn ~12 cửa sổ 6T độc lập hiệu dụng (SE ±~10pp) nên "83.5%" là độ chính xác
 * ảo; bậc 1/10 khớp độ phân giải thật và không bao giờ tuyên bố 0/10 hay 10/10.
 */
export function pUpTenths(pUp: number): number {
  return Math.min(9, Math.max(1, Math.round(pUp / 10)));
}

/**
 * Calibration ĐO ĐƯỢC của dải as-of trên toàn lịch sử đã đáo hạn (walk-forward,
 * không look-ahead: dải ngày X chỉ dùng dữ liệu ≤ X, so với thực tế SAU X):
 * - endIn50: % lần kết cục thực nằm trong [endP25, endP75] — kỳ vọng ~50%.
 * - dipBeyond10: % lần đáy thực SÂU hơn p10 "hiếm gặp" — kỳ vọng ~10%.
 * Lưới thưa `step` để bớt chồng lấn cửa sổ. Con số MÔ TẢ độ khớp lịch sử cho card
 * (biến caveat "không phải dự đoán" thành số kiểm được), không phải CI.
 * null khi <30 mẫu.
 */
export function coverageStats(
  points: TimelinePoint[],
  H: "21" | "63" | "126",
  step = 3
): { endIn50: number; dipBeyond10: number; n: number } | null {
  const prices = points.map((p) => p.price);
  const Hn = Number(H);
  let n = 0, in50 = 0, beyond = 0;
  for (let i = 0; i < points.length; i += step) {
    const b = points[i].bearAsOf?.[H];
    const ret = points[i].returns[H];
    if (!b || ret == null) continue;
    const dip = furtherDrawdownPct(prices, i, Hn);
    if (dip === null) continue;
    n++;
    if (ret >= b.endP25 && ret <= b.endP75) in50++;
    if (dip < b.p10) beyond++;
  }
  if (n < 30) return null;
  return {
    endIn50: Math.round((in50 / n) * 100),
    dipBeyond10: Math.round((beyond / n) * 100),
    n,
  };
}

/** Chỉ số phiên ĐẦU của mỗi năm-tháng (YYYY-MM) — mốc snap cho slider tháng. dates phải tăng dần. */
export function monthAnchors(dates: string[]): number[] {
  const out: number[] = [];
  let prev = "";
  for (let i = 0; i < dates.length; i++) {
    const ym = dates[i].slice(0, 7);
    if (ym !== prev) { out.push(i); prev = ym; }
  }
  return out;
}

/** Vị trí tháng của idx = chỉ số anchor lớn nhất ≤ idx (anchors tăng dần). 0 nếu idx trước anchor đầu. */
export function monthPosOf(anchors: number[], idx: number): number {
  let pos = 0;
  for (let k = 0; k < anchors.length; k++) {
    if (anchors[k] <= idx) pos = k;
    else break;
  }
  return pos;
}
