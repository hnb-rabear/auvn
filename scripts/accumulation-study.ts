/**
 * Tuyển cấu hình PHANH DCA "vùng tích lũy" (chống trả giá đỉnh nhiều năm).
 *
 * Ý tưởng (đã thăm dò, xem docs/superpowers/specs): DCA đều theo tháng, nhưng GHÌM
 * khối lượng (không bao giờ về 0) khi vàng ĐẮT bất thường so với dải N năm của chính
 * nó, HOẶC khi composite bi quan. Mọi "BOOST" (gom mạnh khi rẻ/đáy) đều yếu/kém bền
 * trong thăm dò → chỉ giữ nửa BRAKE. Bottom Hunter & real-yield bị loại bằng bằng chứng.
 *
 * Thước đo: giá vốn trung bình realized của DCA-phanh vs DCA phẳng, CHUẨN HÓA cùng
 *   tổng vốn (capital-weighted = ΣVND / Σlượng). Thấp hơn = nhiều lượng/VND hơn = tốt.
 *   Chỉ dùng dữ liệu TẠI thời điểm mua (percentile trailing past-only + composite
 *   as-of) — không forward-return, nên không pseudo-replication.
 *
 * Cổng 2 giai đoạn (train<2019 / test>=2019): nhận cấu hình cải thiện > 0 ở CẢ HAI,
 *   xếp theo cải thiện tệ nhất (min-excess). CI 95% block-bootstrap trên chuỗi tháng.
 *   Placebo: phanh NGẪU NHIÊN cùng số tháng → kỳ vọng ≈ 0 (chống "phanh gì cũng lợi").
 *
 * Chạy: npm run collect (tạo timeline.json) rồi npx tsx scripts/accumulation-study.ts
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
const STEP = 21; // nhịp DCA tháng
const MIN_BRAKED = 6; // tối thiểu số tháng bị phanh / giai đoạn để cấu hình "có tác dụng"

// percentile giá past-only so dải `win` phiên trước (0=rẻ nhất, 1=đắt nhất). null nếu thiếu warmup.
function pricePct(i: number, win: number): number | null {
  if (i < win) return null;
  const cur = price[i];
  let below = 0;
  for (let j = i - win; j < i; j++) if (price[j] <= cur) below++;
  return below / win;
}

interface Cfg {
  win: number; // cửa sổ percentile
  expHi: number; // phanh khi percentile > expHi (đắt)
  mExp: number; // hệ số khi đắt
  cThr: number | null; // phanh khi composite < cThr (null = tắt)
  mComp: number;
}

// hệ số nhân cho ngày i dưới cấu hình c (brake-only, có sàn 0.2)
function mult(i: number, c: Cfg): number {
  let m = 1;
  const pp = pricePct(i, c.win);
  if (pp !== null && pp > c.expHi) m *= c.mExp;
  if (c.cThr !== null && comp[i] < c.cThr) m *= c.mComp;
  return Math.max(0.2, m);
}

// giá vốn realized (ΣVND/Σlượng) cho danh sách index mua, với hàm hệ số m(i)
function costOf(idxs: number[], m: (i: number) => number): { flat: number; tilt: number; impr: number } {
  let fV = 0,
    fL = 0,
    tV = 0,
    tL = 0;
  for (const i of idxs) {
    const mi = m(i);
    fV += 1;
    fL += 1 / price[i];
    tV += mi;
    tL += mi / price[i];
  }
  const flat = fV / fL,
    tilt = tV / tL;
  return { flat, tilt, impr: (flat - tilt) / flat };
}

const monthly: number[] = [];
for (let i = 0; i < P.length; i += STEP) monthly.push(i);
const trainIdx = monthly.filter((i) => dates[i] < SPLIT);
const testIdx = monthly.filter((i) => dates[i] >= SPLIT);

function brakedCount(idxs: number[], c: Cfg): number {
  return idxs.filter((i) => mult(i, c) < 1).length;
}

// block bootstrap CI cho improvement (ratio-of-sums) — resample khối tháng liên tiếp.
function bootImprCi(
  idxs: number[],
  c: Cfg,
  block = 6,
  iters = 2000,
  seed = 20260620
): [number, number] | null {
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
    out.push(costOf(sample, (i) => mult(i, c)).impr);
  }
  out.sort((a, b) => a - b);
  return [out[Math.floor(iters * 0.025)], out[Math.floor(iters * 0.975)]];
}

// placebo: phanh NGẪU NHIÊN cùng số tháng (mỗi giai đoạn), hệ số trung bình của cfg
function placeboImpr(idxs: number[], c: Cfg, seed: number): number {
  const k = brakedCount(idxs, c);
  if (k === 0) return 0;
  // hệ số phanh đại diện = trung bình hình học các m<1 thực tế
  const ms = idxs.map((i) => mult(i, c)).filter((m) => m < 1);
  const gm = Math.exp(ms.reduce((a, m) => a + Math.log(m), 0) / ms.length);
  const rand = seededRandom(seed);
  // chọn ngẫu nhiên k tháng để gán hệ số gm, còn lại x1
  const order = idxs.map((i, j) => ({ i, r: rand() })).sort((a, b) => a.r - b.r);
  const braked = new Set(order.slice(0, k).map((o) => o.i));
  return costOf(idxs, (i) => (braked.has(i) ? gm : 1)).impr;
}

const pct = (x: number) => (x * 100).toFixed(2) + "%";

// ---- grid search ----
const WINS = [504, 756, 1008];
const EXPHI = [0.6, 0.67, 0.75];
const MEXP = [0.25, 0.5];
const CTHR: (number | null)[] = [null, -20, -30];

interface Cand {
  c: Cfg;
  trImpr: number;
  teImpr: number;
  min: number;
  trBr: number;
  teBr: number;
}
const cands: Cand[] = [];
for (const win of WINS)
  for (const expHi of EXPHI)
    for (const mExp of MEXP)
      for (const cThr of CTHR) {
        const c: Cfg = { win, expHi, mExp, cThr, mComp: 0.5 };
        const trBr = brakedCount(trainIdx, c),
          teBr = brakedCount(testIdx, c);
        if (trBr < MIN_BRAKED || teBr < MIN_BRAKED) continue;
        const tr = costOf(trainIdx, (i) => mult(i, c)).impr;
        const te = costOf(testIdx, (i) => mult(i, c)).impr;
        if (tr <= 0 || te <= 0) continue;
        cands.push({ c, trImpr: tr, teImpr: te, min: Math.min(tr, te), trBr, teBr });
      }
cands.sort((a, b) => b.min - a.min);

console.log(`Lưới: ${WINS.length}×${EXPHI.length}×${MEXP.length}×${CTHR.length} cấu hình`);
console.log(`Tháng: train n=${trainIdx.length} (${dates[trainIdx[0]]}→) | test n=${testIdx.length}`);
console.log(`\nĐạt cổng (cải thiện>0 cả 2 giai đoạn, ≥${MIN_BRAKED} tháng phanh): ${cands.length}\n`);

if (cands.length === 0) {
  console.log("NO-GO: không cấu hình nào vượt cổng 2 giai đoạn.");
  process.exit(0);
}

console.log("TOP 8 theo cải thiện tệ nhất (min-excess):");
const fc = (c: Cfg) =>
  `win=${c.win} đắt>${c.expHi}→x${c.mExp}${c.cThr !== null ? ` comp<${c.cThr}→x${c.mComp}` : ""}`;
for (const cd of cands.slice(0, 8)) {
  console.log(
    `${fc(cd.c).padEnd(40)} | train +${pct(cd.trImpr)} (${cd.trBr} phanh) | test +${pct(
      cd.teImpr
    )} (${cd.teBr} phanh) | min +${pct(cd.min)}`
  );
}

// ---- kiểm cấu hình thắng kỹ ----
const win = cands[0];
console.log(`\n================= CẤU HÌNH THẮNG =================`);
console.log(fc(win.c));
const trCi = bootImprCi(trainIdx, win.c);
const teCi = bootImprCi(testIdx, win.c);
console.log(
  `train: +${pct(win.trImpr)} | CI95 [${trCi ? pct(trCi[0]) : "?"}, ${trCi ? pct(trCi[1]) : "?"}]`
);
console.log(
  `test : +${pct(win.teImpr)} | CI95 [${teCi ? pct(teCi[0]) : "?"}, ${teCi ? pct(teCi[1]) : "?"}]`
);

console.log(`\n-- Placebo (phanh ngẫu nhiên cùng số tháng, 5 seed) --`);
for (const seed of [1, 2, 3, 4, 5]) {
  const ptr = placeboImpr(trainIdx, win.c, seed * 101);
  const pte = placeboImpr(testIdx, win.c, seed * 211);
  console.log(`seed ${seed}: train ${pct(ptr).padStart(8)} | test ${pct(pte).padStart(8)}`);
}
console.log(
  `\nKết luận: nếu placebo ≈ 0 và CI test không chứa 0 → tín hiệu thật, không phải "phanh gì cũng lợi".`
);

// ---- CẤU HÌNH KHÓA (SHIP) — MỘT cổng: chỉ ghìm khi giá đắt so dải 2 năm.
//      Cổng composite cũ bị loại bằng ablation (đóng góp biên ≈0 train, CI chồng;
//      composite-only CI train chứa 0) — xem scripts/accumulation-ablation.ts. ----
const LOCKED: Cfg = { win: 504, expHi: 0.75, mExp: 0.25, cThr: null, mComp: 0.5 };
console.log(`\n================= CẤU HÌNH KHÓA (SHIP) =================`);
console.log(fc(LOCKED));
const lTr = costOf(trainIdx, (i) => mult(i, LOCKED)).impr;
const lTe = costOf(testIdx, (i) => mult(i, LOCKED)).impr;
const lTrCi = bootImprCi(trainIdx, LOCKED);
const lTeCi = bootImprCi(testIdx, LOCKED);
console.log(
  `train: +${pct(lTr)} (${brakedCount(trainIdx, LOCKED)} phanh) | CI95 [${lTrCi ? pct(lTrCi[0]) : "?"}, ${lTrCi ? pct(lTrCi[1]) : "?"}]`
);
console.log(
  `test : +${pct(lTe)} (${brakedCount(testIdx, LOCKED)} phanh) | CI95 [${lTeCi ? pct(lTeCi[0]) : "?"}, ${lTeCi ? pct(lTeCi[1]) : "?"}]`
);
console.log(`placebo train ${pct(placeboImpr(trainIdx, LOCKED, 303))} | test ${pct(placeboImpr(testIdx, LOCKED, 707))}`);
