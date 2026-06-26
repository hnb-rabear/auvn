/**
 * What-if BOOST: gom MẠNH khi rẻ. Thước đo TRUNG LẬP VỐN = giá vốn TB (ΣVND/Σlượng)
 * và lời/đồng = giá_cuối / giá_vốn. (Không dùng "tài sản cuối" vì BOOST tiêu nhiều
 * vốn hơn → so tài sản là gian lận.) Cải thiện giá vốn = (flat−strat)/flat, dương=rẻ hơn.
 * Chia train<2019 / test>=2019 như scripts/accumulation-study.ts.
 *
 *   FLAT          : ×1 luôn
 *   BOOST<70 (x2) : pp<0.70 → ×2, còn lại ×1   — ý người dùng
 *   BOOST<70 (x3) : pp<0.70 → ×3
 *   COMBO         : pp<0.70 → ×2, pp>0.75 → ×0.25, giữa ×1  (boost rẻ + phanh đắt)
 *
 * Chạy: npx tsx scripts/accumulation-boost-whatif.ts
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
const WIN = 504, STEP = 21, SPLIT = "2019-01-01";

function pricePct(i: number): number | null {
  if (i < WIN) return null;
  let below = 0;
  for (let j = i - WIN; j < i; j++) if (price[j] <= price[i]) below++;
  return below / WIN;
}

type Weighter = (pp: number) => number;
const STRATS: { name: string; w: Weighter }[] = [
  { name: "FLAT          ", w: () => 1 },
  { name: "BOOST<70 (x2) ", w: (pp) => (pp < 0.70 ? 2 : 1) },
  { name: "BOOST<70 (x3) ", w: (pp) => (pp < 0.70 ? 3 : 1) },
  { name: "COMBO boost+phanh", w: (pp) => (pp < 0.70 ? 2 : pp > 0.75 ? 0.25 : 1) },
];

// giá vốn capital-weighted cho list index, hàm trọng số w
function avgCost(idxs: number[], w: Weighter): number {
  let v = 0, l = 0;
  for (const i of idxs) {
    const pp = pricePct(i);
    if (pp === null) continue;
    const wt = w(pp);
    v += wt;
    l += wt / price[i];
  }
  return l > 0 ? v / l : 0;
}

const monthly: number[] = [];
for (let i = 0; i < P.length; i += STEP) monthly.push(i);
const has = (i: number) => pricePct(i) !== null;
const train = monthly.filter((i) => has(i) && dates[i] < SPLIT);
const test = monthly.filter((i) => has(i) && dates[i] >= SPLIT);

function impr(idxs: number[], w: Weighter): number {
  const flat = avgCost(idxs, () => 1);
  return (flat - avgCost(idxs, w)) / flat; // dương = rẻ hơn flat
}
const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";

console.log(`train n=${train.length} (${dates[train[0]]}→) | test n=${test.length} (${dates[test[0]]}→)`);
console.log("\nCải thiện GIÁ VỐN vs FLAT (dương = mua rẻ hơn TB, trung lập vốn):\n");
console.log("chiến lược          | train     | test");
for (const s of STRATS) {
  console.log(`${s.name.padEnd(18)} | ${pct(impr(train, s.w)).padStart(8)} | ${pct(impr(test, s.w)).padStart(8)}`);
}
// ---- PLACEBO: boost ×2 vào k tháng NGẪU NHIÊN (k = số tháng <70% thật) ----
// Nếu BOOST<70 ≈ placebo → tín hiệu percentile vô dụng, "lợi" chỉ là tiêu thêm vốn lúc trend lên.
function boostRandom(idxs: number[], k: number, seed: number): number {
  const rand = seededRandom(seed);
  const order = idxs.map((i) => ({ i, r: rand() })).sort((a, b) => a.r - b.r);
  const boosted = new Set(order.slice(0, k).map((o) => o.i));
  const w: Weighter = () => 1; // không dùng pp
  const flat = avgCost(idxs, () => 1);
  // tính trực tiếp: ×2 cho tháng được chọn ngẫu nhiên
  let v = 0, l = 0;
  for (const i of idxs) {
    const wt = boosted.has(i) ? 2 : 1;
    v += wt;
    l += wt / price[i];
    void w;
  }
  return (flat - v / l) / flat;
}
const kTrain = train.filter((i) => (pricePct(i) as number) < 0.7).length;
const kTest = test.filter((i) => (pricePct(i) as number) < 0.7).length;
console.log(`\nPlacebo BOOST×2 vào ${kTrain}/${kTest} tháng NGẪU NHIÊN (= số tháng <70% thật), 5 seed:`);
for (const s of [1, 2, 3, 4, 5]) {
  console.log(`  seed ${s}: train ${pct(boostRandom(train, kTrain, s * 101)).padStart(8)} | test ${pct(boostRandom(test, kTest, s * 211)).padStart(8)}`);
}
console.log(
  "\nĐọc: nếu BOOST<70 ≈ placebo → 'rẻ so dải 2 năm' KHÔNG có kỹ năng, lợi chỉ là đòn bẩy lên xu hướng tăng dài hạn (mua nhiều hơn = lời hơn KHI vàng lên, lỗ hơn KHI vàng xuống)."
);
