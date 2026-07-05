/**
 * Đồng thuận preset — trục verdict của chế độ "Toàn cảnh" (từ 2026-07-05).
 *
 * Cấu hình mặc định cũ (35/25/20/20, ngưỡng ±40) chưa từng qua tuyển chọn và đo
 * được là vô dụng làm tín hiệu: 0 tín hiệu mua suốt test 2019–2026, phía bán
 * ngược chiều ở 6 tháng (xem docs/presets.md "Đồng thuận preset", số liệu bởi
 * scripts/consensus-study.ts). Trục hành động của chế độ mặc định vì vậy chuyển
 * sang PHÉP ĐẾM các preset đã kiểm chứng: "k/3 preset kỳ hạn đang báo MUA".
 *
 * QUAN TRỌNG (kết quả placebo đồng-n, KHÔNG được nói quá): đồng thuận k/3 thắng
 * baseline ở cả 6 ô (3 kỳ hạn × 2 giai đoạn) nhưng KHÔNG vượt placebo "chỉ
 * nới/siết ngưỡng của preset đúng kỳ hạn cho cùng cỡ mẫu" — 3 preset đều
 * macro-nặng nên tương quan cao. Vì vậy k/3 chỉ là TÓM TẮT HIỂN THỊ của 3 tín
 * hiệu đã kiểm chứng riêng lẻ; mọi con số evidence hiển thị phải là evidence
 * CỦA TỪNG PRESET, không được claim "đồng thuận chính xác hơn preset đơn".
 *
 * Radar composite mặc định vẫn được tính làm NGỮ CẢNH (điểm radar, gió ngược
 * ≤ −40 — validated là headwind 1 tháng, xem guidance.ts), không làm cò súng.
 */
import {
  compositeScore,
  PRESETS,
  type CriterionResult,
  type Preset,
  type Zone,
} from "./types";

export interface PresetSignal {
  preset: Preset;
  /** composite -100..+100 theo trọng số preset trên criteria live */
  composite: number;
  /** composite ≥ ngưỡng mua của preset */
  isBuy: boolean;
}

/** Chấm cả 3 preset trên criteria live (analysis.json). */
export function presetSignals(
  criteria: Pick<CriterionResult, "key" | "score" | "available">[]
): PresetSignal[] {
  return PRESETS.map((preset) => {
    const composite = compositeScore(criteria, preset.weights);
    return { preset, composite, isBuy: composite >= preset.buyThreshold };
  });
}

/** Số preset đang trong vùng mua. */
export function buyCount(signals: PresetSignal[]): number {
  return signals.filter((s) => s.isBuy).length;
}

/**
 * Zone cho lớp guidance khi ở chế độ đồng thuận: k≥1 → buy (3/3 → strong-buy).
 * k=0 KHÔNG trả sell ở đây — gió ngược vẫn do radar composite ≤ −40 quyết
 * (caller giữ nguyên đường validated cũ), vì đồng thuận chỉ kiểm chứng phía MUA.
 */
export function consensusZone(k: number): Zone {
  if (k >= 3) return "strong-buy";
  if (k >= 1) return "buy";
  return "neutral";
}

/** Nhãn verdict chính của chế độ đồng thuận (phía mua). */
export function consensusLabel(k: number): string {
  return k >= 1 ? `${k}/3 PRESET BÁO MUA` : "CHƯA CÓ TÍN HIỆU MUA";
}

/** Tên các preset đang báo mua — dùng cho câu lý do trong guidance. */
export function buyNames(signals: PresetSignal[]): string[] {
  return signals.filter((s) => s.isBuy).map((s) => s.preset.label);
}
