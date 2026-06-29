// src/lib/dca-sim.test.ts
import { describe, it, expect } from "vitest";
import {
  groupByMonth, simulateDca, improvementPct,
  pickFirst, pickMid, pickSeededRandom, monthsBetterFraction, type BuyPicker,
} from "./dca-sim";

const dates = (...ds: string[]) => ds;

describe("groupByMonth", () => {
  it("gom index theo YYYY-MM giữ thứ tự", () => {
    const d = ["2020-01-02", "2020-01-31", "2020-02-03", "2020-03-01"];
    expect(groupByMonth(d)).toEqual([[0, 1], [2], [3]]);
  });
});

describe("simulateDca cost basis", () => {
  it("giá vốn = nMonths / Σ(1/price), thấp hơn trung bình cộng", () => {
    // 3 tháng, mua giá 10 / 8 / 12 (mỗi tháng 1 bar)
    const closes = [10, 8, 12];
    const months = [[0], [1], [2]];
    const r = simulateDca(closes, months, (m) => m[0]);
    // Σ(1/p) = 0.1 + 0.125 + 0.0833333 = 0.3083333 ; 3/0.3083333 = 9.7297…
    expect(r.nMonths).toBe(3);
    expect(r.costBasis).toBeCloseTo(9.7297, 3);
    expect(r.costBasis).toBeLessThan((10 + 8 + 12) / 3); // < trung bình cộng 10
  });
});

describe("pickers", () => {
  const closes = [10, 9, 8, 7]; // 1 tháng 4 phiên
  const months = [[0, 1, 2, 3]];
  it("pickFirst mua phiên đầu", () => {
    expect(simulateDca(closes, months, pickFirst).costBasis).toBe(10);
  });
  it("pickMid mua phiên giữa", () => {
    // mid index của [0,1,2,3] = floor(4/2)=2 -> price 8
    expect(simulateDca(closes, months, pickMid).costBasis).toBe(8);
  });
  it("pickSeededRandom tái lập (cùng seed -> cùng kết quả)", () => {
    const p1 = pickSeededRandom(42);
    const p2 = pickSeededRandom(42);
    expect(simulateDca(closes, months, p1).costBasis)
      .toBe(simulateDca(closes, months, p2).costBasis);
  });
});

describe("monthsBetterFraction", () => {
  it("đếm tháng luật mua ≤ baseline", () => {
    const closes = [10, 8, /*m2*/ 5, 6];
    const months = [[0, 1], [2, 3]];
    const rulePick = (m: number[]) => m[1]; // luôn mua phiên 2 của tháng
    const basePick = (m: number[]) => m[0]; // baseline mua phiên 1
    const { favArr, pct } = monthsBetterFraction(closes, months, rulePick, basePick);
    // tháng1: rule idx1=8 ≤ base idx0=10 -> +1 ; tháng2: rule idx3=6 ≤ base idx2=5? 6≤5 sai -> -1
    expect(favArr).toEqual([1, -1]);
    expect(pct).toBeCloseTo(50, 6);
  });
});

describe("improvementPct", () => {
  it("dương khi luật rẻ hơn baseline", () => {
    const base = { costBasis: 10, nMonths: 1, sumInvPrice: 0.1 };
    const rule = { costBasis: 8, nMonths: 1, sumInvPrice: 0.125 };
    expect(improvementPct(rule, base)).toBeCloseTo(20, 6);
  });
});
