import { describe, it, expect } from "vitest";
import { fabLabel, zoneClass, parseSettings, dcaChiThisMonth } from "./settings";
import { PRESETS } from "./types";

describe("fabLabel", () => {
  it("trả label preset khi có preset", () => {
    const p = PRESETS.find((q) => q.id === "3m")!;
    expect(fabLabel(p, false)).toBe(p.label);
  });
  it("trả 'Tùy chỉnh' khi không preset nhưng đã chỉnh", () => {
    expect(fabLabel(null, true)).toBe("Tùy chỉnh");
  });
  it("trả 'Toàn cảnh' khi mặc định", () => {
    expect(fabLabel(null, false)).toBe("Toàn cảnh");
  });
});

describe("zoneClass", () => {
  it("gộp strong-buy/buy thành 'buy'", () => {
    expect(zoneClass("buy")).toBe("buy");
    expect(zoneClass("strong-buy")).toBe("buy");
  });
  it("gộp strong-sell/sell thành 'sell'", () => {
    expect(zoneClass("sell")).toBe("sell");
    expect(zoneClass("strong-sell")).toBe("sell");
  });
  it("còn lại là 'neutral'", () => {
    expect(zoneClass("neutral")).toBe("neutral");
  });
});

describe("dcaBaseChi", () => {
  const withBase = (v: unknown) =>
    parseSettings(JSON.stringify({ weights: parseSettings(null).weights, dcaBaseChi: v })).dcaBaseChi;
  it("giữ số hợp lệ, thiếu/sai/ngoài khoảng ⇒ 1 chỉ", () => {
    expect(withBase(1.5)).toBe(1.5);
    expect(withBase(undefined)).toBe(1);
    expect(withBase("2")).toBe(1);
    expect(withBase(0)).toBe(1);
    expect(withBase(500)).toBe(1);
  });
  it("số chỉ tháng này = mức thường × hệ số, làm tròn 0.05", () => {
    expect(dcaChiThisMonth(1.5, 0.75)).toBe(1.15);
    expect(dcaChiThisMonth(1.5, 1.5)).toBe(2.25);
    expect(dcaChiThisMonth(1.5, 1)).toBe(1.5);
  });
});
