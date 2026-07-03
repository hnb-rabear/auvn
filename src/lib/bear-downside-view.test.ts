import { describe, it, expect } from "vitest";
import { ddAsOfPct, actualWorstDipPct, pUpTenths, coverageStats, monthAnchors, monthPosOf } from "./bear-downside-view";
import type { TimelinePoint } from "./types";

/** Điểm timeline tối giản cho coverageStats: giá phẳng, returns + band đặt sẵn. */
function mkPoints(
  n: number,
  band: { p10: number; endP25: number; endP75: number } | null,
  ret: number | null
): TimelinePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `d${String(i).padStart(4, "0")}`,
    price: 100,
    composite: 0,
    zone: "neutral" as TimelinePoint["zone"],
    scores: {},
    returns: { "21": ret, "63": ret, "126": ret },
    bearAsOf: band
      ? { "21": { median: 0, p10: band.p10, endMedian: 0, endP25: band.endP25, endP75: band.endP75, pUp: 50, n: 100 }, "63": null, "126": null }
      : undefined,
  }));
}

describe("ddAsOfPct", () => {
  it("dùng ATH tới X, không nhìn tương lai", () => {
    const prices = [100, 120, 90, 200]; // tại X=2: ATH(100,120,90)=120, dd=(120-90)/120=25%
    expect(ddAsOfPct(prices, 2)).toBeCloseTo(25, 6);
  });
  it("0 khi đang ở đỉnh", () => {
    expect(ddAsOfPct([100, 120], 1)).toBeCloseTo(0, 6);
  });
});

describe("actualWorstDipPct", () => {
  it("đáy tệ nhất H phiên tới so hôm nay", () => {
    const prices = [100, 90, 95, 80];
    expect(actualWorstDipPct(prices, 0, 3)!).toBeCloseTo(-20, 6); // min(90,95,80)=80
  });
  it("null khi chưa đáo hạn", () => {
    expect(actualWorstDipPct([100, 90], 0, 5)).toBeNull();
  });
});

describe("pUpTenths", () => {
  it("làm tròn về bậc 1/10", () => {
    expect(pUpTenths(83.5)).toBe(8);
    expect(pUpTenths(62.7)).toBe(6);
    expect(pUpTenths(36)).toBe(4);
  });
  it("clamp 1..9 — không bao giờ tuyên bố chắc chắn 0/10 hay 10/10", () => {
    expect(pUpTenths(2)).toBe(1);
    expect(pUpTenths(0)).toBe(1);
    expect(pUpTenths(97)).toBe(9);
    expect(pUpTenths(100)).toBe(9);
  });
});

describe("coverageStats", () => {
  it("dải trùm mọi kết cục → endIn50=100; đáy không thủng p10 → dipBeyond10=0", () => {
    // giá phẳng ⇒ đáy thực = 0% > p10=−5; kết cục 0 ∈ [−1, 1]
    const c = coverageStats(mkPoints(200, { p10: -5, endP25: -1, endP75: 1 }, 0), "21");
    expect(c).not.toBeNull();
    expect(c!.endIn50).toBe(100);
    expect(c!.dipBeyond10).toBe(0);
  });
  it("dải trượt hết → endIn50=0", () => {
    const c = coverageStats(mkPoints(200, { p10: -5, endP25: 3, endP75: 7 }, 0), "21");
    expect(c!.endIn50).toBe(0);
  });
  it("null khi thiếu band hoặc <30 mẫu đáo hạn", () => {
    expect(coverageStats(mkPoints(200, null, 0), "21")).toBeNull();
    expect(coverageStats(mkPoints(50, { p10: -5, endP25: -1, endP75: 1 }, 0), "21")).toBeNull();
  });
  it("bỏ mẫu chưa đáo hạn (returns null)", () => {
    expect(coverageStats(mkPoints(200, { p10: -5, endP25: -1, endP75: 1 }, null), "21")).toBeNull();
  });
});

describe("monthAnchors", () => {
  it("chỉ số phiên đầu của mỗi năm-tháng", () => {
    const dates = ["2020-01-03", "2020-01-31", "2020-02-04", "2020-02-20", "2020-03-02"];
    expect(monthAnchors(dates)).toEqual([0, 2, 4]);
  });
  it("bỏ khoảng trống dữ liệu (tháng thiếu vẫn tính theo tháng có mặt)", () => {
    const dates = ["2020-01-03", "2020-03-10", "2020-03-25", "2021-01-05"];
    expect(monthAnchors(dates)).toEqual([0, 1, 3]); // 01, 03, next-year-01
  });
  it("rỗng khi không có ngày", () => {
    expect(monthAnchors([])).toEqual([]);
  });
});

describe("monthPosOf", () => {
  const anchors = [0, 2, 4];
  it("trả anchor lớn nhất ≤ idx", () => {
    expect(monthPosOf(anchors, 0)).toBe(0);
    expect(monthPosOf(anchors, 1)).toBe(0); // vẫn trong tháng đầu
    expect(monthPosOf(anchors, 2)).toBe(1);
    expect(monthPosOf(anchors, 3)).toBe(1);
    expect(monthPosOf(anchors, 5)).toBe(2); // sau anchor cuối
  });
});
