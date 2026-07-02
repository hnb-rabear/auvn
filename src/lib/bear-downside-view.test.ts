import { describe, it, expect } from "vitest";
import { ddAsOfPct, actualWorstDipPct, verdict } from "./bear-downside-view";

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
