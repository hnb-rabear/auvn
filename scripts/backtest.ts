/**
 * Backtest: chạy lại engine trên lịch sử XAU/USD với các tiêu chí tính được
 * từ dữ liệu thế giới (kỹ thuật, thống kê, vĩ mô DXY+Fed). Tiêu chí chênh lệch VN
 * không có lịch sử dài nên không tham gia — trọng số tự chuẩn hóa lại.
 */
import {
  technicalCriterion,
  statsCriterion,
  macroCriterion,
  momentumCriterion,
  seasonalityTable,
} from "../src/lib/criteria";
import { median } from "../src/lib/indicators";
import {
  compositeScore,
  zoneOf,
  DEFAULT_WEIGHTS,
  type Backtest,
  type BacktestBucket,
  type Timeline,
  type TimelinePoint,
  type Zone,
} from "../src/lib/types";
import type { DailyBar } from "./fetch";

const HORIZONS = [21, 63, 126];
const WARMUP = 756;
/** bước nhảy giữa các quan sát để giảm trùng lặp chuỗi và thời gian chạy */
const STEP = 3;

export interface BacktestExtras {
  yield10y?: { bars: DailyBar[]; real: boolean } | null;
  vix?: DailyBar[] | null;
  gpr?: DailyBar[] | null;
  /** Bật tín hiệu động lượng 12 tháng của XAU (trend-following). */
  momentum12m?: boolean;
}

export function runBacktest(
  xau: DailyBar[],
  dxy: DailyBar[] | null,
  fed: { date: string; value: number }[] | null,
  horizons: number[] = HORIZONS,
  extras: BacktestExtras = {}
): { backtest: Backtest; timeline: Timeline } {
  const closes = xau.map((b) => b.close);
  const dates = xau.map((b) => b.date);
  const season = seasonalityTable(closes, dates);

  const returns = new Map<string, number[]>();
  const points: TimelinePoint[] = [];
  let observations = 0;
  let dxyPtr = 0;
  let fedPtr = 0;
  let yieldPtr = 0;
  let vixPtr = 0;
  let gprPtr = 0;
  const yieldBars = extras.yield10y?.bars ?? null;
  const vixBars = extras.vix ?? null;
  const gprBars = extras.gpr ?? null;

  for (let i = WARMUP; i < closes.length; i += STEP) {
    const date = dates[i];
    const closesUpTo = closes.slice(0, i + 1);
    const datesUpTo = dates.slice(0, i + 1);

    const criteria = [
      technicalCriterion(closesUpTo),
      statsCriterion(closesUpTo, datesUpTo, season),
    ];

    // Macro chạy khi có DXY; Fed (và yield/vix/gpr) là tùy chọn — macroCriterion
    // tự bỏ qua từng tín hiệu con thiếu dữ liệu, giống hệt đường phân tích live.
    // KHÔNG đòi cả dxy && fed: một lần FRED chập chờn từng xóa macro khỏi TOÀN BỘ lịch sử.
    if (dxy) {
      while (dxyPtr < dxy.length && dxy[dxyPtr].date <= date) dxyPtr++;
      const dxyCloses = dxy.slice(0, dxyPtr).map((b) => b.close);
      let fedRates: number[] = [];
      if (fed) {
        while (fedPtr < fed.length && fed[fedPtr].date <= date) fedPtr++;
        fedRates = fed.slice(0, fedPtr).map((f) => f.value);
      }
      if (dxyCloses.length >= 51) {
        let yield10y: { closes: number[]; real: boolean } | undefined;
        if (yieldBars) {
          while (yieldPtr < yieldBars.length && yieldBars[yieldPtr].date <= date) yieldPtr++;
          yield10y = {
            closes: yieldBars.slice(0, yieldPtr).map((b) => b.close),
            real: extras.yield10y!.real,
          };
        }
        let vixCloses: number[] | undefined;
        if (vixBars) {
          while (vixPtr < vixBars.length && vixBars[vixPtr].date <= date) vixPtr++;
          vixCloses = vixBars.slice(0, vixPtr).map((b) => b.close);
        }
        let gprCloses: number[] | undefined;
        if (gprBars) {
          while (gprPtr < gprBars.length && gprBars[gprPtr].date <= date) gprPtr++;
          gprCloses = gprBars.slice(0, gprPtr).map((b) => b.close);
        }
        criteria.push(
          macroCriterion({
            dxyCloses,
            fedRates,
            usdVndHistory: [],
            yield10y,
            vixCloses,
            gprCloses,
          })
        );
      }
    }

    const composite = compositeScore(criteria, DEFAULT_WEIGHTS);
    const zone = zoneOf(composite);
    observations++;

    const fwd: TimelinePoint["returns"] = { "21": null, "63": null, "126": null };
    for (const h of horizons) {
      if (i + h >= closes.length) continue;
      const r = (closes[i + h] / closes[i] - 1) * 100;
      fwd[String(h) as keyof TimelinePoint["returns"]] = Math.round(r * 10) / 10;
      const key = `${zone}|${h}`;
      const arr = returns.get(key) ?? [];
      arr.push(r);
      returns.set(key, arr);
    }

    const scores: TimelinePoint["scores"] = {};
    for (const c of criteria) {
      if (c.available) scores[c.key] = Math.round(c.score * 100) / 100;
    }

    if (extras.momentum12m) {
      const mc = momentumCriterion(closesUpTo);
      if (mc.available) scores[mc.key] = Math.round(mc.score * 100) / 100;
    }

    points.push({
      date,
      price: Math.round(closes[i] * 10) / 10,
      composite,
      zone,
      scores,
      returns: fwd,
    });
  }

  const zones: Zone[] = ["strong-buy", "buy", "neutral", "sell", "strong-sell"];
  const buckets: BacktestBucket[] = [];
  for (const zone of zones) {
    for (const h of horizons) {
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

  const note =
    "Backtest chạy trên giá XAU/USD với các tiêu chí thế giới (kỹ thuật, thống kê, DXY + lãi suất Fed). Tiêu chí chênh lệch VN chưa đủ lịch sử kiểm chứng nên không tham gia backtest.";

  return {
    backtest: {
      generatedAt: new Date().toISOString(),
      fromDate: dates[WARMUP] ?? "",
      toDate: dates[dates.length - 1] ?? "",
      observations,
      horizons,
      buckets,
      note,
    },
    timeline: {
      generatedAt: new Date().toISOString(),
      note,
      points,
    },
  };
}
