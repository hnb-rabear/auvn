import type { VnGoldEntry } from "./types";

/**
 * Chi phí một vòng mua-bán trên giá SJC NIÊM YẾT THẬT — để UI không để người đọc
 * hiểu % evidence của preset (đo trên XAU/USD, không spread không phí) là tiền vào tay.
 *
 * Tái lập: `npx tsx scripts/vn-net-return.ts` (đo trực tiếp public/data/history/vn-gold.json).
 *
 * CỐ TÌNH KHÔNG khóa bằng test: đây là số MÔ TẢ giai đoạn đã tích lũy, nó trôi mỗi
 * lần cron thêm ngày — khóa lại sẽ làm test đỏ hằng ngày. Refresh khi mốc lịch sử đổi
 * đáng kể (chạy script, cập nhật cả `measuredThrough`/`days`).
 *
 * CẢNH BÁO: 19 tháng, MỘT chế độ bull ⇒ KHÔNG phải evidence 2 giai đoạn, không được
 * trình bày như tỉ lệ đúng đã kiểm chứng. Đủ ≥36 tháng thì xem P2-3/P1-4
 * (docs/audit-and-improvement-proposals-2026.md).
 */
export const VN_ROUND_TRIP = {
  days: 572,
  measuredFrom: "2025-02",
  measuredThrough: "2026-09",
  /** trung vị (sjcSell − sjcBuy) / sjcSell */
  spreadMedianPct: 1.66,
  /** p90 spread — vạch cảnh báo giãn, khớp ngưỡng −1 điểm 2,5% trong criteria.ts */
  spreadP90Pct: 2.5,
  /** vòng 30 ngày: mua giá sjcSell, bán lại giá sjcBuy */
  net30MedianPct: 1.17,
  /** cùng cửa sổ nhưng bỏ qua spread (sjcSell→sjcSell) — phần chênh là spread ăn mất */
  gross30MedianPct: 2.73,
  net30PositivePct: 58.5,
} as const;

/**
 * Spread SJC hiện tại + có vượt vạch p90 lịch sử hay không (badge cạnh giá).
 *
 * Ngưỡng dùng percentile ĐO ĐƯỢC (VN_ROUND_TRIP.spreadP90Pct = 2,50%), không hardcode
 * "2,5 triệu/lượng": giá vàng đổi thì mức VND tuyệt đối vô nghĩa, tỉ lệ % thì không.
 * Trùng đúng ngưỡng −1 điểm của signal `spread` trong criteria.ts nên badge và radar
 * không bao giờ nói khác nhau.
 */
export function spreadBadge(
  sjcBuy: number | null | undefined,
  sjcSell: number | null | undefined
): { pct: number; wide: boolean } | null {
  if (sjcBuy == null || sjcSell == null || sjcSell <= 0) return null;
  const pct = ((sjcSell - sjcBuy) / sjcSell) * 100;
  return { pct, wide: pct >= VN_ROUND_TRIP.spreadP90Pct };
}

/**
 * Giá nhẫn hiệu lực để HIỂN THỊ. Giá nhẫn thưa hơn giá SJC: nguồn dự phòng
 * (cafef) chỉ có SJC, nên entry mới nhất thường có nhẫn null trong khi lịch sử
 * vẫn còn giá nhẫn vài phiên trước — trước đây UI hiện "— / —" dù dữ liệu còn.
 *
 * `date` chỉ khác null khi phiên nhẫn CŨ HƠN phiên SJC, để UI ghi rõ tuổi.
 *
 * KHÔNG dùng cho ringDiscountPct (tiêu chí chênh lệch): so giá nhẫn phiên cũ với
 * giá SJC hôm nay sẽ bóp méo điểm số — chỗ đó phải lấy nhẫn cùng phiên.
 */
export function effectiveRing(
  history: VnGoldEntry[],
  sjcDate: string | null | undefined
): { buy: number | null; sell: number | null; date: string | null } {
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e.ringSell === null) continue;
    return { buy: e.ringBuy, sell: e.ringSell, date: e.date === sjcDate ? null : e.date };
  }
  return { buy: null, sell: null, date: null };
}
