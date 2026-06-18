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

import { forwardFillBottomHistory } from "../src/lib/timeline";
import type { BottomHistoryRow } from "../src/lib/types";

describe("forwardFillBottomHistory", () => {
  const mkPt = (date: string): TimelinePoint => ({
    date, price: 1, composite: 0, zone: "neutral", scores: {},
    returns: { "21": null, "63": null, "126": null },
  });
  const hist: BottomHistoryRow[] = [
    { date: "2020-01-03", cycle: { bin: 2, prob: 50, ci: [40, 60], n: 30 }, swing: { bin: 1, prob: 40, ci: null, n: 12 } },
    { date: "2020-01-06", cycle: { bin: 3, prob: 70, ci: [60, 80], n: 40 }, swing: { bin: 2, prob: 55, ci: [45, 65], n: 20 } },
  ];

  it("gán prob từ nút lưới gần nhất ≤ ngày; trước nút đầu để undefined", () => {
    const pts = ["2020-01-02", "2020-01-03", "2020-01-05", "2020-01-06", "2020-01-09"].map(mkPt);
    forwardFillBottomHistory(pts, hist);
    expect(pts[0].cycleProb).toBeUndefined(); // trước nút đầu
    expect(pts[1].cycleProb).toBe(50);        // đúng nút
    expect(pts[2].cycleProb).toBe(50);        // snap về nút 01-03
    expect(pts[3].cycleProb).toBe(70);        // nút 01-06
    expect(pts[4].cycleProb).toBe(70);        // sau nút cuối -> giữ nút cuối
    expect(pts[2].swingN).toBe(12);
    expect(pts[3].swingCi).toEqual([45, 65]);
  });

  it("history rỗng ⇒ không gán gì", () => {
    const pts = [mkPt("2020-01-03")];
    forwardFillBottomHistory(pts, []);
    expect(pts[0].cycleProb).toBeUndefined();
  });
});

import { bottomBandRuns } from "../src/lib/timeline";

describe("bottomBandRuns", () => {
  const mk = (cycleProb: number | null): any => ({
    date: "x", price: 1, composite: 0, zone: "neutral", scores: {},
    returns: { "21": null, "63": null, "126": null }, cycleProb,
  });
  it("gom dải liên tiếp cycleProb>=ngưỡng; null & dưới-ngưỡng cắt dải", () => {
    const pts = [null, 70, 71, 50, 80, null, 90].map(mk);
    expect(bottomBandRuns(pts, 60)).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 4 },
      { start: 6, end: 6 },
    ]);
  });
  it("biên: >= chứ không >", () => {
    expect(bottomBandRuns([60, 59].map(mk), 60)).toEqual([{ start: 0, end: 0 }]);
  });
  it("dải chạm cuối mảng được đóng", () => {
    expect(bottomBandRuns([10, 80, 90].map(mk), 60)).toEqual([{ start: 1, end: 2 }]);
  });
  it("rỗng khi không ngày nào đạt", () => {
    expect(bottomBandRuns([null, 10, 20].map(mk), 60)).toEqual([]);
  });
});
