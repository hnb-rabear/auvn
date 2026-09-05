import {
  presetSignals,
  buyCount,
  consensusZone,
  consensusLabel,
} from "./consensus";
import { zoneOf } from "./types";
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
    bottomHunter: BottomHealth;
    accumulationBrake: AccumulationHealth;
    bearDca: BearDcaHealth;
    fusion3m: FusionHealthFile;
  };
  warnings: string[];
  sourceFreshness: NonNullable<Analysis["sourceTimes"]> | null;
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
    zone: consensusZone(k) as "strong-buy" | "buy" | "neutral",
    label: consensusLabel(k),
    summary:
      k > 0
        ? `${k}/3 preset kỳ hạn đang báo MUA. Mỗi preset được kiểm chứng riêng; mức đồng thuận không tăng độ chính xác. Không dùng composite làm cò súng.`
        : "Chưa có preset nào vào vùng mua. Giữ quan sát hoặc tích sản định kỳ theo Bear DCA.",
  };

  const radarZone = zoneOf(analysis.composite);
  const radarContext = {
    composite: analysis.composite,
    zone: radarZone,
    isHeadwind: radarZone === "sell" || radarZone === "strong-sell",
    note: "Radar composite chỉ dùng làm ngữ cảnh tham khảo / nhận diện gió ngược (<= -40), không dùng làm tín hiệu mua.",
  };

  const hasMissingExpectedItems =
    presetHealth.items.length < 3 || bottomHealth.items.length < 2;

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
    : hasMissingExpectedItems || allStatuses.includes("insufficient")
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
    sourceFreshness: analysis.sourceTimes ?? null,
  };
}