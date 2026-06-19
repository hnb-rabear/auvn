/**
 * Tầng "MUA độ tin cao" — cờ DẪN XUẤT từ composite (điểm mua) ∧ Bottom Hunter
 * (vùng đáy). KHÔNG sửa composite/engine đáy. Chỉ kỳ 3 tháng được kiểm chứng
 * robust (xem docs/fusion.md, scripts/fusion-study.ts).
 */

/** Bin cao của bottomScore = tín hiệu "vùng đáy" đã validated. Khớp
 *  BOTTOM_CONFIG.cycle.binEdges [-40,0,40] (3 ranh giới ⇒ bin 3 = score ≥ 40). */
export const HIGH_CONFIDENCE_BIN = 3;

/** Số liệu kiểm chứng B (composite-buy ∧ cycleBin==3) ở kỳ 3 tháng. Phải khớp
 *  docs/fusion.md và đầu ra scripts/fusion-study.ts. Khóa bằng fusion.evidence.test.ts. */
export interface HighConfEvidence {
  trainFav: number;
  trainN: number;
  testFav: number;
  testN: number;
  /** lưới thưa STEP=3 (mẫu decorrelated) */
  sparseFav: number;
  sparseN: number;
  sparseCi: [number, number];
  /** placebo đồng-n train: B vượt composite-top-n cùng cỡ mẫu (pt) — đo "thông tin trực giao" */
  orthogonalTrainPt: number;
}

export const HIGH_CONF_3M_EVIDENCE: HighConfEvidence = {
  trainFav: 92.8,
  trainN: 69,
  testFav: 100.0,
  testN: 89,
  sparseFav: 96.3,
  sparseN: 54,
  sparseCi: [88.9, 100],
  orthogonalTrainPt: 10.1,
};

/**
 * true khi: đang ở preset 3m + vùng MUA + vùng đáy (cycleBin==3) + tầng đáy đã
 * verified. Đây là tập con của guidance level "strong" — chỉ dùng để quyết định
 * có HIỂN THỊ khối evidence/CI hay không, không đổi nhãn/tone.
 */
export function highConfidenceBuy3m(
  presetId: string | null,
  isBuyZone: boolean,
  cycleBin: number,
  cycleVerified: boolean
): boolean {
  return presetId === "3m" && isBuyZone && cycleBin === HIGH_CONFIDENCE_BIN && cycleVerified;
}
