/** Hàm dùng chung cho các study tuyển chọn cấu hình trên timeline. */
import type { TimelinePoint } from "../src/lib/types";

export type H = "21" | "63" | "126";
export const SPLIT_DATE = "2019-01-01";
export const MIN_SIGNALS = 25;

export function composite(p: TimelinePoint, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores)) {
    const wk = w[k] ?? 0;
    s += (score as number) * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

export interface BucketStats {
  n: number;
  fav: number;
  med: number;
}

export function stats(rets: number[]): BucketStats {
  if (rets.length === 0) return { n: 0, fav: 0, med: 0 };
  const fav = rets.filter((r) => r > 0).length / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  return { n: rets.length, fav, med: sorted[Math.floor(sorted.length / 2)] };
}

export function evalBuy(
  data: TimelinePoint[],
  h: H,
  w: Record<string, number>,
  thr: number
): BucketStats {
  return stats(
    data.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number)
  );
}

export interface Candidate {
  w: Record<string, number>;
  thr: number;
  tr: BucketStats;
  te: BucketStats;
  minExcess: number;
}

/**
 * Grid search trọng số (bước 10%) × ngưỡng mua. Nhận cấu hình có ≥MIN_SIGNALS
 * tín hiệu và thắng baseline ở CẢ HAI giai đoạn; xếp theo lợi thế tệ nhất.
 */
export function gridSearch(points: TimelinePoint[], h: H): {
  baseTrain: number;
  baseTest: number;
  trainN: number;
  testN: number;
  candidates: Candidate[];
} {
  const pts = points.filter((p) => p.returns[h] !== null);
  const train = pts.filter((p) => p.date < SPLIT_DATE);
  const test = pts.filter((p) => p.date >= SPLIT_DATE);
  const baseTrain = stats(train.map((p) => p.returns[h] as number)).fav;
  const baseTest = stats(test.map((p) => p.returns[h] as number)).fav;

  const candidates: Candidate[] = [];
  for (let wt = 0; wt <= 10; wt++) {
    for (let ws = 0; ws <= 10 - wt; ws++) {
      const wm = 10 - wt - ws;
      const w = { technical: wt / 10, stats: ws / 10, macro: wm / 10 };
      for (const thr of [30, 40, 50, 60]) {
        const tr = evalBuy(train, h, w, thr);
        const te = evalBuy(test, h, w, thr);
        if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
        const exTr = tr.fav - baseTrain;
        const exTe = te.fav - baseTest;
        if (exTr <= 0 || exTe <= 0) continue;
        candidates.push({ w, thr, tr, te, minExcess: Math.min(exTr, exTe) });
      }
    }
  }
  candidates.sort((a, b) => b.minExcess - a.minExcess);
  return { baseTrain, baseTest, trainN: train.length, testN: test.length, candidates };
}

/** RNG có seed (mulberry32) để bootstrap tái lập được. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Block bootstrap CI 95% cho tỉ lệ thuận chiều. Tín hiệu bắn chùm (cách STEP
 * phiên, kỳ hạn chồng lấn) nên resample theo KHỐI liên tiếp thay vì từng điểm —
 * không tôn trọng autocorrelation thì CI hẹp ảo.
 */
export function blockBootstrapCi(
  returns: number[],
  blockSize: number,
  iterations = 2000,
  seed = 20260611
): [number, number] | null {
  const n = returns.length;
  if (n < 10) return null;
  const b = Math.max(1, Math.min(blockSize, n));
  const nBlocks = Math.ceil(n / b);
  const rand = seededRandom(seed);
  const favs: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let fav = 0;
    let total = 0;
    for (let k = 0; k < nBlocks; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < b && total < n; j++) {
        if (returns[(start + j) % n] > 0) fav++;
        total++;
      }
    }
    favs.push(fav / total);
  }
  favs.sort((a, c) => a - c);
  const lo = favs[Math.floor(0.025 * (iterations - 1))];
  const hi = favs[Math.floor(0.975 * (iterations - 1))];
  return [Math.round(lo * 1000) / 10, Math.round(hi * 1000) / 10];
}

export function fmtCand(c: Candidate): string {
  return (
    `w=KT:${c.w.technical} TK:${c.w.stats} VM:${c.w.macro} thr=${c.thr} | ` +
    `train ${(c.tr.fav * 100).toFixed(1)}% (n=${c.tr.n}) | ` +
    `test ${(c.te.fav * 100).toFixed(1)}% (n=${c.te.n}, med=${c.te.med.toFixed(1)}%) | ` +
    `min-excess +${(c.minExcess * 100).toFixed(1)}pt`
  );
}
