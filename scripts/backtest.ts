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

  // Tính criteria/composite/scores/returns past-only cho MỘT index. Dùng chung
  // cho cả lưới thống kê (thưa) lẫn lưới hiển thị (dày) — giá trị một ngày là
  // hàm thuần của ngày đó, không phụ thuộc lưới.
  const evalAt = (i: number): { point: TimelinePoint; zone: Zone } => {
    const date = dates[i];
    const closesUpTo = closes.slice(0, i + 1);
    const datesUpTo = dates.slice(0, i + 1);

    // Mùa vụ KHÔNG được truyền bảng tính sẵn: statsCriterion tự dựng bảng từ
    // tiền tố (criteria.ts:570), y hệt đường live. Truyền một bảng tính trên
    // TOÀN chuỗi (bug #10, sửa 2026-09-04) cho mỗi điểm quá khứ biết lợi suất
    // của các tháng chưa xảy ra, và làm mọi hằng evidence dẫn xuất trôi mỗi lần
    // Yahoo rụng bar đầu cửa sổ 20 năm. Chi phí đo được: 4276 gọi ≈ 1,7s.
    const criteria = [technicalCriterion(closesUpTo), statsCriterion(closesUpTo, datesUpTo)];

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

    const fwd: TimelinePoint["returns"] = { "21": null, "63": null, "126": null };
    for (const h of horizons) {
      if (i + h >= closes.length) continue;
      const r = (closes[i + h] / closes[i] - 1) * 100;
      fwd[String(h) as keyof TimelinePoint["returns"]] = Math.round(r * 10) / 10;
    }

    const scores: TimelinePoint["scores"] = {};
    for (const c of criteria) {
      if (c.available) scores[c.key] = Math.round(c.score * 100) / 100;
      // v4: sub-signal vĩ mô thành key phụ để preset chấm trọng số riêng (macroSub).
      // Trọng số 0 ở mọi đường composite cũ ⇒ radar/custom/DEFAULT_WEIGHTS không đổi.
      if (c.key === "macro" && c.available) {
        for (const s of c.signals) {
          if (s.available && (s.id === "dxy" || s.id === "fed" || s.id === "yield10y"))
            scores[s.id] = Math.round(s.score * 100) / 100;
        }
      }
    }
    if (extras.momentum12m) {
      const mc = momentumCriterion(closesUpTo);
      if (mc.available) scores[mc.key] = Math.round(mc.score * 100) / 100;
    }

    const point: TimelinePoint = {
      date,
      price: Math.round(closes[i] * 10) / 10,
      composite,
      zone,
      scores,
      returns: fwd,
    };
    return { point, zone };
  };

  // --- Lưới THỐNG KÊ (thưa, STEP) — nuôi returns map + observations. Giữ STEP
  // để chống pseudo-replication: cửa sổ return của ngày liền kề chồng lấn nặng,
  // chấm mỗi ngày sẽ phình n giả và co CI giả. KHÔNG đổi sang bước 1.
  const statIdxs: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) statIdxs.push(i);
  if (statIdxs.length && statIdxs[statIdxs.length - 1] !== closes.length - 1)
    statIdxs.push(closes.length - 1);
  for (const i of statIdxs) {
    const { zone } = evalAt(i);
    observations++;
    for (const h of horizons) {
      if (i + h >= closes.length) continue;
      const r = (closes[i + h] / closes[i] - 1) * 100;
      const key = `${zone}|${h}`;
      const arr = returns.get(key) ?? [];
      arr.push(r);
      returns.set(key, arr);
    }
  }

  // --- Lưới HIỂN THỊ (dày, mỗi phiên) — nuôi timeline.points để tra cứu mọi
  // ngày T2–T6. KHÔNG đẩy vào returns map (thống kê đã xong ở lưới thưa).
  // Pointer dxyPtr/fedPtr/... được evalAt tua tiến đơn điệu; reset về 0 trước
  // lưới dày vì các index quay lại từ WARMUP.
  dxyPtr = 0;
  fedPtr = 0;
  yieldPtr = 0;
  vixPtr = 0;
  gprPtr = 0;
  for (let i = WARMUP; i < closes.length; i += 1) {
    points.push(evalAt(i).point);
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
