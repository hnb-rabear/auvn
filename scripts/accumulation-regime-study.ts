/**
 * THĂM DÒ (không commit): phanh DCA "linh hoạt theo chu kỳ" có bền hơn bản cứng không?
 * Bản cứng (B) ghìm khi giá > percentile 75 dải 2 năm BẤT KỂ bull/bear.
 * Test 4 cách cho phanh nhận biết chu kỳ — judged bằng CỔNG 2 GIAI ĐOẠN
 * (train<2019 có bear 2013 / test>=2019 bull). Chỉ nhận biến thể thắng CẢ HAI;
 * cảnh giác biến thể chỉ ăn test (overfit bull).
 *
 * Metric: giá vốn TB realized vs DCA phẳng (capital-weighted), lấy mẫu tháng (21 phiên).
 * Chạy: npx tsx scripts/accumulation-regime-study.ts
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
const dates = P.map((p) => p.date);
const SPLIT = "2019-01-01";
const STEP = 21;
const WIN = 504; // 2 năm

function ma(i: number, win: number): number | null {
  if (i < win - 1) return null;
  let s = 0;
  for (let j = i - win + 1; j <= i; j++) s += price[j];
  return s / win;
}
// percentile của arr[i] so trailing WIN (past-only); arr có thể là price hoặc detrended
function pctTrailing(arr: number[], i: number, win = WIN): number | null {
  if (i < win) return null;
  const cur = arr[i];
  if (!Number.isFinite(cur)) return null;
  let below = 0,
    seen = 0;
  for (let j = i - win; j < i; j++) {
    if (!Number.isFinite(arr[j])) continue;
    seen++;
    if (arr[j] <= cur) below++;
  }
  return seen < win * 0.5 ? null : below / seen;
}

// detrended: khoảng cách giá so MA200 (%) — "căng trên xu hướng" thay vì "đỉnh tuyệt đối"
const det = price.map((_, i) => {
  const m = ma(i, 200);
  return m === null ? NaN : (price[i] - m) / m;
});

const rawPct = price.map((_, i) => pctTrailing(price, i));
const detPct = det.map((_, i) => pctTrailing(det, i));
const ma200 = price.map((_, i) => ma(i, 200));
const compBrake = (i: number) => (comp[i] < -30 ? 0.5 : 1);
const FLOOR = 0.2;
const clampF = (m: number) => Math.max(FLOOR, m);

// ----- các biến thể multiplier -----
type MultFn = (i: number) => number;
const variants: Record<string, MultFn> = {
  // B cứng: giá > p75 -> x0.25 ; comp<-30 -> x0.5
  "B-cứng (raw p75)": (i) =>
    clampF((rawPct[i] !== null && (rawPct[i] as number) > 0.75 ? 0.25 : 1) * compBrake(i)),

  // V1: chỉ ghìm theo giá khi DƯỚI MA200 (bear/điều chỉnh); bull thì không ghìm-giá
  "V1 ghìm chỉ khi < MA200": (i) => {
    const below = ma200[i] !== null && price[i] < (ma200[i] as number);
    const pb = below && rawPct[i] !== null && (rawPct[i] as number) > 0.75 ? 0.25 : 1;
    return clampF(pb * compBrake(i));
  },

  // V2: DETREND — ghìm khi giá CĂNG trên xu hướng (detPct>p75), không phải chỉ vì đỉnh tuyệt đối
  "V2 detrend (căng > MA200)": (i) =>
    clampF((detPct[i] !== null && (detPct[i] as number) > 0.75 ? 0.25 : 1) * compBrake(i)),

  // V3: ngưỡng theo chu kỳ — bull (trên MA200) ghìm chỉ ở cực đoan p90; bear ghìm sớm p60
  "V3 ngưỡng theo MA200 (90/60)": (i) => {
    const bull = ma200[i] !== null && price[i] >= (ma200[i] as number);
    const thr = bull ? 0.9 : 0.6;
    return clampF((rawPct[i] !== null && (rawPct[i] as number) > thr ? 0.25 : 1) * compBrake(i));
  },

  // V4: chỉ ghìm theo giá khi KHÔNG vượt giá 1 năm trước (động lượng dài âm)
  "V4 ghìm chỉ khi < giá 1y trước": (i) => {
    const longDown = i >= 252 && price[i] <= price[i - 252];
    const pb = longDown && rawPct[i] !== null && (rawPct[i] as number) > 0.75 ? 0.25 : 1;
    return clampF(pb * compBrake(i));
  },
};

const monthly: number[] = [];
for (let i = 0; i < P.length; i += STEP) monthly.push(i);
const trainIdx = monthly.filter((i) => dates[i] < SPLIT);
const testIdx = monthly.filter((i) => dates[i] >= SPLIT);

function cost(idxs: number[], m: MultFn) {
  let fV = 0,
    fL = 0,
    tV = 0,
    tL = 0,
    brk = 0;
  for (const i of idxs) {
    const mi = m(i);
    if (mi < 1) brk++;
    fV += 1;
    fL += 1 / price[i];
    tV += mi;
    tL += mi / price[i];
  }
  return { impr: (fV / fL - tV / tL) / (fV / fL), braked: brk, n: idxs.length };
}
const pc = (x: number) => (x * 100).toFixed(2) + "%";

console.log(`Mẫu: train n=${trainIdx.length} / test n=${testIdx.length}\n`);
console.log(
  "Biến thể".padEnd(30) +
    " | train impr (ghìm) | test impr (ghìm) | min | cổng"
);
for (const [name, fn] of Object.entries(variants)) {
  const tr = cost(trainIdx, fn);
  const te = cost(testIdx, fn);
  const min = Math.min(tr.impr, te.impr);
  const pass = tr.impr > 0 && te.impr > 0 ? "PASS" : "----";
  console.log(
    name.padEnd(30) +
      ` | ${pc(tr.impr).padStart(7)} (${String(tr.braked).padStart(2)}/${tr.n}) | ${pc(
        te.impr
      ).padStart(7)} (${String(te.braked).padStart(2)}/${te.n}) | ${pc(min).padStart(7)} | ${pass}`
  );
}

// Soi hành vi tại các mốc: 2011 đỉnh (nên ghìm), 2025 cuối bull (gây mâu thuẫn)
console.log(`\nHành vi tại vài mốc (hệ số mỗi biến thể):`);
const probe = ["2011-09-06", "2012-10-04", "2015-07-20", "2020-08-06", "2025-12-31"];
for (const d of probe) {
  const i = dates.indexOf(d) >= 0 ? dates.indexOf(d) : dates.findIndex((x) => x >= d);
  if (i < 0) continue;
  const m = ma200[i];
  const reg = m !== null ? (price[i] >= m ? "bull" : "bear") : "?";
  const line = Object.entries(variants)
    .map(([n, fn]) => `${n.split(" ")[0]}=${fn(i)}`)
    .join("  ");
  console.log(
    `${dates[i]} \$${price[i].toFixed(0)} raw=${rawPct[i] !== null ? Math.round((rawPct[i] as number) * 100) : "?"}% det=${detPct[i] !== null ? Math.round((detPct[i] as number) * 100) : "?"}% [${reg}]  ${line}`
  );
}
