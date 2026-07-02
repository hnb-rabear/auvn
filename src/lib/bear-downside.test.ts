// src/lib/bear-downside.test.ts
import { describe, it, expect } from "vitest";
import { bucketOf, furtherDrawdownPct, terminalReturnPct, computeHorizonStat, BUCKETS, runBearDownside } from "./bear-downside";
import { runBearDownsideHistory } from "./bear-downside";

describe("bucketOf", () => {
  it("ánh xạ dd fraction sang 0..3", () => {
    expect(bucketOf(0.05)).toBe(0);
    expect(bucketOf(0.15)).toBe(1);
    expect(bucketOf(0.25)).toBe(2);
    expect(bucketOf(0.40)).toBe(3);
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(0.10)).toBe(1); // biên trên thuộc bucket kế
  });
});

describe("furtherDrawdownPct", () => {
  it("đáy tệ nhất trong H phiên tới (âm khi còn rơi)", () => {
    const closes = [100, 90, 95, 80]; // từ i=0, H=3: min(90,95,80)=80 -> -20%
    expect(furtherDrawdownPct(closes, 0, 3)!).toBeCloseTo(-20, 6);
  });
  it("dương khi hôm nay là đáy (giá chỉ đi lên)", () => {
    const closes = [80, 90, 100]; // min(90,100)=90 > 80 -> +12.5% (≥0 ⇒ tính là "đáy đã phía sau")
    expect(furtherDrawdownPct(closes, 0, 2)!).toBeGreaterThan(0);
  });
  it("null khi chưa đủ H phiên tương lai", () => {
    expect(furtherDrawdownPct([100, 90], 0, 5)).toBeNull();
  });
});

describe("terminalReturnPct", () => {
  it("lợi suất tại mốc H (KHÔNG phải đáy giữa kỳ)", () => {
    const closes = [100, 90, 110]; // i=0,H=2: closes[2]/closes[0]-1 = +10% (bỏ qua nhịp dúi 90)
    expect(terminalReturnPct(closes, 0, 2)!).toBeCloseTo(10, 6);
  });
  it("null khi chưa đủ H phiên tương lai", () => {
    expect(terminalReturnPct([100, 90], 0, 5)).toBeNull();
  });
});

describe("computeHorizonStat", () => {
  it("tính trung vị, P(đáy phía sau), n", () => {
    // 40 giá trị: 20 âm (-10), 20 bằng 0 -> pBottomBehind 50%, median -5
    const vals = [...Array(20).fill(-10), ...Array(20).fill(0)];
    const s = computeHorizonStat(vals, 63);
    expect(s.horizonDays).toBe(63);
    expect(s.n).toBe(40);
    expect(s.pBottomBehind).toBeCloseTo(50, 0);
    expect(s.median).toBeCloseTo(-5, 6); // nội suy giữa -10 và 0
  });
  it("endMedian & pUp từ termValues (mặt kết cục)", () => {
    const vals = Array(40).fill(-2); // dip bất kỳ
    const term = [...Array(15).fill(5), ...Array(5).fill(-3)]; // 15 tăng / 5 giảm -> pUp 75%, trung vị 5
    const s = computeHorizonStat(vals, 63, term);
    expect(s.pUp).toBeCloseTo(75, 0);
    expect(s.endMedian).toBeCloseTo(5, 6);
  });
  it("endMedian/pUp = 0 khi không truyền termValues (tương thích cũ)", () => {
    const s = computeHorizonStat([-1, -2, -3], 63);
    expect(s.endMedian).toBe(0);
    expect(s.pUp).toBe(0);
  });
});

describe("runBearDownside", () => {
  // chuỗi tăng dài để có ATH rõ rồi rơi cuối -> bucket hiện tại > 0
  const bars = [
    ...Array.from({ length: 400 }, (_, i) => ({ date: `2020-${String((i % 12) + 1).padStart(2, "0")}-01`, close: 100 + i })),
    ...Array.from({ length: 60 }, (_, i) => ({ date: "2024-01-01", close: 499 - i * 3 })), // rơi từ ~499
  ];
  it("báo bucket hiện tại theo drawdown và bảng 3 horizon (1/3/6 tháng)", () => {
    const a = runBearDownside(bars, { conditioningWorks: true });
    expect(a.currentDdPct).toBeGreaterThan(0);
    expect(a.currentPrice).toBe(322); // last close = 499 − 59×3
    expect(a.buckets.length).toBe(4); // 4 bucket độ sâu (không đổi)
    expect(a.unconditional.length).toBe(3); // 1/3/6 tháng (bỏ 12T)
    expect(a.unconditional[0].horizonDays).toBe(21);
    expect(a.unconditional.map((s) => s.horizonDays)).toEqual([21, 63, 126]);
  });
  it("conditioningWorks=false -> shownSource unconditional", () => {
    const a = runBearDownside(bars, { conditioningWorks: false });
    expect(a.shownSource).toBe("unconditional");
    expect(a.shown).toEqual(a.unconditional);
  });
});

describe("runBearDownsideHistory", () => {
  // chuỗi tăng dần có nhịp dúi định kỳ để có mẫu cả hai phía
  const bars = Array.from({ length: 900 }, (_, i) => ({
    date: `2020-${String(1 + Math.floor(i / 300)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
    close: 1000 + i - (i % 30 === 0 ? 50 : 0),
  }));

  it("phát 1 dòng mỗi ngày lưới thưa + ép index cuối", () => {
    const rows = runBearDownsideHistory(bars);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].date).toBe(bars[bars.length - 1].date); // ép ngày cuối
    // ngày sớm chưa đủ mẫu đáo hạn -> band null
    expect(rows[0].bands["126"]).toBeNull();
  });

  it("GOLDEN: dải as-of ngày cuối === runBearDownside(bars).unconditional (5 trường)", () => {
    const rows = runBearDownsideHistory(bars);
    const last = rows[rows.length - 1];
    const uncond = runBearDownside(bars).unconditional; // BearHorizonStat[]
    for (const H of [21, 63, 126] as const) {
      const band = last.bands[H];
      const u = uncond.find((s) => s.horizonDays === H)!;
      expect(band).not.toBeNull();
      expect(band!.median).toBeCloseTo(u.median, 6);
      expect(band!.p10).toBeCloseTo(u.p10, 6);
      expect(band!.endMedian).toBeCloseTo(u.endMedian, 6);
      expect(band!.pUp).toBeCloseTo(u.pUp, 6);
      expect(band!.n).toBe(u.n);
    }
  });

  it("không look-ahead: n của dải as-of không giảm theo thời gian", () => {
    const rows = runBearDownsideHistory(bars).filter((r) => r.bands["21"] !== null);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].bands["21"]!.n).toBeGreaterThanOrEqual(rows[i - 1].bands["21"]!.n);
    }
  });
});
