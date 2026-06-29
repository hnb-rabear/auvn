// src/lib/bear-downside.ts
/** Phân phối rủi ro bear: mức-rơi-thêm có điều kiện theo độ sâu drawdown. Tính tại collection-time. */
import { blockBootstrapCi, blockBootstrapPercentileCi, percentile } from "./indicators";
import type { BearHorizonStat } from "./types";

export const BUCKETS: { lo: number; hi: number | null }[] = [
  { lo: 0, hi: 0.10 },
  { lo: 0.10, hi: 0.20 },
  { lo: 0.20, hi: 0.30 },
  { lo: 0.30, hi: null },
];
export const HORIZONS = [21, 63, 126, 252];
export const STEP = 3;
export const MIN_N = 30;

/** dd fraction (0..1) -> chỉ số bucket 0..3. Biên trên thuộc bucket kế. */
export function bucketOf(dd: number): number {
  for (let b = 0; b < BUCKETS.length; b++) {
    const { hi } = BUCKETS[b];
    if (hi === null || dd < hi) return b;
  }
  return BUCKETS.length - 1;
}

/** Đáy tệ nhất H phiên tới so với hôm nay, %: min(closes[i+1..i+H])/closes[i]-1. null nếu chưa đáo hạn. */
export function furtherDrawdownPct(closes: number[], i: number, H: number): number | null {
  if (i + H >= closes.length) return null;
  let mn = Infinity;
  for (let j = i + 1; j <= i + H; j++) if (closes[j] < mn) mn = closes[j];
  return (mn / closes[i] - 1) * 100;
}

/** Thống kê một nhóm mức-rơi-thêm (%) cho horizon H. blockSize lưới-thưa = round(H/STEP). */
export function computeHorizonStat(values: number[], H: number): BearHorizonStat {
  const n = values.length;
  const blk = Math.max(1, Math.round(H / STEP));
  const favArr = values.map((v) => (v >= 0 ? 1 : -1));
  const pos = favArr.filter((x) => x > 0).length;
  return {
    horizonDays: H,
    median: n ? Math.round(percentile(values, 0.5) * 10) / 10 : 0,
    p10: n ? Math.round(percentile(values, 0.1) * 10) / 10 : 0,
    p90: n ? Math.round(percentile(values, 0.9) * 10) / 10 : 0,
    pBottomBehind: n ? Math.round((pos / n) * 1000) / 10 : 0,
    pCi: blockBootstrapCi(favArr, blk),
    medianCi: blockBootstrapPercentileCi(values, 0.5, blk),
    n,
  };
}
