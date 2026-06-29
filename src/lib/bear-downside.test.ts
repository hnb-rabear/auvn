// src/lib/bear-downside.test.ts
import { describe, it, expect } from "vitest";
import { bucketOf, furtherDrawdownPct, computeHorizonStat, BUCKETS, HORIZONS } from "./bear-downside";

describe("bucketOf", () => {
  it("ánh xạ dd fraction sang 0..3", () => {
    expect(bucketOf(0.05)).toBe(0);
    expect(bucketOf(0.15)).toBe(1);
    expect(bucketOf(0.25)).toBe(2);
    expect(bucketOf(0.40)).toBe(3);
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(0.10)).toBe(1); // biên trên thuộc bucket kế
  });
});

describe("furtherDrawdownPct", () => {
  it("đáy tệ nhất trong H phiên tới (âm khi còn rơi)", () => {
    const closes = [100, 90, 95, 80]; // từ i=0, H=3: min(90,95,80)=80 -> -20%
    expect(furtherDrawdownPct(closes, 0, 3)!).toBeCloseTo(-20, 6);
  });
  it("dương khi hôm nay là đáy (giá chỉ đi lên)", () => {
    const closes = [80, 90, 100]; // min(90,100)=90 > 80 -> +12.5% (≥0 ⇒ tính là "đáy đã phía sau")
    expect(furtherDrawdownPct(closes, 0, 2)!).toBeGreaterThan(0);
  });
  it("null khi chưa đủ H phiên tương lai", () => {
    expect(furtherDrawdownPct([100, 90], 0, 5)).toBeNull();
  });
});

describe("computeHorizonStat", () => {
  it("tính trung vị, P(đáy phía sau), n", () => {
    // 40 giá trị: 20 âm (-10), 20 bằng 0 -> pBottomBehind 50%, median -5
    const vals = [...Array(20).fill(-10), ...Array(20).fill(0)];
    const s = computeHorizonStat(vals, 63);
    expect(s.horizonDays).toBe(63);
    expect(s.n).toBe(40);
    expect(s.pBottomBehind).toBeCloseTo(50, 0);
    expect(s.median).toBeCloseTo(-5, 6); // nội suy giữa -10 và 0
  });
});
