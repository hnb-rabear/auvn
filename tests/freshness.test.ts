import { describe, it, expect } from "vitest";
import { timeAgo, isGoldMarketClosed } from "../src/lib/freshness";

const NOW = Date.parse("2026-06-14T10:00:00Z");

describe("timeAgo", () => {
  it("vừa xong khi dưới 1 phút", () => {
    expect(timeAgo("2026-06-14T09:59:30Z", NOW)).toBe("vừa xong");
  });
  it("phút", () => {
    expect(timeAgo("2026-06-14T09:55:00Z", NOW)).toBe("5 phút trước");
  });
  it("giờ", () => {
    expect(timeAgo("2026-06-14T08:00:00Z", NOW)).toBe("2 giờ trước");
  });
  it("ngày", () => {
    expect(timeAgo("2026-06-11T10:00:00Z", NOW)).toBe("3 ngày trước");
  });
  it("null/không hợp lệ → null", () => {
    expect(timeAgo(null, NOW)).toBeNull();
    expect(timeAgo(undefined, NOW)).toBeNull();
    expect(timeAgo("không phải ngày", NOW)).toBeNull();
  });
  it("biên 59.5s vẫn là vừa xong", () => {
    expect(timeAgo("2026-06-14T09:59:00.500Z", NOW)).toBe("vừa xong");
  });
});

describe("isGoldMarketClosed", () => {
  it("thứ Bảy → đóng (cả ngày)", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-13T10:00:00Z"))).toBe(true);
  });
  it("Chủ Nhật trước 22:00 UTC → đóng", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-14T21:00:00Z"))).toBe(true);
  });
  it("Chủ Nhật từ 22:00 UTC → đã mở lại", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-14T23:00:00Z"))).toBe(false);
  });
  it("thứ Sáu → mở", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-12T10:00:00Z"))).toBe(false);
  });
  it("thứ Hai → mở", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-15T10:00:00Z"))).toBe(false);
  });
});