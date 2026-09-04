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
 *  fusion-study: train B 93,3% vs comp 88,5%, test HÒA TẠI TRẦN 100%
 *  (comp v4.1 đã 99–100% test nên B không thể vượt).
 *
 *  orthogonalTrainPt 1,7 → 3,3 (2026-09-04): KHÔNG phải tín hiệu mạnh lên, mà là
 *  hệ quả một BUG look-ahead ở scripts/backtest.ts:48 — `seasonalityTable` tính MỘT
 *  LẦN trên toàn chuỗi rồi dùng cho mọi điểm lịch sử, nên khi Yahoo cuốn cửa sổ 20
 *  năm (chuỗi bắt đầu 2009-07-06 → 2009-09-03) trung bình tháng đổi: T5 2,30→1,96 và
 *  T8 2,07→1,12 tụt qua ngưỡng ±2 ⇒ 109 điểm train lệch stats ±0,25 ⇒ 2010-11-04 (một
 *  ngày SAI) chen vào top-60 placebo, favTop 91,7→90,0. favB/trainN/fullN/CI KHÔNG đổi
 *  nên chỉ test placebo (xếp hạng trong cụm điểm sát nhau) đủ nhạy để bắt.
 *  ⇒ Số này còn trôi mỗi lần bar đầu chuỗi rụng. Sửa gốc = P1-1 trong
 *  docs/audit-and-improvement-proposals-2026.md (bỏ look-ahead + de-trend mùa vụ),
 *  sẽ đổi toàn bộ evidence timeline nên phải re-validate cả 3 preset + fusion. */
export const HIGH_CONF_3M_EVIDENCE: HighConfEvidence = {
  trainFav: 93.3,
  trainN: 60,
  testFav: 100.0,
  testN: 75,
  fullFav: 97.0,
  fullN: 135,
  fullCi: [91.1, 100],
  orthogonalTrainPt: 3.3,
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
