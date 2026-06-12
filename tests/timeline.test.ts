import { describe, it, expect } from "vitest";
import { pointComposite, thresholdIdxs } from "../src/lib/timeline";
import type { CriterionKey, TimelinePoint } from "../src/lib/types";

// chỉ technical có trọng số -> composite = score * 50
const W: Record<CriterionKey, number> = {
  technical: 1,
  premium: 0,
  macro: 0,
  stats: 0,
  momentum: 0,
};

const pt = (score: number): TimelinePoint => ({
  date: "2020-01-01",
  price: 1500,
  composite: 0,
  zone: "neutral",
  scores: { technical: score },
  returns: { "21": null, "63": null, "126": null },
});

describe("pointComposite", () => {
  it("chuẩn hoá điểm -2..+2 về -100..+100", () => {
    expect(pointComposite(pt(2), W)).toBe(100);
    expect(pointComposite(pt(-2), W)).toBe(-100);
    expect(pointComposite(pt(1), W)).toBe(50);
  });
  it("tổng trọng số 0 -> 0", () => {
    expect(pointComposite(pt(2), { ...W, technical: 0 })).toBe(0);
  });
  it("tiêu chí không có trong scores không kéo composite", () => {
    // macro có trọng số nhưng điểm chỉ có technical -> chia theo trọng số có mặt
    expect(pointComposite(pt(2), { ...W, macro: 1 })).toBe(100);
  });
});

describe("thresholdIdxs", () => {
  // composite lần lượt: 100, 25, 50, -50
  const points = [pt(2), pt(0.5), pt(1), pt(-1)];
  it("ngưỡng 0: mọi điểm không âm đạt", () => {
    expect(thresholdIdxs(points, W, 0)).toEqual([0, 1, 2]);
  });
  it("ngưỡng 50: biên >= tính cả điểm bằng đúng ngưỡng", () => {
    expect(thresholdIdxs(points, W, 50)).toEqual([0, 2]);
  });
  it("ngưỡng 100: chỉ điểm tối đa", () => {
    expect(thresholdIdxs(points, W, 100)).toEqual([0]);
  });
  it("mảng rỗng -> rỗng", () => {
    expect(thresholdIdxs([], W, 0)).toEqual([]);
  });
});
