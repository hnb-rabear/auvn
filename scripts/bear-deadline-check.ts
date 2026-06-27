import { readFileSync } from "fs";
const tl = JSON.parse(readFileSync("public/data/timeline.json", "utf8"));
const pts = tl.points;
const BEAR_START = "2013-04-12", BEAR_END = "2019-08-13";
const STEP = 21;
let rollingMax = 0;
const dd = pts.map((p: any) => { if (p.price > rollingMax) rollingMax = p.price; return (rollingMax - p.price) / rollingMax; });
const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";

const noBH_bear: { diff: number; startPrice: number; endPrice: number; date: string }[] = [];
const noBH_bull: { diff: number }[] = [];

for (let i = 0; i < pts.length; i += STEP) {
  const anchor = pts[i];
  const inBear = anchor.date >= BEAR_START && anchor.date <= BEAR_END;
  const end = Math.min(i + STEP, pts.length) - 1;
  let hasBH = false;
  for (let j = i; j <= end; j++) {
    const cp = pts[j].cycleProb ?? -1;
    const sp = pts[j].swingProb ?? -1;
    if (cp >= 60 || sp >= 60) { hasBH = true; break; }
  }
  if (!hasBH) {
    const diff = (anchor.price - pts[end].price) / anchor.price;
    if (inBear) noBH_bear.push({ diff, startPrice: anchor.price, endPrice: pts[end].price, date: anchor.date });
    else noBH_bull.push({ diff });
  }
}

console.log("Câu hỏi: khi BH không bắn, đầu window (= mua sớm) vs cuối window (= chờ deadline)?");
console.log("(dương = cuối rẻ hơn đầu; âm = cuối đắt hơn đầu)\n");

const reportArr = (label: string, arr: { diff: number }[]) => {
  if (!arr.length) return;
  const cheaper = arr.filter(x => x.diff > 0).length;
  const avg = arr.reduce((s, x) => s + x.diff, 0) / arr.length;
  const med = [...arr].sort((a,b)=>a.diff-b.diff)[Math.floor(arr.length/2)].diff;
  console.log(`${label} (${arr.length} windows không có BH):`);
  console.log(`  Cuối RẺ hơn đầu : ${cheaper}/${arr.length} (${Math.round(cheaper/arr.length*100)}%)`);
  console.log(`  Cuối ĐẮT hơn đầu: ${arr.length-cheaper}/${arr.length} (${Math.round((arr.length-cheaper)/arr.length*100)}%)`);
  console.log(`  TB chênh lệch    : ${pct(avg)} | trung vị: ${pct(med)}`);
};

reportArr("BEAR (2013–2019)", noBH_bear);
reportArr("BULL / sideways  ", noBH_bull);

// Phân tích theo năm trong bear
console.log("\nTheo năm (bear, BH không bắn):");
for (const year of ["2013","2014","2015","2016","2017","2018","2019"]) {
  const yw = noBH_bear.filter(x => x.date.startsWith(year));
  if (!yw.length) continue;
  const cheaper = yw.filter(x => x.diff > 0).length;
  const avg = yw.reduce((s,x) => s+x.diff, 0) / yw.length;
  console.log(`  ${year}: ${cheaper}/${yw.length} tháng cuối rẻ hơn | TB ${pct(avg)}`);
}
