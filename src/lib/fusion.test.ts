import { describe, it, expect } from "vitest";
import { highConfidenceBuy3m, HIGH_CONFIDENCE_BIN } from "./fusion";
import { BOTTOM_CONFIG } from "./types";

describe("highConfidenceBuy3m", () => {
  it("bật khi 3m + vùng mua + cycleBin==3 + verified", () => {
    expect(highConfidenceBuy3m("3m", true, 3, true)).toBe(true);
  });
  it("tắt ở preset khác", () => {
    expect(highConfidenceBuy3m("1m", true, 3, true)).toBe(false);
    expect(highConfidenceBuy3m("6m", true, 3, true)).toBe(false);
    expect(highConfidenceBuy3m(null, true, 3, true)).toBe(false);
  });
  it("tắt khi không phải vùng mua", () => {
    expect(highConfidenceBuy3m("3m", false, 3, true)).toBe(false);
  });
  it("tắt khi cycleBin < 3", () => {
    expect(highConfidenceBuy3m("3m", true, 2, true)).toBe(false);
  });
  it("tắt khi chưa verified", () => {
    expect(highConfidenceBuy3m("3m", true, 3, false)).toBe(false);
  });
});

describe("HIGH_CONFIDENCE_BIN", () => {
  it("khớp số bin cao của BOTTOM_CONFIG.cycle (k ranh giới ⇒ bin cao = k)", () => {
    expect(HIGH_CONFIDENCE_BIN).toBe(BOTTOM_CONFIG.cycle.binEdges.length);
  });
});
