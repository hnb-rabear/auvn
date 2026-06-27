/**
 * Backtest 3 hướng KẾT HỢP tín hiệu vào quyết định khối lượng DCA, trên khung 4-pha.
 * Chống overfit: train(<2019) / test(>=2019) + placebo. Báo giá vốn VÀ tài sản cuối.
 *
 * Baseline 4-pha (đã validate): BULL→FLAT, ACUTE→DEPTH, GRIND→BOOST, RECOVERY→FLAT.
 *
 * H1 CONFLUENCE: gom mạnh thêm (×1.5 cap) khi nhiều tín hiệu đồng thuận rẻ+đáy
 *                (pct2y<0.35 + dd>=0.20 + composite>0 + cycleProb>=45).
 * H2 COMPOSITE-GATE: phân loại pha bằng composite 6m-preset (macro-heavy) thay ddChange.
 * H3 BH-RECOVERY: trong RECOVERY, gom mạnh ×1.5 CHỈ KHI cycleProb>=50, ngược lại FLAT.
 *
 * Thước đo (train & test riêng): avgCost vs baseline + wealth vs baseline.
 * Placebo: thay tín hiệu thật bằng nhãn ngẫu nhiên cùng tần suất → kỳ vọng ≈0.
 *
 * Chạy: npx tsx scripts/bear-combine-signals-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { seededRandom } from "../src/lib/indicators";

const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const STEP = 21, ACUTE = 0.03, SPLIT = "2019-01-01";

let mx = 0;
const dd: number[] = [];
for (const p of pts) { if (p.price > mx) mx = p.price; dd.push((mx - p.price) / mx); }

// preset 6m: macro-heavy. composite6m = (technical*0 + macro*0.9 + stats*0.1)*50, scaled như engine.
function composite6m(scores: any): number {
  const w = { technical: 0, premium: 0, macro: 0.9, stats: 0.1, momentum: 0 };
  let s = 0, tw = 0;
  for (const k of Object.keys(w)) {
    const wk = (w as any)[k];
    if (wk > 0 && scores[k] != null) { s += scores[k] * wk; tw += wk; }
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

type Phase = "BULL" | "ACUTE" | "RECOVERY" | "GRIND";
interface Win {
  date: string; price: number; pct2y: number; dd: number; ddChange: number;
  composite: number; comp6m: number; cycleProb: number; phase: Phase; isTrain: boolean;
}

let prevDd = 0;
const wins: Win[] = [];
for (let i = 0; i < pts.length; i += STEP) {
  const curDd = dd[i];
  const ddChange = curDd - prevDd;
  let phase: Phase;
  if (curDd < 0.15) phase = "BULL";
  else if (ddChange > ACUTE) phase = "ACUTE";
  else if (ddChange < -ACUTE) phase = "RECOVERY";
  else phase = "GRIND";
  wins.push({
    date: pts[i].date, price: pts[i].price, pct2y: pts[i].pricePct2y ?? 0.5,
    dd: curDd, ddChange,
    composite: pts[i].composite ?? 0,
    comp6m: composite6m(pts[i].scores ?? {}),
    cycleProb: pts[i].cycleProb ?? -1,
    phase, isTrain: pts[i].date < SPLIT,
  });
  prevDd = curDd;
}

// ---- qty primitives ----
const fBoost = (w: Win) => w.pct2y < 0.25 ? 1.5 : w.pct2y < 0.50 ? 1.0 : w.pct2y < 0.75 ? 0.75 : 0.5;
const fDepth = (w: Win) => w.dd >= 0.40 ? 1.5 : w.dd >= 0.25 ? 1.0 : w.dd >= 0.15 ? 0.75 : 0.5;

// BASELINE 4-pha
function baseQty(w: Win): number {
  if (w.phase === "BULL") return 1.0;
  if (w.phase === "ACUTE") return fDepth(w);
  if (w.phase === "GRIND") return fBoost(w);
  return 1.0; // RECOVERY → FLAT (an toàn)
}

// H1 CONFLUENCE: nâng lên 1.5 khi đồng thuận mạnh (cap 1.5)
function h1Qty(w: Win): number {
  const base = baseQty(w);
  const confluence = w.pct2y < 0.35 && w.dd >= 0.20 && w.composite > 0 && w.cycleProb >= 45;
  return confluence ? 1.5 : base;
}

// H2 COMPOSITE-GATE: pha xác định bằng comp6m thay ddChange (chỉ đổi cách chia ACUTE/RECOVERY/GRIND)
function h2Phase(w: Win): Phase {
  if (w.dd < 0.15) return "BULL";
  // comp6m rất âm = vĩ mô xấu, coi như đang sụp (ACUTE-like); rất dương = hồi (RECOVERY-like)
  if (w.comp6m < -20) return "ACUTE";
  if (w.comp6m > 20) return "RECOVERY";
  return "GRIND";
}
function h2Qty(w: Win): number {
  const ph = h2Phase(w);
  if (ph === "BULL") return 1.0;
  if (ph === "ACUTE") return fDepth(w);
  if (ph === "GRIND") return fBoost(w);
  return 1.0;
}

// H3 BH-RECOVERY: RECOVERY gom mạnh ×1.5 chỉ khi cycleProb>=50
function h3Qty(w: Win): number {
  if (w.phase === "RECOVERY") return w.cycleProb >= 50 ? 1.5 : 1.0;
  return baseQty(w);
}

type Strat = (w: Win) => number;

function avgCost(seg: Win[], q: Strat): number {
  let v = 0, l = 0;
  for (const w of seg) { const x = q(w); v += x; l += x / w.price; }
  return l > 0 ? v / l : 0;
}
function wealth(seg: Win[], q: Strat): number {
  let gold = 0, cash = 0;
  for (const w of seg) { const x = q(w); gold += x / w.price; cash += (1 - x); }
  return gold * seg[seg.length - 1].price + cash;
}

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";

function compare(label: string, seg: Win[], cand: Strat) {
  if (seg.length < 5) { console.log(`  ${label}: n<5, bỏ`); return; }
  const bc = avgCost(seg, baseQty), cc = avgCost(seg, cand);
  const bw = wealth(seg, baseQty), cw = wealth(seg, cand);
  console.log(`  ${label.padEnd(14)} | giá vốn ${pct((bc - cc) / bc).padStart(8)} | tài sản ${pct((cw - bw) / bw).padStart(8)}`);
}

const train = wins.filter(w => w.isTrain);
const test = wins.filter(w => !w.isTrain);

for (const [name, cand] of [["H1 CONFLUENCE", h1Qty], ["H2 COMPOSITE-GATE", h2Qty], ["H3 BH-RECOVERY", h3Qty]] as [string, Strat][]) {
  console.log(`\n===== ${name} (so với BASELINE 4-pha) =====`);
  compare("TRAIN <2019", train, cand);
  compare("TEST >=2019", test, cand);
  compare("TOÀN BỘ", wins, cand);
}

// ---- PLACEBO cho H1: confluence ngẫu nhiên cùng tần suất ----
console.log(`\n===== PLACEBO (H1 confluence ngẫu nhiên cùng tần suất, 5 seed) =====`);
const realConfl = wins.filter(w => w.pct2y < 0.35 && w.dd >= 0.20 && w.composite > 0 && w.cycleProb >= 45).length;
console.log(`Confluence thật bật: ${realConfl}/${wins.length} nhịp`);
for (const seed of [1, 2, 3, 4, 5]) {
  const rand = seededRandom(seed * 137);
  const flag = new Set<number>();
  const order = wins.map((_, j) => ({ j, r: rand() })).sort((a, b) => a.r - b.r);
  for (let k = 0; k < realConfl; k++) flag.add(order[k].j);
  const placebo: Strat = (w) => { const j = wins.indexOf(w); return flag.has(j) ? 1.5 : baseQty(w); };
  const bc = avgCost(wins, baseQty), pc = avgCost(wins, placebo);
  const bw = wealth(wins, baseQty), pw = wealth(wins, placebo);
  console.log(`  seed ${seed}: giá vốn ${pct((bc - pc) / bc).padStart(8)} | tài sản ${pct((pw - bw) / bw).padStart(8)}`);
}

console.log("\n==== ĐỌC ====");
console.log("Giữ hướng nào: dương ở CẢ train+test, và H1 phải vượt rõ placebo. Nếu ~0/âm/thua placebo → loại.");
