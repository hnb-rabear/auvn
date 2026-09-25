import { describe, it, expect } from "vitest";
import { mergeBars } from "../scripts/fetch";

describe("mergeBars", () => {
  it("keeps old bars a sliding 20y window dropped, fresh wins on same date, stays sorted", () => {
    const cached = [
      { date: "2006-01-02", close: 1 },
      { date: "2006-01-03", close: 2 },
    ];
    const fresh = [
      { date: "2006-01-04", close: 4 },
      { date: "2006-01-03", close: 3 },
    ];
    expect(mergeBars(cached, fresh)).toEqual([
      { date: "2006-01-02", close: 1 },
      { date: "2006-01-03", close: 3 },
      { date: "2006-01-04", close: 4 },
    ]);
    expect(mergeBars(null, fresh).map((b) => b.date)).toEqual(["2006-01-03", "2006-01-04"]);
  });
});
