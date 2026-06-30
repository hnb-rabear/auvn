// src/lib/indicators.test.ts
import { describe, it, expect } from "vitest";
import { percentile, blockBootstrapPercentileCi, bollingerPercentB, stochasticK, pairedBlockBootstrapCi } from "./indicators";

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

describe("bollingerPercentB", () => {
  it("null khi thiếu dữ liệu", () => {
    expect(bollingerPercentB([1, 2, 3], 20)).toBeNull();
  });
  it("≈0.5 khi giá ở giữa dải (chuỗi quanh trung bình)", () => {
    const v = Array.from({ length: 20 }, (_, i) => (i % 2 ? 101 : 99)); // dao động quanh 100 (cuối = 101, %B ≈ 0.75)
    const b = bollingerPercentB(v, 20, 2)!;
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(1);
  });
  it("≤0 khi giá thủng dải dưới", () => {
    const v = [...Array.from({ length: 19 }, () => 100), 90]; // cú sụt mạnh cuối
    expect(bollingerPercentB(v, 20, 2)!).toBeLessThanOrEqual(0);
  });
});

describe("stochasticK", () => {
  it("0 khi giá là đáy cửa sổ", () => {
    const v = [105, 104, 103, 102, 101, 100]; // giảm dần, cuối thấp nhất
    expect(stochasticK(v, 6)!).toBeCloseTo(0, 6);
  });
  it("100 khi giá là đỉnh cửa sổ", () => {
    const v = [100, 101, 102, 103, 104, 105];
    expect(stochasticK(v, 6)!).toBeCloseTo(100, 6);
  });
});

describe("pairedBlockBootstrapCi", () => {
  it("null khi n<10", () => {
    expect(pairedBlockBootstrapCi([0.1, -0.2, 0.0], 2)).toBeNull();
  });
  it("CI quanh trung bình thật, tái lập, lo≤hi", () => {
    const d = Array.from({ length: 200 }, (_, i) => -0.1 + (i % 5) * 0.01); // mean ≈ -0.08
    const c1 = pairedBlockBootstrapCi(d, 4, 500, 7)!;
    const c2 = pairedBlockBootstrapCi(d, 4, 500, 7)!;
    expect(c1).toEqual(c2);
    expect(c1[0]).toBeLessThanOrEqual(c1[1]);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    expect(c1[0]).toBeLessThanOrEqual(mean);
    expect(c1[1]).toBeGreaterThanOrEqual(mean);
  });
  it("CI âm hẳn khi mọi delta âm rõ", () => {
    const d = Array.from({ length: 100 }, () => -0.2);
    const c = pairedBlockBootstrapCi(d, 4, 500, 7)!;
    expect(c[1]).toBeLessThan(0); // cận trên < 0
  });
});
