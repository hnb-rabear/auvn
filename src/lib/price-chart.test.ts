import { describe, expect, it } from "vitest";
import { windowFor, sjcUsdMap, buildGeom, idxAtFrac, MIN_SPAN, POINTS_PER_MONTH } from "./price-chart";
import type { TimelinePoint, VnGoldEntry } from "./types";

const mkPt = (date: string, price: number) =>
  ({ date, price, composite: 0, zone: "neutral", scores: {}, returns: { "21": null, "63": null, "126": null } }) as unknown as TimelinePoint;
const mkVn = (date: string, sjcSell: number | null, usdVnd: number | null = null): VnGoldEntry =>
  ({ date, sjcBuy: null, sjcSell, ringBuy: null, ringSell: null, usdVnd, xauUsd: null, premiumPct: null });

describe("windowFor", () => {
  it("1 tháng = 21 phiên neo cuối", () => {
    expect(windowFor(100, 1)).toEqual({ start: 100 - POINTS_PER_MONTH, span: POINTS_PER_MONTH });
  });
  it("Max = toàn bộ", () => {
    expect(windowFor(100, null)).toEqual({ start: 0, span: 100 });
  });
  it("kẹp MIN_SPAN và total", () => {
    expect(windowFor(10, 1)).toEqual({ start: 0, span: 10 }); // total < MIN_SPAN ⇒ span=total
    expect(windowFor(100, 0 as unknown as number).span).toBeGreaterThanOrEqual(MIN_SPAN);
  });
  it("3N (36 tháng) vượt total ⇒ kẹp về total", () => {
    expect(windowFor(200, 36)).toEqual({ start: 0, span: 200 }); // 36*21=756 > 200
  });
});

describe("idxAtFrac", () => {
  it("map frac 0/0.5/1 vào cửa sổ", () => {
    expect(idxAtFrac(10, 21, 0)).toBe(10);
    expect(idxAtFrac(10, 21, 0.5)).toBe(20);
    expect(idxAtFrac(10, 21, 1)).toBe(30);
  });
  it("kẹp frac ngoài [0,1]", () => {
    expect(idxAtFrac(5, 10, -0.5)).toBe(5);
    expect(idxAtFrac(5, 10, 1.5)).toBe(14);
  });
  it("span 1 luôn trả start", () => {
    expect(idxAtFrac(7, 1, 0.9)).toBe(7);
  });
});

describe("sjcUsdMap", () => {
  it("quy đổi sjcSell/usdVnd/LUONG*TROY đúng công thức, bỏ hàng thiếu 1 trong 2", () => {
    const m = sjcUsdMap([
      mkVn("2025-02-08", 151_400_000, 25400),
      mkVn("2025-02-09", 151_400_000, null),
      mkVn("2025-02-10", null, 25400),
    ]);
    expect(m.get("2025-02-08")).toBeCloseTo((151_400_000 / 25400 / 37.5) * 31.1034768, 3);
    expect(m.has("2025-02-09")).toBe(false);
    expect(m.has("2025-02-10")).toBe(false);
  });
});

describe("buildGeom", () => {
  const pts = [mkPt("2025-02-08", 2800), mkPt("2025-02-09", 2900), mkPt("2025-02-10", 2850)];

  it("xauPath luôn phủ toàn bộ cửa sổ (không cắt theo dữ liệu SJC), x tăng dần", () => {
    const g = buildGeom(pts, 0, 3, new Map());
    expect(g.xauPath.startsWith("M")).toBe(true);
    expect(g.x(0)).toBeLessThan(g.x(2));
    expect(g.sjcPath).toBeNull();
    expect(g.sjcFrom).toBeNull();
    expect(g.min).toBe(2800);
    expect(g.max).toBe(2900);
  });

  it("sjcPath chỉ nối ngày có dữ liệu (sjcSell + usdVnd cùng ngày), sjcFrom = ngày đầu trong cửa sổ", () => {
    const sjc = sjcUsdMap([mkVn("2025-02-09", 151_400_000, 25400), mkVn("2025-02-10", 152_000_000, 25400)]);
    const g = buildGeom(pts, 0, 3, sjc);
    expect(g.sjcPath).not.toBeNull();
    expect(g.sjcFrom).toBe("2025-02-09");
  });

  it("SJC và XAU dùng chung 1 trục y: giá trị (quy đổi) cao hơn ⇒ y nhỏ hơn — không thể chéo giả tạo", () => {
    // XAU trong cửa sổ 2800..2900; SJC quy đổi ra một giá trị RÕ RÀNG cao hơn xauMax
    const sjc = new Map([["2025-02-09", 3200], ["2025-02-10", 3300]]);
    const g = buildGeom(pts, 0, 3, sjc);
    expect(g.min).toBe(2800);
    expect(g.max).toBe(3300);
    expect(g.y(3300)).toBeLessThan(g.y(2800));
    // điểm SJC (3200, luôn cao hơn mọi giá XAU trong cửa sổ) phải nằm phía TRÊN toàn bộ đường XAU
    expect(g.y(3200)).toBeLessThan(g.y(g.xauMax));
  });

  it("nguồn SJC gián đoạn cuối cửa sổ ⇒ giữ giá cuối bằng đoạn nét đứt, không biến mất", () => {
    const sjc = new Map([["2025-02-08", 3000]]); // chỉ có giá ngày đầu, 2 ngày sau thiếu
    const g = buildGeom(pts, 0, 3, sjc);
    expect(g.sjcPath).toBeNull(); // chỉ 1 điểm thật ⇒ không đủ vẽ đoạn "thật"
    expect(g.sjcTailPath).not.toBeNull();
    expect(g.sjcAsOf).toBe("2025-02-08");
  });

  it("giá SJC thật ở phiên cuối cửa sổ ⇒ không cần giữ giá (sjcTailPath null)", () => {
    const sjc = new Map([["2025-02-10", 3000]]);
    const g = buildGeom(pts, 0, 3, sjc);
    expect(g.sjcTailPath).toBeNull();
    expect(g.sjcAsOf).toBeNull();
  });

  it("có giá SJC trước cửa sổ (seed) nhưng không có giá nào trong cửa sổ ⇒ giữ ngang cả cửa sổ", () => {
    const sjc = new Map([["2025-02-01", 3000]]);
    const g = buildGeom(pts, 0, 3, sjc);
    expect(g.sjcPath).toBeNull();
    expect(g.sjcTailPath).not.toBeNull();
    expect(g.sjcAsOf).toBe("2025-02-01");
  });
});
