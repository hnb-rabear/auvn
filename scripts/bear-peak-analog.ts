/**
 * Phân tích analog: từ các đỉnh ATH lịch sử, sau đó giá rơi sâu bao nhiêu và bao lâu mới hồi?
 * Mục đích: cho thấy DẢI KỊCH BẢN (không phải dự đoán). n quá nhỏ để dự báo xu hướng.
 *
 * Bối cảnh: người dùng muốn "dự đoán chu kỳ dài từ đỉnh 5300". Script này chứng minh
 * vì sao KHÔNG làm được — chỉ có 3 sự kiện đỉnh-rồi-rơi≥15% trong toàn lịch sử, kết quả
 * trải cực rộng (−21%..−44%, hồi 40..107 tháng). Dự án: "No prediction claims".
 *
 * Chạy: npx tsx scripts/bear-peak-analog.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const prices = pts.map((p) => p.price);
const STEP = 21;

// Đỉnh = ngày lập ATH-tại-thời-điểm, sau đó rơi >=15% (mỗi đỉnh tính 1 lần)
let runMax = 0, runMaxI = -1;
interface Ev { peakI: number; peakDate: string; peakPrice: number; }
const events: Ev[] = [];
for (let i = 0; i < prices.length; i++) {
  if (prices[i] >= runMax) { runMax = prices[i]; runMaxI = i; }
  else {
    const dd = (runMax - prices[i]) / runMax;
    if (dd >= 0.15 && (!events.length || events[events.length - 1].peakI !== runMaxI)) {
      events.push({ peakI: runMaxI, peakDate: pts[runMaxI].date, peakPrice: runMax });
    }
  }
}

console.log(`Các đỉnh ATH rồi rơi ≥15% trong toàn lịch sử: n=${events.length}\n`);
console.log("Đỉnh | giá | đáy sâu nhất | thời gian tới đáy | hồi lại đỉnh");
for (const e of events) {
  let trough = e.peakPrice, troughI = e.peakI;
  for (let j = e.peakI; j < prices.length; j++) {
    if (prices[j] < trough) { trough = prices[j]; troughI = j; }
    if (prices[j] >= e.peakPrice && j > e.peakI) break;
  }
  let recI = -1;
  for (let j = e.peakI + 1; j < prices.length; j++) { if (prices[j] >= e.peakPrice) { recI = j; break; } }
  const maxDD = (e.peakPrice - trough) / e.peakPrice;
  const moTrough = ((troughI - e.peakI) / STEP).toFixed(0);
  const moRec = recI < 0 ? "CHƯA" : ((recI - e.peakI) / STEP).toFixed(0) + " tháng";
  console.log(`  ${e.peakDate} $${e.peakPrice.toFixed(0)} | -${(maxDD * 100).toFixed(0)}% | ~${moTrough} tháng | ${moRec}`);
}

console.log("\nKẾT LUẬN: n=3, kết quả trải -21%..-44% và hồi 40..107 tháng → KHÔNG dự đoán được");
console.log("đỉnh 2026 sẽ đi đường nào. Mô hình 4-pha PHẢN ỨNG theo dữ liệu, không dự báo.");
