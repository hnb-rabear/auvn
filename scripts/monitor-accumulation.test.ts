import { describe, it, expect } from "vitest";
import { monitorAccumulation } from "./monitor-accumulation";
import type { AccumPoint } from "../src/lib/types";

/** n ngày LIÊN TIẾP từ `start`, giá theo priceAt(i), composite=0. */
function makePoints(n: number, priceAt: (i: number) => number, start = "2014-01-01"): AccumPoint[] {
  const out: AccumPoint[] = [];
  let t = Date.parse(start + "T00:00:00Z");
  for (let i = 0; i < n; i++) {
    out.push({ date: new Date(t).toISOString().slice(0, 10), price: priceAt(i), composite: 0 });
    t += 86400000;
  }
  return out;
}

describe("monitorAccumulation", () => {
  it("insufficient khi quá ít điểm", () => {
    expect(monitorAccumulation(makePoints(50, (i) => 100 + i)).status).toBe("insufficient");
  });
  it("trả status hợp lệ + recentImprPct số khi đủ dữ liệu", () => {
    // 1400 ngày tăng đều -> đủ warmup; cửa sổ 2 năm gần nhất có tháng bị phanh
    const h = monitorAccumulation(makePoints(1400, (i) => 100 + i));
    expect(["ok", "degraded"]).toContain(h.status);
    expect(h.recentImprPct).not.toBeNull();
    expect(h.recentBrakedMonths).toBeGreaterThan(0);
  });
});
