import { describe, it, expect } from "vitest";
import { depthQty, boostQty, classifyPhase, qtyForPhase, runBearDca, monitorBearDca, bearDcaAt, bearPhases } from "./bear-dca";
import type { BearDcaPoint } from "./types";

describe("depthQty", () => {
  it("dd<15% → 0.5", () => expect(depthQty(0.10)).toBe(0.5));
  it("dd=15% → 0.75", () => expect(depthQty(0.15)).toBe(0.75));
  it("dd=25% → 1.0", () => expect(depthQty(0.25)).toBe(1.0));
  it("dd=40% → 1.5", () => expect(depthQty(0.40)).toBe(1.5));
});

describe("boostQty", () => {
  it("pct2y<25% → 1.5", () => expect(boostQty(0.10)).toBe(1.5));
  it("pct2y=50% → 0.75", () => expect(boostQty(0.50)).toBe(0.75));
  it("pct2y=75% → 0.5", () => expect(boostQty(0.75)).toBe(0.5));
});

describe("classifyPhase", () => {
  it("dd<15% → bull bất kể ddChange", () => {
    expect(classifyPhase(0.10, 0.10)).toBe("bull");
    expect(classifyPhase(0.14, -0.10)).toBe("bull");
  });
  it("dd≥15% + ddChange>+3pp → acute", () => expect(classifyPhase(0.20, 0.05)).toBe("acute"));
  it("dd≥15% + ddChange<−3pp → recovery", () => expect(classifyPhase(0.20, -0.05)).toBe("recovery"));
  it("dd≥15% + |ddChange|≤3pp → grind", () => {
    expect(classifyPhase(0.20, 0.02)).toBe("grind");
    expect(classifyPhase(0.20, -0.02)).toBe("grind");
  });
});

describe("qtyForPhase", () => {
  it("bull → 1.0", () => expect(qtyForPhase("bull", 0.5, 0.1)).toBe(1.0));
  it("acute → depthQty", () => expect(qtyForPhase("acute", 0.40, 0.9)).toBe(1.5));
  it("grind → boostQty", () => expect(qtyForPhase("grind", 0.20, 0.10)).toBe(1.5));
  it("grind pct2y null → 0.75", () => expect(qtyForPhase("grind", 0.20, null)).toBe(0.75));
  it("recovery → 1.5", () => expect(qtyForPhase("recovery", 0.30, 0.5)).toBe(1.5));
});

describe("runBearDca", () => {
  const mk = (n: number, priceAt: (i: number) => number, pct = 0.5): BearDcaPoint[] =>
    Array.from({ length: n }, (_, i) => ({ date: `d${String(i).padStart(4, "0")}`, price: priceAt(i), pricePct2y: pct }));

  it("bull: dd<15% → phase bull, mult 1.0, isBear false", () => {
    const r = runBearDca(mk(600, (i) => 1000 + i * 5));
    expect(r.phase).toBe("bull");
    expect(r.mult).toBe(1.0);
    expect(r.isBear).toBe(false);
    expect(r.recoveryRisk).toBe(false);
  });

  it("acute: tăng rồi sụp nhanh → phase acute, recoveryRisk false", () => {
    // 500 tăng 1000→1500, 50 sụp 1500→1000 (dd sâu, ddChange dương lớn)
    const pts = [
      ...mk(500, (i) => 1000 + i),
      ...Array.from({ length: 50 }, (_, i) => ({ date: `s${i}`, price: 1500 - i * 10, pricePct2y: 0.7 })),
    ];
    const r = runBearDca(pts);
    expect(r.phase).toBe("acute");
    expect(r.isBear).toBe(true);
    expect(r.recoveryRisk).toBe(false);
  });

  it("recovery: sụp sâu rồi hồi → phase recovery, mult 1.5, recoveryRisk true", () => {
    // 300 tăng 1000→4000, 100 sụp 4000→2000, 50 hồi 2000→2600
    const pts = [
      ...Array.from({ length: 300 }, (_, i) => ({ date: `u${i}`, price: 1000 + i * 10, pricePct2y: 0.8 })),
      ...Array.from({ length: 100 }, (_, i) => ({ date: `d${i}`, price: 4000 - i * 20, pricePct2y: 0.4 })),
      ...Array.from({ length: 50 }, (_, i) => ({ date: `r${i}`, price: 2000 + i * 12, pricePct2y: 0.3 })),
    ];
    const r = runBearDca(pts);
    expect(r.phase).toBe("recovery");
    expect(r.mult).toBe(1.5);
    expect(r.recoveryRisk).toBe(true);
    expect(r.isBear).toBe(true);
  });
});

describe("bearDcaAt", () => {
  const mk = (n: number, priceAt: (i: number) => number, pct = 0.5): BearDcaPoint[] =>
    Array.from({ length: n }, (_, i) => ({ date: `d${String(i).padStart(4, "0")}`, price: priceAt(i), pricePct2y: pct }));
  it("GOLDEN: as-of index cuối === runBearDca (cùng pha, cùng mult)", () => {
    const series = [
      mk(600, (i) => 1000 + i * 5), // bull
      [...mk(500, (i) => 1000 + i), ...mk(50, (i) => 1500 - i * 10, 0.7)], // acute
      [...mk(300, (i) => 1000 + i * 10, 0.8), ...mk(100, (i) => 4000 - i * 20, 0.4), ...mk(50, (i) => 2000 + i * 12, 0.3)], // recovery
    ];
    for (const pts of series) {
      const full = runBearDca(pts);
      const at = bearDcaAt(pts.map((q) => q.price), pts.length - 1, pts[pts.length - 1].pricePct2y);
      expect(at.phase).toBe(full.phase);
      expect(at.mult).toBe(full.mult);
      expect(at.dd).toBeCloseTo(full.ddFromAth, 10);
    }
  });
  it("index giữa chuỗi: chỉ dùng quá khứ (không nhìn ATH tương lai)", () => {
    // đỉnh tương lai 5000 không được tính vào ATH tại i=99
    const prices = [...Array.from({ length: 100 }, (_, i) => 1000 + i), 5000];
    const at = bearDcaAt(prices, 99, 0.5);
    expect(at.dd).toBeCloseTo(0, 6); // đang ở đỉnh as-of
    expect(at.phase).toBe("bull");
  });
});

describe("bearPhases", () => {
  it("GOLDEN: bằng bearDcaAt(...).phase tại TỪNG index (chuỗi phủ đủ 4 pha)", () => {
    // tăng (bull) → sụp nhanh (acute) → hồi (recovery) → rơi chậm giữ dd sâu (grind)
    const prices = [
      ...Array.from({ length: 300 }, (_, i) => 1000 + i * 10),
      ...Array.from({ length: 100 }, (_, i) => 4000 - i * 20),
      ...Array.from({ length: 50 }, (_, i) => 2000 + i * 12),
      ...Array.from({ length: 100 }, (_, i) => 2600 - i * 1),
    ];
    const phases = bearPhases(prices);
    expect(phases.length).toBe(prices.length);
    for (let i = 0; i < prices.length; i++) {
      expect(phases[i], `index ${i}`).toBe(bearDcaAt(prices, i, 0.5).phase);
    }
    expect(new Set(phases).size).toBe(4); // chuỗi thực sự đi qua đủ 4 pha
  });
});

describe("monitorBearDca", () => {
  const mk = (n: number, priceAt: (i: number) => number, start = "2014-01-01"): BearDcaPoint[] => {
    const out: BearDcaPoint[] = [];
    let t = Date.parse(start + "T00:00:00Z");
    for (let i = 0; i < n; i++) {
      out.push({ date: new Date(t).toISOString().slice(0, 10), price: priceAt(i), pricePct2y: 0.5 });
      t += 86400000;
    }
    return out;
  };
  it("insufficient khi quá ít điểm", () => {
    expect(monitorBearDca(mk(50, (i) => 100 + i)).status).toBe("insufficient");
  });
  it("bull thuần → insufficient (lớp chưa can thiệp, KHÔNG phải degraded)", () => {
    // phiên bản cũ: mọi q=1 → impr=0 → 'degraded' oan. Giờ: <6 nhịp bear → không chấm.
    const h = monitorBearDca(mk(1400, (i) => 100 + i));
    expect(h.status).toBe("insufficient");
    expect(h.recentBearCycles).toBeLessThan(6);
    expect(h.recentImprPct).toBeNull();
  });
  it("bear đủ nhịp → chấm điểm trên nhịp bear + metric tài sản", () => {
    // 400 tăng 100→500, rồi 1000 phiên rơi dần về ~250 (dd sâu, nhiều nhịp bear)
    const h = monitorBearDca(mk(1400, (i) => (i < 400 ? 100 + i : 500 - (i - 400) * 0.25)));
    expect(["ok", "degraded"]).toContain(h.status);
    expect(h.recentBearCycles).toBeGreaterThanOrEqual(6);
    expect(h.recentImprPct).not.toBeNull();
    expect(h.recentAssetImprPct).not.toBeNull();
  });
  it("impr ≈ 0 trong bear (q=1 mọi nhịp) → ok, không degraded (vùng nhiễu)", () => {
    // tăng lên 2000 rồi giữ phẳng 1000 ở đáy: dd=50% ổn định → grind, pct2y=0.5 → q=1.0
    const pts = mk(1600, (i) => (i < 200 ? 100 + i * 9.5 : 1000));
    const h = monitorBearDca(pts);
    expect(h.status).toBe("ok");
    expect(h.recentImprPct).toBeCloseTo(0, 1);
  });
});
