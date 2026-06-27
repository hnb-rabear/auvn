/**
 * Backtest 2 quyết định taxonomy (không nhìn trước):
 *   Q1: Giai đoạn TĂNG (bull) — gom lệch (BOOST) hay gom đều (FLAT)?
 *   Q2: "HỒI PHỤC" có phải giai đoạn riêng đáng tách, hay gộp vào bear-grind?
 *
 * Phân loại 4 giai đoạn — CHỈ DÙNG QUÁ KHỨ (dd rolling ATH + ddChange 21 phiên):
 *   BULL     : dd < 15%
 *   ACUTE    : dd >= 15% AND ddChange > +3pp   (dd phình nhanh = đang rơi mạnh)
 *   RECOVERY : dd >= 15% AND ddChange < -3pp   (dd co nhanh = đang hồi lên)
 *   GRIND    : dd >= 15% AND |ddChange| <= 3pp (rỉ máu chậm / đi ngang dưới đỉnh)
 *
 * Báo CẢ HAI thước đo cho mỗi (giai đoạn × chiến thuật):
 *   - avgCost vs FLAT (capital-weighted): thấp hơn = mua rẻ hơn TB
 *   - wealthVsFlat: ngân sách 1/tháng, tiền dư để mặt, tài sản cuối = vàng×giá_cuối_đoạn + tiền mặt
 *     (cao hơn = giàu hơn THẬT — bắt được lỗi "gom ít trong uptrend")
 *
 * Chạy: npx tsx scripts/bear-phase-taxonomy-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const STEP = 21, ACUTE = 0.03;

let mx = 0;
const dd: number[] = [];
for (const p of pts) { if (p.price > mx) mx = p.price; dd.push((mx - p.price) / mx); }

type Phase = "BULL" | "ACUTE" | "RECOVERY" | "GRIND";
interface Win { date: string; price: number; pct2y: number; dd: number; ddChange: number; phase: Phase; }

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
  wins.push({ date: pts[i].date, price: pts[i].price, pct2y: pts[i].pricePct2y ?? 0.5, dd: curDd, ddChange, phase });
  prevDd = curDd;
}

// ---- chiến thuật khối lượng ----
const FLAT    = (_w: Win) => 1.0;
const BOOST   = (w: Win) => w.pct2y < 0.25 ? 1.5 : w.pct2y < 0.50 ? 1.0 : w.pct2y < 0.75 ? 0.75 : 0.5;
const DEPTH   = (w: Win) => w.dd >= 0.40 ? 1.5 : w.dd >= 0.25 ? 1.0 : w.dd >= 0.15 ? 0.75 : 0.5;
const RECMOM  = (w: Win) => 1.5; // hồi phục: gom mạnh (momentum — giá đang lên từ đáy)
const HALF    = (_w: Win) => 0.5; // gom dè (đối chứng cho bull đắt)

type Strat = (w: Win) => number;

// avg cost capital-weighted
function avgCost(seg: Win[], q: Strat): number {
  let v = 0, l = 0;
  for (const w of seg) { const x = q(w); v += x; l += x / w.price; }
  return v / l;
}
// wealth: ngân sách 1/tháng, mua q(w) (≤... có thể >1), phần (1-q) để mặt nếu q<1; nếu q>1 thì vay phần dư (cash âm)
// tài sản cuối = vàng × giá cuối đoạn + tiền mặt còn lại
function wealth(seg: Win[], q: Strat): number {
  let gold = 0, cash = 0;
  for (const w of seg) { const x = q(w); gold += x / w.price; cash += (1 - x); }
  const endPrice = seg[seg.length - 1].price;
  return gold * endPrice + cash;
}

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";

function report(phase: Phase, strats: [string, Strat][]) {
  const seg = wins.filter(w => w.phase === phase);
  if (!seg.length) { console.log(`\n${phase}: (0 nhịp)`); return; }
  const flatCost = avgCost(seg, FLAT);
  const flatWealth = wealth(seg, FLAT);
  console.log(`\n===== ${phase} (${seg.length} nhịp, ${seg[0].date}…${seg[seg.length-1].date}) =====`);
  console.log("chiến thuật | giá vốn vs FLAT | tài sản cuối vs FLAT | spent/tháng");
  for (const [name, q] of strats) {
    const c = avgCost(seg, q), w = wealth(seg, q);
    const spent = seg.reduce((s, x) => s + q(x), 0) / seg.length;
    const isFlat = name === "FLAT";
    console.log(`  ${name.padEnd(8)} | ${isFlat ? "    (chuẩn)  " : pct((flatCost - c) / flatCost).padStart(13)} | ${isFlat ? "    (chuẩn)  " : pct((w - flatWealth) / flatWealth).padStart(13)} | ${spent.toFixed(2)}`);
  }
}

console.log("Phân bố giai đoạn:", (["BULL","ACUTE","RECOVERY","GRIND"] as Phase[]).map(p => `${p}=${wins.filter(w=>w.phase===p).length}`).join(" "));

report("BULL",     [["FLAT", FLAT], ["BOOST", BOOST], ["HALF", HALF]]);
report("ACUTE",    [["FLAT", FLAT], ["DEPTH", DEPTH], ["BOOST", BOOST]]);
report("RECOVERY", [["FLAT", FLAT], ["RECMOM", RECMOM], ["BOOST", BOOST], ["DEPTH", DEPTH]]);
report("GRIND",    [["FLAT", FLAT], ["BOOST", BOOST], ["DEPTH", DEPTH]]);

console.log("\n==== ĐỌC ====");
console.log("Q1 BULL : nếu BOOST giá vốn dương nhưng tài sản ÂM → gom lệch hại; FLAT thắng.");
console.log("Q2 RECOVERY: nếu RECMOM/DEPTH thắng rõ FLAT & khác hẳn GRIND → tách riêng đáng. Nếu ~ GRIND → gộp.");
