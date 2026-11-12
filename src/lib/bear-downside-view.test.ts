import { describe, it, expect } from "vitest";
import { ddAsOfPct, actualWorstDipPct, pUpTenths, coverageStats, monthAnchors, monthPosOf, ewmaSigma, stormRatio, stormAt, stormEvidence, monitorBearDownside } from "./bear-downside-view";
import type { TimelinePoint } from "./types";

/** Điểm timeline tối giản cho coverageStats: giá phẳng, returns + band đặt sẵn. */
function mkPoints(
  n: number,
  band: { p10: number; endP25: number; endP75: number } | null,
  ret: number | null
): TimelinePoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `d${String(i).padStart(4, "0")}`,
    price: 100,
    composite: 0,
    zone: "neutral" as TimelinePoint["zone"],
    scores: {},
    returns: { "21": ret, "63": ret, "126": ret },
    bearAsOf: band
      ? { "21": { median: 0, p10: band.p10, endMedian: 0, endP25: band.endP25, endP75: band.endP75, pUp: 50, n: 100 }, "63": null, "126": null }
      : undefined,
  }));
}

describe("ddAsOfPct", () => {
  it("dùng ATH tới X, không nhìn tương lai", () => {
    const prices = [100, 120, 90, 200]; // tại X=2: ATH(100,120,90)=120, dd=(120-90)/120=25%
    expect(ddAsOfPct(prices, 2)).toBeCloseTo(25, 6);
  });
  it("0 khi đang ở đỉnh", () => {
    expect(ddAsOfPct([100, 120], 1)).toBeCloseTo(0, 6);
  });
});

describe("actualWorstDipPct", () => {
  it("đáy tệ nhất H phiên tới so hôm nay", () => {
    const prices = [100, 90, 95, 80];
    expect(actualWorstDipPct(prices, 0, 3)!).toBeCloseTo(-20, 6); // min(90,95,80)=80
  });
  it("null khi chưa đáo hạn", () => {
    expect(actualWorstDipPct([100, 90], 0, 5)).toBeNull();
  });
});

describe("pUpTenths", () => {
  it("làm tròn về bậc 1/10", () => {
    expect(pUpTenths(83.5)).toBe(8);
    expect(pUpTenths(62.7)).toBe(6);
    expect(pUpTenths(36)).toBe(4);
  });
  it("clamp 1..9 — không bao giờ tuyên bố chắc chắn 0/10 hay 10/10", () => {
    expect(pUpTenths(2)).toBe(1);
    expect(pUpTenths(0)).toBe(1);
    expect(pUpTenths(97)).toBe(9);
    expect(pUpTenths(100)).toBe(9);
  });
});

describe("coverageStats", () => {
  it("dải trùm mọi kết cục → endIn50=100; đáy không thủng p10 → dipBeyond10=0", () => {
    // giá phẳng ⇒ đáy thực = 0% > p10=−5; kết cục 0 ∈ [−1, 1]
    const c = coverageStats(mkPoints(200, { p10: -5, endP25: -1, endP75: 1 }, 0), "21");
    expect(c).not.toBeNull();
    expect(c!.endIn50).toBe(100);
    expect(c!.dipBeyond10).toBe(0);
  });
  it("dải trượt hết → endIn50=0", () => {
    const c = coverageStats(mkPoints(200, { p10: -5, endP25: 3, endP75: 7 }, 0), "21");
    expect(c!.endIn50).toBe(0);
  });
  it("null khi thiếu band hoặc <30 mẫu đáo hạn", () => {
    expect(coverageStats(mkPoints(200, null, 0), "21")).toBeNull();
    expect(coverageStats(mkPoints(50, { p10: -5, endP25: -1, endP75: 1 }, 0), "21")).toBeNull();
  });
  it("bỏ mẫu chưa đáo hạn (returns null)", () => {
    expect(coverageStats(mkPoints(200, { p10: -5, endP25: -1, endP75: 1 }, null), "21")).toBeNull();
  });
});

describe("monthAnchors", () => {
  it("chỉ số phiên đầu của mỗi năm-tháng", () => {
    const dates = ["2020-01-03", "2020-01-31", "2020-02-04", "2020-02-20", "2020-03-02"];
    expect(monthAnchors(dates)).toEqual([0, 2, 4]);
  });
  it("bỏ khoảng trống dữ liệu (tháng thiếu vẫn tính theo tháng có mặt)", () => {
    const dates = ["2020-01-03", "2020-03-10", "2020-03-25", "2021-01-05"];
    expect(monthAnchors(dates)).toEqual([0, 1, 3]); // 01, 03, next-year-01
  });
  it("rỗng khi không có ngày", () => {
    expect(monthAnchors([])).toEqual([]);
  });
});

describe("monthPosOf", () => {
  const anchors = [0, 2, 4];
  it("trả anchor lớn nhất ≤ idx", () => {
    expect(monthPosOf(anchors, 0)).toBe(0);
    expect(monthPosOf(anchors, 1)).toBe(0); // vẫn trong tháng đầu
    expect(monthPosOf(anchors, 2)).toBe(1);
    expect(monthPosOf(anchors, 3)).toBe(1);
    expect(monthPosOf(anchors, 5)).toBe(2); // sau anchor cuối
  });
});

/** giá dao động đều biên ±a quanh 100 (log-return cố định độ lớn) */
function zigzag(n: number, a: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 * (i % 2 ? 1 + a : 1));
}

describe("ewmaSigma / stormAt", () => {
  it("chuỗi dao động đều: σ ổn định, không bão", () => {
    const s = ewmaSigma(zigzag(700, 0.01));
    expect(s.length).toBe(700);
    expect(stormAt(s, 699)).toBe(false);
    expect(stormRatio(s, 699)!).toBeCloseTo(1, 1);
  });
  it("trước 504 phiên: không đủ lịch sử ⇒ false / null", () => {
    const s = ewmaSigma(zigzag(600, 0.01));
    expect(stormAt(s, 503)).toBe(false);
    expect(stormRatio(s, 503)).toBeNull();
  });
  it("biên độ nhảy gấp 3 ở cuối ⇒ bão", () => {
    const p = [...zigzag(600, 0.01), ...zigzag(30, 0.03).map((x) => x)];
    const s = ewmaSigma(p);
    expect(stormAt(s, 629)).toBe(true);
  });
  it("past-only: σ[X] không đổi khi thêm giá sau X", () => {
    const p = zigzag(600, 0.01);
    const a = ewmaSigma(p)[550];
    const b = ewmaSigma([...p, 500, 1, 900])[550];
    expect(b).toBe(a);
  });
});

/** timeline tổng hợp: giá tùy chọn, band 21 cố định, returns 21 tính từ giá */
function mkTl(prices: number[], band: { p10: number; endP25: number; endP75: number }): TimelinePoint[] {
  return prices.map((price, i) => ({
    date: `d${String(i).padStart(4, "0")}`,
    price,
    composite: 0,
    zone: "neutral" as TimelinePoint["zone"],
    scores: {},
    returns: { "21": i + 21 < prices.length ? (prices[i + 21] / price - 1) * 100 : null, "63": null, "126": null },
    bearAsOf: { "21": { median: 0, p10: band.p10, endMedian: 0, endP25: band.endP25, endP75: band.endP75, pUp: 50, n: 100 }, "63": null, "126": null },
  }));
}

describe("monitorBearDownside", () => {
  it("dải luôn trượt (kết cục 0% nằm ngoài [5,10]) ⇒ degraded ở 21", () => {
    const h = monitorBearDownside(mkTl(Array(700).fill(100), { p10: -50, endP25: 5, endP75: 10 }));
    const it21 = h.items.find((x) => x.H === "21")!;
    expect(it21.status).toBe("degraded");
    expect(it21.endIn50).toBe(0);
    expect(it21.clusters).toBeGreaterThanOrEqual(6);
  });
  it("63/126 không có band ⇒ insufficient", () => {
    const h = monitorBearDownside(mkTl(Array(700).fill(100), { p10: -50, endP25: -1, endP75: 1 }));
    expect(h.items.find((x) => x.H === "63")!.status).toBe("insufficient");
    expect(h.items.find((x) => x.H === "126")!.status).toBe("insufficient");
  });
  it("timeline ngắn ⇒ insufficient, không ném lỗi", () => {
    const h = monitorBearDownside(mkTl(Array(40).fill(100), { p10: -50, endP25: -1, endP75: 1 }));
    expect(h.items.every((x) => x.status === "insufficient")).toBe(true);
  });
});

describe("stormEvidence", () => {
  it("không có ngày bão ⇒ null cho mọi kỳ hạn", () => {
    const tl = mkTl(zigzag(700, 0.01), { p10: -50, endP25: -1, endP75: 1 });
    const ev = stormEvidence(tl, ewmaSigma(tl.map((p) => p.price)));
    expect(ev["21"]).toBeNull();
  });

  // calm 600 → storm 100 → calm 100; p10=-1 ⇒ đỉnh zigzag 3% thủng, 1% không
  const stormTl = () => mkTl([...zigzag(600, 0.01), ...zigzag(100, 0.03), ...zigzag(100, 0.01)], { p10: -1, endP25: -1, endP75: 1 });

  it("asOf bỏ qua ≡ asOf = phiên cuối ≡ toàn lịch sử", () => {
    const tl = stormTl();
    const sig = ewmaSigma(tl.map((p) => p.price));
    const all = stormEvidence(tl, sig);
    expect(all["21"]).not.toBeNull();
    expect(stormEvidence(tl, sig, 3, tl.length - 1)).toEqual(all);
  });
  it("asOf: điểm đáo hạn sau asOf bị loại (không look-ahead)", () => {
    const tl = stormTl();
    const sig = ewmaSigma(tl.map((p) => p.price));
    const full = stormEvidence(tl, sig)["21"]!;
    const early = stormEvidence(tl, sig, 3, 660)["21"]!;
    expect(early.onClusters).toBeLessThan(full.onClusters);
    // tương đương cắt timeline tại asOf (σ past-only)
    expect(early).toEqual(stormEvidence(tl.slice(0, 661), sig.slice(0, 661))["21"]);
  });
});

describe("monitorBearDownside — lưới lấy mẫu cố định", () => {
  it("dịch last 1–2 phiên không đổi pha lưới ⇒ kết quả giống nhau", () => {
    // chỉ số chia hết cho 3 có dải bao kết cục 0%; các chỉ số khác thì trượt
    const tl = mkTl(Array(700).fill(100), { p10: -50, endP25: 5, endP75: 10 }).map((p, i) =>
      i % 3 === 0 ? { ...p, bearAsOf: { ...p.bearAsOf!, "21": { ...p.bearAsOf!["21"]!, endP25: -1, endP75: 1 } } } : p
    );
    const base = monitorBearDownside(tl).items.find((x) => x.H === "21")!;
    expect(base.endIn50).toBe(100);
    for (const cut of [1, 2]) {
      const it21 = monitorBearDownside(tl.slice(0, -cut)).items.find((x) => x.H === "21")!;
      expect(it21.endIn50).toBe(base.endIn50);
      expect(it21.dipBeyond10).toBe(base.dipBeyond10);
    }
  });
});
