// src/lib/dca-zone.test.ts
import { describe, it, expect } from "vitest";
import { inZone, pricePercentile } from "./dca-zone";
import type { ZoneRule } from "@/lib/types";

// chuỗi giảm dần đều: phần tử cuối luôn là thấp nhất -> percentile 0
const desc = Array.from({ length: 60 }, (_, j) => 100 - j);

describe("pricePercentile", () => {
  it("giá thấp nhất cửa sổ -> percentile 0", () => {
    expect(pricePercentile(desc, desc.length - 1, 30)).toBeCloseTo(0, 6);
  });
  it("giá cao nhất cửa sổ -> percentile 100", () => {
    const asc = Array.from({ length: 60 }, (_, j) => j);
    expect(pricePercentile(asc, asc.length - 1, 30)).toBeCloseTo(100, 6);
  });
});

describe("inZone relpos", () => {
  const rule: ZoneRule = { kind: "relpos", window: 30, pct: 25 };
  it("bật khi giá ở đáy biên độ gần đây", () => {
    expect(inZone(desc, desc.length - 1, rule, desc.length - 5)).toBe(true);
  });
  it("tắt khi giá ở đỉnh biên độ gần đây", () => {
    const asc = Array.from({ length: 60 }, (_, j) => j);
    expect(inZone(asc, asc.length - 1, rule, asc.length - 5)).toBe(false);
  });
});

describe("inZone monthdd", () => {
  it("bật khi giá ≥ x% dưới đỉnh trong tháng", () => {
    // tháng bắt đầu idx 0: đỉnh 100, hiện tại 90 -> dưới 10%
    const closes = [100, 95, 90];
    const rule: ZoneRule = { kind: "monthdd", x: 8 };
    expect(inZone(closes, 2, rule, 0)).toBe(true);
    expect(inZone(closes, 1, rule, 0)).toBe(false); // mới dưới 5%
  });
});
