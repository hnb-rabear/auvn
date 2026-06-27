import { describe, it, expect } from "vitest";
import { depthQty, boostQty, runBearDca } from "./bear-dca";
import type { BearDcaPoint } from "./types";

describe("depthQty", () => {
  it("dd<15% → 0.5", () => expect(depthQty(0.10)).toBe(0.5));
  it("dd=15% → 0.75", () => expect(depthQty(0.15)).toBe(0.75));
  it("dd=25% → 1.0", () => expect(depthQty(0.25)).toBe(1.0));
  it("dd=40% → 1.5", () => expect(depthQty(0.40)).toBe(1.5));
  it("dd=50% → 1.5", () => expect(depthQty(0.50)).toBe(1.5));
});

describe("boostQty", () => {
  it("pct2y<25% → 1.5", () => expect(boostQty(0.10)).toBe(1.5));
  it("pct2y=25% → 1.0", () => expect(boostQty(0.25)).toBe(1.0));
  it("pct2y=50% → 0.75", () => expect(boostQty(0.50)).toBe(0.75));
  it("pct2y=75% → 0.5", () => expect(boostQty(0.75)).toBe(0.5));
  it("pct2y=1.0 → 0.5", () => expect(boostQty(1.0)).toBe(0.5));
});

describe("runBearDca", () => {
  // 600 phiên giá tăng đều từ 1000 → 4000 (bull)
  const bullPts: BearDcaPoint[] = Array.from({ length: 600 }, (_, i) => ({
    date: `2020-01-${String(i % 28 + 1).padStart(2, "0")}`,
    price: 1000 + i * 5,
    pricePct2y: 0.9,
    cycleProb: null,
    swingProb: null,
  }));

  it("bull: isBear=false khi dd<15%", () => {
    const r = runBearDca(bullPts);
    expect(r.isBear).toBe(false);
    expect(r.mode).toBe("bull");
  });

  // 600 phiên: 300 tăng từ 1000→4000, 300 giảm từ 4000→2400 (bear -40%)
  const bearPts: BearDcaPoint[] = [
    ...Array.from({ length: 300 }, (_, i) => ({
      date: `d${String(i).padStart(4, "0")}`,
      price: 1000 + i * 10,
      pricePct2y: 0.8,
      cycleProb: null, swingProb: null,
    })),
    ...Array.from({ length: 300 }, (_, i) => ({
      date: `d${String(300 + i).padStart(4, "0")}`,
      price: 4000 - i * 5.3,
      pricePct2y: 0.7,
      cycleProb: null, swingProb: null,
    })),
  ];

  it("bear: isBear=true khi dd>=15%", () => {
    const r = runBearDca(bearPts);
    expect(r.isBear).toBe(true);
  });

  it("acute: isAcute=true khi sụp nhanh (dùng bearPts ngay đầu sụp)", () => {
    // Tạo 550 phiên: 500 tăng rồi 50 sụp -30% nhanh
    const pts: BearDcaPoint[] = [
      ...Array.from({ length: 500 }, (_, i) => ({
        date: `u${i}`, price: 1000 + i, pricePct2y: 0.5, cycleProb: null, swingProb: null,
      })),
      ...Array.from({ length: 50 }, (_, i) => ({
        date: `d${i}`, price: 1500 - i * 10, pricePct2y: 0.7, cycleProb: null, swingProb: null,
      })),
    ];
    const r = runBearDca(pts);
    // dd trong 21 phiên cuối tăng mạnh
    expect(r.isBear).toBe(true);
    expect(typeof r.ddChange).toBe("number");
    expect(r.isAcute).toBe(true);
  });

  it("bhFiredThisCycle=true khi có cycleProb>=60 trong 21 phiên cuối", () => {
    const pts: BearDcaPoint[] = [
      ...Array.from({ length: 500 }, (_, i) => ({
        date: `u${i}`, price: 1000 + i, pricePct2y: 0.5, cycleProb: null, swingProb: null,
      })),
      ...Array.from({ length: 21 }, (_, i) => ({
        date: `b${i}`, price: 1500 - i * 8, pricePct2y: 0.7,
        cycleProb: i === 10 ? 65 : null, swingProb: null,
      })),
    ];
    const r = runBearDca(pts);
    expect(r.bhFiredThisCycle).toBe(true);
  });
});
