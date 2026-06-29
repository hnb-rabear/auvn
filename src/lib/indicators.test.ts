// src/lib/indicators.test.ts
import { describe, it, expect } from "vitest";
import { percentile, blockBootstrapPercentileCi } from "./indicators";

describe("percentile", () => {
  it("trung vị khớp giữa mảng", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 6);
    expect(percentile([1, 2, 3], 0.5)).toBeCloseTo(2, 6);
  });
  it("p10 / p90 nội suy tuyến tính", () => {
    const v = Array.from({ length: 11 }, (_, i) => i * 10); // 0..100 bước 10
    expect(percentile(v, 0.1)).toBeCloseTo(10, 6);
    expect(percentile(v, 0.9)).toBeCloseTo(90, 6);
  });
});

describe("blockBootstrapPercentileCi", () => {
  it("trả null khi n<10", () => {
    expect(blockBootstrapPercentileCi([1, 2, 3], 0.5, 1)).toBeNull();
  });
  it("CI bao quanh trung vị thật và tái lập (cùng seed)", () => {
    const v = Array.from({ length: 200 }, (_, i) => (i % 20) - 10); // -10..9 lặp
    const ci1 = blockBootstrapPercentileCi(v, 0.5, 3, 500, 123)!;
    const ci2 = blockBootstrapPercentileCi(v, 0.5, 3, 500, 123)!;
    expect(ci1).toEqual(ci2);                 // tái lập
    expect(ci1[0]).toBeLessThanOrEqual(ci1[1]); // lo ≤ hi
    const med = percentile(v, 0.5);
    expect(ci1[0]).toBeLessThanOrEqual(med);
    expect(ci1[1]).toBeGreaterThanOrEqual(med);
  });
});
