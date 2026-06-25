import { describe, it, expect } from "vitest";
import { fabLabel, zoneClass } from "./settings";
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
