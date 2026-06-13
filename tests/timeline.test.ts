import { describe, it, expect } from "vitest";
import {
  pointComposite,
  composites,
  idxsAtOrAbove,
  idxsAtOrBelow,
  indexOnOrAfter,
  indexOnOrBefore,
} from "../src/lib/timeline";
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

describe("composites", () => {
  it("map từng điểm theo thứ tự", () => {
    expect(composites([pt(2), pt(-1), pt(0)], W)).toEqual([100, -50, 0]);
  });
  it("mảng rỗng -> rỗng", () => {
    expect(composites([], W)).toEqual([]);
  });
});

describe("idxsAtOrAbove", () => {
  const vals = [100, 25, 50, -50];
  it("ngưỡng 0: mọi giá trị không âm đạt", () => {
    expect(idxsAtOrAbove(vals, 0)).toEqual([0, 1, 2]);
  });
  it("biên >= tính cả giá trị bằng đúng ngưỡng", () => {
    expect(idxsAtOrAbove(vals, 50)).toEqual([0, 2]);
  });
  it("ngưỡng 100: chỉ giá trị tối đa", () => {
    expect(idxsAtOrAbove(vals, 100)).toEqual([0]);
  });
});

describe("idxsAtOrBelow", () => {
  const vals = [100, -40, -50, 0];
  it("biên <= tính cả giá trị bằng đúng ngưỡng (vùng bán -40)", () => {
    expect(idxsAtOrBelow(vals, -40)).toEqual([1, 2]);
  });
  it("không gì đạt -> rỗng", () => {
    expect(idxsAtOrBelow(vals, -200)).toEqual([]);
  });
});

describe("indexOnOrAfter", () => {
  const dates = ["2020-01-01", "2020-02-01", "2020-03-01"];
  it("khớp đúng ngày", () => {
    expect(indexOnOrAfter(dates, "2020-02-01")).toBe(1);
  });
  it("rơi vào giữa -> điểm kế sau", () => {
    expect(indexOnOrAfter(dates, "2020-01-15")).toBe(1);
  });
  it("trước toàn bộ -> 0", () => {
    expect(indexOnOrAfter(dates, "2019-01-01")).toBe(0);
  });
  it("sau toàn bộ -> index cuối", () => {
    expect(indexOnOrAfter(dates, "2021-01-01")).toBe(2);
  });
  it("mảng rỗng -> 0", () => {
    expect(indexOnOrAfter([], "2020-01-01")).toBe(0);
  });
});

describe("indexOnOrBefore", () => {
  const dates = ["2020-01-01", "2020-02-01", "2020-03-01"];
  it("khớp đúng ngày", () => {
    expect(indexOnOrBefore(dates, "2020-02-01")).toBe(1);
  });
  it("rơi vào giữa -> điểm kế trước", () => {
    expect(indexOnOrBefore(dates, "2020-02-15")).toBe(1);
  });
  it("trước toàn bộ -> 0", () => {
    expect(indexOnOrBefore(dates, "2019-01-01")).toBe(0);
  });
  it("sau toàn bộ -> index cuối", () => {
    expect(indexOnOrBefore(dates, "2021-01-01")).toBe(2);
  });
});
