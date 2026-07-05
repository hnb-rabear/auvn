import { describe, it, expect } from "vitest";
import { buyCount, buyNames, consensusLabel, consensusZone, presetSignals } from "./consensus";
import {
  presetComposite,
  scoreMapFromCriteria,
  PRESETS,
  type CriterionResult,
  type SubSignal,
} from "./types";

/** Criteria tối giản — presetSignals đọc key/score/available (+ signals của macro nếu có). */
function crit(
  scores: Partial<Record<CriterionResult["key"], number>>,
  unavailable: CriterionResult["key"][] = [],
  macroSignals?: Pick<SubSignal, "id" | "score" | "available">[]
): (Pick<CriterionResult, "key" | "score" | "available"> & {
  signals?: Pick<SubSignal, "id" | "score" | "available">[];
})[] {
  return (Object.entries(scores) as [CriterionResult["key"], number][]).map(([key, score]) => ({
    key,
    score,
    available: !unavailable.includes(key),
    ...(key === "macro" && macroSignals ? { signals: macroSignals } : {}),
  }));
}

describe("presetSignals (v4: macroSub)", () => {
  it("GOLDEN: composite từng preset ≡ presetComposite trên scoreMap của cùng criteria", () => {
    const criteria = crit(
      { technical: -0.6, premium: 1.2, macro: 1.8, stats: 0.25, momentum: 1 },
      ["premium"], // premium hay unavailable trên đường live thiếu lịch sử
      [
        { id: "dxy", score: 2, available: true },
        { id: "fed", score: -1, available: true },
        { id: "yield10y", score: 1, available: true },
      ]
    );
    const map = scoreMapFromCriteria(criteria);
    const signals = presetSignals(criteria);
    expect(signals).toHaveLength(PRESETS.length);
    for (const s of signals) {
      expect(s.composite).toBe(presetComposite(map, s.preset));
      expect(s.isBuy).toBe(s.composite >= s.preset.buyThreshold);
    }
  });

  it("đọc sub-signal vĩ mô: fed KHÔNG tham gia preset 1m (fed -2 không đè dxy/yield dương)", () => {
    // 2017/2023-scenario: DXY yếu (mua) + lợi suất rơi (mua) nhưng Fed đang TĂNG (bán).
    const criteria = crit(
      { technical: 1, macro: 0.33, stats: 1, momentum: 2 },
      [],
      [
        { id: "dxy", score: 2, available: true },
        { id: "fed", score: -2, available: true },
        { id: "yield10y", score: 1, available: true },
      ]
    );
    // preset 1m: KT .2×1 + TK .1×1 + MOM .3×2 + DXY .1×2 + YLD .3×1 = 1.4 → 70 ≥ 50
    const s1m = presetSignals(criteria).find((s) => s.preset.id === "1m")!;
    expect(s1m.composite).toBe(70);
    expect(s1m.isBuy).toBe(true);
  });

  it("preset 3m/6m v4.1: fed CÓ tham gia (trọng số nhỏ) nên fed -2 kéo composite xuống nhưng chưa đủ lật dấu mua", () => {
    const criteria = crit(
      { technical: 1, macro: 0.33, stats: 1, momentum: 2 },
      [],
      [
        { id: "dxy", score: 2, available: true },
        { id: "fed", score: -2, available: true },
        { id: "yield10y", score: 1, available: true },
      ]
    );
    // preset 3m: KT .1×1 + TK .2×1 + MOM .2×2 + DXY .2×2 + FED .1×(-2) + YLD .2×1 = 1.1 → 55 ≥ 40
    const s3m = presetSignals(criteria).find((s) => s.preset.id === "3m")!;
    expect(s3m.composite).toBe(55);
    expect(s3m.isBuy).toBe(true);
  });

  it("FALLBACK: thiếu sub-signal (analysis/timeline cũ) → trọng số sub dồn về điểm macro, KHÔNG rụng vĩ mô", () => {
    const criteria = crit({ technical: 0, macro: 2, stats: 0, momentum: 0 });
    // preset 3m fallback: macro nhận .5 (dxy .2 + fed .1 + yield .2) → composite = (2×.5)/1 ×50 = 50 ≥ 40
    const s3m = presetSignals(criteria).find((s) => s.preset.id === "3m")!;
    expect(s3m.composite).toBe(50);
    expect(s3m.isBuy).toBe(true);
  });

  it("macro mạnh + momentum thuận → cả 3 preset báo mua (fallback macro)", () => {
    const criteria = crit({ technical: 0, premium: 0, macro: 2, stats: 1, momentum: 2 });
    const signals = presetSignals(criteria);
    expect(buyCount(signals)).toBe(3);
    expect(buyNames(signals)).toEqual(PRESETS.map((p) => p.label));
  });

  it("mọi tiêu chí trung tính → 0 preset báo mua", () => {
    const criteria = crit({ technical: 0, premium: 0, macro: 0, stats: 0, momentum: 0 });
    expect(buyCount(presetSignals(criteria))).toBe(0);
  });

  it("biên ngưỡng: composite đúng bằng buyThreshold vẫn tính là mua (≥)", () => {
    // mọi tiêu chí 1.0 → composite 50 = ngưỡng preset 1m
    const criteria = crit({ technical: 1, macro: 1, stats: 1, momentum: 1 });
    const s1m = presetSignals(criteria).find((s) => s.preset.id === "1m")!;
    expect(s1m.composite).toBe(50);
    expect(s1m.isBuy).toBe(true);
  });
});

describe("presetComposite fallback từng phần", () => {
  it("chỉ thiếu MỘT sub → chỉ trọng số sub đó dồn về macro", () => {
    const preset = PRESETS.find((p) => p.id === "3m")!; // dxy .2, fed .1, yield .2
    // có dxy (=2), thiếu fed+yield, macro tổng = 1
    const c = presetComposite({ technical: 0, stats: 0, momentum: 0, macro: 1, dxy: 2 }, preset);
    // KT .1×0 + TK .2×0 + MOM .2×0 + DXY .2×2 + macro(.3 dồn)×1 = 0.7 → 35
    expect(c).toBe(35);
  });
  it("thiếu cả sub lẫn macro → phần vĩ mô rơi khỏi mẫu số (chuẩn hóa như compositeScore)", () => {
    const preset = PRESETS.find((p) => p.id === "3m")!;
    const c = presetComposite({ technical: 2, stats: 2, momentum: 2 }, preset);
    // chỉ còn KT .1 + TK .2 + MOM .2 = .5 → (2×.5)/.5 ×50 = 100
    expect(c).toBe(100);
  });
});

describe("consensusZone / consensusLabel", () => {
  it("k=0 → neutral (gió ngược do radar quyết, không phải đồng thuận)", () => {
    expect(consensusZone(0)).toBe("neutral");
    expect(consensusLabel(0)).toBe("CHƯA CÓ TÍN HIỆU MUA");
  });
  it("k=1..2 → buy", () => {
    expect(consensusZone(1)).toBe("buy");
    expect(consensusZone(2)).toBe("buy");
    expect(consensusLabel(2)).toBe("2/3 PRESET BÁO MUA");
  });
  it("k=3 → strong-buy", () => {
    expect(consensusZone(3)).toBe("strong-buy");
    expect(consensusLabel(3)).toBe("3/3 PRESET BÁO MUA");
  });
});
