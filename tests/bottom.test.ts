import { describe, it, expect } from "vitest";
import { BOTTOM_CONFIG, type BottomAnalysis } from "../src/lib/types";
import { labelNearBottom, bottomFeatures, bottomScore, binOf, runBottom } from "../src/lib/bottom";
import { macd, drawdownFromPeak, declineSpeedPct, bullishRsiDivergence } from "../src/lib/indicators";

describe("bottom types & config", () => {
  it("BOTTOM_CONFIG has cycle and swing horizons with sane eps", () => {
    expect(BOTTOM_CONFIG.cycle.horizonDays).toBeGreaterThan(BOTTOM_CONFIG.swing.horizonDays);
    expect(BOTTOM_CONFIG.cycle.epsPct).toBeGreaterThan(0);
    expect(BOTTOM_CONFIG.swing.epsPct).toBeGreaterThan(0);
    // tổng trọng số feature mỗi tầng = 1 (tự chuẩn hóa)
    for (const tier of [BOTTOM_CONFIG.cycle, BOTTOM_CONFIG.swing]) {
      const sum = Object.values(tier.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("BottomAnalysis shape compiles", () => {
    // kiểm tra shape compile-time
    const a: BottomAnalysis = {
      generatedAt: "2026-06-13T00:00:00.000Z",
      dataDate: "2026-06-13",
      cycle: { prob: 50, ci: [40, 60], bin: 3, n: 100, drivers: [] },
      swing: { prob: 30, ci: [20, 40], bin: 2, n: 80, drivers: [] },
      confirmedBottoms: [],
      note: "x",
    };
    expect(a.cycle.prob).toBe(50);
  });
});

describe("labelNearBottom", () => {
  // V-shape: index 5 là đáy tuyệt đối
  const v = [110, 108, 105, 103, 101, 100, 102, 104, 107, 110, 112];

  it("đáy tuyệt đối được dán nhãn near-bottom", () => {
    // tại i=5 (giá 100), không có gì rẻ hơn trong tương lai -> near-bottom
    expect(labelNearBottom(v, 5, 5, 2)).toBe(true);
  });

  it("ngay trước đáy KHÔNG phải near-bottom (sẽ còn rẻ hơn >eps)", () => {
    // tại i=2 (giá 105), tương lai chạm 100 = thấp hơn 4.76% > eps 2% -> false
    expect(labelNearBottom(v, 2, 5, 2)).toBe(false);
  });

  it("đỉnh không phải near-bottom", () => {
    expect(labelNearBottom(v, 0, 5, 2)).toBe(false);
  });

  it("thiếu tương lai (sát cuối mảng) trả null", () => {
    expect(labelNearBottom(v, v.length - 1, 5, 2)).toBeNull();
    expect(labelNearBottom(v, v.length - 2, 5, 2)).toBeNull();
  });
});

const rng = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

describe("bottom indicators", () => {
  it("macd: histogram dương khi vừa đảo chiều tăng", () => {
    // giảm rồi tăng mạnh: EMA nhanh vượt EMA chậm -> histogram > 0
    const s = [...rng(60, (i) => 100 - i * 0.5), ...rng(40, (i) => 70 + i * 1.5)];
    const m = macd(s)!;
    expect(m.histogram).toBeGreaterThan(0);
  });

  it("macd: null khi thiếu dữ liệu", () => {
    expect(macd(rng(10, (i) => i))).toBeNull();
  });

  it("drawdownFromPeak: phần trăm dưới đỉnh trailing", () => {
    const s = [...rng(50, () => 100), ...rng(10, () => 80)];
    // hiện tại 80, đỉnh 100 -> drawdown 20%
    expect(drawdownFromPeak(s, 252)).toBeCloseTo(20, 5);
  });

  it("declineSpeedPct: âm khi đang rơi", () => {
    const s = rng(30, (i) => 100 - i); // rơi đều
    expect(declineSpeedPct(s, 21)).toBeLessThan(0);
  });

  it("bullishRsiDivergence: trả về boolean", () => {
    const s = [
      ...rng(20, (i) => 100 - i * 2),
      ...rng(15, (i) => 62 + i * 2),
      ...rng(14, (i) => 90 - i * 2),
    ];
    const div = bullishRsiDivergence(s);
    expect(typeof div).toBe("boolean");
  });
});

describe("bottomFeatures", () => {
  it("đáy chữ V sâu sau đợt rơi: feature drawdown & tốc độ rơi nghiêng dương", () => {
    const closes = [...rng(300, () => 2000), ...rng(120, (i) => 2000 - i * 8)];
    const f = bottomFeatures({ closes, dxyCloses: [], yieldCloses: null, fedRates: [] });
    const dd = f.find((d) => d.id === "dd")!;
    const spd = f.find((d) => d.id === "spd")!;
    expect(dd.available).toBe(true);
    expect(dd.score).toBeGreaterThan(0);
    expect(spd.score).toBeGreaterThan(0);
  });

  it("đỉnh parabol: feature nghiêng âm (xa đáy)", () => {
    const closes = [...rng(300, () => 1500), ...rng(120, (i) => 1500 + i * 10)];
    const f = bottomFeatures({ closes, dxyCloses: [], yieldCloses: null, fedRates: [] });
    const dd = f.find((d) => d.id === "dd")!;
    expect(dd.score).toBeLessThanOrEqual(0);
  });

  it("macro feature available khi có đủ DXY", () => {
    const closes = rng(400, (i) => 1500 + i);
    const dxyCloses = rng(120, (i) => 105 - i * 0.2);
    const f = bottomFeatures({ closes, dxyCloses, yieldCloses: null, fedRates: [] });
    const macro = f.find((d) => d.id === "macro")!;
    expect(macro.available).toBe(true);
  });
});

describe("bottomScore & binOf", () => {
  const drivers = [
    { id: "dd", label: "", score: 2, explanation: "", available: true },
    { id: "spd", label: "", score: 2, explanation: "", available: true },
    { id: "macro", label: "", score: 1, explanation: "", available: false },
  ];

  it("bottomScore tự chuẩn hóa theo feature khả dụng, -100..+100", () => {
    const w = { dd: 0.5, spd: 0.3, macro: 0.2 };
    // chỉ dd & spd available: (2*0.5 + 2*0.3)/(0.8) * 50 = 100
    expect(bottomScore(drivers, w)).toBe(100);
  });

  it("binOf đặt điểm vào đúng khoảng", () => {
    expect(binOf(-50, [-40, 0, 40])).toBe(0);
    expect(binOf(-10, [-40, 0, 40])).toBe(1);
    expect(binOf(10, [-40, 0, 40])).toBe(2);
    expect(binOf(80, [-40, 0, 40])).toBe(3);
  });
});

describe("runBottom", () => {
  const range = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
  const bars = range(1600, (i) => ({
    date: new Date(Date.UTC(2018, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    close: 1500 + 250 * Math.sin(i / 90) + i * 0.05,
  }));

  it("trả xác suất 2 tầng trong [0,100] và CI hợp lệ", () => {
    const r = runBottom(bars, null, null, {});
    for (const tier of [r.cycle, r.swing]) {
      expect(tier.prob).toBeGreaterThanOrEqual(0);
      expect(tier.prob).toBeLessThanOrEqual(100);
      if (tier.ci) {
        expect(tier.ci[0]).toBeLessThanOrEqual(tier.prob + 0.1);
        expect(tier.ci[1]).toBeGreaterThanOrEqual(tier.prob - 0.1);
      }
      expect(tier.drivers.length).toBeGreaterThan(0);
    }
  });

  it("xác suất tầng đáy cao hơn ở đáy sin so với đỉnh sin", () => {
    const atTrough = bars.slice(0, 1413);
    const atPeak = bars.slice(0, 1271);
    const pt = runBottom(atTrough, null, null, {}).cycle.prob;
    const pk = runBottom(atPeak, null, null, {}).cycle.prob;
    expect(pt).toBeGreaterThan(pk);
  });

  it("đánh dấu được đáy lịch sử cho overlay", () => {
    const r = runBottom(bars, null, null, {});
    expect(r.confirmedBottoms.length).toBeGreaterThan(0);
    expect(r.confirmedBottoms[0]).toHaveProperty("date");
    expect(r.confirmedBottoms[0]).toHaveProperty("tier");
  });
});
