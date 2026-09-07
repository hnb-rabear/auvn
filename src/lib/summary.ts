import {
  presetSignals,
  buyCount,
  consensusZone,
  consensusLabel,
} from "./consensus";
import { isPremiumHigh } from "./guidance";
import { bottomStartIdxsFromBins } from "./timeline";
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
  BottomAnalysis,
  BottomTierResult,
  VnGoldEntry,
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

/** Tầng đáy rút gọn cho consumer máy — bỏ `drivers` (dài, chỉ để hiển thị web). */
export interface SummaryBottomTier {
  bin: number;
  prob: number;
  ci: [number, number] | null;
  probUnweighted: number | null;
  n: number;
}

export interface SummaryMarketChanges {
  prevDate: string | null;
  xauUsd: number | null;
  sjcSell: number | null;
  ringSell: number | null;
  vnPremiumPct: number | null;
}

/** Khác biệt so với snapshot sinh lần trước — để consumer poll nhiều lần/ngày không
 *  phải tự giữ state file (mất file = mất tín hiệu). */
export interface SummaryChanged {
  /** `dataDate` đã đổi so lần sinh trước. `true` khi chưa có snapshot cũ để so. */
  sincePrevRun: boolean;
  /** preset vừa chuyển sang báo mua / vừa mất tín hiệu mua. */
  newBuySignals: ("1m" | "3m" | "6m")[];
  lostBuySignals: ("1m" | "3m" | "6m")[];
  /** = `bottomHunter.isBottomStart`, nhân bản ở đây để consumer chỉ đọc một chỗ. */
  bottomStartToday: boolean;
  /** pha Bear DCA đổi so lần trước. */
  phaseChanged: boolean;
}

export interface AuvnSummary {
  schemaVersion: "1.3";
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
    /** Chênh lệch so phiên giao dịch liền trước; `null` khi lịch sử có < 2 phiên. */
    changes: SummaryMarketChanges | null;
  };
  changed: SummaryChanged;
  bottomHunter: {
    cycle: SummaryBottomTier;
    swing: SummaryBottomTier;
    isBottomStart: boolean;
    lastBottomStartDate: string | null;
    daysSinceBottomStart: number | null;
    crashMode: boolean;
    note: string;
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
  bottom: BottomAnalysis;
  /** Lịch sử VN theo ngày tăng dần, để tính `market.changes`. */
  vnHistory: VnGoldEntry[];
  /** Snapshot sinh lần trước, để tính `changed`. `null` = lần đầu / không đọc được. */
  prev?: AuvnSummary | null;
  nowIso?: string;
}

/** Làm tròn n chữ số thập phân; giữ `null`. Cắt đuôi float rác (0.15828068592057748). */
const round = (v: number | null | undefined, dp: number) =>
  v === null || v === undefined ? v : Math.round(v * 10 ** dp) / 10 ** dp;

function computeChanged(
  prev: AuvnSummary | null | undefined,
  dataDate: string,
  presets: SummaryPresetSignal[],
  phase: BearDcaAnalysis["phase"],
  isBottomStart: boolean
): SummaryChanged {
  const buying = new Set(presets.filter((p) => p.isBuy).map((p) => p.id));
  // Snapshot cũ có thể là schema trước hoặc file cắt cụt ⇒ truy cập phòng thủ.
  const prevBuying = new Set(
    (prev?.signals?.presets ?? []).filter((p) => p.isBuy).map((p) => p.id)
  );
  const prevPhase = prev?.accumulation?.bearDca?.phase;
  return {
    // Chưa có snapshot cũ ⇒ coi như mới, đừng ru consumer ngủ bằng `false`.
    sincePrevRun: !prev || prev.dataDate !== dataDate,
    newBuySignals: [...buying].filter((id) => !prevBuying.has(id)),
    lostBuySignals: [...prevBuying].filter((id) => !buying.has(id)),
    bottomStartToday: isBottomStart,
    phaseChanged: prevPhase !== undefined && prevPhase !== phase,
  };
}

const tier = (t: BottomTierResult): SummaryBottomTier => ({
  bin: t.bin,
  prob: t.prob,
  ci: t.ci,
  probUnweighted: t.probUnweighted ?? null,
  n: t.n,
});

const delta = (a: number | null, b: number | null, dp?: number) =>
  a === null || b === null ? null : dp === undefined ? a - b : Math.round((a - b) * 10 ** dp) / 10 ** dp;

/** Số ngày dương lịch giữa hai ngày ISO `YYYY-MM-DD`. */
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function marketChanges(vnHistory: VnGoldEntry[], analysis: Analysis): SummaryMarketChanges | null {
  if (vnHistory.length < 2) return null;
  // Phiên trước = entry cuối cùng có date < dataDate (lịch sử đã sắp tăng dần).
  const prev = [...vnHistory].reverse().find((e) => e.date < analysis.dataDate);
  if (!prev) return null;
  const p = analysis.prices;
  return {
    prevDate: prev.date,
    xauUsd: delta(p.xauUsd, prev.xauUsd, 2),
    sjcSell: delta(p.sjcSell, prev.sjcSell),
    ringSell: delta(p.ringSell, prev.ringSell),
    vnPremiumPct: delta(p.premiumPct, prev.premiumPct, 2),
  };
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
    bottom,
    vnHistory,
  } = input;

  const hist = bottom.signalHistory;
  const startIdxs = bottomStartIdxsFromBins(hist.map((r) => r.cycleBin));
  const lastStart = startIdxs.length ? hist[startIdxs[startIdxs.length - 1]] : null;
  // `bottom.json` và `analysis.json` do hai bước khác nhau của cron ghi ra: nếu Bottom
  // Hunter lỗi mà analysis vẫn chạy, hàng cuối signalHistory là ngày CŨ — báo cạnh lên
  // của nó như "hôm nay" sẽ sinh tín hiệu gom rải giả. Chỉ nhận khi hai ngày trùng khớp.
  const histIsCurrent = hist[hist.length - 1]?.date === analysis.dataDate;
  const isBottomStart = histIsCurrent && startIdxs[startIdxs.length - 1] === hist.length - 1;
  const bottomHunter = {
    cycle: tier(bottom.cycle),
    swing: tier(bottom.swing),
    isBottomStart,
    lastBottomStartDate: lastStart?.date ?? null,
    daysSinceBottomStart: lastStart ? daysBetween(lastStart.date, analysis.dataDate) : null,
    // Cùng cổng acute-crash với web (Dashboard `bottomCrashMode`): prob recency lạc quan
    // giả khi giá đang sụp cấp tính.
    crashMode: bearDca.phase === "acute",
    note: "Bottom Hunter là lớp NGỮ CẢNH, không phải cò súng mua — chỉ signals.presets[*].isBuy mới là tín hiệu mua thật. crashMode = true thì đọc probUnweighted thay cho prob. isBottomStart là điểm dò đáy sớm để BẮT ĐẦU gom rải, không phải lời hứa đáy: tín hiệu phụ thuộc chế độ thị trường (win 6 tháng 92–93% giai đoạn ≥2019 nhưng chỉ 61–69% trong gấu <2019, xem docs/bottom.md). `n` đếm quan sát trên lưới thưa 3 phiên với cửa sổ lợi suất CHỒNG NHAU — không phải số mẫu độc lập, nên đừng đọc CI hẹp thành độ chắc chắn cao.",
  };

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
    schemaVersion: "1.3",
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
      changes: marketChanges(vnHistory, analysis),
    },
    changed: computeChanged(input.prev, analysis.dataDate, presets, bearDca.phase, isBottomStart),
    bottomHunter,
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
      pricePercentile2y: round(accumulation.pricePct2y, 4) ?? null,
      // Đuôi float thô (0.15828068592057748) chỉ là nhiễu cho consumer máy — hiển thị
      // chỉ dùng 2 chữ số. Làm tròn 4 chữ số: không mất thông tin có nghĩa.
      bearDca: {
        ...bearDca,
        ddFromAth: round(bearDca.ddFromAth, 4) as number,
        ddChange: round(bearDca.ddChange, 4) as number,
        pricePct2y: round(bearDca.pricePct2y, 4) as number,
      },
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