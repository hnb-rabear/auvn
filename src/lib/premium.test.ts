import { describe, it, expect } from "vitest";
import { closeBefore, worldVndPerLuong, premiumPct, rederivePremiums } from "./premium";
import type { VnGoldEntry } from "./types";

const bars = [
  { date: "2026-10-20", close: 4142.6 },
  { date: "2026-10-21", close: 4150 },
  { date: "2026-10-22", close: 4108.3 }, // phiên đang chạy lúc VN 11h ngày 22
];

const row = (date: string, sjcSell: number | null, usdVnd: number | null): VnGoldEntry => ({
  date, sjcBuy: null, sjcSell, ringBuy: null, ringSell: null, usdVnd, xauUsd: null, premiumPct: null,
});

describe("closeBefore", () => {
  it("lấy bar có date NHỎ HƠN hẳn ngày VN (phiên đã đóng)", () => {
    expect(closeBefore(bars, "2026-10-22")).toBe(4150);
  });
  it("cuối tuần/ngày sau chuỗi lấy bar cuối", () => {
    expect(closeBefore(bars, "2026-10-25")).toBe(4108.3);
  });
  it("trước bar đầu ⇒ null", () => {
    expect(closeBefore(bars, "2026-10-20")).toBeNull();
  });
});

describe("premiumPct", () => {
  it("khớp số tay: 2500$/oz, 25400 VND, SJC 86tr ⇒ 12,33%", () => {
    expect(premiumPct(86_000_000, worldVndPerLuong(2500, 25400))).toBe(12.33);
  });
  it("thiếu vế nào ⇒ null, không phải 0", () => {
    expect(premiumPct(null, 1)).toBeNull();
    expect(worldVndPerLuong(2500, null)).toBeNull();
  });
});

describe("rederivePremiums", () => {
  it("cùng ngày D ⇒ cùng premium dù cron chạy trước hay sau khi bar D xuất hiện", () => {
    const h = [row("2026-10-22", 142_300_000, 26050)];
    const early = rederivePremiums(h, bars.slice(0, 2));
    const late = rederivePremiums(h, bars);
    expect(late[0].premiumPct).toBe(early[0].premiumPct);
    expect(late[0].xauUsd).toBe(4150);
  });
  it("không chạm cột thô, giữ backfilled, usdVnd null ⇒ premium null", () => {
    const h: VnGoldEntry[] = [
      { ...row("2026-10-21", 142_300_000, null), sjcBuy: 139_300_000, ringSell: 145_000_000, backfilled: true },
    ];
    const out = rederivePremiums(h, bars)[0];
    expect(out).toMatchObject({ sjcBuy: 139_300_000, sjcSell: 142_300_000, ringSell: 145_000_000, usdVnd: null, backfilled: true, premiumPct: null });
    expect(out.xauUsd).toBe(4142.6);
  });
  it("dòng trước bar đầu giữ xauUsd đã lưu", () => {
    const h = [{ ...row("2026-10-19", 86_000_000, 25400), xauUsd: 2500 }];
    expect(rederivePremiums(h, bars)[0]).toMatchObject({ xauUsd: 2500, premiumPct: 12.33 });
  });
  it("không sửa mảng đầu vào", () => {
    const h = [row("2026-10-22", 142_300_000, 26050)];
    rederivePremiums(h, bars);
    expect(h[0].premiumPct).toBeNull();
  });
});
