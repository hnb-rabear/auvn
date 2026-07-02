/**
 * BEAR DOWNSIDE — study "làm trung vị Triển vọng bám thực tế hơn".
 *
 * Câu hỏi: điều kiện hóa / tái trọng số phân phối Triển vọng có giảm SAI SỐ
 * TRUNG VỊ (MAE) bền vững out-of-sample so với vô-điều-kiện không?
 *
 * Nguồn: đọc public/data/timeline.json (composite/zone/price/returns đã
 * walk-forward past-only do backtest sinh) → production-faithful, không tự chế
 * lại composite. Đáy-tệ-nhất tính từ chuỗi price.
 *
 * Estimator = estimator SẼ SHIP: walk-forward as-of, MIN_N fallback về
 * vô-điều-kiện, lưới thưa STEP chống pseudo-replication. Không look-ahead:
 * tại ngày X chỉ dùng mẫu j+H ≤ X; chấm trên ngày có outcome thật X+H ≤ N-1.
 *
 * Ứng viên: baseline · zone · composite-bins · MA200 · momentum126 ·
 * zone×MA200 · recency-weighted(halflife). Placebo = xáo nhãn (sàn nhiễu).
 *
 * Chạy: npx tsx scripts/bear-downside-conditioning-study.ts
 */
import { readFileSync } from "node:fs";
import { HORIZONS, STEP } from "../src/lib/bear-downside";

const MIN_N = 30;
const SPLIT = "2019-01-01";
const PLACEBO_ITERS = 200;
const BOOT_ITERS = 2000;

type Pt = { date: string; price: number; composite: number; zone: string; returns: Record<string, number | null> };
const tl = JSON.parse(readFileSync("public/data/timeline.json", "utf8"));
const P: Pt[] = tl.points;
const N = P.length;
const price = P.map((p) => p.price);
const date = P.map((p) => p.date);
const comp = P.map((p) => p.composite);
const zone = P.map((p) => p.zone);

// ---- seeded PRNG (mulberry32) để placebo tái lập ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- outcomes ----
/** đáy tệ nhất %: min(price[i+1..i+H])/price[i]-1. null nếu chưa đáo hạn. */
function worstDip(i: number, H: number): number | null {
  if (i + H >= N) return null;
  let mn = Infinity;
  for (let j = i + 1; j <= i + H; j++) if (price[j] < mn) mn = price[j];
  return (mn / price[i] - 1) * 100;
}
function termRet(i: number, H: number): number | null {
  const r = P[i].returns[String(H)];
  return r == null ? null : r;
}

// ---- past-only trend features ----
function ma(i: number, w: number): number | null {
  if (i + 1 < w) return null;
  let s = 0; for (let k = i - w + 1; k <= i; k++) s += price[k];
  return s / w;
}
function momSign(i: number, w: number): number | null {
  if (i - w < 0) return null;
  return price[i] / price[i - w] - 1 >= 0 ? 1 : 0;
}

// ---- bucket functions (past-only): trả về id chuỗi cho ngày i ----
type Bucketer = { name: string; of: (i: number) => string | null };
const compBins = [-30, -15, 0, 15]; // 5 bin cố định a-priori (không leak)
function compBin(i: number): string {
  const c = comp[i]; let b = 0; for (const e of compBins) if (c >= e) b++;
  return "c" + b;
}
const BUCKETERS: Bucketer[] = [
  { name: "zone", of: (i) => zone[i] },
  { name: "composite-bins", of: (i) => compBin(i) },
  { name: "MA200", of: (i) => { const m = ma(i, 200); return m == null ? null : price[i] >= m ? "up" : "dn"; } },
  { name: "momentum126", of: (i) => { const s = momSign(i, 126); return s == null ? null : s ? "up" : "dn"; } },
  { name: "zone×MA200", of: (i) => { const m = ma(i, 200); return m == null ? null : zone[i] + "|" + (price[i] >= m ? "u" : "d"); } },
];

// ---- lưới thưa ----
const grid: number[] = [];
for (let i = 0; i < N; i += STEP) grid.push(i);

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** trung vị có trọng số: w giảm dần theo tuổi (half-life tính bằng phiên). */
function wMedian(vals: number[], ages: number[], halflife: number): number {
  if (!vals.length) return 0;
  const idx = vals.map((_, k) => k).sort((a, b) => vals[a] - vals[b]);
  const w = ages.map((ag) => Math.pow(0.5, ag / halflife));
  const tot = w.reduce((s, x) => s + x, 0);
  let cum = 0;
  for (const k of idx) { cum += w[k]; if (cum >= tot / 2) return vals[k]; }
  return vals[idx[idx.length - 1]];
}

type Actual = (i: number, H: number) => number | null;
const SIDES: { name: string; actual: Actual }[] = [
  { name: "term", actual: termRet },
  { name: "dip", actual: worstDip },
];

/**
 * Walk-forward: với hàm bucket b (hoặc null=vô-điều-kiện), trả mảng |err| trên
 * các ngày eval của một era. bucketOverride cho placebo (nhãn đã xáo).
 */
function walkForwardErrors(
  H: number, side: Actual, bucketOf: ((i: number) => string | null) | null,
  era: (d: string) => boolean, recencyHalflife: number | null,
  labelOverride?: Map<number, string | null>
): number[] {
  // gom mẫu đã đáo hạn theo bucket, thêm dần khi X tăng
  const byBucket = new Map<string, number[]>();
  const byBucketAge = new Map<string, number[]>(); // index j để tính tuổi
  const uncond: number[] = [];
  const uncondIdx: number[] = [];
  let ptr = 0; // con trỏ mẫu đã đáo hạn trong grid
  const errs: number[] = [];
  for (const X of grid) {
    if (X + H >= N) continue; // cần outcome thật để chấm
    // thêm mẫu j (grid) mới đáo hạn: j+H <= X
    while (ptr < grid.length && grid[ptr] + H <= X) {
      const j = grid[ptr]; ptr++;
      const v = side(j, H); if (v == null) continue;
      uncond.push(v); uncondIdx.push(j);
      const b = labelOverride ? labelOverride.get(j) ?? null : bucketOf ? bucketOf(j) : null;
      if (b != null) {
        (byBucket.get(b) ?? byBucket.set(b, []).get(b)!).push(v);
        (byBucketAge.get(b) ?? byBucketAge.set(b, []).get(b)!).push(j);
      }
    }
    if (!era(date[X])) continue;
    const actual = side(X, H); if (actual == null) continue;
    // dự trung vị
    let pred: number;
    const b = labelOverride ? labelOverride.get(X) ?? null : bucketOf ? bucketOf(X) : null;
    const pool = b != null ? byBucket.get(b) : undefined;
    if (bucketOf == null && !labelOverride) {
      // vô-điều-kiện (có thể recency-weighted)
      if (recencyHalflife != null) pred = wMedian(uncond, uncondIdx.map((j) => X - j), recencyHalflife);
      else pred = median(uncond);
    } else if (pool && pool.length >= MIN_N) {
      if (recencyHalflife != null) pred = wMedian(pool, byBucketAge.get(b!)!.map((j) => X - j), recencyHalflife);
      else pred = median(pool);
    } else {
      // fallback vô-điều-kiện
      pred = recencyHalflife != null ? wMedian(uncond, uncondIdx.map((j) => X - j), recencyHalflife) : median(uncond);
    }
    errs.push(Math.abs(actual - pred));
  }
  return errs;
}

/** MAE = trung bình mảng lỗi. */
const mae = (e: number[]) => (e.length ? e.reduce((s, x) => s + x, 0) / e.length : NaN);

/** block-bootstrap CI 95% cho trung bình chuỗi Δ (paired). blk ~ H/STEP. */
function bootCiMean(delta: number[], blk: number, rng: () => number): [number, number] {
  if (!delta.length) return [NaN, NaN];
  const nBlocks = Math.ceil(delta.length / blk);
  const means: number[] = [];
  for (let it = 0; it < BOOT_ITERS; it++) {
    let s = 0, c = 0;
    for (let bIdx = 0; bIdx < nBlocks; bIdx++) {
      const start = Math.floor(rng() * delta.length);
      for (let k = 0; k < blk && c < delta.length; k++) { s += delta[(start + k) % delta.length]; c++; }
    }
    means.push(s / c);
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * BOOT_ITERS)], means[Math.floor(0.975 * BOOT_ITERS)]];
}

const eraTrain = (d: string) => d < SPLIT;
const eraTest = (d: string) => d >= SPLIT;

console.log("=".repeat(90));
console.log("BEAR DOWNSIDE CONDITIONING STUDY — MAE trung vị walk-forward (thấp = bám thực tế hơn)");
console.log(`timeline: ${N} phiên ${date[0]}..${date[N - 1]} · STEP=${STEP} · MIN_N=${MIN_N} · split ${SPLIT}`);
console.log("=".repeat(90));

for (const H of HORIZONS) {
  const blk = Math.max(1, Math.round(H / STEP));
  for (const { name: sideName, actual } of SIDES) {
    console.log(`\n### Horizon ${H} phiên · mặt ${sideName.toUpperCase()} ###`);
    // baseline
    const baseTr = walkForwardErrors(H, actual, null, eraTrain, null);
    const baseTe = walkForwardErrors(H, actual, null, eraTest, null);
    console.log(`  baseline (vô-đk)         MAE train=${mae(baseTr).toFixed(3)}  test=${mae(baseTe).toFixed(3)}  (n_te=${baseTe.length})`);

    // recency-weighted unconditional (một số half-life, tính bằng phiên: 1y≈252, 2y≈504, 3y≈756)
    for (const hl of [252, 504, 756]) {
      const te = walkForwardErrors(H, actual, null, eraTest, hl);
      const tr = walkForwardErrors(H, actual, null, eraTrain, hl);
      const d = te.map((e, k) => e - baseTe[k]);
      const ci = bootCiMean(d, blk, mulberry32(1000 + hl));
      const dt = mae(te) - mae(baseTe);
      console.log(`  recency hl=${hl}p            MAE train=${mae(tr).toFixed(3)}  test=${mae(te).toFixed(3)}  Δtest=${dt.toFixed(3)}  CIΔ=[${ci[0].toFixed(3)},${ci[1].toFixed(3)}]${ci[1] < 0 ? " ✓sig" : ""}`);
    }

    // các bucketer
    for (const bk of BUCKETERS) {
      const te = walkForwardErrors(H, actual, bk.of, eraTest, null);
      const tr = walkForwardErrors(H, actual, bk.of, eraTrain, null);
      const d = te.map((e, k) => e - baseTe[k]);
      const ci = bootCiMean(d, blk, mulberry32(2000));
      const dt = mae(te) - mae(baseTe);
      // placebo: xáo nhãn của bk trên toàn grid (giữ multiset), đo Δ p95
      let placeboBeat = "";
      if (dt < 0) {
        const labels = grid.map((i) => bk.of(i));
        const improves: number[] = [];
        for (let it = 0; it < PLACEBO_ITERS; it++) {
          const rng = mulberry32(3000 + it);
          const perm = [...labels];
          for (let k = perm.length - 1; k > 0; k--) { const r = Math.floor(rng() * (k + 1)); [perm[k], perm[r]] = [perm[r], perm[k]]; }
          const ov = new Map<number, string | null>(); grid.forEach((i, k) => ov.set(i, perm[k]));
          const pe = walkForwardErrors(H, actual, bk.of, eraTest, null, ov);
          improves.push(mae(pe) - mae(baseTe));
        }
        improves.sort((a, b) => a - b);
        const p05 = improves[Math.floor(0.05 * PLACEBO_ITERS)]; // cải thiện tốt nhất ~5% của placebo
        placeboBeat = dt < p05 ? `  ✓beat-placebo(p05=${p05.toFixed(3)})` : `  ✗within-placebo(p05=${p05.toFixed(3)})`;
      }
      const sig = ci[1] < 0 ? " ✓sig" : "";
      console.log(`  ${bk.name.padEnd(22)} MAE train=${mae(tr).toFixed(3)}  test=${mae(te).toFixed(3)}  Δtest=${dt.toFixed(3)}  CIΔ=[${ci[0].toFixed(3)},${ci[1].toFixed(3)}]${sig}${placeboBeat}`);
    }
  }
}

console.log("\n" + "=".repeat(90));
console.log("QUY TẮC SHIP: một ứng viên chỉ ship nếu Δtest<0 & CIΔ loại 0 (✓sig) & vượt placebo (✓beat)");
console.log("& train cùng dấu. Không ứng viên nào đạt → giữ vô-điều-kiện, ghi REJECTED.");
console.log("=".repeat(90));
