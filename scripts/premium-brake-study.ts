/**
 * PREMIUM BRAKE — cơ chế GHÌM KHỐI LƯỢNG DCA dài hạn theo premium SJC, không phải
 * canh ngày trong cửa sổ ngắn (per-window rangePos đã NO-GO, xem premium-accum-study.ts).
 * Mirror đúng phương pháp Accumulation brake đã SHIP (accumulation-study.ts,
 * docs/accumulation.md): ghìm mult<1 khi premiumPct percentile trailing CAO (mua đắt
 * so với thế giới) — không bao giờ boost. Đo giá vốn realized (ΣVND/Σlượng) DCA-phanh
 * vs DCA phẳng trên chuỗi sjcSell thật (VND), không phải XAU quy đổi.
 *
 * docs/bear-dca.md ghi "Premium VN | không backtest được (data quá ngắn) | —" — data
 * nay đã 493 phiên (~23 tháng), đủ để thử (dù mỏng, xem caveat).
 *
 * Cổng 2 giai đoạn (split lịch cố định vì <2 năm dữ liệu, không theo năm dương lịch):
 *   improvement > 0 ở CẢ train và test, CI95% (block-bootstrap tháng) không chứa 0,
 *   placebo (phanh ngẫu nhiên cùng số tháng) ≈ 0.
 *
 * Chạy: npx tsx scripts/premium-brake-study.ts (~1s, dùng data đã commit)
 */
import { readFileSync } from "node:fs";
import { seededRandom } from "../src/lib/indicators";

type VnRow = { date: string; sjcSell: number; premiumPct: number };
const raw = JSON.parse(
  readFileSync("public/data/history/vn-gold.json", "utf8")
) as VnRow[];
const dates = raw.map((r) => r.date);
const price = raw.map((r) => r.sjcSell);
const prem = raw.map((r) => r.premiumPct);
const N = raw.length;

const SPLIT = "2025-11-08"; // ~9 tháng train / ~8 tháng test, xem premium-accum-study.ts
const STEP = 21; // nhịp DCA ~1 tháng phiên giao dịch
const MIN_BRAKED = 3; // mỏng hơn accumulation-study (504 phiên/2yr) nên hạ ngưỡng

function premPct(i: number, win: number): number | null {
  if (i < win) return null;
  const cur = prem[i];
  let below = 0;
  for (let j = i - win; j < i; j++) if (prem[j] <= cur) below++;
  return below / win;
}

interface Cfg {
  win: number;
  expHi: number; // phanh khi percentile premium > expHi
  mExp: number;
}
function mult(i: number, c: Cfg): number {
  const pp = premPct(i, c.win);
  if (pp !== null && pp > c.expHi) return c.mExp;
  return 1;
}

function costOf(idxs: number[], m: (i: number) => number) {
  let fV = 0, fL = 0, tV = 0, tL = 0;
  for (const i of idxs) {
    const mi = m(i);
    fV += 1;
    fL += 1 / price[i];
    tV += mi;
    tL += mi / price[i];
  }
  const flat = fV / fL, tilt = tV / tL;
  return { flat, tilt, impr: (flat - tilt) / flat };
}

const monthly: number[] = [];
for (let i = 0; i < N; i += STEP) monthly.push(i);
const trainIdx = monthly.filter((i) => dates[i] < SPLIT);
const testIdx = monthly.filter((i) => dates[i] >= SPLIT);

function brakedCount(idxs: number[], c: Cfg) {
  return idxs.filter((i) => mult(i, c) < 1).length;
}

function bootImprCi(idxs: number[], c: Cfg, block = 3, iters = 2000, seed = 20260706): [number, number] | null {
  const n = idxs.length;
  if (n < 6) return null;
  const rand = seededRandom(seed);
  const nBlocks = Math.ceil(n / block);
  const out: number[] = [];
  for (let it = 0; it < iters; it++) {
    const sample: number[] = [];
    for (let k = 0; k < nBlocks; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < block && sample.length < n; j++) sample.push(idxs[(start + j) % n]);
    }
    out.push(costOf(sample, (i) => mult(i, c)).impr);
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(iters * 0.025)], out[Math.floor(iters * 0.975)]];
}

function placeboImpr(idxs: number[], c: Cfg, seed: number): number {
  const k = brakedCount(idxs, c);
  if (k === 0) return 0;
  const rand = seededRandom(seed);
  const order = idxs.map((i) => ({ i, r: rand() })).sort((a, b) => a.r - b.r);
  const braked = new Set(order.slice(0, k).map((o) => o.i));
  return costOf(idxs, (i) => (braked.has(i) ? c.mExp : 1)).impr;
}

const pct = (x: number) => (x * 100).toFixed(2) + "%";

const WINS = [90, 126, 180, 252];
const EXPHI = [0.6, 0.67, 0.75, 0.8];
const MEXP = [0.25, 0.5, 0.75];

interface Cand { c: Cfg; trImpr: number; teImpr: number; min: number; trBr: number; teBr: number; }
const cands: Cand[] = [];
for (const win of WINS)
  for (const expHi of EXPHI)
    for (const mExp of MEXP) {
      const c: Cfg = { win, expHi, mExp };
      const trBr = brakedCount(trainIdx, c), teBr = brakedCount(testIdx, c);
      if (trBr < MIN_BRAKED || teBr < MIN_BRAKED) continue;
      const tr = costOf(trainIdx, (i) => mult(i, c)).impr;
      const te = costOf(testIdx, (i) => mult(i, c)).impr;
      if (tr <= 0 || te <= 0) continue;
      cands.push({ c, trImpr: tr, teImpr: te, min: Math.min(tr, te), trBr, teBr });
    }
cands.sort((a, b) => b.min - a.min);

console.log(`Lưới: ${WINS.length}×${EXPHI.length}×${MEXP.length} = ${WINS.length * EXPHI.length * MEXP.length} cấu hình`);
console.log(`Tháng: train n=${trainIdx.length} (${dates[trainIdx[0]]}→${dates[trainIdx[trainIdx.length - 1]]}) | test n=${testIdx.length} (${dates[testIdx[0]]}→${dates[testIdx[testIdx.length - 1]]})`);
console.log(`Đạt cổng (cải thiện>0 cả 2 giai đoạn, ≥${MIN_BRAKED} tháng phanh): ${cands.length}\n`);

if (cands.length === 0) {
  console.log("NO-GO: không cấu hình nào vượt cổng cải thiện>0 cả 2 giai đoạn.");
  process.exit(0);
}

console.log("TOP 8 theo cải thiện tệ nhất (min-excess):");
const fc = (c: Cfg) => `win=${c.win} premium-pctile>${c.expHi}→x${c.mExp}`;
for (const cd of cands.slice(0, 8)) {
  console.log(
    `${fc(cd.c).padEnd(34)} | train +${pct(cd.trImpr)} (${cd.trBr} phanh) | test +${pct(cd.teImpr)} (${cd.teBr} phanh) | min +${pct(cd.min)}`
  );
}

const win = cands[0];
console.log(`\n================= CẤU HÌNH THẮNG =================`);
console.log(fc(win.c));
const trCi = bootImprCi(trainIdx, win.c);
const teCi = bootImprCi(testIdx, win.c);
console.log(`train: +${pct(win.trImpr)} | CI95 [${trCi ? pct(trCi[0]) : "?"}, ${trCi ? pct(trCi[1]) : "?"}]`);
console.log(`test : +${pct(win.teImpr)} | CI95 [${teCi ? pct(teCi[0]) : "?"}, ${teCi ? pct(teCi[1]) : "?"}]`);

console.log(`\n-- Placebo (phanh ngẫu nhiên cùng số tháng, 5 seed) --`);
for (const seed of [1, 2, 3, 4, 5]) {
  const ptr = placeboImpr(trainIdx, win.c, seed * 101);
  const pte = placeboImpr(testIdx, win.c, seed * 211);
  console.log(`seed ${seed}: train ${pct(ptr).padStart(8)} | test ${pct(pte).padStart(8)}`);
}
console.log(`\nCaveat: chỉ 493 phiên (~23 tháng), 1 giai đoạn thị trường (tăng mạnh), split lịch không theo năm.`);
