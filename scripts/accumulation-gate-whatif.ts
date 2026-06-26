/**
 * What-if: so 4 chiến lược DCA trên CÙNG ngân sách cố định mỗi tháng (=1 đơn vị/tháng).
 *   FLAT      : tháng nào cũng gom đủ (×1)
 *   PHANH     : >p75 → ×0.25 (sàn, không về 0) — engine hiện tại
 *   GATE<75   : <p75 mua đủ, ≥p75 mua 0 (cắt hẳn)
 *   GATE<70   : <p70 mua đủ, ≥p70 mua 0 (cắt hẳn) — ý người dùng
 *
 * Tiền không tiêu được GIỮ LẠI dạng mặt (không sinh lời). Báo cả 3 mặt:
 *   giá vốn TB (ΣVND/Σlượng), TỔNG lượng gom được, TÀI SẢN cuối (lượng×giá cuối + tiền mặt dư).
 * Đọc: GATE hạ giá vốn nhưng gom ít vàng — nhìn tài sản cuối mới thấy đánh đổi thật.
 *
 * Chạy: npx tsx scripts/accumulation-gate-whatif.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "../src/lib/types";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const P = tl.points;
const price = P.map((p) => p.price);
const dates = P.map((p) => p.date);
const WIN = 504, STEP = 21;

function pricePct(i: number): number | null {
  if (i < WIN) return null;
  let below = 0;
  for (let j = i - WIN; j < i; j++) if (price[j] <= price[i]) below++;
  return below / WIN;
}

type Weighter = (pp: number) => number;
const STRATS: { name: string; w: Weighter }[] = [
  { name: "FLAT (gom đủ luôn)   ", w: () => 1 },
  { name: "PHANH (>75%→x0.25)   ", w: (pp) => (pp > 0.75 ? 0.25 : 1) },
  { name: "GATE<75 (≥75%→mua 0) ", w: (pp) => (pp < 0.75 ? 1 : 0) },
  { name: "GATE<70 (≥70%→mua 0) ", w: (pp) => (pp < 0.70 ? 1 : 0) },
];

function run(idxs: number[], w: Weighter) {
  let spent = 0, gold = 0, cash = 0;
  for (const i of idxs) {
    const pp = pricePct(i);
    if (pp === null) continue;
    const wt = w(pp); // phần ngân sách 1 đem mua
    spent += wt;
    gold += wt / price[i];
    cash += 1 - wt; // phần giữ mặt
  }
  const last = price[idxs[idxs.length - 1]];
  const avgCost = gold > 0 ? spent / gold : 0;
  const wealth = gold * last + cash; // tài sản cuối / tổng ngân sách
  return { avgCost, gold, spent, cash, wealth };
}

function report(title: string, idxs: number[]) {
  const months = idxs.filter((i) => pricePct(i) !== null);
  console.log(`\n===== ${title} (${months.length} tháng, ngân sách 1/tháng = ${months.length}) =====`);
  console.log("chiến lược            | giá vốn  | lượng gom | đã tiêu | tài sản cuối | vs FLAT");
  const flat = run(months, STRATS[0].w);
  for (const s of STRATS) {
    const r = run(months, s.w);
    const dCost = ((r.avgCost / flat.avgCost - 1) * 100).toFixed(1);
    const dWealth = ((r.wealth / flat.wealth - 1) * 100).toFixed(1);
    console.log(
      `${s.name} | ${r.avgCost.toFixed(1).padStart(7)} | ${r.gold.toFixed(4).padStart(8)} | ${r.spent
        .toFixed(0)
        .padStart(6)} | ${r.wealth.toFixed(1).padStart(11)} | giá vốn ${dCost}%, tài sản ${dWealth}%`
    );
  }
}

const monthly: number[] = [];
for (let i = 0; i < P.length; i += STEP) monthly.push(i);
const lastDate = dates[dates.length - 1];
const cut2y = new Date(new Date(lastDate).getTime() - 730 * 86400000).toISOString().slice(0, 10);

report("TOÀN LỊCH SỬ", monthly);
report("~2 NĂM GẦN NHẤT", monthly.filter((i) => dates[i] >= cut2y));
console.log(
  "\nĐọc: 'giá vốn' thấp hơn = mua được giá rẻ hơn TRUNG BÌNH. 'tài sản cuối' cao hơn = giàu hơn THẬT."
);
