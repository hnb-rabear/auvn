import { describe, it, expect } from "vitest";
import { buildAuvnSummary, type BuildSummaryInput } from "./summary";
import { DEFAULT_WEIGHTS, type Analysis, type AccumulationAnalysis, type BearDcaAnalysis, type PresetHealthFile, type FusionHealthFile, type AccumulationHealth, type BearDcaHealth, type BottomAnalysis, type BottomSignalRow, type VnGoldEntry } from "./types";
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

  const mockBottom: BottomAnalysis = {
    generatedAt: "2026-09-05T01:00:00.000Z",
    dataDate: "2026-09-04",
    cycle: { prob: 58.1, ci: [40, 72], probUnweighted: 44.2, bin: 2, n: 31, drivers: [] },
    swing: { prob: 51.4, ci: [35, 66], probUnweighted: 47, bin: 2, n: 28, drivers: [] },
    confirmedBottoms: [],
    signalHistory: [
      { date: "2026-09-01", cycleBin: 1, swingBin: 1 },
      { date: "2026-09-02", cycleBin: 2, swingBin: 1 },
      { date: "2026-09-03", cycleBin: 2, swingBin: 2 },
      { date: "2026-09-04", cycleBin: 2, swingBin: 2 },
    ],
    bottomHistory: [],
    note: "mẫu",
  };

  const mockVnHistory: VnGoldEntry[] = [
    { date: "2026-09-03", sjcBuy: 145000000, sjcSell: 148000000, ringBuy: 146000000, ringSell: 150000000, usdVnd: 26200, xauUsd: 4460.2, premiumPct: 4.6 },
    { date: "2026-09-04", sjcBuy: 145600000, sjcSell: 148600000, ringBuy: 146500000, ringSell: 150500000, usdVnd: 26255, xauUsd: 4477.2, premiumPct: 4.85 },
  ];

  return {
    analysis: mockAnalysis,
    bottom: mockBottom,
    vnHistory: mockVnHistory,
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
  it("exports valid schemaVersion 1.2 and passes through market freshness", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.schemaVersion).toBe("1.3");
    expect(s.dataDate).toBe("2026-09-04");
    expect(s.stale).toBe(false);
    expect(s.staleDays).toBe(0);
    expect(s.market).toMatchObject({
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

    // biên: hệ số 1 = KHÔNG phanh (AccumConfig chỉ sinh mult ∈ {1, 0.25})
    input.accumulation.mult = 1;
    expect(buildAuvnSummary(input).accumulation.twoYearBrake.active).toBe(false);
  });

  it("keeps overall health scoped to the layers that produce conclusions", () => {
    const input = createMockInput();
    // ngữ cảnh degraded (phanh 2 năm, Bottom Hunter) không được ghim overall
    input.bearDcaHealth.status = "ok";
    const s = buildAuvnSummary(input);

    expect(s.modelHealth.overall).toBe("ok");
    expect(s.modelHealth.degradedLayers).toEqual([
      "bottom-cycle",
      "accumulation-brake",
    ]);
    expect(s.modelHealth.insufficientLayers).toEqual([]);
  });

  it("does not let an insufficient layer pin overall health", () => {
    // Bear DCA ở `insufficient` liên tục từ 2026-07 (3/6 chu kỳ gấu) — web không cảnh
    // báo trạng thái này, JSON cũng không được chiết khấu mọi kết luận vì nó.
    const s = buildAuvnSummary(createMockInput());

    expect(s.modelHealth.insufficientLayers).toEqual(["bear-dca"]);
    expect(s.modelHealth.overall).toBe("ok");
  });

  it("rolls up overall model health prioritizing degraded over insufficient", () => {
    const input = createMockInput();
    input.presetHealth.items[1].status = "degraded";
    const s = buildAuvnSummary(input);

    expect(s.modelHealth.overall).toBe("degraded");
    expect(s.modelHealth.degradedLayers).toContain("preset-3m");
    expect(s.modelHealth.insufficientLayers).toEqual(["bear-dca"]);
  });

  it("treats missing preset evidence as insufficient", () => {
    const input = createMockInput();
    input.presetHealth.items = [];
    input.bearDcaHealth.status = "ok";

    expect(buildAuvnSummary(input).modelHealth.overall).toBe("insufficient");
  });
});

/** Ghi đè signalHistory bằng danh sách bin chu kỳ, ngày liên tiếp kết thúc ở dataDate. */
function withCycleBins(bins: number[], dates?: string[]): BuildSummaryInput {
  const input = createMockInput();
  const ds = dates ?? bins.map((_, i) => `2026-09-0${i + 1}`);
  input.bottom.signalHistory = bins.map<BottomSignalRow>((cycleBin, i) => ({
    date: ds[i],
    cycleBin,
    swingBin: 0,
  }));
  input.analysis.dataDate = ds[ds.length - 1] ?? input.analysis.dataDate;
  return input;
}

describe("buildAuvnSummary — bottomHunter", () => {
  it("passes Bottom Hunter tiers through without drivers", () => {
    const bh = buildAuvnSummary(createMockInput()).bottomHunter;

    expect(bh.cycle).toEqual({ bin: 2, prob: 58.1, ci: [40, 72], probUnweighted: 44.2, n: 31 });
    expect(bh.swing.prob).toBe(51.4);
    expect(bh.swing.bin).toBe(2);
    expect(bh.cycle).not.toHaveProperty("drivers");
  });

  it("flags isBottomStart only on the rising edge into cycleBin 3", () => {
    expect(buildAuvnSummary(withCycleBins([1, 2, 2, 3])).bottomHunter.isBottomStart).toBe(true);
    // đã ở trong vùng đáy từ phiên trước ⇒ không phải cạnh lên
    expect(buildAuvnSummary(withCycleBins([1, 2, 3, 3])).bottomHunter.isBottomStart).toBe(false);
    expect(buildAuvnSummary(withCycleBins([1, 3, 3, 2])).bottomHunter.isBottomStart).toBe(false);
  });

  it("reports daysSinceBottomStart in calendar days from the last rising edge", () => {
    // cạnh lên ở giữa lịch sử; ngày giao dịch nhảy cuối tuần
    const mid = buildAuvnSummary(
      withCycleBins([2, 3, 3, 2], ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-07"])
    ).bottomHunter;
    expect(mid.lastBottomStartDate).toBe("2026-09-02");
    expect(mid.daysSinceBottomStart).toBe(5);

    const today = buildAuvnSummary(withCycleBins([1, 2, 2, 3])).bottomHunter;
    expect(today.isBottomStart).toBe(true);
    expect(today.daysSinceBottomStart).toBe(0);
  });

  it("returns nulls when the history never reached cycleBin 3", () => {
    const bh = buildAuvnSummary(withCycleBins([0, 1, 2, 2])).bottomHunter;
    expect(bh.lastBottomStartDate).toBeNull();
    expect(bh.daysSinceBottomStart).toBeNull();
  });

  it("refuses a stale signal history instead of dating its edge to today", () => {
    // bottom.json cũ + analysis.json mới: hàng cuối là cạnh lên của một ngày TRƯỚC ĐÓ.
    // Nếu tin nó, consumer nhận tín hiệu gom rải giả với daysSinceBottomStart = 0.
    const input = withCycleBins([1, 2, 2, 3], ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
    input.analysis.dataDate = "2026-09-07";

    const bh = buildAuvnSummary(input).bottomHunter;
    expect(bh.isBottomStart).toBe(false);
    expect(bh.lastBottomStartDate).toBe("2026-09-04");
    expect(bh.daysSinceBottomStart).toBe(3);
  });

  it("warns that n counts overlapping windows, not independent samples", () => {
    const note = buildAuvnSummary(createMockInput()).bottomHunter.note;
    expect(note).toContain("CHỒNG NHAU");
    expect(note).toContain("không phải số mẫu độc lập");
  });

  it("mirrors the site's acute-crash display gate in crashMode", () => {
    for (const [phase, crash] of [["acute", true], ["grind", false], ["bull", false], ["recovery", false]] as const) {
      const input = createMockInput();
      input.bearDca.phase = phase;
      expect(buildAuvnSummary(input).bottomHunter.crashMode).toBe(crash);
    }
  });

  it("survives an empty signal history", () => {
    const input = createMockInput();
    input.bottom.signalHistory = [];

    const bh = buildAuvnSummary(input).bottomHunter;
    expect(bh.isBottomStart).toBe(false);
    expect(bh.lastBottomStartDate).toBeNull();
    expect(bh.daysSinceBottomStart).toBeNull();
  });
});

describe("buildAuvnSummary — market.changes", () => {
  it("computes deltas against the previous trading session", () => {
    const c = buildAuvnSummary(createMockInput()).market.changes;

    expect(c).toEqual({
      prevDate: "2026-09-03",
      xauUsd: 17,
      sjcSell: 600000,
      ringSell: 500000,
      vnPremiumPct: 0.25,
    });
  });

  it("keeps a missing side null instead of treating it as zero", () => {
    const input = createMockInput();
    input.vnHistory[0].ringSell = null;

    expect(buildAuvnSummary(input).market.changes?.ringSell).toBeNull();
  });

  it("returns null when there is not enough history", () => {
    const input = createMockInput();
    input.vnHistory = input.vnHistory.slice(-1);

    expect(buildAuvnSummary(input).market.changes).toBeNull();
  });
});

describe("buildAuvnSummary — changed", () => {
  it("treats a missing previous snapshot as new rather than quiet", () => {
    // Consumer poll nhiều lần/ngày: mất snapshot cũ mà báo "không đổi" sẽ nuốt tín hiệu.
    const c = buildAuvnSummary(createMockInput()).changed;

    expect(c.sincePrevRun).toBe(true);
    expect(c.newBuySignals).toEqual([]);
    expect(c.lostBuySignals).toEqual([]);
    expect(c.phaseChanged).toBe(false);
  });

  it("reports a quiet re-run against an identical previous snapshot", () => {
    const input = createMockInput();
    const c = buildAuvnSummary({ ...input, prev: buildAuvnSummary(input) }).changed;

    expect(c.sincePrevRun).toBe(false);
    expect(c.newBuySignals).toEqual([]);
    expect(c.lostBuySignals).toEqual([]);
    expect(c.phaseChanged).toBe(false);
    expect(c.bottomStartToday).toBe(false);
  });

  it("names the presets that gained and lost their buy signal", () => {
    const quiet = buildAuvnSummary(createMockInput());
    const gained = buildAuvnSummary({ ...allBullishInput(), prev: quiet });
    expect(gained.changed.newBuySignals).toEqual(["1m", "3m", "6m"]);
    expect(gained.changed.lostBuySignals).toEqual([]);

    const lost = buildAuvnSummary({ ...createMockInput(), prev: gained });
    expect(lost.changed.newBuySignals).toEqual([]);
    expect(lost.changed.lostBuySignals).toEqual(["1m", "3m", "6m"]);
  });

  it("flags a Bear DCA phase transition and a new data date", () => {
    const prev = buildAuvnSummary(createMockInput());
    const input = createMockInput();
    input.bearDca.phase = "acute";
    input.analysis.dataDate = "2026-09-07";

    const c = buildAuvnSummary({ ...input, prev }).changed;
    expect(c.phaseChanged).toBe(true);
    expect(c.sincePrevRun).toBe(true);
  });

  it("mirrors bottomStartToday from bottomHunter", () => {
    const s = buildAuvnSummary(withCycleBins([1, 2, 2, 3]));
    expect(s.changed.bottomStartToday).toBe(s.bottomHunter.isBottomStart);
    expect(s.changed.bottomStartToday).toBe(true);
  });

  it("survives a truncated previous snapshot from an older schema", () => {
    const prev = { dataDate: "2026-09-04" } as never;

    const c = buildAuvnSummary({ ...createMockInput(), prev }).changed;
    expect(c.sincePrevRun).toBe(false);
    expect(c.lostBuySignals).toEqual([]);
    expect(c.phaseChanged).toBe(false);
  });
});

describe("buildAuvnSummary — numeric hygiene", () => {
  it("rounds Bear DCA float tails without changing the displayed value", () => {
    const input = createMockInput();
    input.bearDca.ddFromAth = 0.15828068592057748;
    input.bearDca.ddChange = -0.02555279783393513;
    input.bearDca.pricePct2y = 0.7876984126984127;
    input.accumulation.pricePct2y = 0.7876984126984127;

    const a = buildAuvnSummary(input).accumulation;
    expect(a.bearDca.ddFromAth).toBe(0.1583);
    expect(a.bearDca.ddChange).toBe(-0.0256);
    expect(a.bearDca.pricePct2y).toBe(0.7877);
    expect(a.pricePercentile2y).toBe(0.7877);
    // phần còn lại của object đi qua nguyên vẹn
    expect(a.bearDca.phase).toBe("recovery");
    expect(a.bearDca.mult).toBe(1.5);
  });

  it("keeps a null two-year percentile null", () => {
    const input = createMockInput();
    input.accumulation.pricePct2y = null;

    expect(buildAuvnSummary(input).accumulation.pricePercentile2y).toBeNull();
  });
});
