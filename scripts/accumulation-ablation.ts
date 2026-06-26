/**
 * Ablation: đóng góp BIÊN của cổng composite trong phanh DCA "vùng tích lũy".
 *
 * So 3 biến thể trên CÙNG dữ liệu (timeline.json), cùng cổng 2 giai đoạn + CI block-bootstrap:
 *   FULL  : B đã ship — win=504, đắt>0.75→x0.25, comp<-30→x0.5   (giá + composite)
 *   PRICE : đúng B nhưng TẮT cổng composite (cThr=null)          (chỉ giá)
 *   COMP  : đúng B nhưng TẮT cổng giá (chỉ composite<-30→x0.5)   (chỉ composite)
 *
 * Đọc: nếu FULL ≈ PRICE và CI chồng nhau → cổng composite không thêm gì → bỏ được.
 *
 * Chạy: npx tsx scripts/accumulation-ablation.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "../src/lib/types";
import { seededRandom } from "../src/lib/indicators";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const P = tl.points;
const price = P.map((p) => p.price);
const dates = P.map((p) => p.date);
const comp = P.map((p) => p.composite);
const SPLIT = "2019-01-01";
const STEP = 21;

function pricePct(i: number, win: number): number | null {
  if (i < win) return null;
  const cur = price[i];
  let below = 0;
  for (let j = i - win; j < i; j++) if (price[j] <= cur) below++;
  return below / win;
}

interface Cfg {
  win: number;
  expHi: number | null; // null = tắt cổng giá
  mExp: number;
  cThr: number | null; // null = tắt cổng composite
  mComp: number;
}

function mult(i: number, c: Cfg): number {
  let m = 1;
  if (c.expHi !== null) {
    const pp = pricePct(i, c.win);
    if (pp !== null && pp > c.expHi) m *= c.mExp;
  }
  if (c.cThr !== null && comp[i] < c.cThr) m *= c.mComp;
  return Math.max(0.2, m);
}

function costImpr(idxs: number[], c: Cfg): number {
  let fL = 0, tV = 0, tL = 0, fV = 0;
  for (const i of idxs) {
    const mi = mult(i, c);
    fV += 1; fL += 1 / price[i];
    tV += mi; tL += mi / price[i];
  }
  const flat = fV / fL, tilt = tV / tL;
  return (flat - tilt) / flat;
}

function brakedCount(idxs: number[], c: Cfg): number {
  return idxs.filter((i) => mult(i, c) < 1).length;
}

function bootCi(idxs: number[], c: Cfg, block = 6, iters = 2000, seed = 20260620): [number, number] | null {
  const n = idxs.length;
  if (n < 10) return null;
  const rand = seededRandom(seed);
  const nBlocks = Math.ceil(n / block);
  const out: number[] = [];
  for (let it = 0; it < iters; it++) {
    const sample: number[] = [];
    for (let k = 0; k < nBlocks; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < block && sample.length < n; j++) sample.push(idxs[(start + j) % n]);
    }
    out.push(costImpr(sample, c));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(iters * 0.025)], out[Math.floor(iters * 0.975)]];
}

const monthly: number[] = [];
for (let i = 0; i < P.length; i += STEP) monthly.push(i);
const trainIdx = monthly.filter((i) => dates[i] < SPLIT);
const testIdx = monthly.filter((i) => dates[i] >= SPLIT);
const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";

const VARIANTS: { name: string; c: Cfg }[] = [
  { name: "FULL  (giá+composite)", c: { win: 504, expHi: 0.75, mExp: 0.25, cThr: -30, mComp: 0.5 } },
  { name: "PRICE (chỉ giá)       ", c: { win: 504, expHi: 0.75, mExp: 0.25, cThr: null, mComp: 0.5 } },
  { name: "COMP  (chỉ composite) ", c: { win: 504, expHi: null, mExp: 0.25, cThr: -30, mComp: 0.5 } },
];

console.log(`Tháng: train n=${trainIdx.length} (${dates[trainIdx[0]]}→) | test n=${testIdx.length} (${dates[testIdx[0]]}→)\n`);
for (const v of VARIANTS) {
  const tr = costImpr(trainIdx, v.c), te = costImpr(testIdx, v.c);
  const trCi = bootCi(trainIdx, v.c), teCi = bootCi(testIdx, v.c);
  console.log(v.name);
  console.log(`  train +${(tr * 100).toFixed(2)}% (${brakedCount(trainIdx, v.c)} phanh) CI95 [${trCi ? pct(trCi[0]) : "?"}, ${trCi ? pct(trCi[1]) : "?"}]`);
  console.log(`  test  +${(te * 100).toFixed(2)}% (${brakedCount(testIdx, v.c)} phanh) CI95 [${teCi ? pct(teCi[0]) : "?"}, ${teCi ? pct(teCi[1]) : "?"}]\n`);
}
console.log("Đọc: FULL − PRICE = đóng góp biên của cổng composite. Nếu ~0 và CI chồng → cổng composite thừa.");
