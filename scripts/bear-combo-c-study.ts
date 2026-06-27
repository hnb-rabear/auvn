/**
 * Backtest COMBO-C: kết hợp pct2y + drawdown từ ATH để tính khối lượng mua.
 *
 * Vấn đề: BOOST (pct2y thuần) gom ít đúng lúc sụp đổ cấp tính vì pct2y vẫn cao
 * khi giá mới bắt đầu rớt từ vùng đắt. Cần tích hợp drawdown từ ATH.
 *
 * Thước đo kết hợp:
 *   cheapness = 1 - pct2y         (0=đắt so 2 năm, 1=rẻ)
 *   depth     = dd_from_ath        (0=tại ATH, 1=mất hết)
 *   score     = α·cheapness + (1-α)·depth  -- alpha ∈ [0,1]
 *
 * Bậc thang qty theo score (grid search):
 *   score > hi  → ×1.5
 *   score > mid → ×1.0
 *   score > lo  → ×0.75
 *   else        → ×0.5
 *
 * So sánh: BOOST (α=1, thuần pct2y) vs DEPTH (α=0, thuần dd) vs COMBO-C tốt nhất.
 * Tối ưu trên: (1) toàn lịch sử, (2) bear acute Def C (dd tăng >3pp/tháng).
 * Gate: cải thiện >0 ở cả bear lẫn bull để không overfit.
 *
 * Chạy: npx tsx scripts/bear-combo-c-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const BEAR_START = "2013-04-12", BEAR_END = "2019-08-13";
const STEP = 21;

let rollingMax = 0;
const dd: number[] = [];
for (const p of pts) {
  if (p.price > rollingMax) rollingMax = p.price;
  dd.push((rollingMax - p.price) / rollingMax);
}
let prevDd = 0;

interface Win {
  date: string;
  anchorPrice: number;
  pricePct2y: number;
  dd: number;
  ddChange: number;
  bhPrice: number | null;
  inBear: boolean;
  isBull: boolean;
  isAcuteC: boolean; // dd tăng >3pp/tháng
}

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
    dd: curDd,
    ddChange,
    bhPrice,
    inBear,
    isBull: !inBear,
    isAcuteC: inBear && ddChange > 0.03,
  });
  prevDd = curDd;
}

const bearWins   = wins.filter(w => w.inBear);
const bullWins   = wins.filter(w => w.isBull);
const acuteWins  = wins.filter(w => w.isAcuteC);
const afterWins  = wins.filter(w => w.inBear && !w.isAcuteC);

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
const fmt = (x: number) => x.toFixed(3);

// ---- simulate ----
function qty(score: number, hi: number, mid: number, lo: number): number {
  if (score > hi)  return 1.5;
  if (score > mid) return 1.0;
  if (score > lo)  return 0.75;
  return 0.5;
}

function simWins(seg: Win[], alpha: number, hi: number, mid: number, lo: number) {
  let bV = 0, bL = 0, cV = 0, cL = 0;
  for (const w of seg) {
    const cheapness = 1 - w.pricePct2y;
    const depth = Math.min(w.dd * 2, 1); // chuẩn hóa dd: 50% dd → score 1.0
    const score = alpha * cheapness + (1 - alpha) * depth;
    const q = qty(score, hi, mid, lo);
    const price = w.bhPrice ?? w.anchorPrice;
    bV += 1; bL += 1 / w.anchorPrice;
    cV += q; cL += q / price;
  }
  const baseAvg = bL > 0 ? bV / bL : 0;
  const comboAvg = cL > 0 ? cV / cL : 0;
  return {
    impr: baseAvg > 0 ? (baseAvg - comboAvg) / baseAvg : 0,
    qpm: cV / seg.length,
  };
}

// ---- grid search ----
const ALPHAS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const HIS   = [0.6, 0.65, 0.7];
const MIDS  = [0.4, 0.45, 0.5];
const LOS   = [0.2, 0.25, 0.3];

interface Cand {
  alpha: number; hi: number; mid: number; lo: number;
  bearImpr: number; bullImpr: number; acuteImpr: number; afterImpr: number;
  bearQpm: number; acuteQpm: number;
  minBoth: number; // gate: min(bear, bull)
}

const cands: Cand[] = [];
for (const alpha of ALPHAS)
  for (const hi of HIS)
    for (const mid of MIDS)
      for (const lo of LOS) {
        if (lo >= mid || mid >= hi) continue;
        const rb = simWins(bearWins, alpha, hi, mid, lo);
        const ru = simWins(bullWins, alpha, hi, mid, lo);
        const ra = simWins(acuteWins, alpha, hi, mid, lo);
        const rf = simWins(afterWins, alpha, hi, mid, lo);
        if (rb.impr <= 0 || ru.impr <= 0) continue; // gate: phải tốt ở cả 2
        cands.push({
          alpha, hi, mid, lo,
          bearImpr: rb.impr, bullImpr: ru.impr,
          acuteImpr: ra.impr, afterImpr: rf.impr,
          bearQpm: rb.qpm, acuteQpm: ra.qpm,
          minBoth: Math.min(rb.impr, ru.impr),
        });
      }

// sắp xếp theo acute improvement (tối ưu giai đoạn sụp cấp tính)
const byAcute = [...cands].sort((a, b) => b.acuteImpr - a.acuteImpr);
// sắp xếp theo min(bear, bull) (ổn định cả 2 mùa)
const byStable = [...cands].sort((a, b) => b.minBoth - a.minBoth);

const fmtCfg = (c: Cand) =>
  `α=${c.alpha.toFixed(1)} tiers=[${c.lo},${c.mid},${c.hi}]`;

console.log(`Grid: ${ALPHAS.length}×${HIS.length}×${MIDS.length}×${LOS.length} cấu hình | Qua gate (bear>0 & bull>0): ${cands.length}\n`);

console.log("=== TOP 5 theo ACUTE improvement (tối ưu sụp cấp tính) ===");
console.log("Cấu hình                    | bear   | bull   | cấp tính | sau sụp | qpm acute");
for (const c of byAcute.slice(0, 5)) {
  console.log(`${fmtCfg(c).padEnd(28)} | ${pct(c.bearImpr).padStart(6)} | ${pct(c.bullImpr).padStart(6)} | ${pct(c.acuteImpr).padStart(8)} | ${pct(c.afterImpr).padStart(7)} | ${fmt(c.acuteQpm)}`);
}

console.log("\n=== TOP 5 theo STABLE (min bear+bull, ổn định 2 mùa) ===");
console.log("Cấu hình                    | bear   | bull   | cấp tính | sau sụp | qpm acute");
for (const c of byStable.slice(0, 5)) {
  console.log(`${fmtCfg(c).padEnd(28)} | ${pct(c.bearImpr).padStart(6)} | ${pct(c.bullImpr).padStart(6)} | ${pct(c.acuteImpr).padStart(8)} | ${pct(c.afterImpr).padStart(7)} | ${fmt(c.acuteQpm)}`);
}

// ---- so sánh với BOOST (α=1) và DEPTH (α=0) ----
const BOOST_CFG = { alpha: 1.0, hi: 0.7, mid: 0.5, lo: 0.25 }; // ≈ BOOST gốc
const DEPTH_CFG = { alpha: 0.0, hi: 0.7, mid: 0.5, lo: 0.25 }; // thuần drawdown

const rBoostBear  = simWins(bearWins,  BOOST_CFG.alpha, BOOST_CFG.hi, BOOST_CFG.mid, BOOST_CFG.lo);
const rBoostBull  = simWins(bullWins,  BOOST_CFG.alpha, BOOST_CFG.hi, BOOST_CFG.mid, BOOST_CFG.lo);
const rBoostAcute = simWins(acuteWins, BOOST_CFG.alpha, BOOST_CFG.hi, BOOST_CFG.mid, BOOST_CFG.lo);
const rDepthBear  = simWins(bearWins,  DEPTH_CFG.alpha, DEPTH_CFG.hi, DEPTH_CFG.mid, DEPTH_CFG.lo);
const rDepthBull  = simWins(bullWins,  DEPTH_CFG.alpha, DEPTH_CFG.hi, DEPTH_CFG.mid, DEPTH_CFG.lo);
const rDepthAcute = simWins(acuteWins, DEPTH_CFG.alpha, DEPTH_CFG.hi, DEPTH_CFG.mid, DEPTH_CFG.lo);

console.log("\n=== SO SÁNH THAM CHIẾU ===");
console.log("Chiến lược            | bear   | bull   | cấp tính | qpm acute");
console.log(`BOOST (α=1.0, pct2y)  | ${pct(rBoostBear.impr).padStart(6)} | ${pct(rBoostBull.impr).padStart(6)} | ${pct(rBoostAcute.impr).padStart(8)} | ${fmt(rBoostAcute.qpm)}`);
console.log(`DEPTH (α=0.0, dd ATH) | ${pct(rDepthBear.impr).padStart(6)} | ${pct(rDepthBull.impr).padStart(6)} | ${pct(rDepthAcute.impr).padStart(8)} | ${fmt(rDepthAcute.qpm)}`);
if (byAcute.length) {
  const best = byAcute[0];
  const rb = simWins(bearWins,  best.alpha, best.hi, best.mid, best.lo);
  const ru = simWins(bullWins,  best.alpha, best.hi, best.mid, best.lo);
  const ra = simWins(acuteWins, best.alpha, best.hi, best.mid, best.lo);
  console.log(`COMBO-C best-acute    | ${pct(rb.impr).padStart(6)} | ${pct(ru.impr).padStart(6)} | ${pct(ra.impr).padStart(8)} | ${fmt(ra.qpm)} [${fmtCfg(best)}]`);
}
if (byStable.length) {
  const best = byStable[0];
  const rb = simWins(bearWins,  best.alpha, best.hi, best.mid, best.lo);
  const ru = simWins(bullWins,  best.alpha, best.hi, best.mid, best.lo);
  const ra = simWins(acuteWins, best.alpha, best.hi, best.mid, best.lo);
  console.log(`COMBO-C best-stable   | ${pct(rb.impr).padStart(6)} | ${pct(ru.impr).padStart(6)} | ${pct(ra.impr).padStart(8)} | ${fmt(ra.qpm)} [${fmtCfg(best)}]`);
}

// ---- spotlight tháng 6/2026 ----
const cur = wins.find(w => w.date.startsWith("2026-06"));
if (cur && byAcute.length && byStable.length) {
  console.log("\n=== THÁNG 6/2026 — qty theo từng chiến lược ===");
  const show = (label: string, alpha: number, hi: number, mid: number, lo: number) => {
    const cheapness = 1 - cur.pricePct2y;
    const depth = Math.min(cur.dd * 2, 1);
    const score = alpha * cheapness + (1 - alpha) * depth;
    const q = qty(score, hi, mid, lo);
    const buyPrice = cur.bhPrice ?? cur.anchorPrice;
    console.log(`  ${label.padEnd(22)}: score=${score.toFixed(2)} → ${q} chỉ | mua $${buyPrice} (${cur.bhPrice ? "BH bắn" : "đầu tháng"})`);
  };
  console.log(`  dd từ ATH: ${pct(cur.dd)} | pct2y: ${Math.round(cur.pricePct2y*100)}% | ddChange: ${pct(cur.ddChange)}/tháng (${cur.isAcuteC ? "CẤP TÍNH" : "bình thường"})`);
  show("BOOST (α=1.0)", BOOST_CFG.alpha, BOOST_CFG.hi, BOOST_CFG.mid, BOOST_CFG.lo);
  show("DEPTH (α=0.0)", DEPTH_CFG.alpha, DEPTH_CFG.hi, DEPTH_CFG.mid, DEPTH_CFG.lo);
  show("COMBO-C best-acute", byAcute[0].alpha, byAcute[0].hi, byAcute[0].mid, byAcute[0].lo);
  show("COMBO-C best-stable", byStable[0].alpha, byStable[0].hi, byStable[0].mid, byStable[0].lo);
}
