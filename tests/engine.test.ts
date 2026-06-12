import { describe, it, expect } from "vitest";
import {
  sma,
  rsi,
  percentileRank,
  volatility30,
  toWeekly,
  swingLevels,
  median,
} from "../src/lib/indicators";
import {
  technicalCriterion,
  premiumCriterion,
  macroCriterion,
  statsCriterion,
} from "../src/lib/criteria";
import { compositeScore, zoneOf, DEFAULT_WEIGHTS, PRESETS } from "../src/lib/types";
import { runBacktest } from "../scripts/backtest";
import { blockBootstrapCi, seededRandom } from "../scripts/study-lib";

const range = <T>(n: number, f: (i: number) => T): T[] =>
  Array.from({ length: n }, (_, i) => f(i));

describe("indicators", () => {
  it("sma", () => {
    expect(sma([1, 2, 3, 4], 2)).toBe(3.5);
    expect(sma([1, 2], 5)).toBeNull();
  });

  it("rsi extremes", () => {
    expect(rsi(range(50, (i) => 100 + i))).toBe(100);
    const down = rsi(range(50, (i) => 100 - i))!;
    expect(down).toBeLessThan(1);
    expect(rsi([1, 2, 3], 14)).toBeNull();
  });

  it("percentileRank", () => {
    expect(percentileRank([1, 2, 3, 4, 5], 5)).toBe(100);
    expect(percentileRank([5, 4, 3, 2, 1], 5)).toBe(0);
  });

  it("volatility30 zero for constant series", () => {
    expect(volatility30(range(40, () => 100))).toBe(0);
  });

  it("toWeekly keeps last element and every 5th back", () => {
    const w = toWeekly(range(11, (i) => i));
    expect(w).toEqual([0, 5, 10]);
  });

  it("swingLevels finds support below and resistance above", () => {
    // hình chữ V + hồi: đáy cục bộ và đỉnh cục bộ rõ ràng
    const series = [
      ...range(30, (i) => 100 - i), // giảm về 71
      ...range(30, (i) => 71 + i), // tăng về 100
      ...range(30, (i) => 100 - i * 0.5), // chỉnh về 85.5
    ];
    const { support, resistance } = swingLevels(series, 90, 5);
    expect(support).toBe(71);
    expect(resistance).toBe(100);
  });

  it("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("composite & zones", () => {
  const mk = (key: "technical" | "premium" | "macro" | "stats", score: number, available = true) => ({
    key,
    score,
    available,
  });

  it("all max buy -> +100", () => {
    const c = [mk("technical", 2), mk("premium", 2), mk("macro", 2), mk("stats", 2)];
    expect(compositeScore(c, DEFAULT_WEIGHTS)).toBe(100);
  });

  it("renormalizes when criterion unavailable", () => {
    const c = [mk("technical", 2), mk("premium", 0, false), mk("macro", 2), mk("stats", 2)];
    expect(compositeScore(c, DEFAULT_WEIGHTS)).toBe(100);
  });

  it("nothing available -> 0", () => {
    expect(compositeScore([mk("technical", 2, false)], DEFAULT_WEIGHTS)).toBe(0);
  });

  it("zone thresholds", () => {
    expect(zoneOf(80)).toBe("strong-buy");
    expect(zoneOf(40)).toBe("buy");
    expect(zoneOf(0)).toBe("neutral");
    expect(zoneOf(-40)).toBe("sell");
    expect(zoneOf(-75)).toBe("strong-sell");
  });

  it("zoneOf honors custom buy threshold (presets)", () => {
    expect(zoneOf(55, 60)).toBe("neutral");
    expect(zoneOf(60, 60)).toBe("buy");
    expect(zoneOf(90, 60)).toBe("strong-buy");
    expect(zoneOf(-40, 60)).toBe("sell");
  });

  it("presets are sane", () => {
    expect(PRESETS.length).toBe(3);
    for (const p of PRESETS) {
      const sum = Object.values(p.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
      expect(p.weights.premium).toBe(0);
      expect(p.buyThreshold).toBeGreaterThanOrEqual(40);
      expect(p.evidence.trainFav).toBeGreaterThan(p.evidence.trainBaseline);
      expect(p.evidence.testFav).toBeGreaterThan(p.evidence.testBaseline);
      expect(p.evidence.trainN).toBeGreaterThanOrEqual(25);
      expect(p.evidence.testN).toBeGreaterThanOrEqual(25);
    }
  });
});

describe("criteria", () => {
  it("technical leans buy after long decline", () => {
    const closes = range(400, (i) => 2000 - i * 2);
    const r = technicalCriterion(closes);
    expect(r.available).toBe(true);
    expect(r.score).toBeGreaterThan(0.5);
  });

  it("technical leans sell at parabolic top", () => {
    const closes = [...range(300, () => 2000), ...range(100, (i) => 2000 + i * 15)];
    const r = technicalCriterion(closes);
    expect(r.score).toBeLessThan(-0.5);
  });

  it("premium uses fixed thresholds when history thin, flags provisional", () => {
    const r = premiumCriterion({
      premiumPct: 20,
      spreadPct: 3,
      ringDiscountPct: 0,
      premiumHistory: [],
    });
    expect(r.provisional).toBe(true);
    expect(r.signals.find((s) => s.id === "premium")!.score).toBe(-2);
    expect(r.signals.find((s) => s.id === "spread")!.score).toBe(-1);
  });

  it("premium uses percentile when history rich", () => {
    const hist = range(120, (i) => 5 + (i % 10)); // 5..14
    const r = premiumCriterion({
      premiumPct: 1,
      spreadPct: 1,
      ringDiscountPct: 0,
      premiumHistory: hist,
    });
    expect(r.provisional).toBe(false);
    expect(r.signals.find((s) => s.id === "premium")!.score).toBe(2);
  });

  it("macro: strong USD downtrend favors gold", () => {
    const dxy = range(120, (i) => 110 - i * 0.2);
    const r = macroCriterion({
      dxyCloses: dxy,
      fedRates: [5.5, 5.25, 5.0, 4.75],
      usdVndHistory: [],
    });
    expect(r.signals.find((s) => s.id === "dxy")!.score).toBe(2);
    expect(r.signals.find((s) => s.id === "fed")!.score).toBe(2);
    expect(r.signals.find((s) => s.id === "usdvnd")!.available).toBe(false);
    // không truyền yield/vix/gpr -> không xuất hiện tín hiệu tương ứng
    expect(r.signals.find((s) => s.id === "yield10y")).toBeUndefined();
    expect(r.signals.find((s) => s.id === "vix")).toBeUndefined();
    expect(r.signals.find((s) => s.id === "gpr")).toBeUndefined();
  });

  it("macro: falling 10y yield favors gold, rising hurts", () => {
    const base = {
      dxyCloses: range(120, () => 100),
      fedRates: [5, 5, 5, 5],
      usdVndHistory: [],
    };
    const falling = macroCriterion({
      ...base,
      yield10y: { closes: range(100, (i) => 5 - i * 0.01), real: false },
    });
    expect(falling.signals.find((s) => s.id === "yield10y")!.score).toBe(2);
    const rising = macroCriterion({
      ...base,
      yield10y: { closes: range(100, (i) => 3 + i * 0.01), real: false },
    });
    expect(rising.signals.find((s) => s.id === "yield10y")!.score).toBe(-2);
    const flat = macroCriterion({
      ...base,
      yield10y: { closes: range(100, () => 4), real: false },
    });
    expect(flat.signals.find((s) => s.id === "yield10y")!.score).toBe(0);
  });

  it("stats: price at multi-year low leans buy", () => {
    const closes = [...range(800, (i) => 2000 - i), ...range(10, () => 1100)];
    const dates = range(closes.length, (i) => {
      const d = new Date(Date.UTC(2020, 0, 1) + i * 86400000);
      return d.toISOString().slice(0, 10);
    });
    const r = statsCriterion(closes, dates);
    const p1 = r.signals.find((s) => s.id === "pct1y")!;
    expect(p1.score).toBe(2);
  });
});

describe("bootstrap CI", () => {
  it("seeded RNG is deterministic", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("all-positive returns give CI at 100", () => {
    const ci = blockBootstrapCi(Array(50).fill(1), 7)!;
    expect(ci).toEqual([100, 100]);
  });

  it("mixed returns give CI containing point estimate, wider than zero", () => {
    const rand = seededRandom(7);
    const rets = Array.from({ length: 100 }, () => (rand() < 0.7 ? 1 : -1));
    const point = (rets.filter((r) => r > 0).length / rets.length) * 100;
    const ci = blockBootstrapCi(rets, 7)!;
    expect(ci[0]).toBeLessThanOrEqual(point);
    expect(ci[1]).toBeGreaterThanOrEqual(point);
    expect(ci[1] - ci[0]).toBeGreaterThan(5);
    expect(ci[0]).toBeGreaterThanOrEqual(0);
    expect(ci[1]).toBeLessThanOrEqual(100);
  });

  it("too few samples -> null", () => {
    expect(blockBootstrapCi([1, -1, 1], 2)).toBeNull();
  });
});

describe("backtest", () => {
  it("runs on synthetic series and produces sane buckets", () => {
    const bars = range(1400, (i) => ({
      date: new Date(Date.UTC(2019, 0, 1) + i * 86400000).toISOString().slice(0, 10),
      close: 1500 + 300 * Math.sin(i / 80) + i * 0.1,
    }));
    const { backtest: bt, timeline } = runBacktest(bars, null, null);
    expect(bt.observations).toBeGreaterThan(50);
    expect(bt.buckets.length).toBe(15);
    for (const b of bt.buckets) {
      if (b.pctFavorable !== null) {
        expect(b.pctFavorable).toBeGreaterThanOrEqual(0);
        expect(b.pctFavorable).toBeLessThanOrEqual(100);
      }
      if (b.zone === "neutral") expect(b.pctFavorable).toBeNull();
    }
    const total21 = bt.buckets
      .filter((b) => b.horizonDays === 21)
      .reduce((a, b) => a + b.count, 0);
    expect(total21).toBeGreaterThan(0);

    // timeline: mỗi quan sát một điểm, điểm cuối chưa có dữ liệu tương lai
    expect(timeline.points.length).toBe(bt.observations);
    const lastP = timeline.points[timeline.points.length - 1];
    expect(lastP.returns["126"]).toBeNull();
    const firstP = timeline.points[0];
    expect(firstP.returns["21"]).not.toBeNull();
    for (const pt of timeline.points) {
      expect(pt.price).toBeGreaterThan(0);
      expect(Math.abs(pt.composite)).toBeLessThanOrEqual(100);
      expect(pt.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("includes the macro criterion when DXY is present but Fed is missing", () => {
    const mkBars = (n: number, base: number, f: (i: number) => number) =>
      range(n, (i) => ({
        date: new Date(Date.UTC(2019, 0, 1) + i * 86400000).toISOString().slice(0, 10),
        close: base + f(i),
      }));
    const xau = mkBars(1400, 1500, (i) => 300 * Math.sin(i / 80) + i * 0.1);
    const dxy = mkBars(1400, 100, (i) => 5 * Math.sin(i / 60));
    // fed = null mô phỏng FRED hỏng; macro vẫn phải được tính từ DXY (như đường live).
    const { timeline } = runBacktest(xau, dxy, null);
    const withMacro = timeline.points.filter((p) => "macro" in p.scores).length;
    expect(withMacro).toBe(timeline.points.length);
    expect(withMacro).toBeGreaterThan(0);
  });
});
