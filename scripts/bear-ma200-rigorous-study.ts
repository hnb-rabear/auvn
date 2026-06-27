/**
 * Kiểm chứng nghiêm ranh giới bull/bear = giá<MA(win) vs dd>=15% hiện tại.
 * Khi bear → acute/recovery/grind theo ddChange (như model). Khi bull → 1.0.
 *
 * Chống overfit: train(<2019)/test(>=2019) + CI block-bootstrap + placebo +
 *   độ nhạy cửa sổ MA (150/200/250) + so trực tiếp MA200 − DD15 (có CI).
 * Đo giá vốn (capital-weighted) vs FLAT. Báo cả tài sản cuối + bear giả trong bull.
 *
 * Chạy: npx tsx scripts/bear-ma200-rigorous-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { seededRandom } from "../src/lib/indicators";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const STEP = 21, SPLIT = "2019-01-01";

const prices = pts.map((p) => p.price);
let mx = 0;
const dd: number[] = [];
for (const p of prices) { if (p > mx) mx = p; dd.push((mx - p) / mx); }

function maAt(i: number, win: number): number | null {
  if (i < win) return null;
  let s = 0;
  for (let j = i - win; j < i; j++) s += prices[j];
  return s / win;
}
const depth = (d: number) => d >= 0.40 ? 1.5 : d >= 0.25 ? 1.0 : d >= 0.15 ? 0.75 : 0.5;
const boost = (pp: number) => pp < 0.25 ? 1.5 : pp < 0.50 ? 1.0 : pp < 0.75 ? 0.75 : 0.5;

type BearFn = (i: number) => boolean;
const bearDD: BearFn = (i) => dd[i] >= 0.15;
const bearMA = (win: number): BearFn => (i) => { const m = maAt(i, win); return m !== null && prices[i] < m; };

function qty(i: number, isBear: BearFn): number {
  if (!isBear(i)) return 1.0;
  const ch = dd[i] - dd[Math.max(0, i - STEP)];
  if (ch > 0.03) return depth(dd[i]);
  if (ch < -0.03) return 1.5;
  const pp = pts[i].pricePct2y;
  return pp != null ? boost(pp) : 0.75;
}

interface Win { i: number; date: string; price: number; }
const monthly: Win[] = [];
for (let i = 0; i < pts.length; i += STEP) monthly.push({ i, date: pts[i].date, price: pts[i].price });
const train = monthly.filter((w) => w.date < SPLIT);
const test = monthly.filter((w) => w.date >= SPLIT);

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";

// giá vốn improvement vs FLAT trên một tập index
function impr(seg: Win[], f: BearFn): number {
  let fv = 0, fl = 0, sv = 0, sl = 0;
  for (const w of seg) {
    const q = qty(w.i, f);
    fv += 1; fl += 1 / w.price;
    sv += q; sl += q / w.price;
  }
  const flat = fv / fl, strat = sv / sl;
  return (flat - strat) / flat;
}
function wealthVsFlat(seg: Win[], f: BearFn): number {
  let g = 0, c = 0, fg = 0;
  for (const w of seg) { const q = qty(w.i, f); g += q / w.price; c += 1 - q; fg += 1 / w.price; }
  const last = seg[seg.length - 1].price;
  return ((g * last + c) - fg * last) / (fg * last);
}

// block-bootstrap CI cho improvement
function bootCi(seg: Win[], f: BearFn, block = 6, iters = 2000, seed = 20260627): [number, number] {
  const n = seg.length, rand = seededRandom(seed), out: number[] = [];
  const nBlocks = Math.ceil(n / block);
  for (let it = 0; it < iters; it++) {
    const sample: Win[] = [];
    for (let k = 0; k < nBlocks; k++) {
      const s = Math.floor(rand() * n);
      for (let j = 0; j < block && sample.length < n; j++) sample.push(seg[(s + j) % n]);
    }
    out.push(impr(sample, f));
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(iters * 0.025)], out[Math.floor(iters * 0.975)]];
}

// placebo: gán bear ngẫu nhiên cùng tần suất
function placebo(seg: Win[], f: BearFn, seed: number): number {
  const k = seg.filter((w) => f(w.i)).length;
  const rand = seededRandom(seed);
  const order = seg.map((w, j) => ({ j, r: rand() })).sort((a, b) => a.r - b.r);
  const bear = new Set(order.slice(0, k).map((o) => o.j));
  const fakeBear: BearFn = (i) => bear.has(seg.findIndex((w) => w.i === i));
  return impr(seg, fakeBear);
}

function report(name: string, f: BearFn) {
  const trCi = bootCi(train, f), teCi = bootCi(test, f);
  console.log(`\n${name}`);
  console.log(`  train: giá vốn ${pct(impr(train, f))} CI[${pct(trCi[0])},${pct(trCi[1])}] | tài sản ${pct(wealthVsFlat(train, f))} | ${train.filter(w=>f(w.i)).length} bear`);
  console.log(`  test : giá vốn ${pct(impr(test, f))} CI[${pct(teCi[0])},${pct(teCi[1])}] | tài sản ${pct(wealthVsFlat(test, f))} | ${test.filter(w=>f(w.i)).length} bear`);
}

console.log("Improvement giá vốn vs FLAT, CI95 block-bootstrap. Train n=" + train.length + " test n=" + test.length);
report("DD15 (hiện tại)", bearDD);
report("MA150", bearMA(150));
report("MA200", bearMA(200));
report("MA250", bearMA(250));

console.log("\n-- Placebo (bear ngẫu nhiên cùng tần suất, 5 seed) — kỳ vọng ≈0 --");
for (const s of [1, 2, 3, 4, 5]) {
  console.log(`  seed ${s}: DD15 train ${pct(placebo(train, bearDD, s*11))} | MA200 train ${pct(placebo(train, bearMA(200), s*17))}`);
}

// So trực tiếp MA200 − DD15: chênh improvement có CI không chứa 0?
console.log("\n-- MA200 − DD15 (chênh improvement, CI block-bootstrap) --");
function diffCi(seg: Win[], block = 6, iters = 2000, seed = 42): { d: number; ci: [number, number] } {
  const n = seg.length, rand = seededRandom(seed), out: number[] = [];
  const nBlocks = Math.ceil(n / block);
  for (let it = 0; it < iters; it++) {
    const sample: Win[] = [];
    for (let k = 0; k < nBlocks; k++) {
      const s = Math.floor(rand() * n);
      for (let j = 0; j < block && sample.length < n; j++) sample.push(seg[(s + j) % n]);
    }
    out.push(impr(sample, bearMA(200)) - impr(sample, bearDD));
  }
  out.sort((a, b) => a - b);
  return { d: impr(seg, bearMA(200)) - impr(seg, bearDD), ci: [out[Math.floor(iters*0.025)], out[Math.floor(iters*0.975)]] };
}
const dTr = diffCi(train), dTe = diffCi(test);
console.log(`  train: ${pct(dTr.d)} CI[${pct(dTr.ci[0])},${pct(dTr.ci[1])}]  ${dTr.ci[0] > 0 ? "MA200 hơn rõ" : "CI chứa 0 → không chắc hơn"}`);
console.log(`  test : ${pct(dTe.d)} CI[${pct(dTe.ci[0])},${pct(dTe.ci[1])}]  ${dTe.ci[0] > 0 ? "MA200 hơn rõ" : "CI chứa 0 → không chắc hơn"}`);
