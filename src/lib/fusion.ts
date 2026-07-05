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
  /** toàn giai đoạn (train+test gộp, chọn theo NGÀY): tỉ lệ thuận chiều, cỡ mẫu, CI 95%
   *  block-bootstrap (block=H/3, xử lý tín hiệu bắn chùm). Thay lưới-thưa i%STEP cũ vốn
   *  trôi theo canh-pha khi cron đổi độ dài đầu chuỗi timeline. */
  fullFav: number;
  fullN: number;
  fullCi: [number, number];
  /** placebo đồng-n train: B vượt composite-top-n cùng cỡ mẫu (pt) — đo "thông tin trực giao" */
  orthogonalTrainPt: number;
}

/** Số cho preset 3m v4.1 phủ-max (macroSub Fed>0, 2026-07-05) — tính lại bởi
 *  scripts/calc-fusion-evidence.ts sau khi preset 3m đổi trọng số; re-validated bởi
 *  fusion-study: train B 93,3% vs comp 88,5% (+placebo +1,7pt), test HÒA TẠI TRẦN 100%
 *  (comp v4.1 đã 99–100% test nên B không thể vượt). */
export const HIGH_CONF_3M_EVIDENCE: HighConfEvidence = {
  trainFav: 93.3,
  trainN: 60,
  testFav: 100.0,
  testN: 75,
  fullFav: 97.0,
  fullN: 135,
  fullCi: [91.1, 100],
  orthogonalTrainPt: 1.7,
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
