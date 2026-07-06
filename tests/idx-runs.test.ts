import { describe, it, expect } from "vitest";
import { idxRuns } from "../src/lib/timeline";

describe("idxRuns", () => {
  it("rỗng → rỗng", () => expect(idxRuns([])).toEqual([]));
  it("1 ngày đứng riêng → cụm [i,i]", () => expect(idxRuns([7])).toEqual([[7, 7]]));
  it("liên tục gộp, đứt quãng tách cụm", () =>
    expect(idxRuns([1, 2, 3, 7, 9, 10])).toEqual([
      [1, 3],
      [7, 7],
      [9, 10],
    ]));
});
