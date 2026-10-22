import type { VnGoldEntry } from "./types";

export const TROY_OZ_GRAMS = 31.1034768;
export const LUONG_GRAMS = 37.5;

export interface CloseBar {
  date: string;
  close: number;
}

/**
 * Close của bar cuối cùng có `date` NHỎ HƠN HẲN ngày VN `d` — phiên đã đóng trước khi
 * ngày VN d bắt đầu (Yahoo gắn nhãn bar GC=F theo ngày kết phiên, ~04:00Z). Bar mang
 * nhãn d là phiên ĐANG CHẠY lúc VN chụp giá: dùng nó làm premium cùng ngày lệch tới
 * 4,2pt tùy giờ cron (đo 2026-10-22).
 */
export function closeBefore(bars: CloseBar[], d: string): number | null {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date < d) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? bars[ans].close : null;
}

/** Giá thế giới quy đổi VND/lượng. */
export function worldVndPerLuong(xauUsd: number | null, usdVnd: number | null): number | null {
  return xauUsd === null || usdVnd === null ? null : (xauUsd / TROY_OZ_GRAMS) * LUONG_GRAMS * usdVnd;
}

/** % SJC đắt hơn giá thế giới quy đổi, 2 chữ số. */
export function premiumPct(sjcSell: number | null, world: number | null): number | null {
  return sjcSell === null || world === null ? null : Math.round(((sjcSell - world) / world) * 10000) / 100;
}

/**
 * Tái suy ra `xauUsd` + `premiumPct` của mọi dòng từ bar HIỆN TẠI. Hai cột này là dẫn
 * xuất: đóng băng chúng làm lịch sử premium trộn hai phiên bản GC=F (Yahoo sửa
 * 2026-09-15, 511/515 dòng backfill lệch trung vị −0,45pt). Cột thô giữ nguyên.
 * Dòng không có bar nào trước nó giữ `xauUsd` đã lưu.
 */
export function rederivePremiums(history: VnGoldEntry[], bars: CloseBar[]): VnGoldEntry[] {
  return history.map((e) => {
    const xau = closeBefore(bars, e.date) ?? e.xauUsd;
    return { ...e, xauUsd: xau, premiumPct: premiumPct(e.sjcSell, worldVndPerLuong(xau, e.usdVnd)) };
  });
}
