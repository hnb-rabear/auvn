import { describe, it, expect } from "vitest";
import { buyCount, buyNames, consensusLabel, consensusZone, presetSignals } from "./consensus";
import { compositeScore, PRESETS, type CriterionResult } from "./types";

/** Criteria tối giản — compositeScore chỉ đọc key/score/available. */
function crit(
  scores: Partial<Record<CriterionResult["key"], number>>,
  unavailable: CriterionResult["key"][] = []
): Pick<CriterionResult, "key" | "score" | "available">[] {
  return (Object.entries(scores) as [CriterionResult["key"], number][]).map(([key, score]) => ({
    key,
    score,
    available: !unavailable.includes(key),
  }));
}

describe("presetSignals", () => {
  it("GOLDEN: composite từng preset ≡ compositeScore với trọng số preset đó", () => {
    const criteria = crit(
      { technical: -0.6, premium: 1.2, macro: 1.8, stats: 0.25, momentum: 1 },
      ["premium"] // premium hay unavailable trên đường live thiếu lịch sử
    );
    const signals = presetSignals(criteria);
    expect(signals).toHaveLength(PRESETS.length);
    for (const s of signals) {
      expect(s.composite).toBe(compositeScore(criteria, s.preset.weights));
      expect(s.isBuy).toBe(s.composite >= s.preset.buyThreshold);
    }
  });

  it("macro mạnh + momentum thuận → cả 3 preset báo mua (đều macro-nặng)", () => {
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
    // preset 1m: KT .1 / TK .1 / VM .6 / MOM .2, ngưỡng 40 ⇒ mọi tiêu chí 0.8 → composite 40
    const criteria = crit({ technical: 0.8, macro: 0.8, stats: 0.8, momentum: 0.8 });
    const s1m = presetSignals(criteria).find((s) => s.preset.id === "1m")!;
    expect(s1m.composite).toBe(40);
    expect(s1m.isBuy).toBe(true);
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
