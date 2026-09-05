# AI summary JSON design

**Date:** 2026-09-05

## Goal

Publish `public/data/summary.json` for machine consumers at `/auvn/data/summary.json`. It is a compact, precomputed AUVN state snapshot. Consumers read conclusions and must not scrape HTML or recompute signals.

## Constraints

- Static export only. No browser/server analysis.
- Reuse current AUVN functions and outputs. Do not duplicate formulas, thresholds, or alter analysis algorithms.
- Keep default-mode rule: preset consensus is buy verdict; default radar composite is context only.
- Preserve existing data JSON files and collection history.
- Schema changes require `schemaVersion` update and documentation update.

## Pipeline

`npm run collect` becomes one ordered local pipeline:

1. `scripts/run.ts` fetches, analyzes, backtests, and writes core JSON.
2. `scripts/monitor-presets.ts` writes current preset health.
3. `scripts/monitor-fusion.ts` writes current 3-month fusion health.
4. `scripts/generate-summary.ts` reads resulting JSON and writes `public/data/summary.json`.

GitHub Actions runs only `npm run collect` before commit/deploy, removing duplicate monitor commands. This ensures every health object inside summary belongs to same collection cycle.

## Builder boundary

Create `src/lib/summary.ts` with:

- `AuvnSummary` and nested TypeScript interfaces.
- Pure `buildAuvnSummary(input)` function accepting current analysis, accumulation, Bear DCA, and health objects.

Create `scripts/generate-summary.ts` as thin filesystem adapter. It reads generated files, passes them to builder, and serializes JSON. Builder uses existing `presetSignals`, `buyCount`, `consensusZone`, and `consensusLabel`; it does not reproduce scoring or thresholds.

## Schema v1.0

```ts
interface AuvnSummary {
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
    presets: Array<{
      id: "1m" | "3m" | "6m";
      label: string;
      horizonDays: 21 | 63 | 126;
      score: number;
      buyThreshold: number;
      isBuy: boolean;
      pointsToThreshold: number;
    }>;
    consensus: {
      buyCount: number;
      totalPresets: 3;
      zone: "strong-buy" | "buy" | "neutral";
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
    bottomHunter: BottomHealthFile;
    accumulationBrake: AccumulationHealth;
    bearDca: BearDcaHealth;
    fusion3m: FusionHealthFile;
  };
  warnings: string[];
  sourceFreshness: Analysis["sourceTimes"];
}
```

`pointsToThreshold` is zero when preset already buys, else positive score distance rounded to one decimal. This is presentation only; predicate remains existing `isBuy` result.

`effectiveBuyMultiplier` is `BearDcaAnalysis.mult`, matching current action card. Two-year price brake remains separate and explicit. It must not be multiplied into this field.

`modelHealth.overall` is `degraded` if any model health status is degraded; otherwise `insufficient` if any is insufficient; otherwise `ok`. Original health objects remain included so consumer can inspect exact state.

`sourceFreshness` and `warnings` retain analysis output unchanged. `stale` and `staleDays` retain existing analysis definition.

## Consumer semantics

- `signals.presets[*].isBuy` is only real buy trigger.
- `signals.consensus` summarizes count of independently validated preset triggers. It is not evidence that agreement increases accuracy.
- `signals.radarContext` is never a buy trigger. `isHeadwind` is true only for existing radar composite `<= -40` rule.
- `accumulation.twoYearBrake` is anti-FOMO context; `effectiveBuyMultiplier` remains Bear DCA action multiplier.

## Tests

Add `src/lib/summary.test.ts` with fixed in-memory inputs. Verify:

1. Each preset comes from shared preset logic, reports threshold, isBuy, and positive/zero distance correctly.
2. Consensus count/label/zone derive from existing consensus functions; radar never becomes trigger.
3. Bear DCA multiplier stays effective multiplier while two-year brake stays separate with reasons.
4. Health aggregate prioritizes degraded over insufficient and preserves source objects.
5. Stale/source warnings/market values pass through unchanged.

Add short consumer documentation at `docs/summary-json.md`: URL, versioning contract, fields, units, and semantic rules above.

## Verification

Run `npm run typecheck`, `npm test`, `npm run collect`, and `npm run build`. Inspect produced `public/data/summary.json` against schema and test invariants. Commit and push resulting code, docs, and generated JSON to `main`.
