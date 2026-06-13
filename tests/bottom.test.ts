import { describe, it, expect } from "vitest";
import { BOTTOM_CONFIG, type BottomAnalysis } from "../src/lib/types";

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
