// src/lib/bear-downside.ts
/** Phân phối rủi ro bear: mức-rơi-thêm có điều kiện theo độ sâu drawdown. Tính tại collection-time. */
import { blockBootstrapCi, blockBootstrapPercentileCi, percentile } from "./indicators";
import { BEAR_DOWNSIDE_CONFIG, type BearHorizonStat, type BearDownsideAnalysis, type BearBucketStat, type BearDownsideConfig } from "./types";

export const BUCKETS: { lo: number; hi: number | null }[] = [
  { lo: 0, hi: 0.10 },
  { lo: 0.10, hi: 0.20 },
  { lo: 0.20, hi: 0.30 },
  { lo: 0.30, hi: null },
];
export const HORIZONS = [21, 63, 126]; // 1/3/6 tháng — bỏ 12T (252) vì ~20 cửa sổ độc lập + thiên lệch bull mạnh nhất
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

/** Lợi suất TẠI MỐC H so với hôm nay, %: closes[i+H]/closes[i]-1. null nếu chưa đáo hạn. */
export function terminalReturnPct(closes: number[], i: number, H: number): number | null {
  if (i + H >= closes.length) return null;
  return (closes[i + H] / closes[i] - 1) * 100;
}

/**
 * Thống kê một nhóm cho horizon H. `values` = mức-rơi-thêm (%); `termValues` = lợi suất
 * tại mốc (%) cho mặt KẾT CỤC (endMedian/pUp). blockSize lưới-thưa = round(H/STEP).
 */
export function computeHorizonStat(values: number[], H: number, termValues: number[] = []): BearHorizonStat {
  const n = values.length;
  const blk = Math.max(1, Math.round(H / STEP));
  const favArr = values.map((v) => (v >= 0 ? 1 : -1));
  const pos = favArr.filter((x) => x > 0).length;
  const tn = termValues.length;
  const upArr = termValues.map((v) => (v > 0 ? 1 : -1));
  const upPos = upArr.filter((x) => x > 0).length;
  return {
    horizonDays: H,
    median: n ? Math.round(percentile(values, 0.5) * 10) / 10 : 0,
    p10: n ? Math.round(percentile(values, 0.1) * 10) / 10 : 0,
    p90: n ? Math.round(percentile(values, 0.9) * 10) / 10 : 0,
    pBottomBehind: n ? Math.round((pos / n) * 1000) / 10 : 0,
    pCi: blockBootstrapCi(favArr, blk),
    medianCi: blockBootstrapPercentileCi(values, 0.5, blk),
    endMedian: tn ? Math.round(percentile(termValues, 0.5) * 10) / 10 : 0,
    pUp: tn ? Math.round((upPos / tn) * 1000) / 10 : 0,
    pUpCi: blockBootstrapCi(upArr, blk),
    n,
  };
}

function rollingAth(prices: number[]): number[] {
  const out: number[] = [];
  let mx = -Infinity;
  for (const p of prices) { if (p > mx) mx = p; out.push(mx); }
  return out;
}

export function runBearDownside(
  bars: { date: string; close: number }[],
  cfg: BearDownsideConfig = BEAR_DOWNSIDE_CONFIG
): BearDownsideAnalysis {
  if (bars.length === 0) {
    const empty = HORIZONS.map((H) => computeHorizonStat([], H));
    return {
      generatedAt: new Date().toISOString(),
      dataDate: "",
      currentPrice: 0,
      currentDdPct: 0,
      currentBucketIdx: 0,
      conditioningWorks: cfg.conditioningWorks,
      shownSource: "unconditional",
      shown: empty,
      buckets: BUCKETS.map((bk, b) => ({ bucketIdx: b, ddLowPct: Math.round(bk.lo * 100), ddHighPct: bk.hi === null ? null : Math.round(bk.hi * 100), horizons: HORIZONS.map((H) => computeHorizonStat([], H)) })),
      unconditional: empty,
      note: "Chưa có dữ liệu.",
    };
  }

  const closes = bars.map((b) => b.close);
  const dates = bars.map((b) => b.date);
  const ath = rollingAth(closes);
  const ddFrac = closes.map((c, i) => (ath[i] === 0 ? 0 : (ath[i] - c) / ath[i]));

  // gom mức-rơi-thêm (dip) + lợi suất tại mốc (term) theo bucket × horizon + vô-điều-kiện
  const byBucket: number[][][] = BUCKETS.map(() => HORIZONS.map(() => []));
  const byBucketTerm: number[][][] = BUCKETS.map(() => HORIZONS.map(() => []));
  const uncond: number[][] = HORIZONS.map(() => []);
  const uncondTerm: number[][] = HORIZONS.map(() => []);
  for (let i = 0; i < closes.length; i += STEP) {
    const b = bucketOf(ddFrac[i]);
    HORIZONS.forEach((H, h) => {
      const fd = furtherDrawdownPct(closes, i, H);
      if (fd === null) return;
      byBucket[b][h].push(fd);
      uncond[h].push(fd);
      const tr = terminalReturnPct(closes, i, H);
      if (tr !== null) { byBucketTerm[b][h].push(tr); uncondTerm[h].push(tr); }
    });
  }

  const buckets: BearBucketStat[] = BUCKETS.map((bk, b) => ({
    bucketIdx: b,
    ddLowPct: Math.round(bk.lo * 100),
    ddHighPct: bk.hi === null ? null : Math.round(bk.hi * 100),
    horizons: HORIZONS.map((H, h) => computeHorizonStat(byBucket[b][h], H, byBucketTerm[b][h])),
  }));
  const unconditional = HORIZONS.map((H, h) => computeHorizonStat(uncond[h], H, uncondTerm[h]));

  const last = closes.length - 1;
  const currentBucketIdx = bucketOf(ddFrac[last]);
  const useBucket = cfg.conditioningWorks && buckets[currentBucketIdx].horizons[0].n >= MIN_N;
  const shownSource: "bucket" | "unconditional" = useBucket ? "bucket" : "unconditional";
  const shown = useBucket ? buckets[currentBucketIdx].horizons : unconditional;

  const note = useBucket
    ? `Đang ở vùng ${buckets[currentBucketIdx].ddLowPct}–${buckets[currentBucketIdx].ddHighPct ?? "∞"}% dưới đỉnh. Phân phối đáy tệ nhất về sau theo các lần tương tự trong lịch sử.`
    : "Độ sâu drawdown không tiên lượng được mức rơi thêm — đây là phân phối lịch sử chung mọi thời điểm.";

  return {
    generatedAt: new Date().toISOString(),
    dataDate: dates[last] ?? "",
    currentPrice: Math.round(closes[last] * 100) / 100,
    currentDdPct: Math.round(ddFrac[last] * 1000) / 10,
    currentBucketIdx,
    conditioningWorks: cfg.conditioningWorks,
    shownSource,
    shown,
    buckets,
    unconditional,
    note,
  };
}
