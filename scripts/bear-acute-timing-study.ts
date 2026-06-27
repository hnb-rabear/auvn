/**
 * Timing study trong giai đoạn ACUTE BEAR (ddChange > 3pp/tháng):
 * So 3 thời điểm mua trong cùng một window:
 *   EARLY   : mua ngay đầu window (ngày 1)
 *   LATE    : mua cuối window (ngày 21 — deadline)
 *   BH_FIRST: mua ngày BH bắn đầu tiên trong window (nếu không có BH → EARLY)
 *   BH_LAST : mua ngày BH bắn cuối cùng trong window (nếu không có BH → LATE)
 *
 * Chạy: npx tsx scripts/bear-acute-timing-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const BEAR_START = "2013-04-12", BEAR_END = "2019-08-13";
const STEP = 21, ACUTE_THR = 0.03;

let rollingMax = 0;
const dd: number[] = [];
for (const p of pts) {
  if (p.price > rollingMax) rollingMax = p.price;
  dd.push((rollingMax - p.price) / rollingMax);
}

interface Win {
  date: string;
  earlyPrice: number;   // giá ngày đầu window
  latePrice: number;    // giá ngày cuối window
  bhFirstPrice: number | null;  // BH ngày đầu tiên
  bhLastPrice: number | null;   // BH ngày cuối cùng
  isAcute: boolean;
  ddChange: number;
  inBear: boolean;
}

let prevDd = 0;
const wins: Win[] = [];
for (let i = 0; i < pts.length; i += STEP) {
  const end = Math.min(i + STEP, pts.length) - 1;
  const curDd = dd[i];
  const ddChange = curDd - prevDd;
  const inBear = pts[i].date >= BEAR_START && pts[i].date <= BEAR_END;

  let bhFirstPrice: number | null = null;
  let bhLastPrice: number | null = null;
  for (let j = i; j <= end; j++) {
    const cp = pts[j].cycleProb ?? -1;
    const sp = pts[j].swingProb ?? -1;
    if (cp >= 60 || sp >= 60) {
      if (bhFirstPrice === null) bhFirstPrice = pts[j].price;
      bhLastPrice = pts[j].price;
    }
  }

  wins.push({
    date: pts[i].date,
    earlyPrice: pts[i].price,
    latePrice: pts[end].price,
    bhFirstPrice, bhLastPrice,
    isAcute: inBear && ddChange > ACUTE_THR,
    ddChange, inBear,
  });
  prevDd = curDd;
}

const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";

function analyze(label: string, seg: Win[]) {
  if (!seg.length) return;
  const n = seg.length;
  const nBH = seg.filter(w => w.bhFirstPrice !== null).length;

  // Giá cuối vs đầu (không tính BH)
  const lateVsEarly = seg.map(w => (w.earlyPrice - w.latePrice) / w.earlyPrice); // dương = cuối rẻ hơn
  const avgLate = lateVsEarly.reduce((a, b) => a + b, 0) / n;
  const cheaperLate = lateVsEarly.filter(x => x > 0).length;

  // Giá vốn TB (capital-weighted) cho từng chiến lược
  const costOf = (priceOf: (w: Win) => number) => {
    let v = 0, l = 0;
    for (const w of seg) { v += 1; l += 1 / priceOf(w); }
    return v / l;
  };

  const earlyAvg = costOf(w => w.earlyPrice);
  const lateAvg  = costOf(w => w.latePrice);
  const bhFirstAvg = costOf(w => w.bhFirstPrice ?? w.earlyPrice); // no BH → EARLY
  const bhLastAvg  = costOf(w => w.bhLastPrice ?? w.latePrice);  // no BH → LATE

  console.log(`\n===== ${label} (${n} tháng, BH=${nBH}) =====`);
  console.log(`Cuối tháng RẺ hơn đầu: ${cheaperLate}/${n} (${Math.round(cheaperLate/n*100)}%) | TB chênh: ${pct(avgLate)} (dương=cuối rẻ)`);
  console.log(`Giá vốn TB (thấp hơn = tốt):`);
  console.log(`  EARLY   (mua đầu tháng)      : ${earlyAvg.toFixed(1)} (chuẩn)`);
  console.log(`  LATE    (mua cuối tháng)      : ${lateAvg.toFixed(1)} | ${pct((earlyAvg-lateAvg)/earlyAvg)}`);
  console.log(`  BH_FIRST (BH đầu, không BH→sớm) : ${bhFirstAvg.toFixed(1)} | ${pct((earlyAvg-bhFirstAvg)/earlyAvg)}`);
  console.log(`  BH_LAST  (BH cuối, không BH→muộn): ${bhLastAvg.toFixed(1)} | ${pct((earlyAvg-bhLastAvg)/earlyAvg)}`);

  // Phân tích theo năm nếu là bear
  if (seg[0]?.inBear) {
    console.log(`\n  Theo năm:`);
    for (const yr of ["2013","2014","2015","2016","2017","2018","2019"]) {
      const yw = seg.filter(w => w.date.startsWith(yr));
      if (!yw.length) continue;
      const avg = yw.map(w => (w.earlyPrice - w.latePrice) / w.earlyPrice).reduce((a,b)=>a+b,0)/yw.length;
      const ch = yw.filter(w => w.latePrice < w.earlyPrice).length;
      console.log(`    ${yr}: cuối rẻ hơn ${ch}/${yw.length} | TB ${pct(avg)}`);
    }
  }
}

const acuteWins = wins.filter(w => w.isAcute);
const normalBearWins = wins.filter(w => w.inBear && !w.isAcute);
const bullWins = wins.filter(w => !w.inBear);

analyze("ACUTE BEAR (ddChange>3pp/tháng)", acuteWins);
analyze("BEAR BÌNH THƯỜNG", normalBearWins);
analyze("BULL/SIDEWAYS", bullWins);

console.log("\n==== KẾT LUẬN ====");
console.log("Cấp tính: cuối tháng rẻ hơn đầu nhiều không? BH_LAST hay LATE tốt hơn EARLY?");
