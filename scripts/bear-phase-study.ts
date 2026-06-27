/**
 * Phân tích 2 giai đoạn bear: sụp đổ cấp tính vs giai đoạn sau.
 * Backtest COMBO-A (BOOST qty + BH timing sớm) theo từng giai đoạn.
 *
 * 3 định nghĩa "cấp tính":
 *   A. Tốc độ rơi trong window: giá cuối window < giá đầu window - X% (X=3%)
 *   B. N tháng đầu tiên kể từ khi bắt đầu bear (N=12)
 *   C. Gia tốc drawdown: drawdown tăng > D%/tháng so tháng trước (D=3%)
 *
 * Chạy: npx tsx scripts/bear-phase-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const BEAR_START = "2013-04-12", BEAR_END = "2019-08-13";
const STEP = 21;

// rolling ATH + drawdown
let rollingMax = 0;
const ath: number[] = [], dd: number[] = [];
for (const p of pts) {
  if (p.price > rollingMax) rollingMax = p.price;
  ath.push(rollingMax);
  dd.push((rollingMax - p.price) / rollingMax);
}

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
const fmt = (x: number) => x.toFixed(3);

// ---- build windows ----
interface Win {
  idx: number;
  date: string;
  anchorPrice: number;
  lastPrice: number;
  pricePct2y: number;
  dd: number;       // drawdown at anchor
  ddPrev: number;   // drawdown tháng trước (window trước)
  ddChange: number; // dd - ddPrev (dương = sụp thêm)
  monthsIntoBear: number; // tháng kể từ đầu bear (-1 nếu không ở bear)
  bhPrice: number | null; // giá BH đầu tiên trong window (null nếu không có)
  inBear: boolean;
}

const wins: Win[] = [];
let prevDd = 0;
let bearStartIdx = -1;

for (let i = 0; i < pts.length; i += STEP) {
  const p = pts[i];
  const inBear = p.date >= BEAR_START && p.date <= BEAR_END;
  if (inBear && bearStartIdx < 0) bearStartIdx = wins.length;
  const monthsIntoBear = inBear ? wins.filter(w => w.inBear).length : -1;

  const end = Math.min(i + STEP, pts.length) - 1;
  let bhPrice: number | null = null;
  for (let j = i; j <= end; j++) {
    const cp = pts[j].cycleProb ?? -1;
    const sp = pts[j].swingProb ?? -1;
    if (cp >= 60 || sp >= 60) { bhPrice = pts[j].price; break; }
  }

  const curDd = dd[i];
  wins.push({
    idx: i,
    date: p.date,
    anchorPrice: p.price,
    lastPrice: pts[end].price,
    pricePct2y: p.pricePct2y ?? 0.5,
    dd: curDd,
    ddPrev: prevDd,
    ddChange: curDd - prevDd,
    monthsIntoBear,
    bhPrice,
    inBear,
  });
  prevDd = curDd;
}

// ---- phân loại giai đoạn theo A, B, C ----
const ACUTE_A_DROP = 0.03;  // cấp tính nếu giá rơi >3% trong window
const ACUTE_B_MONTHS = 12;  // cấp tính nếu trong 12 tháng đầu bear
const ACUTE_C_ACCEL = 0.03; // cấp tính nếu drawdown tăng >3pp/tháng

const bearWins = wins.filter(w => w.inBear);
const phaseA = (w: Win) => (w.anchorPrice - w.lastPrice) / w.anchorPrice > ACUTE_A_DROP;
const phaseB = (w: Win) => w.monthsIntoBear >= 0 && w.monthsIntoBear < ACUTE_B_MONTHS;
const phaseC = (w: Win) => w.ddChange > ACUTE_C_ACCEL;

// ---- simulate COMBO-A: BOOST qty + BH timing sớm; không BH → đầu tháng ----
function boostQty(pp: number): number {
  if (pp < 0.25) return 1.5;
  if (pp < 0.50) return 1.0;
  if (pp < 0.75) return 0.75;
  return 0.5;
}

interface SegResult {
  label: string;
  n: number;
  baseAvg: number;
  comboAvg: number;
  improvement: number; // (base-combo)/base
  comboQtyPerMonth: number;
  bhMonths: number;
}

function simSegment(label: string, seg: Win[]): SegResult {
  if (!seg.length) return { label, n: 0, baseAvg: 0, comboAvg: 0, improvement: 0, comboQtyPerMonth: 0, bhMonths: 0 };
  let bV = 0, bL = 0, cV = 0, cL = 0, cQty = 0, bhM = 0;
  for (const w of seg) {
    // BASE: 1 chỉ, đầu tháng
    bV += 1; bL += 1 / w.anchorPrice;
    // COMBO-A: BOOST qty + BH timing
    const qty = boostQty(w.pricePct2y);
    const price = w.bhPrice ?? w.anchorPrice;
    cV += qty; cL += qty / price;
    cQty += qty;
    if (w.bhPrice) bhM++;
  }
  const baseAvg = bV / bL, comboAvg = cV / cL;
  return {
    label, n: seg.length,
    baseAvg, comboAvg,
    improvement: (baseAvg - comboAvg) / baseAvg,
    comboQtyPerMonth: cQty / seg.length,
    bhMonths: bhM,
  };
}

function printSeg(r: SegResult) {
  if (r.n === 0) { console.log(`  ${r.label}: (không có dữ liệu)`); return; }
  console.log(`  ${r.label} (${r.n} tháng, BH=${r.bhMonths}):`);
  console.log(`    COMBO-A giá vốn: ${pct(r.improvement)} vs BASE | lượng/tháng: ${fmt(r.comboQtyPerMonth)}`);
}

// ---- report theo từng định nghĩa ----
console.log("==== ĐỊNH NGHĨA A: cấp tính = giá rơi >3% trong window ====");
{
  const acute = bearWins.filter(phaseA);
  const after = bearWins.filter(w => !phaseA(w));
  console.log(`Cấp tính: ${acute.length} tháng | Sau sụp: ${after.length} tháng`);
  printSeg(simSegment("Cấp tính (giá rơi >3%/tháng)", acute));
  printSeg(simSegment("Sau sụp  (giá rơi ≤3%/tháng)", after));
  // phân phối từng năm
  console.log("  Cấp tính theo năm:");
  for (const yr of ["2013","2014","2015","2016","2017","2018","2019"]) {
    const yw = bearWins.filter(w => w.date.startsWith(yr));
    const ac = yw.filter(phaseA).length;
    if (yw.length) console.log(`    ${yr}: ${ac}/${yw.length} tháng cấp tính`);
  }
}

console.log("\n==== ĐỊNH NGHĨA B: cấp tính = 12 tháng đầu bear ====");
{
  const acute = bearWins.filter(phaseB);
  const after = bearWins.filter(w => !phaseB(w));
  console.log(`Cấp tính: ${acute.length} tháng | Sau sụp: ${after.length} tháng`);
  printSeg(simSegment(`Cấp tính (tháng 0–${ACUTE_B_MONTHS-1} của bear)`, acute));
  printSeg(simSegment("Sau sụp  (tháng 12+ của bear)", after));
}

console.log("\n==== ĐỊNH NGHĨA C: cấp tính = drawdown tăng >3pp/tháng ====");
{
  const acute = bearWins.filter(phaseC);
  const after = bearWins.filter(w => !phaseC(w));
  console.log(`Cấp tính: ${acute.length} tháng | Sau sụp: ${after.length} tháng`);
  printSeg(simSegment("Cấp tính (dd tăng >3pp/tháng)", acute));
  printSeg(simSegment("Sau sụp  (dd tăng ≤3pp/tháng)", after));
  console.log("  Cấp tính theo năm:");
  for (const yr of ["2013","2014","2015","2016","2017","2018","2019"]) {
    const yw = bearWins.filter(w => w.date.startsWith(yr));
    const ac = yw.filter(phaseC).length;
    if (yw.length) console.log(`    ${yr}: ${ac}/${yw.length} tháng cấp tính (dd tăng mạnh)`);
  }
}

// ---- câu hỏi thực tế: COMBO-A trong giai đoạn sụp cấp tính có đủ tốt không? ----
console.log("\n==== TÓM TẮT 3 ĐỊNH NGHĨA (COMBO-A vs BASE) ====");
console.log("Giai đoạn         | Def A            | Def B            | Def C");

const makeRow = (label: string, filterFn: (w: Win) => boolean, negFn: (w: Win) => boolean) => {
  const ra = simSegment("", bearWins.filter(filterFn));
  const rb = simSegment("", bearWins.filter(negFn));
  return { label, acute: ra, after: rb };
};

const rows = [
  { label: "Cấp tính ", acute: simSegment("", bearWins.filter(phaseA)), after: simSegment("", bearWins.filter(w=>!phaseA(w))) },
  { label: "Sau sụp  ", acute: simSegment("", bearWins.filter(w=>!phaseA(w))), after: simSegment("", bearWins.filter(w=>!phaseB(w))) },
];

const segA_acute = simSegment("", bearWins.filter(phaseA));
const segA_after = simSegment("", bearWins.filter(w => !phaseA(w)));
const segB_acute = simSegment("", bearWins.filter(phaseB));
const segB_after = simSegment("", bearWins.filter(w => !phaseB(w)));
const segC_acute = simSegment("", bearWins.filter(phaseC));
const segC_after = simSegment("", bearWins.filter(w => !phaseC(w)));

const row = (label: string, a: SegResult, b: SegResult, c: SegResult) =>
  `${label.padEnd(18)} | ${pct(a.improvement).padStart(8)} (${fmt(a.comboQtyPerMonth)}/tháng, n=${a.n}) | ${pct(b.improvement).padStart(8)} (${fmt(b.comboQtyPerMonth)}/tháng, n=${b.n}) | ${pct(c.improvement).padStart(8)} (${fmt(c.comboQtyPerMonth)}/tháng, n=${c.n})`;

console.log(row("Cấp tính", segA_acute, segB_acute, segC_acute));
console.log(row("Sau sụp ", segA_after, segB_after, segC_after));

// ---- spotlight: tháng hiện tại 6/2026 ----
const curWin = wins.find(w => w.date.startsWith("2026-06"));
if (curWin) {
  console.log("\n==== THÁNG 6/2026 (situational) ====");
  console.log(`  DD hiện tại từ ATH: ${pct(curWin.dd)} | DD tháng trước: ${pct(curWin.ddPrev)} | Thay đổi: ${pct(curWin.ddChange)}`);
  console.log(`  Def A: ${(curWin.anchorPrice - curWin.lastPrice)/curWin.anchorPrice > ACUTE_A_DROP ? "CẤP TÍNH" : "sau sụp"} (rơi ${pct((curWin.anchorPrice - curWin.lastPrice)/curWin.anchorPrice)} trong window)`);
  console.log(`  Def C: ${curWin.ddChange > ACUTE_C_ACCEL ? "CẤP TÍNH" : "sau sụp"} (dd tăng ${pct(curWin.ddChange)}/tháng)`);
  const qty = boostQty(curWin.pricePct2y);
  console.log(`  COMBO-A gợi ý: ${qty} chỉ | BH: ${curWin.bhPrice ? "$"+curWin.bhPrice : "chưa bắn → mua đầu tháng $"+curWin.anchorPrice}`);
}
