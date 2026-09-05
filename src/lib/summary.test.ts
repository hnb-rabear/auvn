import { describe, it, expect } from "vitest";
import { buildAuvnSummary, type BuildSummaryInput } from "./summary";
import { DEFAULT_WEIGHTS, type Analysis, type AccumulationAnalysis, type BearDcaAnalysis, type PresetHealthFile, type FusionHealthFile, type AccumulationHealth, type BearDcaHealth } from "./types";
import type { BottomHealth } from "../../scripts/monitor-bottom";

function createMockInput(overrides?: Partial<BuildSummaryInput>): BuildSummaryInput {
  const mockAnalysis: Analysis = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    dataDate: "2026-09-04",
    stale: false,
    staleDays: 0,
    prices: {
      sjcBuy: 145600000,
      sjcSell: 148600000,
      ringBuy: 146500000,
      ringSell: 150500000,
      ringDate: null,
      xauUsd: 4477.2,
      usdVnd: 26255,
      worldVndPerLuong: 141723173,
      premiumPct: 4.85,
      premiumVnd: 6876827,
    },
    criteria: [
      {
        key: "technical",
        label: "Kỹ thuật",
        score: 0.2,
        available: true,
        signals: [{ id: "rsi-d", label: "RSI", score: 0, explanation: "neutral", available: true }],
      },
      {
        key: "premium",
        label: "Premium",
        score: 0.33,
        available: true,
        signals: [{ id: "premium", label: "Premium", score: 2, explanation: "low", available: true }],
      },
      {
        key: "macro",
        label: "Vĩ mô",
        score: 0,
        available: true,
        signals: [
          { id: "dxy", label: "DXY", score: 1, explanation: "down", available: true },
          { id: "fed", label: "Fed", score: 0, explanation: "flat", available: true },
          { id: "yield10y", label: "Yield", score: -1, explanation: "up", available: true },
        ],
      },
      {
        key: "stats",
        label: "Thống kê",
        score: -0.5,
        available: true,
        signals: [{ id: "pct1y", label: "1y", score: 0, explanation: "mid", available: true }],
      },
      {
        key: "momentum",
        label: "Động lượng",
        score: 2,
        available: true,
        signals: [{ id: "mom12m", label: "12m", score: 2, explanation: "up", available: true }],
      },
    ],
    defaultWeights: DEFAULT_WEIGHTS,
    composite: 2.7,
    zone: "neutral",
    vnHistoryDays: 573,
    warnings: ["Cảnh báo mẫu 1", "Cảnh báo mẫu 2"],
    sourceTimes: {
      world: "2026-09-04T22:00:00.000Z",
      dxy: "2026-09-04T22:00:00.000Z",
      yield10y: "2026-09-04T22:00:00.000Z",
      vnGold: "2026-09-05T01:00:00.000Z",
      usdVnd: "2026-09-05T01:00:00.000Z",
      fed: null,
    },
  };

  const mockAccumulation: AccumulationAnalysis = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    dataDate: "2026-09-04",
    pricePct2y: 0.79,
    mult: 0.25,
    brakes: [{ id: "price-top", label: "Giá đỉnh vùng 2 năm", explanation: "Ghìm mua" }],
    provisional: false,
    history: [],
    note: "Phanh",
  };

  const mockBearDca: BearDcaAnalysis = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    dataDate: "2026-09-04",
    isBear: true,
    ddFromAth: 0.158,
    ddChange: -0.044,
    phase: "recovery",
    pricePct2y: 0.79,
    mult: 1.5,
    recoveryRisk: true,
    note: "Gom mạnh ×1.5",
  };

  const mockPresetHealth: PresetHealthFile = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    items: [
      { presetId: "1m", minExcessNowPt: 29.4, recentFavPct: 100, recentBaselinePct: 68, recentN: 32, testFavCi95: [75, 98], status: "ok" },
      { presetId: "3m", minExcessNowPt: 31.2, recentFavPct: 98, recentBaselinePct: 79, recentN: 44, testFavCi95: [97, 100], status: "ok" },
      { presetId: "6m", minExcessNowPt: 20.9, recentFavPct: 100, recentBaselinePct: 89, recentN: 86, testFavCi95: [100, 100], status: "ok" },
    ],
  };

  const mockBottomHealth: BottomHealth = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    items: [
      { tier: "cycle", recentTopFav: 62.5, recentBaseline: 63.8, n: 16, status: "degraded" },
      { tier: "swing", recentTopFav: 63.2, recentBaseline: 54.1, n: 19, status: "ok" },
    ],
  };

  const mockAccumulationHealth: AccumulationHealth = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    recentImprPct: -3.1,
    recentBrakedMonths: 22,
    status: "degraded",
  };

  const mockBearDcaHealth: BearDcaHealth = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    recentImprPct: null,
    recentAssetImprPct: null,
    recentBearCycles: 4,
    status: "insufficient",
  };

  const mockFusionHealth: FusionHealthFile = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    item: {
      presetId: "3m",
      bTrainFav: 93.3,
      bTestFav: 100,
      compTrainFav: 88.1,
      compTestFav: 99,
      bTestN: 75,
      bTestCi95: [100, 100],
      orthoTrainPt: 3.3,
      status: "ok",
    },
  };

  return {
    analysis: mockAnalysis,
    accumulation: mockAccumulation,
    bearDca: mockBearDca,
    presetHealth: mockPresetHealth,
    bottomHealth: mockBottomHealth,
    accumulationHealth: mockAccumulationHealth,
    bearDcaHealth: mockBearDcaHealth,
    fusionHealth: mockFusionHealth,
    ...overrides,
  };
}

/** Mọi tiêu chí +2 ⇒ cả ba preset vượt ngưỡng mua, để chạm nhánh isBuy. */
function allBullishInput(): BuildSummaryInput {
  const input = createMockInput();
  input.analysis.criteria = input.analysis.criteria.map((c) => ({
    ...c,
    score: 2,
    signals: c.signals.map((s) => ({ ...s, score: 2 })),
  }));
  return input;
}

describe("buildAuvnSummary", () => {
  it("exports valid schemaVersion 1.1 and passes through market freshness", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.schemaVersion).toBe("1.1");
    expect(s.dataDate).toBe("2026-09-04");
    expect(s.stale).toBe(false);
    expect(s.staleDays).toBe(0);
    expect(s.market).toEqual({
      xauUsd: 4477.2,
      sjcBuy: 145600000,
      sjcSell: 148600000,
      ringBuy: 146500000,
      ringSell: 150500000,
      ringDate: null,
      usdVnd: 26255,
      worldVndPerLuong: 141723173,
      vnPremiumPct: 4.85,
      vnPremiumVnd: 6876827,
    });
    expect(s.warnings).toEqual(["Cảnh báo mẫu 1", "Cảnh báo mẫu 2"]);
  });

  it("evaluates presets with pointsToThreshold = 0 when buy, positive when neutral", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.signals.presets).toHaveLength(3);
    expect(s.signals.presets.map((p) => p.isBuy)).toEqual([false, false, false]);
    for (const p of s.signals.presets) {
      expect(p.pointsToThreshold).toBeCloseTo(p.buyThreshold - p.score, 1);
      expect(p.pointsToThreshold).toBeGreaterThan(0);
    }
  });

  it("clamps pointsToThreshold to 0 once a preset is buying", () => {
    const s = buildAuvnSummary(allBullishInput());

    const buys = s.signals.presets.filter((p) => p.isBuy);
    expect(buys.length).toBeGreaterThan(0);
    for (const p of buys) {
      expect(p.score).toBeGreaterThan(p.buyThreshold);
      expect(p.pointsToThreshold).toBe(0);
    }
  });

  it("reports consensus as pure count and marks radar as non-actionable context", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.signals.consensus.totalPresets).toBe(3);
    expect(s.signals.consensus.buyCount).toBe(0);
    expect(s.signals.consensus.zone).toBe("neutral");
    expect(s.signals.consensus.label).toBe("CHƯA CÓ TÍN HIỆU MUA");
    expect(s.signals.radarContext.composite).toBe(2.7);
    expect(s.signals.radarContext.isHeadwind).toBe(false);
  });

  it("labels consensus by the number of presets actually buying", () => {
    const s = buildAuvnSummary(allBullishInput());

    const k = s.signals.presets.filter((p) => p.isBuy).length;
    expect(s.signals.consensus.buyCount).toBe(k);
    expect(s.signals.consensus.label).toBe(`${k}/3 PRESET BÁO MUA`);
    expect(s.signals.consensus.zone).toBe(k >= 3 ? "strong-buy" : "buy");
  });

  it("publishes the same premium gate the site's guidance uses", () => {
    const input = createMockInput();
    input.analysis.premiumPercentiles = { p20: 2, p50: 3.5, p80: 4.8 };
    const gate = buildAuvnSummary(input).signals.premiumGate;

    expect(gate.blocksBuying).toBe(true);
    expect(gate.premiumPct).toBe(4.85);
    expect(gate.premiumP80).toBe(4.8);

    input.analysis.premiumPercentiles = { p20: 2, p50: 3.5, p80: 5 };
    expect(buildAuvnSummary(input).signals.premiumGate.blocksBuying).toBe(false);

    delete input.analysis.premiumPercentiles;
    const noRank = buildAuvnSummary(input).signals.premiumGate;
    expect(noRank.premiumP80).toBeNull();
    expect(noRank.blocksBuying).toBe(false);
  });

  it("states consensus members do not gain accuracy from agreement", () => {
    const summary = buildAuvnSummary(allBullishInput()).signals.consensus.summary;

    expect(summary).not.toContain("độc lập");
    expect(summary).toContain("không tăng độ chính xác");
  });

  it("derives headwind boundaries from canonical zone logic", () => {
    for (const [composite, isHeadwind] of [[-40, true], [-39.9, false]] as const) {
      const input = createMockInput();
      input.analysis.composite = composite;

      const radar = buildAuvnSummary(input).signals.radarContext;
      expect(radar.isHeadwind).toBe(isHeadwind);
      expect(radar.zone).toBe(composite === -40 ? "sell" : "neutral");
    }
  });

  it("serializes absent source freshness as null", () => {
    const input = createMockInput();
    delete input.analysis.sourceTimes;

    const serialized = JSON.parse(JSON.stringify(buildAuvnSummary(input)));
    expect(serialized).toHaveProperty("sourceFreshness", null);
  });

  it("keeps Bear DCA as effectiveBuyMultiplier and isolates 2y brake", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.accumulation.effectiveBuyMultiplier).toBe(1.5);
    expect(s.accumulation.effectiveBuyMultiplierSource).toBe("bear-dca");
    expect(s.accumulation.pricePercentile2y).toBe(0.79);
    expect(s.accumulation.bearDca.phase).toBe("recovery");
    expect(s.accumulation.twoYearBrake.multiplier).toBe(0.25);
    expect(s.accumulation.twoYearBrake.active).toBe(true);
    expect(s.accumulation.twoYearBrake.brakes).toHaveLength(1);
  });

  it("keeps overall health scoped to the layers that produce conclusions", () => {
    const input = createMockInput();
    // ngữ cảnh degraded/insufficient (phanh 2 năm, Bottom Hunter) không được ghim overall
    input.bearDcaHealth.status = "ok";
    const s = buildAuvnSummary(input);

    expect(s.modelHealth.overall).toBe("ok");
    expect(s.modelHealth.degradedLayers).toEqual([
      "bottom-cycle",
      "accumulation-brake",
    ]);
    expect(s.modelHealth.insufficientLayers).toEqual([]);
  });

  it("rolls up overall model health prioritizing degraded over insufficient", () => {
    const input = createMockInput();
    input.presetHealth.items[1].status = "degraded";
    const s = buildAuvnSummary(input);

    expect(s.modelHealth.overall).toBe("degraded");
    expect(s.modelHealth.degradedLayers).toContain("preset-3m");
    expect(s.modelHealth.insufficientLayers).toEqual(["bear-dca"]);
  });

  it("rolls up overall model health to insufficient if none degraded but at least one insufficient", () => {
    const s = buildAuvnSummary(createMockInput());

    expect(s.modelHealth.overall).toBe("insufficient");
    expect(s.modelHealth.insufficientLayers).toEqual(["bear-dca"]);
  });

  it("treats missing preset evidence as insufficient", () => {
    const input = createMockInput();
    input.presetHealth.items = [];
    input.bearDcaHealth.status = "ok";

    expect(buildAuvnSummary(input).modelHealth.overall).toBe("insufficient");
  });
});
