import { describe, it, expect } from "vitest";
import { timeAgo } from "../src/lib/freshness";

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
    expect(timeAgo("không-phải-ngày", NOW)).toBeNull();
  });
});
