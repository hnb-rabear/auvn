/**
 * Backtest 3 chiến thuật DCA trong bear market, so với baseline (mua đầu tháng mù quáng).
 *
 * Bối cảnh: người dùng mua 1 chỉ/tháng, dùng Bottom Hunter làm timing.
 * Câu hỏi: chiến thuật nào tốt hơn khi thị trường đang ở bear thật sự?
 *
 * 4 chiến thuật:
 *   BASE     : mua đầu tháng, bất kể tín hiệu, luôn 1 chỉ
 *   SIGNAL   : chờ Bottom Hunter (cycleProb>=60 || swingProb>=60), mua 1 chỉ đầu tiên mỗi tháng
 *              nếu tháng đó không có tín hiệu → bỏ tháng đó (không mua)
 *   SPLIT    : Hướng 2 — ½ chỉ đầu tháng vô điều kiện + ½ chỉ khi Bottom Hunter bắn
 *              (tổng tối đa 1 chỉ/tháng; ½ dư tích lũy sang tháng sau tối đa 1 kỳ)
 *   SIZED    : Hướng 1 — Bottom Hunter làm timing, khối lượng theo độ sâu drawdown từ ATH:
 *              dd<20%→½ dd<30%→¾ dd<40%→1 dd>=40%→1½ (chuẩn hóa về 1/tháng trung bình)
 *
 * Thước đo (trung lập vốn - capital-weighted, đồng nhất ngân sách):
 *   - Giá vốn TB (ΣVND/Σlượng) — thấp hơn = gom rẻ hơn
 *   - Lượng vàng gom được / vốn bỏ ra (nhiều hơn = tốt hơn)
 *   - Miss rate: % tháng không mua được (chỉ SIGNAL)
 *
 * Giai đoạn: BEAR thật (2013-04-12 → 2019-08-13, dd>=20% liên tục), BULL còn lại, TOÀN BỘ.
 *
 * Chạy: npx tsx scripts/bear-strategy-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "../src/lib/types";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const pts = tl.points;

// ---- xác định bear thật (dd>=20% từ rolling ATH, kéo dài >=90 phiên liên tiếp) ----
let rollingMax = 0;
const dd: number[] = [];
for (const p of pts) {
  if (p.price > rollingMax) rollingMax = p.price;
  dd.push((rollingMax - p.price) / rollingMax);
}
const BEAR_START = "2013-04-12";
const BEAR_END   = "2019-08-13";
const isBear = (date: string) => date >= BEAR_START && date <= BEAR_END;

// ---- lấy 1 phiên/tháng, nhịp STEP=21, với cycleProb/swingProb ----
const STEP = 21;
interface MonthPt {
  date: string;
  price: number;
  drawdownFrac: number; // từ rolling ATH
  pricePct2y: number | null; // percentile giá so dải 2 năm (0..1)
  cycleProb: number;   // -1 nếu undefined/null
  swingProb: number;
  hasSignal: boolean;  // cycle>=60 || swing>=60
  inBear: boolean;
}

const monthly: MonthPt[] = [];
for (let i = 0; i < pts.length; i += STEP) {
  const p = pts[i];
  const cp = (p.cycleProb ?? -1) as number;
  const sp = (p.swingProb ?? -1) as number;
  monthly.push({
    date: p.date,
    price: p.price,
    drawdownFrac: dd[i],
    pricePct2y: p.pricePct2y ?? null,
    cycleProb: cp,
    swingProb: sp,
    hasSignal: cp >= 60 || sp >= 60,
    inBear: isBear(p.date),
  });
}

// ---- hàm tính khối lượng theo drawdown (Hướng 1, chuẩn hóa ≈1 trung bình) ----
// dd<20%→0.5  dd<30%→0.75  dd<40%→1  dd>=40%→1.5
function sizedQty(d: number): number {
  if (d < 0.20) return 0.5;
  if (d < 0.30) return 0.75;
  if (d < 0.40) return 1.0;
  return 1.5;
}

// ---- engine mô phỏng DCA ----
interface SimResult {
  totalQty: number;
  totalSpent: number;
  avgCost: number;
  missedMonths: number;
  brakedMonths: number;
  months: number;
}

// ---- cửa sổ tháng: mỗi window STEP=21 phiên ----
// bhFirst  = ngày BH đầu tiên xuất hiện trong window (mua ngay khi bắn)
// bhBest   = ngày BH giá thấp nhất trong window (nhìn lại — không thực tế nhưng upper bound)
// lastPrice= giá phiên cuối window (fallback deadline nếu BH không bắn)
interface Window {
  anchor: MonthPt;
  bhFirst: { price: number; dd: number } | null;
  bhBest:  { price: number; dd: number } | null;
  lastPrice: number;
}

const windows: Window[] = [];
for (let i = 0; i < pts.length; i += STEP) {
  const anchor = monthly[i / STEP];
  if (!anchor) continue;
  const end = Math.min(i + STEP, pts.length);
  let bhFirst: Window["bhFirst"] = null;
  let bhBest:  Window["bhBest"]  = null;
  for (let j = i; j < end; j++) {
    const p = pts[j];
    const cp = (p.cycleProb ?? -1) as number;
    const sp = (p.swingProb ?? -1) as number;
    if (cp >= 60 || sp >= 60) {
      if (!bhFirst) bhFirst = { price: p.price, dd: dd[j] };
      if (!bhBest || p.price < bhBest.price) bhBest = { price: p.price, dd: dd[j] };
    }
  }
  const lastPrice = pts[end - 1].price;
  windows.push({ anchor, bhFirst, bhBest, lastPrice });
}

type Strategy =
  | "base"          // mua ngay đầu tháng, luôn 1 chỉ
  | "boost"         // BOOST qty từ pct2y, mua ngay đầu tháng
  | "combo_early"   // BOOST qty + BH timing; nếu không có BH → mua ngay đầu tháng (bhFirst)
  | "combo_wait"    // BOOST qty + BH timing; nếu không có BH → chờ hết window rồi mua cuối tháng
  | "combo_bestbh"; // BOOST qty + BH ngày giá thấp nhất (upper bound lý thuyết — nhìn lại)

function boostQty(pp: number): number {
  if (pp < 0.25) return 1.5;
  if (pp < 0.50) return 1.0;
  if (pp < 0.75) return 0.75;
  return 0.5;
}

function simulate(wins: Window[], strategy: Strategy): SimResult {
  let totalQty = 0, totalSpent = 0, missedMonths = 0, brakedMonths = 0;

  for (const { anchor: p, bhFirst, bhBest, lastPrice } of wins) {
    let qty = 0;
    let buyPrice = p.price;
    const pp = p.pricePct2y ?? 0.5;

    if (strategy === "base") {
      qty = 1;
      buyPrice = p.price;

    } else if (strategy === "boost") {
      qty = boostQty(pp);
      buyPrice = p.price; // mua đầu tháng

    } else if (strategy === "combo_early") {
      // Thực tế A: biết qty từ đầu tháng, mua ngay nếu không có BH
      qty = boostQty(pp);
      buyPrice = bhFirst ? bhFirst.price : p.price;

    } else if (strategy === "combo_wait") {
      // Thực tế B (câu hỏi của anh): chờ BH trong window, hết hạn mua cuối
      qty = boostQty(pp);
      if (bhFirst) {
        buyPrice = bhFirst.price; // mua ngay khi BH bắn lần đầu
      } else {
        buyPrice = lastPrice;     // deadline cuối window
        brakedMonths++;
      }

    } else if (strategy === "combo_bestbh") {
      // Upper bound lý thuyết: BH ngày giá thấp nhất (không thực tế)
      qty = boostQty(pp);
      buyPrice = bhBest ? bhBest.price : p.price;
    }

    if (qty > 0) {
      totalQty += qty;
      totalSpent += qty * buyPrice;
    }
    void missedMonths;
  }

  const avgCost = totalQty > 0 ? totalSpent / totalQty : 0;
  return { totalQty, totalSpent, avgCost, missedMonths: 0, brakedMonths, months: wins.length };
}

// ---- báo cáo ----
const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
const fmt = (x: number) => x.toFixed(3);

const STRATS: { id: Strategy; label: string; note: string }[] = [
  { id: "base",         label: "BASE             ", note: "mua đầu tháng, luôn 1 chỉ" },
  { id: "boost",        label: "BOOST (đầu tháng)", note: "BOOST qty từ pct2y, mua ngay đầu tháng" },
  { id: "combo_early",  label: "COMBO-A (sớm)    ", note: "BOOST qty + mua ngay BH đầu tiên; không BH→đầu tháng" },
  { id: "combo_wait",   label: "COMBO-B (chờ)    ", note: "BOOST qty + chờ BH; không BH→cuối window (deadline)" },
  { id: "combo_bestbh", label: "COMBO-MAX (lý thuyết)", note: "BOOST qty + BH giá thấp nhất (nhìn lại — upper bound)" },
];

function report(label: string, wins: Window[]) {
  if (wins.length === 0) return;
  const results = STRATS.map(s => ({ ...s, r: simulate(wins, s.id) }));
  const baseAvg = results[0].r.avgCost;
  const bhMonths = wins.filter(w => w.bhFirst).length;

  console.log(`\n===== ${label} (${wins.length} tháng, BH bắn=${bhMonths} tháng/${wins.length} = ${Math.round(bhMonths/wins.length*100)}%) =====`);
  console.log("Chiến thuật           | giá vốn vs BASE | lượng/tháng | deadline% | note");
  for (const { label: lbl, r, note } of results) {
    const isBase = lbl === results[0].label;
    const costStr = isBase ? "    (chuẩn)  " : pct((baseAvg - r.avgCost) / baseAvg).padStart(13);
    const qtyStr = fmt(r.totalQty / r.months).padStart(10);
    const deadlineStr = `${Math.round(r.brakedMonths / r.months * 100)}%`.padStart(9);
    console.log(`${lbl} |${costStr}  | ${qtyStr} | ${deadlineStr} | ${note}`);
  }
}

const bearWins = windows.filter(w => w.anchor.inBear);
const bullWins = windows.filter(w => !w.anchor.inBear);

report("TOÀN LỊCH SỬ", windows);
report("BEAR THẬT (2013–2019, max DD 44%)", bearWins);
report("NGOÀI BEAR (bull / sideways)", bullWins);

// ---- spotlight: COMBO-A vs COMBO-B tháng 6/2026 ----
const jun26win = windows.find(w => w.anchor.date.startsWith("2026-06"));
if (jun26win) {
  const pp = jun26win.anchor.pricePct2y ?? 0.5;
  const qty = boostQty(pp);
  console.log(`\n-- Tháng 6/2026 (COMBO-A vs COMBO-B) --`);
  console.log(`  BOOST qty : pct2y=${Math.round(pp*100)}% → ${qty} chỉ`);
  if (jun26win.bhFirst) {
    console.log(`  BH bắn lần đầu : $${jun26win.bhFirst.price} → cả COMBO-A và COMBO-B mua ngày đó`);
    console.log(`  (so với đầu tháng $${jun26win.anchor.price}: tiết kiệm ${pct((jun26win.anchor.price-jun26win.bhFirst.price)/jun26win.anchor.price)})`);
  } else {
    console.log(`  BH KHÔNG bắn trong window`);
    console.log(`  COMBO-A → mua ngay đầu tháng $${jun26win.anchor.price} (${jun26win.anchor.date})`);
    console.log(`  COMBO-B → chờ hết tháng, mua cuối window $${jun26win.lastPrice}`);
    const diff = pct((jun26win.anchor.price - jun26win.lastPrice) / jun26win.anchor.price);
    console.log(`  Chênh lệch cuối vs đầu: ${diff} (${jun26win.lastPrice < jun26win.anchor.price ? "cuối rẻ hơn" : "đầu rẻ hơn"})`);
  }
}

// ---- phân tích COMBO-B: deadline rẻ hơn hay đắt hơn đầu tháng? ----
const noSignalWins = windows.filter(w => !w.bhFirst);
const deadlineCheaper = noSignalWins.filter(w => w.lastPrice < w.anchor.price).length;
console.log(`\n-- Khi BH không bắn (${noSignalWins.length} tháng): deadline có rẻ hơn đầu tháng không? --`);
console.log(`  Rẻ hơn : ${deadlineCheaper}/${noSignalWins.length} (${Math.round(deadlineCheaper/noSignalWins.length*100)}%)`);
console.log(`  Đắt hơn: ${noSignalWins.length - deadlineCheaper}/${noSignalWins.length} (${Math.round((noSignalWins.length-deadlineCheaper)/noSignalWins.length*100)}%)`);
const avgDiff = noSignalWins.reduce((s,w) => s + (w.anchor.price - w.lastPrice)/w.anchor.price, 0) / noSignalWins.length;
console.log(`  Chênh lệch TB: ${pct(avgDiff)} (dương = deadline rẻ hơn, âm = deadline đắt hơn)`);
