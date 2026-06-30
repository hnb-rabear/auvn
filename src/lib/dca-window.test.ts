// src/lib/dca-window.test.ts
import { describe, it, expect } from "vitest";
import { rangePos, inZoneV2, evalWindow } from "./dca-window";

describe("rangePos", () => {
  it("0 ở đáy, 1 ở đỉnh, 0 khi phẳng", () => {
    expect(rangePos(10, 10, 20)).toBeCloseTo(0, 6);
    expect(rangePos(20, 10, 20)).toBeCloseTo(1, 6);
    expect(rangePos(15, 15, 15)).toBe(0);
  });
});

describe("inZoneV2 relpos", () => {
  const desc = Array.from({ length: 60 }, (_, j) => 100 - j); // giảm dần, cuối thấp nhất
  it("bật khi giá ở đáy biên độ gần đây", () => {
    expect(inZoneV2(desc, desc.length - 1, { kind: "relpos", window: 30, pct: 25 }, 0)).toBe(true);
  });
});

describe("inZoneV2 pullback", () => {
  it("bật khi n phiên giảm liên tiếp", () => {
    const c = [100, 101, 102, 101, 100, 99]; // 3 phiên cuối giảm liên tiếp (102→101→100→99)
    expect(inZoneV2(c, 5, { kind: "pullback", n: 3 }, 0)).toBe(true);
    expect(inZoneV2(c, 2, { kind: "pullback", n: 3 }, 0)).toBe(false); // đang tăng
  });
});

describe("evalWindow", () => {
  it("mua phiên đầu chạm vùng; rangePos đúng", () => {
    // cửa sổ giá [t..t+5] = [100, 98, 95, 90, 96, 99]; relpos pct cao -> chạm sớm
    const closes = [120, 118, 116, 114, 112, /*t=5*/ 100, 98, 95, 90, 96, 99];
    const t = 5, H = 5;
    const r = evalWindow(closes, t, H, { kind: "relpos", window: 5, pct: 50 }, 0)!;
    expect(r.lo).toBe(90);
    expect(r.hi).toBe(100);
    expect(r.buyIdx).toBeGreaterThanOrEqual(t);
    expect(r.pos).toBeCloseTo(rangePos(closes[r.buyIdx], 90, 100), 6);
  });
  it("buộc mua phiên cuối khi không chạm vùng", () => {
    const closes = [...Array.from({ length: 10 }, (_, i) => 100 + i), 200, 201, 202, 203, 204, 205];
    const t = 10, H = 5;
    // rule gần như không bao giờ bật (pct rất thấp trên chuỗi tăng) -> mua cuối
    const r = evalWindow(closes, t, H, { kind: "relpos", window: 5, pct: 1 }, 0)!;
    expect(r.buyIdx).toBe(t + H);
  });
  it("null khi cửa sổ vượt quá dữ liệu", () => {
    expect(evalWindow([1, 2, 3], 1, 5, { kind: "relpos", window: 2, pct: 50 }, 0)).toBeNull();
  });
});
