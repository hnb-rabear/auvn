/**
 * BEAR DOWNSIDE — study BIAS & CALIBRATION (bổ sung cho conditioning-study).
 *
 * Phàn nàn thực của người dùng = trung vị UNDERSHOOT trong bull (bias), không
 * phải variance. Study này đo:
 *   1. BIAS  = mean(thực tế − trung vị dự)  → >0 nghĩa là dự THẤP hơn thực (undershoot).
 *   2. COVERAGE của dải [p10,p90] (đúng ~80%) & [p25,p75] (~50%) → dải có hiệu chuẩn?
 * cho: baseline vô-đk · recency hl=252/504 · trailing-5y window.
 * Walk-forward as-of, không look-ahead, lưới thưa STEP, tách train/test.
 *
 * Mục tiêu: (a) định lượng undershoot; (b) xem recency/trailing có sửa bias
 * đáng tin không; (c) xem dải phân phối (giá trị THẬT của card) có calibrated.
 *
 * Chạy: npx tsx scripts/bear-downside-calibration-study.ts
 */
import { readFileSync } from "node:fs";
import { HORIZONS, STEP } from "../src/lib/bear-downside";

const MIN_HIST = 60; // cần ≥ mẫu để phát dải
const SPLIT = "2019-01-01";
const BOOT = 2000;

const tl = JSON.parse(readFileSync("public/data/timeline.json", "utf8"));
const P: { date: string; price: number; returns: Record<string, number | null> }[] = tl.points;
const N = P.length;
const price = P.map((p) => p.price);
const date = P.map((p) => p.date);

function worstDip(i: number, H: number): number | null {
  if (i + H >= N) return null;
  let mn = Infinity;
  for (let j = i + 1; j <= i + H; j++) if (price[j] < mn) mn = price[j];
  return (mn / price[i] - 1) * 100;
}
const termRet = (i: number, H: number): number | null => { const r = P[i].returns[String(H)]; return r == null ? null : r; };

/** phân vị q có trọng số (w giảm theo tuổi). null half-life = đều. */
function wq(vals: number[], ages: number[], q: number, hl: number | null): number {
  if (!vals.length) return 0;
  const idx = vals.map((_, k) => k).sort((a, b) => vals[a] - vals[b]);
  const w = hl == null ? vals.map(() => 1) : ages.map((a) => Math.pow(0.5, a / hl));
  const tot = w.reduce((s, x) => s + x, 0);
  let cum = 0;
  for (const k of idx) { cum += w[k]; if (cum >= q * tot) return vals[k]; }
  return vals[idx[idx.length - 1]];
}

type Method = { name: string; hl: number | null; trailingYears: number | null };
const METHODS: Method[] = [
  { name: "baseline", hl: null, trailingYears: null },
  { name: "recency-252", hl: 252, trailingYears: null },
  { name: "recency-504", hl: 504, trailingYears: null },
  { name: "trailing-5y", hl: null, trailingYears: 5 },
];

const grid: number[] = [];
for (let i = 0; i < N; i += STEP) grid.push(i);

const boot = (arr: number[], blk: number, seed: number): [number, number] => {
  if (!arr.length) return [NaN, NaN];
  let s = seed >>> 0;
  const rng = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const nB = Math.ceil(arr.length / blk); const ms: number[] = [];
  for (let it = 0; it < BOOT; it++) { let sum = 0, c = 0; for (let b = 0; b < nB; b++) { const st = Math.floor(rng() * arr.length); for (let k = 0; k < blk && c < arr.length; k++) { sum += arr[(st + k) % arr.length]; c++; } } ms.push(sum / c); }
  ms.sort((a, b) => a - b); return [ms[Math.floor(0.025 * BOOT)], ms[Math.floor(0.975 * BOOT)]];
};

console.log("=".repeat(96));
console.log("BEAR DOWNSIDE — BIAS & CALIBRATION (bias>0 = trung vị dự THẤP hơn thực = undershoot)");
console.log(`timeline ${N} phiên ${date[0]}..${date[N - 1]} · STEP=${STEP} · split ${SPLIT}`);
console.log("=".repeat(96));

for (const H of HORIZONS) {
  const blk = Math.max(1, Math.round(H / STEP));
  for (const side of [{ n: "term", f: termRet }, { n: "dip", f: worstDip }] as const) {
    console.log(`\n### H=${H} · ${side.n.toUpperCase()} ###`);
    for (const m of METHODS) {
      // walk-forward per era
      for (const [eraName, inEra] of [["train", (d: string) => d < SPLIT], ["test", (d: string) => d >= SPLIT]] as const) {
        const hist: number[] = []; const histIdx: number[] = []; let ptr = 0;
        const biasArr: number[] = []; let in8 = 0, in5 = 0, cnt = 0;
        for (const X of grid) {
          if (X + H >= N) continue;
          while (ptr < grid.length && grid[ptr] + H <= X) { const j = grid[ptr]; ptr++; const v = side.f(j, H); if (v != null) { hist.push(v); histIdx.push(j); } }
          if (!inEra(date[X])) continue;
          const actual = side.f(X, H); if (actual == null) continue;
          // chọn mẫu (trailing window nếu có)
          let vals = hist, idxs = histIdx;
          if (m.trailingYears != null) { const cut = X - m.trailingYears * 252; const keep: number[] = [], ka: number[] = []; for (let k = 0; k < hist.length; k++) if (histIdx[k] >= cut) { keep.push(hist[k]); ka.push(histIdx[k]); } vals = keep; idxs = ka; }
          if (vals.length < MIN_HIST) continue;
          const ages = idxs.map((j) => X - j);
          const med = wq(vals, ages, 0.5, m.hl);
          const p10 = wq(vals, ages, 0.1, m.hl), p90 = wq(vals, ages, 0.9, m.hl);
          const p25 = wq(vals, ages, 0.25, m.hl), p75 = wq(vals, ages, 0.75, m.hl);
          biasArr.push(actual - med);
          if (actual >= p10 && actual <= p90) in8++;
          if (actual >= p25 && actual <= p75) in5++;
          cnt++;
        }
        if (!cnt) { console.log(`  ${m.name.padEnd(12)} ${eraName}: (n=0)`); continue; }
        const bias = biasArr.reduce((s, x) => s + x, 0) / biasArr.length;
        const mae = biasArr.reduce((s, x) => s + Math.abs(x), 0) / biasArr.length;
        const ci = boot(biasArr, blk, 777 + H);
        const cov8 = (100 * in8 / cnt).toFixed(0), cov5 = (100 * in5 / cnt).toFixed(0);
        const sig = ci[0] > 0 || ci[1] < 0 ? " ✓biasSig" : "";
        console.log(`  ${m.name.padEnd(12)} ${eraName}: bias=${bias.toFixed(2)}% CI=[${ci[0].toFixed(2)},${ci[1].toFixed(2)}]${sig}  MAE=${mae.toFixed(2)}  cov[p10-p90]=${cov8}%(kỳ vọng 80) cov[p25-p75]=${cov5}%(kv 50)  n=${cnt}`);
      }
    }
  }
}
console.log("\n" + "=".repeat(96));
