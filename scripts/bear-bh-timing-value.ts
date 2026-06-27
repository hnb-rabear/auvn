/**
 * BH timing có đáng không? So 2 chiến lược THỰC THI ĐƯỢC (không nhìn trước):
 *
 *   BUY_START : mỗi nhịp, mua ngay ngày đầu. Kệ BH.
 *   WAIT_BH   : mỗi nhịp, ôm tiền chờ. Ngày đầu tiên BH bắn → mua ngày đó.
 *               Hết nhịp không có BH → mua ngày cuối (deadline). KHÔNG nhìn trước.
 *
 * Cùng khối lượng 1 đơn vị/nhịp. Giá vốn TB capital-weighted. Thấp hơn = tốt.
 * Tách acute / normal bear / bull. Đây là test xem BH-timing-trong-nhịp có giá trị thật.
 *
 * Chạy: npx tsx scripts/bear-bh-timing-value.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const BEAR_START = "2013-04-12", BEAR_END = "2019-08-13";
const STEP = 21, ACUTE_THR = 0.03;

let rollingMax = 0;
const dd: number[] = [];
for (const p of pts) { if (p.price > rollingMax) rollingMax = p.price; dd.push((rollingMax - p.price) / rollingMax); }

interface Win {
  date: string;
  startPrice: number;   // ngày đầu nhịp (thực thi được: mua ngay)
  bhBuyPrice: number | null; // ngày BH ĐẦU TIÊN bắn (thực thi: mua ngay khi thấy)
  deadlinePrice: number; // ngày cuối nhịp (fallback khi không có BH)
  isAcute: boolean;
  inBear: boolean;
}

let prevDd = 0;
const wins: Win[] = [];
for (let i = 0; i < pts.length; i += STEP) {
  const end = Math.min(i + STEP, pts.length) - 1;
  const ddCh = dd[i] - prevDd;
  const inBear = pts[i].date >= BEAR_START && pts[i].date <= BEAR_END;
  let bhBuyPrice: number | null = null;
  for (let j = i; j <= end; j++) {
    const cp = pts[j].cycleProb ?? -1, sp = pts[j].swingProb ?? -1;
    if (cp >= 60 || sp >= 60) { bhBuyPrice = pts[j].price; break; } // ĐẦU TIÊN, mua ngay
  }
  wins.push({
    date: pts[i].date,
    startPrice: pts[i].price,
    bhBuyPrice,
    deadlinePrice: pts[end].price,
    isAcute: inBear && ddCh > ACUTE_THR,
    inBear,
  });
  prevDd = dd[i];
}

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";

// giá vốn capital-weighted: 1 đơn vị/nhịp
function avgCost(seg: Win[], priceOf: (w: Win) => number): number {
  let v = 0, l = 0;
  for (const w of seg) { v += 1; l += 1 / priceOf(w); }
  return v / l;
}

function analyze(label: string, seg: Win[]) {
  if (!seg.length) return;
  const nBH = seg.filter(w => w.bhBuyPrice !== null).length;
  // BUY_START: luôn mua startPrice
  const start = avgCost(seg, w => w.startPrice);
  // WAIT_BH: bhBuyPrice nếu có, else deadlinePrice (thực thi được, không nhìn trước)
  const waitBH = avgCost(seg, w => w.bhBuyPrice ?? w.deadlinePrice);
  console.log(`\n===== ${label} (${seg.length} nhịp, BH bắn ${nBH} = ${Math.round(nBH/seg.length*100)}%) =====`);
  console.log(`  BUY_START (mua đầu nhịp)        : ${start.toFixed(1)}  (chuẩn)`);
  console.log(`  WAIT_BH   (chờ BH, fallback cuối): ${waitBH.toFixed(1)}  ${pct((start - waitBH) / start)} (dương = WAIT_BH rẻ hơn)`);
}

const acute = wins.filter(w => w.isAcute);
const normalBear = wins.filter(w => w.inBear && !w.isAcute);
const bull = wins.filter(w => !w.inBear);
const allBear = wins.filter(w => w.inBear);

analyze("ACUTE BEAR", acute);
analyze("BEAR BÌNH THƯỜNG", normalBear);
analyze("TOÀN BEAR", allBear);
analyze("BULL/SIDEWAYS", bull);

console.log("\n==== KẾT LUẬN ====");
console.log("WAIT_BH rẻ hơn BUY_START? Nếu ~0 hoặc âm → BH-timing-trong-nhịp KHÔNG đáng, bỏ.");
