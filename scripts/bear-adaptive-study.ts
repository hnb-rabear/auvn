/**
 * Backtest ADAPTIVE: hai chế độ trong bear market.
 *   - Cấp tính (ddChange >3pp/tháng) → DEPTH: qty theo drawdown từ ATH
 *   - Bear bình thường               → BOOST: qty theo pct2y (rẻ/đắt so 2 năm)
 *   - Cả hai đều dùng BH timing (mua ngay khi BH bắn, không thì đầu tháng)
 *
 * So sánh vs BOOST thuần, DEPTH thuần, và BASE.
 * Phân tích từng năm trong bear để thấy chế độ nào bật khi nào.
 *
 * Chạy: npx tsx scripts/bear-adaptive-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const BEAR_START = "2013-04-12", BEAR_END = "2019-08-13";
const STEP = 21;
const ACUTE_DD_CHANGE = 0.03; // >3pp/tháng = cấp tính

let rollingMax = 0;
const dd: number[] = [];
for (const p of pts) {
  if (p.price > rollingMax) rollingMax = p.price;
  dd.push((rollingMax - p.price) / rollingMax);
}

interface Win {
  date: string;
  anchorPrice: number;
  pricePct2y: number;
  dd: number;
  ddChange: number;
  bhPrice: number | null;
  inBear: boolean;
  isAcute: boolean;
}

let prevDd = 0;
const wins: Win[] = [];
for (let i = 0; i < pts.length; i += STEP) {
  const p = pts[i];
  const curDd = dd[i];
  const inBear = p.date >= BEAR_START && p.date <= BEAR_END;
  const end = Math.min(i + STEP, pts.length) - 1;
  let bhPrice: number | null = null;
  for (let j = i; j <= end; j++) {
    const cp = pts[j].cycleProb ?? -1;
    const sp = pts[j].swingProb ?? -1;
    if (cp >= 60 || sp >= 60) { bhPrice = pts[j].price; break; }
  }
  const ddChange = curDd - prevDd;
  wins.push({
    date: p.date,
    anchorPrice: p.price,
    pricePct2y: p.pricePct2y ?? 0.5,
    dd: curDd, ddChange,
    bhPrice, inBear,
    isAcute: inBear && ddChange > ACUTE_DD_CHANGE,
  });
  prevDd = curDd;
}

const bearWins  = wins.filter(w => w.inBear);
const acuteWins = bearWins.filter(w => w.isAcute);
const afterWins = bearWins.filter(w => !w.isAcute);

const pct  = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
const fmt  = (x: number) => x.toFixed(3);

// ---- qty functions ----
function boostQty(pp: number): number {
  // pct2y: rẻ=thấp, đắt=cao → cheapness = 1-pp
  if (pp < 0.25) return 1.5;  // rất rẻ
  if (pp < 0.50) return 1.0;
  if (pp < 0.75) return 0.75;
  return 0.5;                  // đắt
}
function depthQty(d: number): number {
  // dd từ ATH: sâu = mua nhiều
  // chuẩn hóa: dd≥40%→×1.5, ≥25%→×1.0, ≥15%→×0.75, <15%→×0.5
  if (d >= 0.40) return 1.5;
  if (d >= 0.25) return 1.0;
  if (d >= 0.15) return 0.75;
  return 0.5;
}
function adaptiveQty(w: Win): number {
  return w.isAcute ? depthQty(w.dd) : boostQty(w.pricePct2y);
}

// ---- simulate ----
type QtyFn = (w: Win) => number;
function sim(seg: Win[], qFn: QtyFn) {
  let bV = 0, bL = 0, cV = 0, cL = 0, nAcute = 0, nBH = 0;
  for (const w of seg) {
    bV += 1; bL += 1 / w.anchorPrice;
    const q = qFn(w);
    const price = w.bhPrice ?? w.anchorPrice;
    cV += q; cL += q / price;
    if (w.isAcute) nAcute++;
    if (w.bhPrice) nBH++;
  }
  const baseAvg = bV / bL, comboAvg = cV / cL;
  return {
    impr: (baseAvg - comboAvg) / baseAvg,
    qpm: cV / seg.length,
    nAcute, nBH, n: seg.length,
  };
}

// ---- report ----
const STRATS: { name: string; fn: QtyFn }[] = [
  { name: "BASE (1 chỉ/tháng)   ", fn: () => 1 },
  { name: "BOOST (pct2y)        ", fn: w => boostQty(w.pricePct2y) },
  { name: "DEPTH (dd ATH)       ", fn: w => depthQty(w.dd) },
  { name: "ADAPTIVE (2 chế độ)  ", fn: adaptiveQty },
];

function report(label: string, seg: Win[]) {
  if (!seg.length) return;
  const base = sim(seg, () => 1);
  console.log(`\n===== ${label} (${seg.length} tháng, cấp tính=${acuteWins.filter(w=>seg.includes(w)).length}, BH=${seg.filter(w=>w.bhPrice).length}) =====`);
  console.log("Chiến lược            | giá vốn vs BASE | lượng/tháng");
  for (const s of STRATS) {
    const r = sim(seg, s.fn);
    const isBase = s.name.startsWith("BASE");
    const costStr = isBase ? "      (chuẩn)    " : pct(r.impr).padStart(15);
    console.log(`${s.name} |${costStr}  | ${fmt(r.qpm)}`);
  }
}

report("TOÀN LỊCH SỬ", wins);
report("BEAR 2013–2019", bearWins);
report("  └ CẤP TÍNH (ddChange>3pp)", acuteWins);
report("  └ BÌNH THƯỜNG (bear, không cấp tính)", afterWins);

// ---- từng năm trong bear ----
console.log("\n===== ADAPTIVE theo từng năm trong bear =====");
console.log("Năm  | cấp tính | bình thường | ADAPTIVE vs BASE");
for (const yr of ["2013","2014","2015","2016","2017","2018","2019"]) {
  const yw = bearWins.filter(w => w.date.startsWith(yr));
  if (!yw.length) continue;
  const acute = yw.filter(w => w.isAcute).length;
  const rAdap = sim(yw, adaptiveQty);
  const rBase = sim(yw, () => 1);
  console.log(`${yr} | ${String(acute).padStart(8)} | ${String(yw.length-acute).padStart(11)} | ${pct(rAdap.impr).padStart(10)} (${fmt(rAdap.qpm)} chỉ/tháng)`);
}

// ---- spotlight tháng 6/2026 ----
const cur = wins.find(w => w.date.startsWith("2026-06"));
if (cur) {
  console.log("\n===== THÁNG 6/2026 =====");
  console.log(`  dd ATH: ${pct(cur.dd)} | pct2y: ${Math.round(cur.pricePct2y*100)}% | ddChange: ${pct(cur.ddChange)}/tháng`);
  console.log(`  Chế độ: ${cur.isAcute ? "CẤP TÍNH → dùng DEPTH" : "bình thường → dùng BOOST"}`);
  console.log(`  BOOST qty: ${boostQty(cur.pricePct2y)} chỉ | DEPTH qty: ${depthQty(cur.dd)} chỉ | ADAPTIVE: ${adaptiveQty(cur)} chỉ`);
  console.log(`  Giá mua: $${cur.bhPrice ?? cur.anchorPrice} (${cur.bhPrice ? "BH bắn 24/06" : "đầu tháng"})`);

  // Giải thích logic
  console.log(`\n  Lý do DEPTH chọn qty=${depthQty(cur.dd)}:`);
  console.log(`    dd=${pct(cur.dd)} → bậc thang: ≥40%→×1.5 | ≥25%→×1.0 | ≥15%→×0.75 | <15%→×0.5`);
  console.log(`    22.75% nằm trong [15%,25%) → ×0.75 chỉ`);
  console.log(`\n  Nếu giá tiếp tục rơi về $3500 (dd≈34%): DEPTH → 1.0 chỉ`);
  console.log(`  Nếu giá tiếp tục rơi về $3000 (dd≈44%): DEPTH → 1.5 chỉ`);
}

// ---- sensitivity: ngưỡng cấp tính ----
console.log("\n===== SENSITIVITY: ngưỡng phát hiện cấp tính =====");
console.log("Threshold | n acute | ADAPTIVE bear | ADAPTIVE acute | ADAPTIVE after");
for (const thr of [0.01, 0.02, 0.03, 0.04, 0.05]) {
  const ac = bearWins.filter(w => w.ddChange > thr);
  const af = bearWins.filter(w => w.ddChange <= thr);
  const adaptFn = (w: Win) => w.ddChange > thr ? depthQty(w.dd) : boostQty(w.pricePct2y);
  const rb = sim(bearWins, adaptFn);
  const ra = sim(ac, adaptFn);
  const rf = sim(af, adaptFn);
  console.log(`  >${(thr*100).toFixed(0)}pp/tháng | n=${String(ac.length).padStart(3)} | bear ${pct(rb.impr).padStart(7)} | acute ${pct(ra.impr).padStart(7)} | after ${pct(rf.impr).padStart(7)}`);
}
