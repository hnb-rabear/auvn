import { describe, it, expect } from "vitest";
import { deriveGuidance, type GuidanceInput } from "../src/lib/guidance";

const base: GuidanceInput = {
  zone: "neutral",
  composite: 0,
  cycleProb: 40,
  cycleVerified: true,
  swingProb: 40,
  swingVerified: true,
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
    const g = deriveGuidance({ ...base, zone: "buy", composite: 45, cycleProb: 72 });
    expect(g.level).toBe("strong");
    expect(g.tone).toBe("buy");
  });

  it("mua + đáy thấp → buy theo kế hoạch", () => {
    const g = deriveGuidance({ ...base, zone: "buy", composite: 45, cycleProb: 40, swingProb: 40 });
    expect(g.level).toBe("buy");
  });

  it("trung tính + đáy cao → dca (gom rải)", () => {
    const g = deriveGuidance({ ...base, zone: "neutral", composite: 5, cycleProb: 65 });
    expect(g.level).toBe("dca");
    expect(g.how).toMatch(/RẢI/);
  });

  it("trung tính + đáy thấp → wait", () => {
    const g = deriveGuidance({ ...base, zone: "neutral", composite: 5, cycleProb: 40, swingProb: 40 });
    expect(g.level).toBe("wait");
    expect(g.tone).toBe("neutral");
  });
});

describe("deriveGuidance — cổng premium VN", () => {
  it("chênh ≥ p80 chặn ngay cả khi tín hiệu thế giới thuận", () => {
    const g = deriveGuidance({ ...base, zone: "buy", composite: 50, cycleProb: 70, premiumPct: 18, premiumP80: 16 });
    expect(g.level).toBe("premium-wait");
    expect(g.how).toMatch(/đợi chênh lệch hạ/);
  });

  it("vùng bán vẫn ưu tiên hơn cổng premium", () => {
    const g = deriveGuidance({ ...base, zone: "sell", composite: -50, premiumPct: 18, premiumP80: 16 });
    expect(g.level).toBe("reduce");
  });

  it("chưa đủ lịch sử premium (p80 null) → không chặn, ghi chú chưa xếp hạng", () => {
    const g = deriveGuidance({ ...base, zone: "buy", composite: 45, cycleProb: 70, premiumPct: 18, premiumP80: null });
    expect(g.level).toBe("strong");
    expect(g.reasons.some((r) => /chưa đủ lịch sử/.test(r))).toBe(true);
  });
});

describe("deriveGuidance — kiểm chứng đáy", () => {
  it("đáy chưa kiểm chứng (chưa verified) không kích hoạt tín hiệu đáy", () => {
    const g = deriveGuidance({
      ...base,
      zone: "neutral",
      composite: 5,
      cycleProb: 90,
      cycleVerified: false,
      swingProb: 90,
      swingVerified: false,
    });
    expect(g.level).toBe("wait");
    expect(g.reasons.some((r) => /chưa đủ dữ liệu kiểm chứng/.test(r))).toBe(true);
  });

  it("luôn có đủ 3 lý do (điểm mua, săn đáy, chênh VN)", () => {
    expect(deriveGuidance(base).reasons).toHaveLength(3);
  });
});
