/**
 * THĂM DÒ (không commit): lợi suất thực (DFII10) làm NEO ĐỊNH-GIÁ nhiều năm cho phanh
 * DCA — có bền hơn / cộng thêm vào VAL percentile + composite không? Cần mạng (FRED).
 * Thước đo & cổng giống accumulation-study.ts (realized 3y cost, train<2019/test>=2019).
 *
 * Chạy: npx tsx scripts/accumulation-ryield.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline } from "../src/lib/types";
import { fetchRealYield } from "./fetch";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const P = tl.points;
const price = P.map((p) => p.price);
const dates = P.map((p) => p.date);
const SPLIT = "2019-01-01";
const STEP = 21;
const VAL_WIN = 756;

function pctRankTrailing(arr: (number | null)[], i: number, win: number): number | null {
  if (i < win) return null;
  const cur = arr[i];
  if (cur === null) return null;
  let below = 0,
    seen = 0;
  for (let j = i - win; j < i; j++) {
    if (arr[j] === null) continue;
    seen++;
    if ((arr[j] as number) <= cur) below++;
  }
  return seen < win * 0.5 ? null : below / seen;
}

async function main() {
  const ry = await fetchRealYield();
  if (!ry) {
    console.error("THIẾU DFII10 (mạng/FRED lỗi) — dừng.");
    process.exit(1);
  }
  const rb = [...ry.bars].sort((a, b) => (a.date < b.date ? -1 : 1));
  console.log(`DFII10: ${rb.length} điểm, ${rb[0].date} → ${rb[rb.length - 1].date}`);

  // forward-fill real yield lên từng ngày timeline (latest <= date)
  const ryAligned: (number | null)[] = [];
  let s = 0;
  for (let i = 0; i < dates.length; i++) {
    while (s + 1 < rb.length && rb[s + 1].date <= dates[i]) s++;
    ryAligned.push(rb.length && rb[s].date <= dates[i] ? rb[s].close : null);
  }
  const cov = ryAligned.filter((x) => x !== null).length;
  console.log(`Phủ lên timeline: ${cov}/${dates.length} ngày\n`);

  // features
  const valArr = price.map((_, i) => pctRankTrailing(price, i, VAL_WIN)); // pctRank giá; thấp=rẻ
  const ryPctArr = ryAligned.map((_, i) => pctRankTrailing(ryAligned, i, VAL_WIN)); // pctRank ry; cao=ry cao=vàng đắt

  interface Row {
    i: number;
    date: string;
    valA: number | null; // 1=rẻ
    ryA: number | null; // 1=ry thấp=vàng hấp dẫn
    ryLevel: number | null;
    comp: number;
  }
  const rows: Row[] = [];
  for (let i = 0; i < P.length; i += STEP) {
    rows.push({
      i,
      date: dates[i],
      valA: valArr[i] === null ? null : 1 - (valArr[i] as number),
      ryA: ryPctArr[i] === null ? null : 1 - (ryPctArr[i] as number),
      ryLevel: ryAligned[i],
      comp: P[i].composite,
    });
  }

  function sim(sub: Row[], fn: (r: Row) => number | null) {
    let fV = 0,
      fL = 0,
      tV = 0,
      tL = 0,
      n = 0;
    for (const r of sub) {
      const m = fn(r);
      if (m === null) continue;
      fV += 1;
      fL += 1 / price[r.i];
      tV += m;
      tL += m / price[r.i];
      n++;
    }
    if (n < 12) return null;
    return { n, impr: (fV / fL - tV / tL) / (fV / fL) };
  }
  const pct = (x: number) => (x * 100).toFixed(2) + "%";
  const brakeVal = (r: Row) => (r.valA === null ? 1 : r.valA < 0.33 ? 0.25 : 1);
  const brakeRyPct = (r: Row) => (r.ryA === null ? null : r.ryA < 0.33 ? 0.25 : 1);
  const brakeComp = (r: Row) => (r.comp < -30 ? 0.5 : 1);

  const schemes: [string, (r: Row) => number | null][] = [
    ["VAL-brake (mốc)", brakeVal],
    ["VAL-brake × tránh-bán(comp) (mốc tốt nhất)", (r) => brakeVal(r) * brakeComp(r)],
    ["RY-brake percentile (ryA<0.33→x0.25)", brakeRyPct],
    ["RY-brake mức tuyệt đối (ry>1.0%→x0.5, >1.5%→x0.25)", (r) =>
      r.ryLevel === null ? null : r.ryLevel > 1.5 ? 0.25 : r.ryLevel > 1.0 ? 0.5 : 1],
    ["VAL-brake × RY-brake(pct)", (r) => {
      const b = brakeRyPct(r);
      return b === null ? null : brakeVal(r) * b;
    }],
    ["VAL × comp × RY(pct) — full stack", (r) => {
      const b = brakeRyPct(r);
      return b === null ? null : brakeVal(r) * brakeComp(r) * b;
    }],
  ];
  console.log("Realized 3y cost (chuẩn hóa cùng tổng vốn), train<2019 / test>=2019:\n");
  for (const [name, fn] of schemes) {
    const tr = sim(rows.filter((r) => r.date < SPLIT), fn);
    const te = sim(rows.filter((r) => r.date >= SPLIT), fn);
    if (!tr || !te) {
      console.log(`${name.padEnd(48)}: thiếu mẫu`);
      continue;
    }
    const pass = tr.impr > 0 && te.impr > 0 ? "PASS" : "----";
    console.log(
      `${name.padEnd(48)} | train ${pct(tr.impr).padStart(7)} (n=${tr.n}) | test ${pct(
        te.impr
      ).padStart(7)} (n=${te.n}) [${pass}]`
    );
  }
}
main();
