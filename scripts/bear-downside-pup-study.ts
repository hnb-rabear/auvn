/**
 * BEAR DOWNSIDE — study CALIBRATION của "Cơ hội tăng" (pUp).
 *
 * pUp là XÁC SUẤT → "chính xác" nghĩa là HIỆU CHUẨN: khi dự 83% thì thực tế có
 * tăng ~83% số lần không? Thước đo đúng = Brier score (proper scoring rule), KHÔNG
 * phải MAE. Study tìm ước lượng pUp calibrated nhất để người dùng không "ảo giác".
 *
 * Ứng viên: unconditional · recency 252/504/756 · shrink (blend recency×uncond) ·
 * shrink-to-50 (kéo về base-rate để bớt overconfident).
 * Metric: Brier (train/test), mean pred vs mean actual (bias xác suất), bảng
 * reliability (bin dự đoán → tần suất tăng thực). Walk-forward as-of, lưới thưa STEP.
 *
 * Chạy: npx tsx scripts/bear-downside-pup-study.ts
 */
import { readFileSync } from "node:fs";
import { HORIZONS, STEP } from "../src/lib/bear-downside";

const MIN_HIST = 60;
const SPLIT = "2019-01-01";

const tl = JSON.parse(readFileSync("public/data/timeline.json", "utf8"));
const P: { date: string; returns: Record<string, number | null> }[] = tl.points;
const N = P.length;
const date = P.map((p) => p.date);
const term = (i: number, H: number): number | null => { const r = P[i].returns[String(H)]; return r == null ? null : r; };

/** tỉ lệ có trọng số của v>0 (0..1). hl=null ⇒ đều. */
function wUp(vals: number[], ages: number[], hl: number | null): number {
  const w = hl == null ? vals.map(() => 1) : ages.map((a) => Math.pow(0.5, a / hl));
  const tot = w.reduce((s, x) => s + x, 0);
  if (tot === 0) return 0.5;
  let s = 0; for (let k = 0; k < vals.length; k++) if (vals[k] > 0) s += w[k];
  return s / tot;
}

type Method = { name: string; p: (vals: number[], ages: number[]) => number };
const METHODS: Method[] = [
  { name: "unconditional", p: (v, a) => wUp(v, a, null) },
  { name: "recency-252", p: (v, a) => wUp(v, a, 252) },
  { name: "recency-504", p: (v, a) => wUp(v, a, 504) },
  { name: "recency-756", p: (v, a) => wUp(v, a, 756) },
  // shrink recency-504 về unconditional (giảm overconfidence)
  { name: "shrink504→unc.5", p: (v, a) => 0.5 * wUp(v, a, 504) + 0.5 * wUp(v, a, null) },
  { name: "shrink504→unc.3", p: (v, a) => 0.3 * wUp(v, a, 504) + 0.7 * wUp(v, a, null) },
  // shrink recency-504 về 50% (base-rate agnostic)
  { name: "shrink504→50 .7", p: (v, a) => 0.7 * wUp(v, a, 504) + 0.3 * 0.5 },
];

const grid: number[] = [];
for (let i = 0; i < N; i += STEP) grid.push(i);

console.log("=".repeat(96));
console.log("BEAR DOWNSIDE — CALIBRATION pUp (Brier THẤP = hiệu chuẩn tốt hơn; predBias→0 = không thiên lệch)");
console.log(`timeline ${N} phiên ${date[0]}..${date[N - 1]} · STEP=${STEP} · split ${SPLIT}`);
console.log("=".repeat(96));

for (const H of HORIZONS) {
  console.log(`\n### Horizon ${H} phiên ###`);
  // thu thập per method: predictions + outcomes theo era
  type Acc = { brier: number; sumP: number; sumY: number; n: number; bins: { sp: number; sy: number; n: number }[] };
  const mk = (): Acc => ({ brier: 0, sumP: 0, sumY: 0, n: 0, bins: Array.from({ length: 10 }, () => ({ sp: 0, sy: 0, n: 0 })) });
  const acc: Record<string, { train: Acc; test: Acc }> = {};
  METHODS.forEach((m) => (acc[m.name] = { train: mk(), test: mk() }));

  const hist: number[] = []; const histAge: number[] = []; let ptr = 0;
  const histIdx: number[] = [];
  for (const X of grid) {
    if (X + H >= N) continue;
    while (ptr < grid.length && grid[ptr] + H <= X) { const j = grid[ptr]; ptr++; const v = term(j, H); if (v != null) { hist.push(v); histIdx.push(j); } }
    const y = term(X, H); if (y == null || hist.length < MIN_HIST) continue;
    const ages = histIdx.map((j) => X - j);
    const yUp = y > 0 ? 1 : 0;
    const era = date[X] < SPLIT ? "train" : "test";
    for (const m of METHODS) {
      const p = Math.max(0, Math.min(1, m.p(hist, ages)));
      const a = acc[m.name][era];
      a.brier += (p - yUp) ** 2; a.sumP += p; a.sumY += yUp; a.n++;
      const b = Math.min(9, Math.floor(p * 10)); a.bins[b].sp += p; a.bins[b].sy += yUp; a.bins[b].n++;
    }
  }

  const line = (name: string, a: Acc) =>
    `${name.padEnd(16)} Brier=${(a.brier / a.n).toFixed(4)}  predMean=${(100 * a.sumP / a.n).toFixed(1)}%  actualUp=${(100 * a.sumY / a.n).toFixed(1)}%  predBias=${(100 * (a.sumP - a.sumY) / a.n).toFixed(1)}%  n=${a.n}`;
  for (const m of METHODS) {
    console.log("  " + line(m.name + " [train]", acc[m.name].train));
    console.log("  " + line(m.name + " [test] ", acc[m.name].test));
  }
  // reliability cho unconditional vs recency-504 (test)
  for (const mn of ["unconditional", "recency-504"]) {
    const a = acc[mn].test;
    const rel = a.bins.map((b, i) => (b.n >= 8 ? `${i * 10}-${i * 10 + 10}%:${(100 * b.sy / b.n).toFixed(0)}%(n${b.n})` : null)).filter(Boolean).join("  ");
    console.log(`    reliability ${mn} [test]: ${rel}`);
  }
}
console.log("\n" + "=".repeat(96));
console.log("Brier thấp nhất + predBias gần 0 = pUp \"chính xác\" nhất (ít ảo giác). reliability: bin dự X% nên tăng ~X% thực.");
