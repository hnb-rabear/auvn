import { describe, it, expect } from "vitest";
import { deriveGuidance, type GuidanceInput, type BottomDescriptor } from "../src/lib/guidance";

const bottomLow: BottomDescriptor = { high: false, verified: true, label: "Săn đáy: xác suất gần đáy thấp (chu kỳ 40%, sóng 40%)." };
const bottomHigh: BottomDescriptor = { high: true, verified: true, label: "Săn đáy: xác suất gần đáy cao (chu kỳ 72%, sóng 40%)." };

const base: GuidanceInput = {
  zone: "neutral",
  composite: 0,
  bottom: bottomLow,
  premiumPct: 5,
  premiumP80: 16,
};

describe("deriveGuidance — ma trận điểm mua × săn đáy", () => {
  it("vùng bán → reduce, không bán tháo", () => {
    const g = deriveGuidance({ ...base, zone: "sell", composite: -45 });
    expect(g.level).toBe("reduce");
    expect(g.tone).toBe("sell");
    expect(g.how).toMatch(/KHÔNG bán tháo/);
  });

  it("mua + đáy cao → strong (tín hiệu mạnh nhất)", () => {
    const g = deriveGuidance({ ...base, zone: "buy", composite: 45, bottom: bottomHigh });
    expect(g.level).toBe("strong");
    expect(g.tone).toBe("buy");
  });

  it("mua + đáy thấp → buy theo kế hoạch", () => {
    const g = deriveGuidance({ ...base, zone: "buy", composite: 45, bottom: bottomLow });
    expect(g.level).toBe("buy");
  });

  it("trung tính + đáy cao → dca (gom rải)", () => {
    const g = deriveGuidance({ ...base, zone: "neutral", composite: 5, bottom: bottomHigh });
    expect(g.level).toBe("dca");
    expect(g.how).toMatch(/RẢI/);
  });

  it("trung tính + đáy thấp → wait", () => {
    const g = deriveGuidance({ ...base, zone: "neutral", composite: 5, bottom: bottomLow });
    expect(g.level).toBe("wait");
    expect(g.tone).toBe("neutral");
  });
});

describe("deriveGuidance — cổng premium VN", () => {
  it("chênh ≥ p80 chặn ngay cả khi tín hiệu thế giới thuận", () => {
    const g = deriveGuidance({ ...base, zone: "buy", composite: 50, bottom: bottomHigh, premiumPct: 18, premiumP80: 16 });
    expect(g.level).toBe("premium-wait");
    expect(g.how).toMatch(/đợi chênh lệch hạ/);
  });

  it("vùng bán vẫn ưu tiên hơn cổng premium", () => {
    const g = deriveGuidance({ ...base, zone: "sell", composite: -50, premiumPct: 18, premiumP80: 16 });
    expect(g.level).toBe("reduce");
  });

  it("chưa đủ lịch sử premium (p80 null) → không chặn, ghi chú chưa xếp hạng", () => {
    const g = deriveGuidance({ ...base, zone: "buy", composite: 45, bottom: bottomHigh, premiumPct: 18, premiumP80: null });
    expect(g.level).toBe("strong");
    expect(g.reasons.some((r) => /chưa đủ lịch sử/.test(r))).toBe(true);
  });

  it("premium null (lịch sử world-only) → cổng tắt, ghi 'chưa có dữ liệu'", () => {
    const g = deriveGuidance({ ...base, zone: "buy", composite: 50, bottom: bottomHigh, premiumPct: null, premiumP80: null });
    expect(g.level).toBe("strong");
    expect(g.reasons.some((r) => /Chênh VN: chưa có dữ liệu/.test(r))).toBe(true);
  });
});

describe("deriveGuidance — kiểm chứng đáy", () => {
  it("đáy chưa kiểm chứng (verified:false) không kích hoạt tín hiệu đáy", () => {
    const g = deriveGuidance({
      ...base,
      zone: "neutral",
      composite: 5,
      bottom: { high: true, verified: false, label: "(không dùng vì chưa verified)" },
    });
    expect(g.level).toBe("wait");
    expect(g.reasons.some((r) => /chưa đủ dữ liệu kiểm chứng/.test(r))).toBe(true);
  });

  it("dùng label do caller dựng khi đã verified", () => {
    const g = deriveGuidance({ ...base, bottom: { high: false, verified: true, label: "Săn đáy: nhóm điểm đáy chưa cao (chu kỳ bin 1/3)." } });
    expect(g.reasons.some((r) => /nhóm điểm đáy chưa cao/.test(r))).toBe(true);
  });

  it("luôn có đủ 3 lý do (điểm mua, săn đáy, chênh VN)", () => {
    expect(deriveGuidance(base).reasons).toHaveLength(3);
  });
});
