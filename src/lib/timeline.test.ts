import { describe, it, expect } from "vitest";
import { forwardFillBearAsOf } from "./timeline";
import type { TimelinePoint, BearAsOfRow } from "./types";

const pt = (date: string): TimelinePoint => ({
  date, price: 1, composite: 0, zone: "neutral", scores: {},
  returns: { "21": null, "63": null, "126": null },
});
const band = { median: -3, p10: -8, endMedian: 5, pUp: 60, n: 100 };

describe("forwardFillBearAsOf", () => {
  it("snap nút gần nhất ≤ ngày; ngày trước nút đầu để undefined", () => {
    const points = [pt("2020-01-01"), pt("2020-01-05"), pt("2020-01-10")];
    const rows: BearAsOfRow[] = [
      { date: "2020-01-05", bands: { "21": band, "63": null, "126": null } },
    ];
    forwardFillBearAsOf(points, rows);
    expect(points[0].bearAsOf).toBeUndefined();          // trước nút đầu
    expect(points[1].bearAsOf!["21"]).toEqual(band);     // đúng nút
    expect(points[2].bearAsOf!["21"]).toEqual(band);     // forward-fill
  });

  it("rỗng history: không đụng points", () => {
    const points = [pt("2020-01-01")];
    forwardFillBearAsOf(points, []);
    expect(points[0].bearAsOf).toBeUndefined();
  });
});
