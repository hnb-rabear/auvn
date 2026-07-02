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
