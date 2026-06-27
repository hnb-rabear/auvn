/**
 * Backtest: ranh giới bull/bear nên dùng dd tức thời (15%) hay XU HƯỚNG DÀI?
 *
 * So 3 cách xác định "đang bear" (khi bear → dùng acute/recovery/grind như cũ; khi bull → gom đều 1.0):
 *   DD15   : dd từ ATH >= 15%            (hiện tại)
 *   MA200  : giá < MA200 phiên           (TA cổ điển, ~10 tháng)
 *   MOM6M  : lợi suất 126 phiên < 0      (momentum 6 tháng)
 *
 * Trong "bear", phân acute/recovery/grind bằng ddChange như mô hình hiện tại.
 * Đo: giá vốn + tài sản cuối vs FLAT, train(<2019)/test(>=2019).
 * QUAN TRỌNG: đo riêng giai đoạn BULL THẬT (dd<15% VÀ giá>MA200) để xem mỗi cách
 *   có báo "bear giả" làm gom ít trong bull không (cái giá -20% đã biết).
 *
 * Chạy: npx tsx scripts/bear-trend-boundary-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const STEP = 21, SPLIT = "2019-01-01";

const prices = pts.map((p) => p.price);
let mx = 0;
const dd: number[] = [];
for (const p of prices) { if (p > mx) mx = p; dd.push((mx - p) / mx); }

// MA200 + momentum 6 tháng (126 phiên), past-only
function maAt(i: number, win: number): number | null {
  if (i < win) return null;
  let s = 0;
  for (let j = i - win; j < i; j++) s += prices[j];
  return s / win;
}
function mom(i: number, win: number): number | null {
  if (i < win) return null;
  return (prices[i] - prices[i - win]) / prices[i - win];
}

const depth = (d: number) => d >= 0.40 ? 1.5 : d >= 0.25 ? 1.0 : d >= 0.15 ? 0.75 : 0.5;
const boost = (pp: number) => pp < 0.25 ? 1.5 : pp < 0.50 ? 1.0 : pp < 0.75 ? 0.75 : 0.5;

type BearFn = (i: number) => boolean;
const isBearDD: BearFn = (i) => dd[i] >= 0.15;
const isBearMA: BearFn = (i) => { const m = maAt(i, 200); return m !== null && prices[i] < m; };
const isBearMOM: BearFn = (i) => { const r = mom(i, 126); return r !== null && r < 0; };

// qty cho 1 nhịp i dưới một định nghĩa bear
function qty(i: number, isBear: BearFn): number {
  if (!isBear(i)) return 1.0; // bull → gom đều
  const prev = Math.max(0, i - STEP);
  const ch = dd[i] - dd[prev];
  if (ch > 0.03) return depth(dd[i]);          // acute
  if (ch < -0.03) return 1.5;                  // recovery
  const pp = pts[i].pricePct2y;                // grind
  return pp != null ? boost(pp) : 0.75;
}

interface Win { i: number; date: string; price: number; isTrain: boolean; }
const wins: Win[] = [];
for (let i = 0; i < pts.length; i += STEP) wins.push({ i, date: pts[i].date, price: pts[i].price, isTrain: pts[i].date < SPLIT });

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";

function avgCost(seg: Win[], f: BearFn): number {
  let v = 0, l = 0;
  for (const w of seg) { const q = qty(w.i, f); v += q; l += q / w.price; }
  return v / l;
}
function wealth(seg: Win[], f: BearFn): number {
  let g = 0, c = 0;
  for (const w of seg) { const q = qty(w.i, f); g += q / w.price; c += 1 - q; }
  return g * seg[seg.length - 1].price + c;
}

const train = wins.filter((w) => w.isTrain);
const test = wins.filter((w) => !w.isTrain);
// BULL THẬT = dd<15% VÀ giá>=MA200 (đồng thuận cả hai → chắc chắn bull)
const trueBull = wins.filter((w) => dd[w.i] < 0.15 && (() => { const m = maAt(w.i, 200); return m !== null && prices[w.i] >= m; })());

function report(name: string, f: BearFn) {
  const flat: BearFn = () => false; // FLAT = không bao giờ bear → luôn 1.0
  const fc = (seg: Win[]) => pct((avgCost(seg, flat) - avgCost(seg, f)) / avgCost(seg, flat));
  const fw = (seg: Win[]) => pct((wealth(seg, f) - wealth(seg, flat)) / wealth(seg, flat));
  const bearN = (seg: Win[]) => seg.filter((w) => f(w.i)).length;
  console.log(`\n${name}`);
  console.log(`  train: giá vốn ${fc(train).padStart(8)} | tài sản ${fw(train).padStart(8)} | ${bearN(train)}/${train.length} nhịp bear`);
  console.log(`  test : giá vốn ${fc(test).padStart(8)} | tài sản ${fw(test).padStart(8)} | ${bearN(test)}/${test.length} nhịp bear`);
  // báo bear giả trong bull thật:
  const falseBear = trueBull.filter((w) => f(w.i)).length;
  console.log(`  BÁO BEAR GIẢ trong bull thật: ${falseBear}/${trueBull.length} nhịp` + (falseBear > 0 ? `  ⚠ gom ít trong bull` : `  ✅ sạch`));
}

console.log("So 3 ranh giới bull/bear (vs FLAT gom đều). Dương = tốt hơn FLAT.");
report("DD15 (hiện tại)", isBearDD);
report("MA200 (giá < trung bình 200 phiên)", isBearMA);
report("MOM6M (lợi suất 6 tháng < 0)", isBearMOM);

// Tháng 5/2026: mỗi cách phân loại thế nào?
console.log("\n==== Tháng 5/2026 phân loại ra sao ====");
for (let i = 0; i < pts.length; i += STEP) {
  if (pts[i].date >= "2026-05-01" && pts[i].date <= "2026-05-31") {
    const m = maAt(i, 200), r = mom(i, 126);
    console.log(`  ${pts[i].date} giá $${pts[i].price.toFixed(0)} dd=${(dd[i]*100).toFixed(0)}% | DD15:${isBearDD(i)?"bear":"bull"} | MA200:${m?(prices[i]<m?"bear":"bull"):"?"}(MA=${m?m.toFixed(0):"?"}) | MOM6M:${r!=null?(r<0?"bear":"bull"):"?"}(${r!=null?(r*100).toFixed(0)+"%":"?"})`);
  }
}
