import { describe, it, expect } from "vitest";
import { applyBrushDrag, centerWindow, zoomTo } from "../src/lib/brush";

// total = 100 điểm, minSpan = 14, cửa sổ neo: start 40, span 20
const TOTAL = 100;
const MIN = 14;

describe("applyBrushDrag — pan", () => {
  it("dời start theo delta, giữ span", () => {
    expect(applyBrushDrag("pan", 40, 20, 10, TOTAL, MIN)).toEqual({ start: 50, span: 20 });
    expect(applyBrushDrag("pan", 40, 20, -10, TOTAL, MIN)).toEqual({ start: 30, span: 20 });
  });
  it("kẹp biên trái 0", () => {
    expect(applyBrushDrag("pan", 40, 20, -100, TOTAL, MIN)).toEqual({ start: 0, span: 20 });
  });
  it("kẹp biên phải total - span", () => {
    expect(applyBrushDrag("pan", 40, 20, 100, TOTAL, MIN)).toEqual({ start: 80, span: 20 });
  });
});

describe("applyBrushDrag — left (mép phải đứng yên)", () => {
  it("kéo ra trái = giãn", () => {
    expect(applyBrushDrag("left", 40, 20, -10, TOTAL, MIN)).toEqual({ start: 30, span: 30 });
  });
  it("kéo vào phải = co", () => {
    expect(applyBrushDrag("left", 40, 20, 5, TOTAL, MIN)).toEqual({ start: 45, span: 15 });
  });
  it("co quá minSpan thì kẹp tại minSpan, mép phải đứng yên", () => {
    // end = 60 cố định -> start tối đa 60 - 14 = 46
    expect(applyBrushDrag("left", 40, 20, 50, TOTAL, MIN)).toEqual({ start: 46, span: 14 });
  });
  it("giãn quá biên trái thì kẹp tại 0", () => {
    expect(applyBrushDrag("left", 40, 20, -100, TOTAL, MIN)).toEqual({ start: 0, span: 60 });
  });
});

describe("applyBrushDrag — right (mép trái đứng yên)", () => {
  it("kéo ra phải = giãn", () => {
    expect(applyBrushDrag("right", 40, 20, 15, TOTAL, MIN)).toEqual({ start: 40, span: 35 });
  });
  it("kéo vào trái = co", () => {
    expect(applyBrushDrag("right", 40, 20, -4, TOTAL, MIN)).toEqual({ start: 40, span: 16 });
  });
  it("co quá minSpan thì kẹp tại minSpan", () => {
    expect(applyBrushDrag("right", 40, 20, -50, TOTAL, MIN)).toEqual({ start: 40, span: 14 });
  });
  it("giãn quá biên phải thì kẹp tại total - start", () => {
    expect(applyBrushDrag("right", 40, 20, 100, TOTAL, MIN)).toEqual({ start: 40, span: 60 });
  });
});

describe("applyBrushDrag — minSpan lớn hơn total", () => {
  it("dùng total làm min hiệu dụng, không nổ", () => {
    expect(applyBrushDrag("right", 0, 10, -100, 10, MIN)).toEqual({ start: 0, span: 10 });
  });
});

describe("centerWindow", () => {
  it("căn giữa quanh center", () => {
    expect(centerWindow(50, 20, TOTAL)).toBe(40);
  });
  it("kẹp biên trái", () => {
    expect(centerWindow(3, 20, TOTAL)).toBe(0);
  });
  it("kẹp biên phải", () => {
    expect(centerWindow(99, 20, TOTAL)).toBe(80);
  });
});

describe("applyBrushDrag — span neo nhỏ hơn minSpan (bất biến bị phá từ ngoài)", () => {
  it("delta 0 không tự nhảy cửa sổ — left", () => {
    expect(applyBrushDrag("left", 40, 8, 0, TOTAL, MIN)).toEqual({ start: 40, span: 8 });
  });
  it("delta 0 không tự nhảy cửa sổ — right", () => {
    expect(applyBrushDrag("right", 40, 8, 0, TOTAL, MIN)).toEqual({ start: 40, span: 8 });
  });
});

describe("applyBrushDrag — span neo lớn hơn total", () => {
  it("pan: kẹp span về total", () => {
    expect(applyBrushDrag("pan", 0, 200, 0, TOTAL, MIN)).toEqual({ start: 0, span: 100 });
  });
  it("left: mép phải không vượt total", () => {
    expect(applyBrushDrag("left", 0, 200, 0, TOTAL, MIN)).toEqual({ start: 0, span: 100 });
  });
});

describe("applyBrushDrag — minSpan lớn hơn total, các mode còn lại", () => {
  it("pan không nổ", () => {
    expect(applyBrushDrag("pan", 0, 10, 5, 10, MIN)).toEqual({ start: 0, span: 10 });
  });
  it("left không nổ", () => {
    expect(applyBrushDrag("left", 0, 10, 0, 10, MIN)).toEqual({ start: 0, span: 10 });
  });
});

describe("centerWindow — biên hiếm", () => {
  it("span lẻ: thiên trái theo floor", () => {
    expect(centerWindow(50, 21, TOTAL)).toBe(40);
  });
  it("span > total: kẹp về toàn cửa sổ", () => {
    expect(centerWindow(5, 200, TOTAL)).toBe(0);
  });
});

describe("zoomTo", () => {
  it("factor < 1 = phóng to: span hẹp lại, căn tâm", () => {
    // anchorSpan 40, factor 0.5 -> span 20, center 50 -> start 40
    expect(zoomTo(40, 0.5, 50, TOTAL, MIN)).toEqual({ start: 40, span: 20 });
  });
  it("factor > 1 = thu nhỏ: span rộng ra", () => {
    expect(zoomTo(20, 2, 50, TOTAL, MIN)).toEqual({ start: 30, span: 40 });
  });
  it("kẹp span tại minSpan khi phóng quá sâu", () => {
    expect(zoomTo(20, 0.1, 50, TOTAL, MIN)).toEqual({ start: 43, span: 14 });
  });
  it("kẹp span tại total khi thu quá rộng", () => {
    expect(zoomTo(80, 5, 50, TOTAL, MIN)).toEqual({ start: 0, span: 100 });
  });
  it("căn tâm kẹp biên trái", () => {
    // span 20 quanh center 3 -> start kẹp 0
    expect(zoomTo(40, 0.5, 3, TOTAL, MIN)).toEqual({ start: 0, span: 20 });
  });
});
