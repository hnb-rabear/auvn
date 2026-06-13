import { describe, it, expect } from "vitest";
import { BOTTOM_CONFIG, type BottomAnalysis } from "../src/lib/types";
import { labelNearBottom } from "../src/lib/bottom";
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
