import { describe, it, expect } from "vitest";
import {
  pricePct2y,
  accumMult,
  brakeDescriptors,
  realizedCostImpr,
  runAccumulation,
} from "./accumulation";
import { ACCUM_CONFIG, type AccumPoint } from "./types";

describe("pricePct2y", () => {
  it("null khi chưa đủ warmup", () => {
    expect(pricePct2y([1, 2, 3], 2, 504)).toBeNull();
  });
  it("percentile = tỉ lệ ngày quá khứ <= hôm nay", () => {
    // win=4: closes[0..3]=[10,20,30,40], i=4 giá=25 -> 2/4 (10,20 <=25)
    expect(pricePct2y([10, 20, 30, 40, 25], 4, 4)).toBe(0.5);
  });
  it("past-only: thêm dữ liệu tương lai không đổi giá trị quá khứ", () => {
    const base = [10, 20, 30, 40, 25, 99];
    const a = pricePct2y(base, 4, 4);
    const b = pricePct2y([...base, 1, 2, 3], 4, 4);
    expect(a).toBe(b);
  });
});

describe("accumMult", () => {
  it("x1 khi không đắt, composite ổn", () => {
    expect(accumMult(0.5, 0)).toBe(1);
  });
  it("x0.25 khi giá đắt (>expHi), composite ổn", () => {
    expect(accumMult(0.8, 0)).toBe(0.25);
  });
  it("x0.5 khi composite bi quan, giá không đắt", () => {
    expect(accumMult(0.5, -40)).toBe(0.5);
  });
  it("stack đắt + bi quan bị kẹp ở sàn 0.2 (0.25*0.5=0.125 -> 0.2)", () => {
    expect(accumMult(0.9, -50)).toBe(0.2);
  });
  it("pricePct null (warmup) coi như không đắt", () => {
    expect(accumMult(null, 0)).toBe(1);
  });
  it("không bao giờ >1 hay =0 trên dải đầu vào", () => {
    for (const pp of [null, 0, 0.5, 0.75, 0.76, 1]) {
      for (const c of [-100, -30, 0, 55]) {
        const m = accumMult(pp as number | null, c);
        expect(m).toBeGreaterThanOrEqual(ACCUM_CONFIG.floor);
        expect(m).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("brakeDescriptors", () => {
  it("rỗng khi không phanh", () => {
    expect(brakeDescriptors(0.5, 0)).toEqual([]);
  });
  it("price-top khi đắt", () => {
    const b = brakeDescriptors(0.8, 0);
    expect(b.map((x) => x.id)).toEqual(["price-top"]);
  });
  it("cả hai khi đắt + bi quan", () => {
    const b = brakeDescriptors(0.9, -40);
    expect(b.map((x) => x.id)).toEqual(["price-top", "comp-bear"]);
  });
});

describe("realizedCostImpr", () => {
  it("phanh ở tháng đắt (khác tháng rẻ) -> giá vốn rẻ hơn (impr > 0)", () => {
    // win=4. Giá xen kẽ cao/thấp -> tháng cao bị phanh x0.25, tháng thấp giữ x1,
    // dồn trọng số sang tháng rẻ -> giá vốn TB thấp hơn. (Phanh ĐỒNG ĐỀU mọi tháng
    // sẽ cho impr=0 vì chỉ là co giãn tỉ lệ — phải phân biệt mới có lợi.)
    const closes = [50, 50, 50, 50, 100, 50, 100, 50];
    const composites = closes.map(() => 0);
    const cfg = { ...ACCUM_CONFIG, win: 4, expHi: 0.75 };
    const idxs = [4, 5, 6, 7]; // giá [100,50,100,50] -> mult [0.25,1,0.25,1]
    expect(realizedCostImpr(closes, composites, idxs, cfg)).toBeGreaterThan(0);
  });
});

describe("runAccumulation", () => {
  const points: AccumPoint[] = Array.from({ length: 520 }, (_, i) => ({
    date: `d${String(i).padStart(4, "0")}`,
    price: 100 + i, // tăng đều -> ngày cuối ở đỉnh percentile
    composite: 0,
  }));
  it("ngày cuối ở đỉnh 2 năm -> phanh x0.25, provisional=false", () => {
    const a = runAccumulation(points);
    expect(a.provisional).toBe(false);
    expect(a.pricePct2y).toBeGreaterThan(0.75);
    expect(a.mult).toBe(0.25);
    expect(a.brakes.map((b) => b.id)).toContain("price-top");
  });
  it("history phủ mọi điểm, dataDate = ngày cuối", () => {
    const a = runAccumulation(points);
    expect(a.history.length).toBe(points.length);
    expect(a.dataDate).toBe(points[points.length - 1].date);
  });
  it("provisional=true khi < warmup", () => {
    const a = runAccumulation(points.slice(0, 100));
    expect(a.provisional).toBe(true);
    expect(a.mult).toBeLessThanOrEqual(1);
  });
});
