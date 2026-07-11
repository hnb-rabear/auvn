/**
 * Lõi as-of của cả trang (2026-07-10 UI rework) — TÁCH từ TimeMachine.tsx, thuần không React.
 * Chart ≡ card ≡ monitor: MỌI giá trị lịch-sử/as-of hiển thị phải đi qua đây.
 * Không viết lại logic — mọi công thức trỏ về hàm engine gốc (presetComposites,
 * bearDcaAt, deriveGuidance, highConfidenceBuy3m).
 */
import {
  PRESETS,
  zoneOf,
  type CriterionKey,
  type Preset,
  type TimelinePoint,
  type Zone,
  type BearPhase,
} from "./types";
import { consensusLabel, consensusZone } from "./consensus";
import { deriveGuidance, type Guidance } from "./guidance";
import { highConfidenceBuy3m } from "./fusion";
import { bearDcaAt } from "./bear-dca";
import {
  composites,
  presetComposites,
  idxsAtOrAbove,
  idxsAtOrBelow,
  bottomStartIdxs,
} from "./timeline";

export interface AsOfMode {
  preset: Preset | null;
  weights: Record<CriterionKey, number>;
  consensusMode: boolean;
  fusionDegraded: boolean;
}

export interface AsOfDay {
  idx: number;
  point: TimelinePoint;
  composite: number;
  /** số preset báo mua (0 khi không ở chế độ đồng thuận) */
  kDay: number;
  /** zone thô — bán chỉ tham khảo, caller quyết hiển thị */
  rawZone: Zone;
  /** zone phía mua (bán đã ép neutral — mặc định ẩn vùng bán) */
  zone: Zone;
  isBuy: boolean;
  isSell: boolean;
  verdictLabel: string;
  highConf: boolean;
  dca: { phase: BearPhase; mult: number };
  crashDay: boolean;
  /** prob đã qua cổng acute-crash (crashDay ⇒ bản không trọng số) */
  cycleProb: number | null;
  /** CI chỉ hiển thị khi KHÔNG crash (CI tính theo scheme trọng số) */
  cycleCi: [number, number] | null;
  cycleN: number;
  swingProb: number | null;
  swingCi: [number, number] | null;
  swingN: number;
  guidance: Guidance;
}

export interface AsOfEngine {
  comps: number[];
  buyKs: number[] | null;
  /** ngày tín hiệu mua (chấm ● trên chart) */
  signalIdxs: number[];
  /** ngày composite ≤ −40 (vùng bán tham khảo) */
  sellIdxs: number[];
  /** cạnh lên bin đáy (chấm ▲) */
  bottomStarts: number[];
  day(idx: number): AsOfDay;
}

const fmtNum = (v: number | null, d = 1) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d });

/** Nhãn pha Bear DCA — dùng chung TimeMachine + Dashboard as-of (2026-07-10, chuyển từ TimeMachine.tsx). */
export const DCA_PHASE_LABEL: Record<BearPhase, string> = {
  bull: "Tăng",
  acute: "Sụp cấp tính",
  grind: "Rỉ máu",
  recovery: "Hồi phục",
};

/**
 * Đúng/sai của quyết định: mua đúng khi giá tăng, bán đúng khi giá giảm.
 * Tín hiệu bán chỉ chấm ở 1 tháng — kỳ hạn dài nó NGƯỢC là chính (docs/sell-zone.md).
 * (chuyển nguyên từ TimeMachine.tsx)
 */
export function verdictFor(
  zone: Zone,
  ret: number | null,
  h: "21" | "63" | "126"
): "right" | "wrong" | "n/a" | null {
  if (ret === null || zone === "neutral") return null;
  const buyish = zone === "buy" || zone === "strong-buy";
  if (!buyish && h !== "21") return "n/a";
  return (buyish ? ret > 0 : ret < 0) ? "right" : "wrong";
}

export function createAsOfEngine(points: TimelinePoint[], mode: AsOfMode): AsOfEngine {
  const { preset, weights, consensusMode, fusionDegraded } = mode;
  const buyThr = preset?.buyThreshold ?? 40;
  // v4: chế độ preset chấm bằng presetComposites (sub-signal vĩ mô trọng số riêng)
  const comps = preset ? presetComposites(points, preset) : composites(points, weights);
  // Đồng thuận: số preset báo mua từng ngày — CÙNG trục với verdict live
  const perPreset = consensusMode ? PRESETS.map((pr) => presetComposites(points, pr)) : null;
  const buyKs = perPreset
    ? points.map((_, i) =>
        PRESETS.reduce((k, pr, j) => k + (perPreset[j][i] >= pr.buyThreshold ? 1 : 0), 0)
      )
    : null;
  const signalIdxs = buyKs
    ? buyKs.reduce<number[]>((acc, k, i) => (k >= 1 ? (acc.push(i), acc) : acc), [])
    : idxsAtOrAbove(comps, buyThr);
  const sellIdxs = idxsAtOrBelow(comps, -40);
  const bottomStarts = bottomStartIdxs(points);
  const allPrices = points.map((q) => q.price);
  const preset3m = PRESETS.find((q) => q.id === "3m")!;

  function day(idx: number): AsOfDay {
    const p = points[idx];
    const composite = comps[idx];
    const kDay = buyKs ? buyKs[idx] : 0;
    const compZone = zoneOf(composite, buyThr);
    const rawZone: Zone = buyKs
      ? kDay >= 1
        ? consensusZone(kDay)
        : compZone === "sell" || compZone === "strong-sell"
          ? compZone
          : "neutral"
      : compZone;
    const isBuy = rawZone === "buy" || rawZone === "strong-buy";
    const isSell = rawZone === "sell" || rawZone === "strong-sell";
    // preset chỉ kiểm chứng phía mua — mặc định ẩn vùng bán (caller có thể tự hiện tham khảo)
    const zone: Zone = isBuy ? rawZone : "neutral";
    // Tầng "MUA độ tin cao" 3m: cycleBin past-only, KHÔNG dùng prob (base-rate look-ahead)
    const is3mBuyDay = consensusMode
      ? presetComposites([p], preset3m)[0] >= preset3m.buyThreshold
      : false;
    const highConf =
      highConfidenceBuy3m(
        consensusMode ? "3m" : (preset?.id ?? null),
        consensusMode ? is3mBuyDay : isBuy,
        p.cycleBin ?? -1,
        p.cycleBin !== undefined
      ) && !fusionDegraded;
    // Mức mua Bear DCA as-of — CÙNG engine với card live (golden: bearDcaAt ≡ runBearDca)
    const dcaAt = bearDcaAt(allPrices, idx, p.pricePct2y ?? null);
    // Cổng acute-crash as-of-ngày — CÙNG chính sách với live
    const crashDay = dcaAt.phase === "acute";
    const cycleProb = crashDay ? (p.cycleProbUw ?? p.cycleProb ?? null) : (p.cycleProb ?? null);
    const swingProb = crashDay ? (p.swingProbUw ?? p.swingProb ?? null) : (p.swingProb ?? null);
    const cycleN = p.cycleN ?? 0;
    const verified = cycleProb !== null && cycleN >= 10;
    const high = verified && cycleProb >= 60;
    const ciStr = !crashDay && p.cycleCi ? ` (CI ${p.cycleCi[0]}–${p.cycleCi[1]}%)` : "";
    const signedC = `${composite > 0 ? "+" : ""}${fmtNum(composite)}`;
    const scoreReason = buyKs
      ? kDay >= 1
        ? `Điểm mua: ${kDay}/3 preset kỳ hạn đang báo MUA — cò súng đã kiểm chứng 2 giai đoạn.`
        : isSell
          ? `Điểm mua: chưa preset nào báo mua; radar âm sâu (${signedC}) — gió ngược ngắn hạn, với người mua tương đương trung tính.`
          : `Điểm mua: chưa preset nào trong vùng mua (radar ${signedC}).`
      : undefined;
    const guidance = deriveGuidance({
      zone: rawZone,
      composite,
      bottom: {
        high,
        verified,
        label: verified
          ? `Săn đáy: xác suất gần đáy ${Math.round(cycleProb!)}%${ciStr}${crashDay ? " (đang sụp cấp tính — ước lượng thận trọng)" : ""}.`
          : "Săn đáy: chưa đủ dữ liệu kiểm chứng.",
      },
      premiumPct: null, // world-only ở as-of — cổng premium tắt (trung thực)
      premiumP80: null,
      scoreReason,
    });
    const verdictLabel = buyKs
      ? kDay >= 1
        ? consensusLabel(kDay)
        : "CHƯA CÓ TÍN HIỆU MUA"
      : preset && !isBuy
        ? "CHƯA CÓ TÍN HIỆU MUA"
        : isBuy
          ? rawZone === "strong-buy"
            ? "VÙNG MUA MẠNH"
            : "VÙNG MUA"
          : "TRUNG LẬP";
    return {
      idx,
      point: p,
      composite,
      kDay,
      rawZone,
      zone,
      isBuy,
      isSell,
      verdictLabel,
      highConf,
      dca: { phase: dcaAt.phase, mult: dcaAt.mult },
      crashDay,
      cycleProb,
      cycleCi: crashDay ? null : (p.cycleCi ?? null),
      cycleN,
      swingProb,
      swingCi: crashDay ? null : (p.swingCi ?? null),
      swingN: p.swingN ?? 0,
      guidance,
    };
  }

  return { comps, buyKs, signalIdxs, sellIdxs, bottomStarts, day };
}
