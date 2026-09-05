# AI Summary JSON Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export versioned static snapshot `public/data/summary.json` for machine consumers at `/auvn/data/summary.json`. Reuses existing domain engines without formula duplication.

**Architecture:** A pure builder `buildAuvnSummary` in `src/lib/summary.ts` transforms existing in-memory/JSON structures into an AI-ready schema (`schemaVersion: "1.0"`). A thin CLI `scripts/generate-summary.ts` writes `public/data/summary.json`. The pipeline is unified in `package.json` under `collect`, and GitHub Actions workflow is cleaned up to avoid redundant health calculations.

**Tech Stack:** TypeScript, Next.js static asset export, Vitest, Node fs/path.

## Global Constraints

- Never re-implement scoring, thresholds, or zone logic; call existing functions in `src/lib/consensus.ts`, `src/lib/types.ts`, `src/lib/bear-dca.ts`, `src/lib/accumulation.ts`.
- `signals.presets[*].isBuy` is the only actionable buy trigger.
- `signals.consensus` is an aggregation count of valid preset triggers; never describe it as an accuracy booster.
- `signals.radarContext` is context-only; `isHeadwind` activates strictly at radar composite `<= -40`.
- `accumulation.effectiveBuyMultiplier` mirrors `bearDca.mult`. The 2-year price brake remains a separate context indicator.
- Static export only: must work without runtime API or server dependencies.

---

### Task 1: Summary Types and Pure Builder

**Files:**
- Create: `src/lib/summary.ts`
- Test: `src/lib/summary.test.ts`

**Interfaces:**
- Consumes:
  - `presetSignals`, `buyCount`, `consensusZone`, `consensusLabel` from `src/lib/consensus.ts`
  - `Analysis`, `Zone`, `PresetHealthFile`, `FusionHealthFile`, `AccumulationHealth`, `BearDcaHealth` from `src/lib/types.ts`
  - `BottomHealth` from `scripts/monitor-bottom.ts`
- Produces:
  - `AuvnSummary` interface
  - `BuildSummaryInput` interface
  - `buildAuvnSummary(input: BuildSummaryInput): AuvnSummary`

- [ ] **Step 1: Write failing tests in `src/lib/summary.test.ts`**

```ts
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
    warnings: ["Cảnh báo mẫu 1"],
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

describe("buildAuvnSummary", () => {
  it("exports valid schemaVersion 1.0 and passes through market freshness", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.schemaVersion).toBe("1.0");
    expect(s.dataDate).toBe("2026-09-04");
    expect(s.stale).toBe(false);
    expect(s.staleDays).toBe(0);
    expect(s.market.xauUsd).toBe(4477.2);
    expect(s.market.vnPremiumPct).toBe(4.85);
    expect(s.warnings).toEqual(["Cảnh báo mẫu 1"]);
  });

  it("evaluates presets with pointsToThreshold = 0 when buy, positive when neutral", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.signals.presets).toHaveLength(3);
    for (const p of s.signals.presets) {
      if (p.isBuy) {
        expect(p.pointsToThreshold).toBe(0);
        expect(p.score).toBeGreaterThanOrEqual(p.buyThreshold);
      } else {
        expect(p.pointsToThreshold).toBeCloseTo(p.buyThreshold - p.score, 1);
        expect(p.pointsToThreshold).toBeGreaterThan(0);
      }
    }
  });

  it("reports consensus as pure count and marks radar as non-actionable context", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.signals.consensus.totalPresets).toBe(3);
    expect(s.signals.consensus.buyCount).toBe(
      s.signals.presets.filter((p) => p.isBuy).length
    );
    expect(s.signals.radarContext.composite).toBe(2.7);
    expect(s.signals.radarContext.isHeadwind).toBe(false);
  });

  it("marks isHeadwind true when radar composite <= -40", () => {
    const input = createMockInput();
    input.analysis.composite = -42.5;
    input.analysis.zone = "sell";
    const s = buildAuvnSummary(input);

    expect(s.signals.radarContext.composite).toBe(-42.5);
    expect(s.signals.radarContext.isHeadwind).toBe(true);
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

  it("rolls up overall model health prioritizing degraded over insufficient", () => {
    const input = createMockInput();
    const s = buildAuvnSummary(input);

    expect(s.modelHealth.overall).toBe("degraded");
  });

  it("rolls up overall model health to insufficient if none degraded but at least one insufficient", () => {
    const input = createMockInput();
    input.bottomHealth.items[0].status = "ok";
    input.accumulationHealth.status = "ok";
    const s = buildAuvnSummary(input);

    expect(s.modelHealth.overall).toBe("insufficient");
  });

  it("rolls up overall model health to ok when all ok", () => {
    const input = createMockInput();
    input.bottomHealth.items[0].status = "ok";
    input.accumulationHealth.status = "ok";
    input.bearDcaHealth.status = "ok";
    const s = buildAuvnSummary(input);

    expect(s.modelHealth.overall).toBe("ok");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/summary.test.ts`
Expected: FAIL with missing module `./summary`.

- [ ] **Step 3: Implement `src/lib/summary.ts`**

```ts
import {
  presetSignals,
  buyCount,
  consensusZone,
  consensusLabel,
} from "./consensus";
import type {
  Analysis,
  Zone,
  PresetHealthFile,
  FusionHealthFile,
  AccumulationHealth,
  BearDcaHealth,
  AccumulationAnalysis,
  BearDcaAnalysis,
  AccumBrake,
} from "./types";
import type { BottomHealth } from "../../scripts/monitor-bottom";

export interface SummaryPresetSignal {
  id: "1m" | "3m" | "6m";
  label: string;
  horizonDays: 21 | 63 | 126;
  score: number;
  buyThreshold: number;
  isBuy: boolean;
  pointsToThreshold: number;
}

export interface AuvnSummary {
  schemaVersion: "1.0";
  generatedAt: string;
  dataDate: string;
  stale: boolean;
  staleDays: number;
  market: {
    xauUsd: number | null;
    sjcBuy: number | null;
    sjcSell: number | null;
    ringBuy: number | null;
    ringSell: number | null;
    ringDate: string | null;
    usdVnd: number | null;
    worldVndPerLuong: number | null;
    vnPremiumPct: number | null;
    vnPremiumVnd: number | null;
  };
  signals: {
    presets: SummaryPresetSignal[];
    consensus: {
      buyCount: number;
      totalPresets: 3;
      zone: Zone;
      label: string;
      summary: string;
    };
    radarContext: {
      composite: number;
      zone: Zone;
      isHeadwind: boolean;
      note: string;
    };
  };
  accumulation: {
    effectiveBuyMultiplier: number;
    effectiveBuyMultiplierSource: "bear-dca";
    pricePercentile2y: number | null;
    bearDca: BearDcaAnalysis;
    twoYearBrake: {
      multiplier: number;
      active: boolean;
      brakes: AccumBrake[];
      provisional: boolean;
      note: string;
    };
  };
  modelHealth: {
    overall: "ok" | "degraded" | "insufficient";
    presets: PresetHealthFile;
    bottomHunter: BottomHealth;
    accumulationBrake: AccumulationHealth;
    bearDca: BearDcaHealth;
    fusion3m: FusionHealthFile;
  };
  warnings: string[];
  sourceFreshness: Analysis["sourceTimes"];
}

export interface BuildSummaryInput {
  analysis: Analysis;
  accumulation: AccumulationAnalysis;
  bearDca: BearDcaAnalysis;
  presetHealth: PresetHealthFile;
  bottomHealth: BottomHealth;
  accumulationHealth: AccumulationHealth;
  bearDcaHealth: BearDcaHealth;
  fusionHealth: FusionHealthFile;
  nowIso?: string;
}

export function buildAuvnSummary(input: BuildSummaryInput): AuvnSummary {
  const {
    analysis,
    accumulation,
    bearDca,
    presetHealth,
    bottomHealth,
    accumulationHealth,
    bearDcaHealth,
    fusionHealth,
  } = input;

  const rawSignals = presetSignals(analysis.criteria);
  const presets: SummaryPresetSignal[] = rawSignals.map((s) => {
    const id = s.preset.id as "1m" | "3m" | "6m";
    const buyThreshold = s.preset.buyThreshold;
    const score = s.composite;
    const isBuy = s.isBuy;
    const pointsToThreshold = isBuy
      ? 0
      : Math.max(0, Math.round((buyThreshold - score) * 10) / 10);

    return {
      id,
      label: s.preset.label,
      horizonDays: s.preset.horizonDays,
      score,
      buyThreshold,
      isBuy,
      pointsToThreshold,
    };
  });

  const k = buyCount(rawSignals);
  const consensus = {
    buyCount: k,
    totalPresets: 3 as const,
    zone: consensusZone(k),
    label: consensusLabel(k),
    summary:
      k > 0
        ? `${k}/3 preset kỳ hạn đang báo MUA. Tín hiệu kích hoạt từ preset độc lập, không dùng composite làm cò súng.`
        : "Chưa có preset nào vào vùng mua. Giữ quan sát hoặc tích sản định kỳ theo Bear DCA.",
  };

  const radarContext = {
    composite: analysis.composite,
    zone: analysis.zone,
    isHeadwind: analysis.composite <= -40,
    note: "Radar composite chỉ dùng làm ngữ cảnh tham khảo / nhận diện gió ngược (<= -40), không dùng làm tín hiệu mua.",
  };

  const allStatuses: ("ok" | "degraded" | "insufficient")[] = [
    ...presetHealth.items.map((i) => i.status),
    ...bottomHealth.items.map((i) => i.status),
    accumulationHealth.status,
    bearDcaHealth.status,
    fusionHealth.item.status,
  ];

  const overallHealth: "ok" | "degraded" | "insufficient" = allStatuses.includes(
    "degraded"
  )
    ? "degraded"
    : allStatuses.includes("insufficient")
    ? "insufficient"
    : "ok";

  return {
    schemaVersion: "1.0",
    generatedAt: input.nowIso ?? new Date().toISOString(),
    dataDate: analysis.dataDate,
    stale: analysis.stale,
    staleDays: analysis.staleDays,
    market: {
      xauUsd: analysis.prices.xauUsd,
      sjcBuy: analysis.prices.sjcBuy,
      sjcSell: analysis.prices.sjcSell,
      ringBuy: analysis.prices.ringBuy,
      ringSell: analysis.prices.ringSell,
      ringDate: analysis.prices.ringDate ?? null,
      usdVnd: analysis.prices.usdVnd,
      worldVndPerLuong: analysis.prices.worldVndPerLuong,
      vnPremiumPct: analysis.prices.premiumPct,
      vnPremiumVnd: analysis.prices.premiumVnd,
    },
    signals: {
      presets,
      consensus,
      radarContext,
    },
    accumulation: {
      effectiveBuyMultiplier: bearDca.mult,
      effectiveBuyMultiplierSource: "bear-dca",
      pricePercentile2y: accumulation.pricePct2y,
      bearDca,
      twoYearBrake: {
        multiplier: accumulation.mult,
        active: accumulation.mult < 1,
        brakes: accumulation.brakes,
        provisional: accumulation.provisional ?? false,
        note: "Phanh 2 năm là lan can chống FOMO riêng, không ghi đè trực tiếp lên hệ số hành động Bear DCA.",
      },
    },
    modelHealth: {
      overall: overallHealth,
      presets: presetHealth,
      bottomHunter: bottomHealth,
      accumulationBrake: accumulationHealth,
      bearDca: bearDcaHealth,
      fusion3m: fusionHealth,
    },
    warnings: analysis.warnings,
    sourceFreshness: analysis.sourceTimes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/summary.test.ts`
Expected: PASS with 7 tests green.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/summary.ts src/lib/summary.test.ts
git commit -m "feat: add summary builder and unit tests"
```

---

### Task 2: Generator Script and Consumer Documentation

**Files:**
- Create: `scripts/generate-summary.ts`
- Create: `docs/summary-json.md`

**Interfaces:**
- Consumes:
  - `buildAuvnSummary` from `src/lib/summary.ts`
  - JSON data files in `public/data/`
- Produces:
  - CLI script generating `public/data/summary.json`
  - Consumer reference in `docs/summary-json.md`

- [ ] **Step 1: Create `scripts/generate-summary.ts`**

```ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildAuvnSummary } from "../src/lib/summary";
import type {
  Analysis,
  AccumulationAnalysis,
  BearDcaAnalysis,
  PresetHealthFile,
  FusionHealthFile,
  AccumulationHealth,
  BearDcaHealth,
} from "../src/lib/types";
import type { BottomHealth } from "./monitor-bottom";

const DATA_DIR = join(process.cwd(), "public", "data");

function readJson<T>(file: string): T {
  const p = join(DATA_DIR, file);
  if (!existsSync(p)) {
    throw new Error(`File not found for summary generation: ${p}`);
  }
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

export function generateSummary(): void {
  const analysis = readJson<Analysis>("analysis.json");
  const accumulation = readJson<AccumulationAnalysis>("accumulation.json");
  const bearDca = readJson<BearDcaAnalysis>("bear-dca.json");
  const presetHealth = readJson<PresetHealthFile>("preset-health.json");
  const bottomHealth = readJson<BottomHealth>("bottom-health.json");
  const accumulationHealth = readJson<AccumulationHealth>("accumulation-health.json");
  const bearDcaHealth = readJson<BearDcaHealth>("bear-dca-health.json");
  const fusionHealth = readJson<FusionHealthFile>("fusion-health.json");

  const summary = buildAuvnSummary({
    analysis,
    accumulation,
    bearDca,
    presetHealth,
    bottomHealth,
    accumulationHealth,
    bearDcaHealth,
    fusionHealth,
  });

  const outPath = join(DATA_DIR, "summary.json");
  writeFileSync(outPath, JSON.stringify(summary, null, 1));
  console.log(
    `OK: summary.json (v${summary.schemaVersion}) -> consensus=${summary.signals.consensus.label}, dcaMult=${summary.accumulation.effectiveBuyMultiplier}, health=${summary.modelHealth.overall}`
  );
}

if (process.argv[1] && process.argv[1].includes("generate-summary")) {
  generateSummary();
}
```

- [ ] **Step 2: Run generator script manually against current `public/data`**

Run: `npx tsx scripts/generate-summary.ts`
Expected: `public/data/summary.json` written with exit code 0.

- [ ] **Step 3: Create consumer documentation `docs/summary-json.md`**

Document the exact URL (`https://hnb-rabear.github.io/auvn/data/summary.json`), `schemaVersion: "1.0"`, field reference, and consumer semantic rules (presets are only buy triggers, consensus is summary count, radar composite is context only, effective multiplier is Bear DCA).

- [ ] **Step 4: Commit Task 2**

```bash
git add scripts/generate-summary.ts docs/summary-json.md public/data/summary.json
git commit -m "feat: add summary CLI generator and consumer docs"
```

---

### Task 3: Pipeline and GitHub Workflow Integration

**Files:**
- Modify: `package.json:10`
- Modify: `.github/workflows/update-and-deploy.yml:36-44`

**Interfaces:**
- `npm run collect` runs `run.ts` -> `monitor-presets.ts` -> `monitor-fusion.ts` -> `generate-summary.ts`.
- GitHub Actions executes `npm run collect`, removing duplicated health script steps.

- [ ] **Step 1: Update `package.json`**

Edit `scripts.collect`:
```json
"collect": "tsx scripts/run.ts && tsx scripts/monitor-presets.ts && tsx scripts/monitor-fusion.ts && tsx scripts/generate-summary.ts",
```

- [ ] **Step 2: Update `.github/workflows/update-and-deploy.yml`**

Replace lines 36-44 with single collect step:
```yaml
      - name: Collect data, run analysis, monitor & summarize
        run: npm run collect
```

- [ ] **Step 3: Run static validation and test suite**

Run: `npm run typecheck && npm test`
Expected: All TypeScript checks pass, all tests pass.

- [ ] **Step 4: Commit Task 3**

```bash
git add package.json .github/workflows/update-and-deploy.yml
git commit -m "chore: integrate summary generation into collect pipeline and CI"
```

---

### Task 4: Full Verification and Release

**Files:**
- Output verified: `public/data/summary.json`

- [ ] **Step 1: Run full collect pipeline end-to-end**

Run: `npm run collect`
Expected: `run.ts`, `monitor-presets.ts`, `monitor-fusion.ts`, `generate-summary.ts` succeed in order.

- [ ] **Step 2: Run production Next.js build**

Run: `npm run build`
Expected: Build succeeds with static export.

- [ ] **Step 3: Inspect git status and commit updated data artifacts**

Run:
```bash
git status --short
git add public/data/
git commit -m "data: generate fresh summary.json snapshot"
```

- [ ] **Step 4: Push to `main`**

Run: `git push origin main`
Expected: Push succeeds on remote `main`.
