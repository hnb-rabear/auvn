import { describe, it, expect } from "vitest";
import { visibleRange, localMinMax } from "./bdo-window";

describe("visibleRange", () => {
  it("cuộn về 0: dải bắt đầu từ 0, dài đúng 1 khung nhìn", () => {
    // pxPerSession = 360/126 ≈ 2.857 -> 1 khung nhìn (360px) phủ ceil(360/2.857)=126 phiên
    const r = visibleRange(0, 360, 360 / 126, 4000);
    expect(r.start).toBe(0);
    expect(r.end).toBe(126);
  });

  it("đã cuộn: dải dịch theo scrollLeft", () => {
    const pxPerSession = 360 / 126;
    const r = visibleRange(1000 * pxPerSession, 360, pxPerSession, 4000);
    expect(r.start).toBe(1000);
    expect(r.end).toBe(1126);
  });

  it("cuối lịch sử: dải bị cắt ở `len`, không vượt quá", () => {
    const pxPerSession = 360 / 126;
    const r = visibleRange(3950 * pxPerSession, 360, pxPerSession, 4000);
    expect(r.end).toBe(4000);
    expect(r.start).toBeLessThan(4000);
  });

  it("len quá nhỏ so với 1 khung nhìn: end kẹp về len, vẫn hợp lệ (end > start)", () => {
    const pxPerSession = 360 / 126;
    const r = visibleRange(0, 360, pxPerSession, 50);
    expect(r.start).toBe(0);
    expect(r.end).toBe(50);
  });
});

describe("localMinMax", () => {
  it("tính đúng min/max trên đúng dải [start, end)", () => {
    const prices = [10, 20, 5, 30, 1, 40];
    expect(localMinMax(prices, 1, 4)).toEqual({ min: 5, max: 30 });
  });

  it("dải quá hẹp (<2 phần tử): fallback về min/max toàn mảng", () => {
    const prices = [10, 20, 5, 30, 1, 40];
    expect(localMinMax(prices, 2, 2)).toEqual({ min: 1, max: 40 });
    expect(localMinMax(prices, 2, 3)).toEqual({ min: 1, max: 40 });
  });
});
