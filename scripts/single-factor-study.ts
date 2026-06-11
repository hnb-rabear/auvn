/**
 * Mỗi tín hiệu vĩ mô ĐỨNG MỘT MÌNH dự báo tốt đến đâu? (Fed / DXY / lợi suất
 * 10y / cả ba). Composite = điểm tín hiệu × 50, ngưỡng mua thử 25..75.
 * Cùng bộ lọc 2 giai đoạn như preset study.
 */
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";
import { macroCriterion } from "../src/lib/criteria";
import { stats, SPLIT_DATE, MIN_SIGNALS } from "./study-lib";

const WARMUP = 756;
const STEP = 3;
const HORIZONS = [21, 63, 126];

async function main() {
  const [xau, dxy, fed, y10] = await Promise.all([
    fetchXau(),
    fetchDxy(),
    fetchFedFunds(),
    fetchYield10y(),
  ]);
  if (!dxy || !fed || !y10) throw new Error("thiếu nguồn");
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  const variants: [string, (i: number, dxyN: number, fedN: number, yN: number) => number][] = [
    [
      "Fed một mình   ",
      (i, _d, fedN) =>
        macroCriterion({ dxyCloses: [], fedRates: fed.slice(0, fedN).map((f) => f.value), usdVndHistory: [] }).score,
    ],
    [
      "DXY một mình   ",
      (i, dxyN) =>
        macroCriterion({ dxyCloses: dxy.bars.slice(0, dxyN).map((b) => b.close), fedRates: [], usdVndHistory: [] }).score,
    ],
    [
      "Lợi suất 1 mình",
      (i, _d, _f, yN) =>
        macroCriterion({
          dxyCloses: [],
          fedRates: [],
          usdVndHistory: [],
          yield10y: { closes: y10.bars.slice(0, yN).map((b) => b.close), real: y10.real },
        }).score,
    ],
    [
      "Cả ba gộp      ",
      (i, dxyN, fedN, yN) =>
        macroCriterion({
          dxyCloses: dxy.bars.slice(0, dxyN).map((b) => b.close),
          fedRates: fed.slice(0, fedN).map((f) => f.value),
          usdVndHistory: [],
          yield10y: { closes: y10.bars.slice(0, yN).map((b) => b.close), real: y10.real },
        }).score,
    ],
  ];

  // điểm từng ngày cho từng biến thể
  type Day = { date: string; score: number; rets: (number | null)[] };
  const table = new Map<string, Day[]>();
  let dxyPtr = 0;
  let fedPtr = 0;
  let yPtr = 0;
  for (let i = WARMUP; i < closes.length; i += STEP) {
    const date = dates[i];
    while (dxyPtr < dxy.bars.length && dxy.bars[dxyPtr].date <= date) dxyPtr++;
    while (fedPtr < fed.length && fed[fedPtr].date <= date) fedPtr++;
    while (yPtr < y10.bars.length && y10.bars[yPtr].date <= date) yPtr++;
    const rets = HORIZONS.map((h) =>
      i + h < closes.length ? (closes[i + h] / closes[i] - 1) * 100 : null
    );
    for (const [name, fn] of variants) {
      const arr = table.get(name) ?? [];
      arr.push({ date, score: fn(i, dxyPtr, fedPtr, yPtr), rets });
      table.set(name, arr);
    }
  }

  for (const [hi, h] of HORIZONS.entries()) {
    console.log(`\n===== KỲ HẠN ${h} phiên =====`);
    const any = table.get(variants[0][0])!;
    const all = any.filter((d) => d.rets[hi] !== null);
    const baseTr = stats(all.filter((d) => d.date < SPLIT_DATE).map((d) => d.rets[hi]!)).fav;
    const baseTe = stats(all.filter((d) => d.date >= SPLIT_DATE).map((d) => d.rets[hi]!)).fav;
    console.log(`baseline train=${(baseTr * 100).toFixed(1)}% test=${(baseTe * 100).toFixed(1)}%`);
    for (const [name] of variants) {
      const days = table.get(name)!.filter((d) => d.rets[hi] !== null);
      let best = "";
      let bestMin = -1;
      for (const thr of [25, 40, 50, 75]) {
        const tr = stats(days.filter((d) => d.date < SPLIT_DATE && d.score * 50 >= thr).map((d) => d.rets[hi]!));
        const te = stats(days.filter((d) => d.date >= SPLIT_DATE && d.score * 50 >= thr).map((d) => d.rets[hi]!));
        if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
        const minEx = Math.min(tr.fav - baseTr, te.fav - baseTe);
        if (minEx > bestMin) {
          bestMin = minEx;
          best = `thr=${thr} train ${(tr.fav * 100).toFixed(1)}% (n=${tr.n}) test ${(te.fav * 100).toFixed(1)}% (n=${te.n}) min-excess ${minEx >= 0 ? "+" : ""}${(minEx * 100).toFixed(1)}pt`;
        }
      }
      console.log(`${name}: ${best || "không đạt chuẩn mẫu/baseline"}`);
    }
  }
}
main();
