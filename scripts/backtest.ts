/**
 * Backtest: chạy lại engine trên lịch sử XAU/USD với các tiêu chí tính được
 * từ dữ liệu thế giới (kỹ thuật, thống kê, vĩ mô DXY+Fed). Tiêu chí chênh lệch VN
 * không có lịch sử dài nên không tham gia — trọng số tự chuẩn hóa lại.
 */
import {
  technicalCriterion,
  statsCriterion,
  macroCriterion,
  seasonalityTable,
} from "../src/lib/criteria";
import { median } from "../src/lib/indicators";
import {
  compositeScore,
  zoneOf,
  DEFAULT_WEIGHTS,
  type Backtest,
  type BacktestBucket,
  type Zone,
} from "../src/lib/types";
import type { DailyBar } from "./fetch";

const HORIZONS = [21, 63, 126];
const WARMUP = 756;
/** bước nhảy giữa các quan sát để giảm trùng lặp chuỗi và thời gian chạy */
const STEP = 3;

export function runBacktest(
  xau: DailyBar[],
  dxy: DailyBar[] | null,
  fed: { date: string; value: number }[] | null
): Backtest {
  const closes = xau.map((b) => b.close);
  const dates = xau.map((b) => b.date);
  const season = seasonalityTable(closes, dates);

  const returns = new Map<string, number[]>();
  let observations = 0;
  let dxyPtr = 0;
  let fedPtr = 0;

  for (let i = WARMUP; i < closes.length - HORIZONS[0]; i += STEP) {
    const date = dates[i];
    const closesUpTo = closes.slice(0, i + 1);
    const datesUpTo = dates.slice(0, i + 1);

    const criteria = [
      technicalCriterion(closesUpTo),
      statsCriterion(closesUpTo, datesUpTo, season),
    ];

    if (dxy && fed) {
      while (dxyPtr < dxy.length && dxy[dxyPtr].date <= date) dxyPtr++;
      while (fedPtr < fed.length && fed[fedPtr].date <= date) fedPtr++;
      const dxyCloses = dxy.slice(0, dxyPtr).map((b) => b.close);
      const fedRates = fed.slice(0, fedPtr).map((f) => f.value);
      if (dxyCloses.length >= 51 && fedRates.length >= 4) {
        criteria.push(
          macroCriterion({ dxyCloses, fedRates, usdVndHistory: [] })
        );
      }
    }

    const zone = zoneOf(compositeScore(criteria, DEFAULT_WEIGHTS));
    observations++;

    for (const h of HORIZONS) {
      if (i + h >= closes.length) continue;
      const r = (closes[i + h] / closes[i] - 1) * 100;
      const key = `${zone}|${h}`;
      const arr = returns.get(key) ?? [];
      arr.push(r);
      returns.set(key, arr);
    }
  }

  const zones: Zone[] = ["strong-buy", "buy", "neutral", "sell", "strong-sell"];
  const buckets: BacktestBucket[] = [];
  for (const zone of zones) {
    for (const h of HORIZONS) {
      const rets = returns.get(`${zone}|${h}`) ?? [];
      let pctFavorable: number | null = null;
      if (rets.length > 0 && zone !== "neutral") {
        const fav =
          zone === "buy" || zone === "strong-buy"
            ? rets.filter((r) => r > 0).length
            : rets.filter((r) => r < 0).length;
        pctFavorable = Math.round((fav / rets.length) * 1000) / 10;
      }
      const med = median(rets);
      buckets.push({
        zone,
        horizonDays: h,
        count: rets.length,
        pctFavorable,
        medianReturnPct: med === null ? null : Math.round(med * 10) / 10,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    fromDate: dates[WARMUP] ?? "",
    toDate: dates[dates.length - 1] ?? "",
    observations,
    horizons: HORIZONS,
    buckets,
    note:
      "Backtest chạy trên giá XAU/USD với các tiêu chí thế giới (kỹ thuật, thống kê, DXY + lãi suất Fed). Tiêu chí chênh lệch VN chưa đủ lịch sử kiểm chứng nên không tham gia backtest.",
  };
}
