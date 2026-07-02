// src/lib/bear-downside-view.ts
/** Helper thuần cho máy thời gian card Triển Vọng — không React, dễ test. */
import { furtherDrawdownPct } from "./bear-downside";

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

/** right nếu actual ≥ threshold; wrong nếu thấp hơn; null nếu thiếu đầu vào. */
export function verdict(actual: number | null, threshold: number | null): "right" | "wrong" | null {
  if (actual === null || threshold === null) return null;
  return actual >= threshold ? "right" : "wrong";
}
