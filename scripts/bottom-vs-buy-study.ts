/**
 * Săn đáy vs Điểm mua — phân tích quan hệ thời điểm giữa hai lớp tín hiệu.
 *
 * Trả lời câu hỏi của người dùng: "đáy xuất hiện trước hay điểm mua xuất hiện
 * trước, và chúng có trùng nhau không?". Chạy trên dữ liệu ĐÃ commit:
 *   - public/data/timeline.json   (composite + zone thế giới theo lưới backtest)
 *   - public/data/bottom.json     (confirmedBottoms = nơi gauge săn đáy đạt đỉnh)
 *
 * Lưu ý phương pháp (xem mục tương ứng trong docs/bottom.md):
 *   1. Composite trong timeline là composite THẾ GIỚI (không có premium VN — chưa
 *      đủ lịch sử backtest). So với săn đáy (cũng thuần XAU) là cùng vũ trụ.
 *   2. Không tính lại gauge săn đáy theo ngày được offline (fetch XAU daily bị
 *      chặn), nên dùng confirmedBottoms làm đại diện cho "nơi gauge đạt đỉnh" —
 *      hợp lý vì gauge được validate quanh chính các đáy đó (docs/bottom.md).
 *
 * Chạy: npx tsx scripts/bottom-vs-buy-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DATA = join(process.cwd(), "public", "data");
type Pt = { date: string; price: number; composite: number; zone: "buy" | "neutral" | "sell" };
const tl: Pt[] = JSON.parse(readFileSync(join(DATA, "timeline.json"), "utf8")).points;
const bottom = JSON.parse(readFileSync(join(DATA, "bottom.json"), "utf8"));

const ms = (d: string) => new Date(d).getTime();
const dayDiff = (a: string, b: string) => Math.round((ms(a) - ms(b)) / 86_400_000);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);

const gd = tl.map((p) => p.date);
const idxOnOrBefore = (date: string) => {
  let r = -1;
  for (let i = 0; i < gd.length; i++) {
    if (gd[i] <= date) r = i;
    else break;
  }
  return r;
};
const nearest = (date: string) => {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < gd.length; i++) {
    const x = Math.abs(dayDiff(gd[i], date));
    if (x < bd) { bd = x; bi = i; }
  }
  return bi;
};

function tierBottoms(tier: "cycle" | "swing"): string[] {
  return [...new Set(bottom.confirmedBottoms.filter((b: any) => b.tier === tier).map((b: any) => b.date as string))].sort() as string[];
}

console.log(`Lưới timeline: ${tl.length} điểm, ${gd[0]} → ${gd[gd.length - 1]}\n`);

// (1) Zone của composite TẠI mỗi đáy đã xác nhận + lead time nếu composite có vào MUA trước đáy.
for (const [tier, lookback] of [["cycle", 252], ["swing", 120]] as const) {
  const dates = tierBottoms(tier).filter((B) => B >= gd[0] && B <= gd[gd.length - 1]);
  const zoneAt = { buy: 0, neutral: 0, sell: 0 };
  const leads: number[] = [];
  let buyBefore = 0;
  let compSum = 0;
  for (const B of dates) {
    const ni = nearest(B);
    zoneAt[tl[ni].zone]++;
    compSum += tl[ni].composite;
    const bi = idxOnOrBefore(B);
    for (let i = 0; i <= bi; i++) {
      if (dayDiff(B, gd[i]) > lookback) continue;
      if (tl[i].zone === "buy") { buyBefore++; leads.push(dayDiff(B, gd[i])); break; }
    }
  }
  console.log(`===== ${tier.toUpperCase()} — ${dates.length} đáy (lookback ${lookback} ngày) =====`);
  console.log(`  Zone composite TẠI đáy: ${JSON.stringify(zoneAt)}`);
  console.log(`  Composite trung bình tại đáy: ${(compSum / dates.length).toFixed(1)}`);
  console.log(`  Composite đã ở vùng MUA trước đáy: ${buyBefore}/${dates.length}` + (leads.length ? ` (lead median ${median(leads)} ngày)` : ""));
}

// (2) Mỗi điểm-lưới ở vùng MUA nằm trước hay sau đáy chu kỳ gần nhất.
const cyc = tierBottoms("cycle");
const buyPts = tl.filter((p) => p.zone === "buy");
const offsets = buyPts.map((p) => {
  let best = NaN, ba = Infinity;
  for (const B of cyc) {
    const x = dayDiff(p.date, B);
    if (Math.abs(x) < ba) { ba = Math.abs(x); best = x; }
  }
  return best;
});
const after = offsets.filter((x) => x > 0).length;
const before = offsets.filter((x) => x < 0).length;
console.log(`\n===== Vùng MUA của composite (${buyPts.length}/${tl.length} điểm = ${Math.round((buyPts.length / tl.length) * 100)}%) =====`);
console.log(`  So với đáy chu kỳ gần nhất: SAU ${after} | TRƯỚC ${before} | offset median ${median(offsets)} ngày, khoảng ${Math.min(...offsets)}..${Math.max(...offsets)}`);
const comps = tl.map((p) => p.composite).sort((a, b) => a - b);
console.log(`  Composite lịch sử: min ${comps[0]} | median ${median(comps)} | max ${comps[comps.length - 1]}`);
console.log(`\nKết luận: săn đáy và điểm mua bật ở HAI chế độ khác nhau — tại đáy nhọn composite ~trung tính, vùng MUA hiếm (≈3%) và rải rác, không bám đáy.`);
