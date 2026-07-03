// src/lib/bear-downside.ts
/** Phân phối rủi ro bear: mức-rơi-thêm có điều kiện theo độ sâu drawdown. Tính tại collection-time. */
import { blockBootstrapCi, blockBootstrapPercentileCi, percentile } from "./indicators";
import { BEAR_DOWNSIDE_CONFIG, type BearHorizonStat, type BearDownsideAnalysis, type BearBucketStat, type BearDownsideConfig, type BearAsOfRow, type BearAsOfBand } from "./types";

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

/** Trọng số recency theo tuổi (phiên): 0.5^(tuổi/halflife). halflife≤0 ⇒ đều (=1). */
function recencyWeights(ages: number[], halflife: number): number[] {
  if (!(halflife > 0)) return ages.map(() => 1);
  return ages.map((a) => Math.pow(0.5, a / halflife));
}
/** Phân vị q có trọng số (bậc thang): value tại điểm cum-weight vượt q·tổng. */
function weightedPercentile(values: number[], weights: number[], q: number): number {
  if (!values.length) return 0;
  const idx = values.map((_, k) => k).sort((a, b) => values[a] - values[b]);
  const tot = weights.reduce((s, w) => s + w, 0);
  if (tot === 0) return values[idx[Math.floor(q * (idx.length - 1))]];
  let cum = 0;
  for (const k of idx) { cum += weights[k]; if (cum >= q * tot) return values[k]; }
  return values[idx[idx.length - 1]];
}
/** Tỉ lệ % có trọng số của các phần tử thỏa pred. */
function weightedFrac(values: number[], weights: number[], pred: (v: number) => boolean): number {
  const tot = weights.reduce((s, w) => s + w, 0);
  if (tot === 0) return 0;
  let s = 0;
  for (let k = 0; k < values.length; k++) if (pred(values[k])) s += weights[k];
  return (s / tot) * 100;
}

/**
 * Thống kê một nhóm cho horizon H. `values` = mức-rơi-thêm (%); `termValues` = lợi suất
 * tại mốc (%) cho mặt KẾT CỤC (endMedian/pUp). blockSize lưới-thưa = round(H/STEP).
 * `skipCi` (mặc định false, không đổi hành vi cũ): bỏ 3 lần block-bootstrap (2000 vòng lặp
 * mỗi lần) khi gọi viên chỉ cần median/p10/endMedian/pUp/n — dùng cho walk-forward as-of
 * (runBearDownsideHistory) nơi CI bị bỏ (BearAsOfBand không lưu CI) nhưng lại được gọi
 * hàng trăm lần trên các mẫu ngày càng lớn, nếu không sẽ rất chậm.
 *
 * `opts.halflife>0` + `opts.ages` (cùng độ dài `values`, tuổi mỗi mẫu tính bằng phiên tới
 * ngày as-of) ⇒ TÁI TRỌNG SỐ recency: phân phối bám chế độ gần đây, sửa thiên lệch
 * trôi-chế-độ. Khi TẮT (mặc định) dùng percentile nội suy như cũ (giữ nguyên unit test +
 * dữ liệu cũ). CI luôn tính trên mảng KHÔNG trọng số (chỉ là trường legacy, card không hiển thị).
 */
export function computeHorizonStat(
  values: number[], H: number, termValues: number[] = [], skipCi = false,
  opts: { ages?: number[]; termAges?: number[]; halflife?: number } = {}
): BearHorizonStat {
  const n = values.length;
  const tn = termValues.length;
  const blk = Math.max(1, Math.round(H / STEP));
  const hl = opts.halflife ?? 0;
  const weighted = hl > 0 && !!opts.ages && opts.ages.length === n;
  const r1 = (x: number) => Math.round(x * 10) / 10;

  let median = 0, p10 = 0, p90 = 0, pBottomBehind = 0, endMedian = 0, endP25 = 0, endP75 = 0, pUp = 0;
  if (weighted) {
    const w = recencyWeights(opts.ages!, hl);
    median = n ? r1(weightedPercentile(values, w, 0.5)) : 0;
    p10 = n ? r1(weightedPercentile(values, w, 0.1)) : 0;
    p90 = n ? r1(weightedPercentile(values, w, 0.9)) : 0;
    pBottomBehind = n ? Math.round(weightedFrac(values, w, (v) => v >= 0) * 10) / 10 : 0;
    const tw = opts.termAges && opts.termAges.length === tn ? recencyWeights(opts.termAges, hl) : termValues.map(() => 1);
    endMedian = tn ? r1(weightedPercentile(termValues, tw, 0.5)) : 0;
    endP25 = tn ? r1(weightedPercentile(termValues, tw, 0.25)) : 0;
    endP75 = tn ? r1(weightedPercentile(termValues, tw, 0.75)) : 0;
    pUp = tn ? Math.round(weightedFrac(termValues, tw, (v) => v > 0) * 10) / 10 : 0;
  } else {
    median = n ? r1(percentile(values, 0.5)) : 0;
    p10 = n ? r1(percentile(values, 0.1)) : 0;
    p90 = n ? r1(percentile(values, 0.9)) : 0;
    pBottomBehind = n ? Math.round((values.filter((v) => v >= 0).length / n) * 1000) / 10 : 0;
    endMedian = tn ? r1(percentile(termValues, 0.5)) : 0;
    endP25 = tn ? r1(percentile(termValues, 0.25)) : 0;
    endP75 = tn ? r1(percentile(termValues, 0.75)) : 0;
    pUp = tn ? Math.round((termValues.filter((v) => v > 0).length / tn) * 1000) / 10 : 0;
  }
  const favArr = values.map((v) => (v >= 0 ? 1 : -1));
  const upArr = termValues.map((v) => (v > 0 ? 1 : -1));
  return {
    horizonDays: H,
    median, p10, p90, pBottomBehind,
    pCi: skipCi ? null : blockBootstrapCi(favArr, blk),
    medianCi: skipCi ? null : blockBootstrapPercentileCi(values, 0.5, blk),
    endMedian, endP25, endP75, pUp,
    pUpCi: skipCi ? null : blockBootstrapCi(upArr, blk),
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
  const hl = cfg.recencyHalflife ?? 0;
  const last = closes.length - 1;

  // gom mức-rơi-thêm (dip) + lợi suất tại mốc (term) theo bucket × horizon + vô-điều-kiện,
  // kèm tuổi mẫu (phiên) tính tới ngày as-of = last, để tái trọng số recency.
  const byBucket: number[][][] = BUCKETS.map(() => HORIZONS.map(() => []));
  const byBucketTerm: number[][][] = BUCKETS.map(() => HORIZONS.map(() => []));
  const byBucketAge: number[][][] = BUCKETS.map(() => HORIZONS.map(() => []));
  const byBucketTermAge: number[][][] = BUCKETS.map(() => HORIZONS.map(() => []));
  const uncond: number[][] = HORIZONS.map(() => []);
  const uncondTerm: number[][] = HORIZONS.map(() => []);
  const uncondAge: number[][] = HORIZONS.map(() => []);
  const uncondTermAge: number[][] = HORIZONS.map(() => []);
  for (let i = 0; i < closes.length; i += STEP) {
    const b = bucketOf(ddFrac[i]);
    const age = last - i;
    HORIZONS.forEach((H, h) => {
      const fd = furtherDrawdownPct(closes, i, H);
      if (fd === null) return;
      byBucket[b][h].push(fd); byBucketAge[b][h].push(age);
      uncond[h].push(fd); uncondAge[h].push(age);
      const tr = terminalReturnPct(closes, i, H);
      if (tr !== null) { byBucketTerm[b][h].push(tr); byBucketTermAge[b][h].push(age); uncondTerm[h].push(tr); uncondTermAge[h].push(age); }
    });
  }

  const buckets: BearBucketStat[] = BUCKETS.map((bk, b) => ({
    bucketIdx: b,
    ddLowPct: Math.round(bk.lo * 100),
    ddHighPct: bk.hi === null ? null : Math.round(bk.hi * 100),
    horizons: HORIZONS.map((H, h) => computeHorizonStat(byBucket[b][h], H, byBucketTerm[b][h], false, { ages: byBucketAge[b][h], termAges: byBucketTermAge[b][h], halflife: hl })),
  }));
  const unconditional = HORIZONS.map((H, h) => computeHorizonStat(uncond[h], H, uncondTerm[h], false, { ages: uncondAge[h], termAges: uncondTermAge[h], halflife: hl }));

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

/**
 * Dải Bear Downside as-of từng ngày (walk-forward). Lưới thưa STEP để chống
 * pseudo-replication; mẫu chỉ tính khi đã đáo hạn as-of ngày đó (j+H ≤ X).
 * Vô-điều-kiện (conditioning đã bị bác). Byte-đồng nhất runBearDownside ở ngày cuối.
 */
export function runBearDownsideHistory(bars: { date: string; close: number }[]): BearAsOfRow[] {
  const closes = bars.map((b) => b.close);
  const dates = bars.map((b) => b.date);
  const n = closes.length;
  if (n === 0) return [];

  // các ngày X phát dải: bội STEP + ép index cuối (như statIdxs của backtest)
  const gridX: number[] = [];
  for (let i = 0; i < n; i += STEP) gridX.push(i);
  if (gridX[gridX.length - 1] !== n - 1) gridX.push(n - 1);

  const hl = BEAR_DOWNSIDE_CONFIG.recencyHalflife ?? 0;
  const toBand = (dips: number[], terms: number[], dipAges: number[], termAges: number[], H: number): BearAsOfBand | null => {
    if (dips.length < MIN_N) return null;
    // skipCi: as-of band không lưu CI, tránh bootstrap thừa. ages+halflife: tái trọng số recency (khớp runBearDownside).
    const s = computeHorizonStat(dips, H, terms, true, { ages: dipAges, termAges, halflife: hl });
    return { median: s.median, p10: s.p10, endMedian: s.endMedian, endP25: s.endP25, endP75: s.endP75, pUp: s.pUp, n: s.n };
  };

  return gridX.map((X) => {
    const bands = {} as Record<"21" | "63" | "126", BearAsOfBand | null>;
    HORIZONS.forEach((H) => {
      const dips: number[] = [];
      const terms: number[] = [];
      const dipAges: number[] = [];
      const termAges: number[] = [];
      for (let j = 0; j <= X; j += STEP) {
        if (j + H > X) continue; // chỉ mẫu đã đáo hạn as-of X
        const fd = furtherDrawdownPct(closes, j, H);
        if (fd === null) continue;
        dips.push(fd); dipAges.push(X - j);
        const tr = terminalReturnPct(closes, j, H);
        if (tr !== null) { terms.push(tr); termAges.push(X - j); }
      }
      bands[String(H) as "21" | "63" | "126"] = toBand(dips, terms, dipAges, termAges, H);
    });
    return { date: dates[X], bands };
  });
}
