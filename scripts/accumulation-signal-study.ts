/**
 * THĂM DÒ (không commit): hướng MỚI — DCA sizing CHỈ dựa trên Săn đáy (cycleProb/
 * swingProb) + Săn điểm mua (composite), KHÔNG dùng cheapness. Mục tiêu: coherent với
 * 2 lớp đã có (gom nhiều khi chúng thuận) → hết mâu thuẫn.
 *
 * Chấm bằng HAI thước, cổng 2 giai đoạn (train<2019 / test>=2019):
 *  (1) giá vốn TB realized vs phẳng (thước cũ) — boost dễ thua ở đây.
 *  (2) forward return-weighted: tiền rót vào có sinh lời tốt hơn mua đều không?
 *      = Σ(m·fwd)/Σm − mean(fwd). Đây là thước HỢP với tín hiệu điểm-mua/đáy.
 *
 * Tất cả walk-forward/as-of (cycleProb, composite trong timeline đều past-only).
 * Chạy: npx tsx scripts/accumulation-signal-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "../src/lib/types";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const P = tl.points;
const price = P.map((p) => p.price);
const comp = P.map((p) => p.composite);
const cp = P.map((p) => p.cycleProb ?? null);
const sp = P.map((p) => p.swingProb ?? null);
const dates = P.map((p) => p.date);
const SPLIT = "2019-01-01";
const STEP = 21;

const fwd = (i: number, H: number): number | null =>
  i + H < price.length ? price[i + H] / price[i] - 1 : null;

// multiplier boost-only (>=1): gom nhiều khi tín hiệu thuận. KHÔNG dùng cheapness.
type MultFn = (i: number) => number | null; // null = bỏ (thiếu tín hiệu)
const nearBottom = (i: number) => {
  const c = cp[i],
    s = sp[i];
  if (c === null && s === null) return null;
  return Math.max(c ?? -1, s ?? -1);
};
const variants: Record<string, MultFn> = {
  "buyzone comp>=40 ->x2": (i) => (comp[i] >= 40 ? 2 : 1),
  "buyzone comp>=25 ->x1.5": (i) => (comp[i] >= 25 ? 1.5 : 1),
  "đáy>=60 ->x2": (i) => {
    const b = nearBottom(i);
    return b === null ? null : b >= 60 ? 2 : 1;
  },
  "đáy>=50 ->x1.5": (i) => {
    const b = nearBottom(i);
    return b === null ? null : b >= 50 ? 1.5 : 1;
  },
  "đáy hoặc buyzone ->x2": (i) => {
    const b = nearBottom(i);
    if (b === null) return null;
    return b >= 60 || comp[i] >= 40 ? 2 : 1;
  },
  "graded: 1+comp+/50+đáy/100": (i) => {
    const b = nearBottom(i);
    if (b === null) return null;
    return 1 + Math.max(0, comp[i]) / 50 + Math.max(0, b) / 100; // ~1..3.x
  },
};

const monthly: number[] = [];
for (let i = 0; i < P.length; i += STEP) monthly.push(i);
const train = monthly.filter((i) => dates[i] < SPLIT);
const test = monthly.filter((i) => dates[i] >= SPLIT);

// thước 1: giá vốn TB (thấp hơn tốt)
function costImpr(idxs: number[], m: MultFn) {
  let fV = 0,
    fL = 0,
    tV = 0,
    tL = 0,
    n = 0,
    boost = 0;
  for (const i of idxs) {
    const mi = m(i);
    if (mi === null) continue;
    if (mi > 1) boost++;
    fV += 1;
    fL += 1 / price[i];
    tV += mi;
    tL += mi / price[i];
    n++;
  }
  return n < 12 ? null : { impr: (fV / fL - tV / tL) / (fV / fL), n, boost };
}
// thước 2: forward return-weighted (cao hơn tốt)
function retImpr(idxs: number[], m: MultFn, H: number) {
  let sumW = 0,
    sumWR = 0,
    sumR = 0,
    n = 0;
  for (const i of idxs) {
    const mi = m(i);
    const r = fwd(i, H);
    if (mi === null || r === null) continue;
    sumW += mi;
    sumWR += mi * r;
    sumR += r;
    n++;
  }
  return n < 12 ? null : { impr: sumWR / sumW - sumR / n, n };
}
const pc = (x: number | undefined) => (x === undefined ? "?" : (x * 100).toFixed(2) + "%");

console.log("===== THƯỚC 1: giá vốn TB (boost dễ thua) =====");
console.log("Biến thể".padEnd(28) + " | train | test | cổng");
for (const [name, fn] of Object.entries(variants)) {
  const tr = costImpr(train, fn);
  const te = costImpr(test, fn);
  if (!tr || !te) {
    console.log(name.padEnd(28) + " | thiếu mẫu");
    continue;
  }
  const pass = tr.impr > 0 && te.impr > 0 ? "PASS" : "----";
  console.log(
    name.padEnd(28) + ` | ${pc(tr.impr).padStart(7)} | ${pc(te.impr).padStart(7)} | ${pass}`
  );
}

for (const H of [126, 252, 504]) {
  console.log(`\n===== THƯỚC 2: forward return-weighted, H=${H} phiên (${(H / 252).toFixed(1)}y) =====`);
  console.log("Biến thể".padEnd(28) + " | train | test | cổng");
  for (const [name, fn] of Object.entries(variants)) {
    const tr = retImpr(train, fn, H);
    const te = retImpr(test, fn, H);
    if (!tr || !te) {
      console.log(name.padEnd(28) + " | thiếu mẫu");
      continue;
    }
    const pass = tr.impr > 0 && te.impr > 0 ? "PASS" : "----";
    console.log(
      name.padEnd(28) + ` | ${pc(tr.impr).padStart(7)} | ${pc(te.impr).padStart(7)} | ${pass}`
    );
  }
}
