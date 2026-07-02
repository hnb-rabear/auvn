import { describe, it, expect } from "vitest";
import { ddAsOfPct, actualWorstDipPct, verdict, monthAnchors, monthPosOf } from "./bear-downside-view";

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

describe("verdict", () => {
  it("right khi actual ≥ ngưỡng (đáy không thủng p10)", () => {
    expect(verdict(-5, -8)).toBe("right");   // -5 ≥ -8
    expect(verdict(-9, -8)).toBe("wrong");   // thủng đuôi
  });
  it("right khi kết cục ≥ endMedian", () => {
    expect(verdict(12, 5)).toBe("right");
    expect(verdict(2, 5)).toBe("wrong");
  });
  it("null khi thiếu đầu vào", () => {
    expect(verdict(null, -8)).toBeNull();
    expect(verdict(-5, null)).toBeNull();
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
