import {
  presetSignals,
  buyCount,
  consensusZone,
  consensusLabel,
} from "./consensus";
import { isPremiumHigh } from "./guidance";
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
  schemaVersion: "1.1";
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
    premiumGate: {
      blocksBuying: boolean;
      premiumPct: number | null;
      premiumP80: number | null;
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
    /**
     * `degraded` khi một lớp sinh kết luận (preset, fusion 3m, Bear DCA) mất phong độ;
     * `insufficient` khi thiếu bằng chứng preset. Lớp ngữ cảnh và lớp chưa đủ chu kỳ
     * để chấm không ghim giá trị này.
     */
    overall: "ok" | "degraded" | "insufficient";
    degradedLayers: string[];
    insufficientLayers: string[];
    note: string;
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

  const premiumP80 = analysis.premiumPercentiles?.p80 ?? null;
  const radarZone = zoneOf(analysis.composite);
  const radarContext = {
    composite: analysis.composite,
    zone: radarZone,
    isHeadwind: radarZone === "sell" || radarZone === "strong-sell",
    note: "Radar composite chỉ dùng làm ngữ cảnh tham khảo / nhận diện gió ngược (<= -40), không dùng làm tín hiệu mua.",
  };

  // `overall` chỉ tổng hợp các lớp SINH RA kết luận trong file này. Phanh 2 năm và
  // Bottom Hunter là ngữ cảnh (không có mặt ở trục mua / hệ số hành động) — phanh 2 năm
  // ở trạng thái degraded suốt và sẽ ghim overall = degraded vĩnh viễn nếu gộp vào,
  // khiến consumer chiết khấu mọi kết luận. Trạng thái từng lớp vẫn liệt kê đủ ở
  // degradedLayers/insufficientLayers.
  const layers: { name: string; status: "ok" | "degraded" | "insufficient"; actionable: boolean }[] = [
    ...presetHealth.items.map((i) => ({ name: `preset-${i.presetId}`, status: i.status, actionable: true })),
    { name: "fusion-3m", status: fusionHealth.item.status, actionable: true },
    { name: "bear-dca", status: bearDcaHealth.status, actionable: true },
    ...bottomHealth.items.map((i) => ({ name: `bottom-${i.tier}`, status: i.status, actionable: false })),
    { name: "accumulation-brake", status: accumulationHealth.status, actionable: false },
  ];

  const degradedLayers = layers.filter((l) => l.status === "degraded").map((l) => l.name);
  const insufficientLayers = layers.filter((l) => l.status === "insufficient").map((l) => l.name);
  const actionable = layers.filter((l) => l.actionable);
  const missingPresets = presetHealth.items.length < 3;

  // Chỉ `degraded` mới ghim `overall` — giống hệt web (BearDcaCard/Dashboard chỉ cảnh
  // báo khi status === "degraded"). `insufficient` của một lớp nghĩa là "chưa đủ chu kỳ
  // để chấm", KHÔNG phải "kết luận sai": Bear DCA nằm ở `insufficient` liên tục từ
  // 2026-07 (recentBearCycles 3 < 6) nên nếu nó ghim overall thì consumer sẽ chiết khấu
  // mọi tín hiệu preset khỏe mạnh vô thời hạn. `insufficient` chỉ dành cho trường hợp
  // THIẾU bằng chứng preset. Trạng thái từng lớp vẫn liệt kê đủ ở hai mảng dưới.
  const overallHealth: "ok" | "degraded" | "insufficient" = actionable.some(
    (l) => l.status === "degraded"
  )
    ? "degraded"
    : missingPresets
    ? "insufficient"
    : "ok";

  return {
    schemaVersion: "1.1",
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
      premiumGate: {
        blocksBuying: isPremiumHigh(analysis.prices.premiumPct, premiumP80),
        premiumPct: analysis.prices.premiumPct,
        premiumP80,
        note: "Chênh VN ≥ p80 lịch sử: người mua vàng vật chất không nên đuổi giá kể cả khi preset báo mua (cùng cổng với gợi ý hành động trên web).",
      },
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
      degradedLayers,
      insufficientLayers,
      note: "`overall` = degraded khi một lớp sinh kết luận (preset 1m/3m/6m, fusion 3m, Bear DCA) mất phong độ trên dữ liệu mới; = insufficient khi thiếu bằng chứng preset. Lớp ở trạng thái insufficient (chưa đủ chu kỳ để chấm) và lớp ngữ cảnh (Bottom Hunter, phanh 2 năm) không ghim overall — đọc riêng ở hai danh sách lớp.",
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