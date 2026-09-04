import { describe, expect, it } from "vitest";
import { effectiveRing, spreadBadge, VN_ROUND_TRIP } from "./vn-gold";
import type { VnGoldEntry } from "./types";

const mk = (date: string, sjcSell: number | null, ringSell: number | null): VnGoldEntry => ({
  date,
  sjcBuy: sjcSell === null ? null : sjcSell - 3_000_000,
  sjcSell,
  ringBuy: ringSell === null ? null : ringSell - 4_000_000,
  ringSell,
  usdVnd: null,
  xauUsd: null,
  premiumPct: null,
});

describe("effectiveRing", () => {
  it("nhẫn cùng phiên SJC ⇒ date null (UI không ghi tuổi)", () => {
    const h = [mk("2026-09-03", 148_400_000, 148_800_000)];
    expect(effectiveRing(h, "2026-09-03")).toEqual({
      buy: 144_800_000,
      sell: 148_800_000,
      date: null,
    });
  });

  it("entry mới nhất thiếu nhẫn ⇒ lấy phiên nhẫn trước + ghi ngày (bug '— / —')", () => {
    const h = [mk("2026-09-03", 148_400_000, 148_800_000), mk("2026-09-04", 148_600_000, null)];
    expect(effectiveRing(h, "2026-09-04")).toEqual({
      buy: 144_800_000,
      sell: 148_800_000,
      date: "2026-09-03",
    });
  });

  it("nhiều phiên liền thiếu nhẫn ⇒ vẫn quét tới phiên có dữ liệu", () => {
    const h = [
      mk("2026-09-01", 147_000_000, 147_500_000),
      mk("2026-09-02", 148_000_000, null),
      mk("2026-09-03", 148_400_000, null),
      mk("2026-09-04", 148_600_000, null),
    ];
    expect(effectiveRing(h, "2026-09-04").date).toBe("2026-09-01");
  });

  it("chưa từng có giá nhẫn ⇒ null hết (không bịa số)", () => {
    const h = [mk("2026-09-03", 148_400_000, null), mk("2026-09-04", 148_600_000, null)];
    expect(effectiveRing(h, "2026-09-04")).toEqual({ buy: null, sell: null, date: null });
  });

  it("lịch sử rỗng ⇒ null hết", () => {
    expect(effectiveRing([], null)).toEqual({ buy: null, sell: null, date: null });
  });
});

describe("spreadBadge", () => {
  it("spread bình thường ⇒ wide=false", () => {
    // 148,4 / 151,0 ⇒ 1,72%, quanh trung vị lịch sử 1,66%
    const s = spreadBadge(148_400_000, 151_000_000)!;
    expect(s.pct).toBeCloseTo(1.72, 2);
    expect(s.wide).toBe(false);
  });

  it("đúng vạch p90 ⇒ wide=true (>=, không phải >)", () => {
    const sell = 100_000_000;
    const buy = sell * (1 - VN_ROUND_TRIP.spreadP90Pct / 100);
    expect(spreadBadge(buy, sell)!.wide).toBe(true);
  });

  it("ngưỡng badge trùng ngưỡng −1 điểm của signal spread trong criteria.ts", () => {
    expect(VN_ROUND_TRIP.spreadP90Pct).toBe(2.5);
  });

  it("thiếu giá hoặc giá bán ≤ 0 ⇒ null (không chia 0, không bịa badge)", () => {
    expect(spreadBadge(null, 151_000_000)).toBeNull();
    expect(spreadBadge(148_400_000, null)).toBeNull();
    expect(spreadBadge(148_400_000, 0)).toBeNull();
  });
});
