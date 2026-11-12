// src/lib/bear-downside-view.ts
/** Helper thuần cho máy thời gian card Triển Vọng — không React, dễ test. */
import { furtherDrawdownPct } from "./bear-downside";
import type { TimelinePoint } from "./types";

/** % dưới đỉnh (ATH) tính tới ngày X, không nhìn tương lai. Trả số dương. */
export function ddAsOfPct(prices: number[], X: number): number {
  let ath = -Infinity;
  for (let i = 0; i <= X && i < prices.length; i++) if (prices[i] > ath) ath = prices[i];
  if (ath <= 0) return 0;
  return ((ath - prices[X]) / ath) * 100;
}

/** Đáy tệ nhất thực tế H phiên sau X: min(prices[X+1..X+H])/prices[X]-1 (%). null nếu chưa đáo hạn. */
export function actualWorstDipPct(prices: number[], X: number, H: number): number | null {
  return furtherDrawdownPct(prices, X, H);
}

/**
 * pUp % → bậc thô "X/10", clamp 1..9. Chống giả-chính-xác: sau recency-weighting
 * chỉ còn ~12 cửa sổ 6T độc lập hiệu dụng (SE ±~10pp) nên "83.5%" là độ chính xác
 * ảo; bậc 1/10 khớp độ phân giải thật và không bao giờ tuyên bố 0/10 hay 10/10.
 */
export function pUpTenths(pUp: number): number {
  return Math.min(9, Math.max(1, Math.round(pUp / 10)));
}

/** Dải as-of tại i đã đáo hạn? Nếu có: kết cục nằm trong p25–p75 / đáy thủng p10. null nếu chưa đáo hạn hoặc không có dải. */
function bandHit(
  points: TimelinePoint[],
  prices: number[],
  i: number,
  H: "21" | "63" | "126"
): { in50: boolean; beyond: boolean } | null {
  const b = points[i].bearAsOf?.[H];
  const ret = points[i].returns[H];
  if (!b || ret == null) return null;
  const dip = furtherDrawdownPct(prices, i, Number(H));
  if (dip === null) return null;
  return { in50: ret >= b.endP25 && ret <= b.endP75, beyond: dip < b.p10 };
}

/**
 * Calibration ĐO ĐƯỢC của dải as-of trên toàn lịch sử đã đáo hạn (walk-forward,
 * không look-ahead: dải ngày X chỉ dùng dữ liệu ≤ X, so với thực tế SAU X):
 * - endIn50: % lần kết cục thực nằm trong [endP25, endP75] — kỳ vọng ~50%.
 * - dipBeyond10: % lần đáy thực SÂU hơn p10 "hiếm gặp" — kỳ vọng ~10%.
 * Lưới thưa `step` để bớt chồng lấn cửa sổ. Con số MÔ TẢ độ khớp lịch sử cho card
 * (biến caveat "không phải dự đoán" thành số kiểm được), không phải CI.
 * null khi <30 mẫu.
 */
export function coverageStats(
  points: TimelinePoint[],
  H: "21" | "63" | "126",
  step = 3
): { endIn50: number; dipBeyond10: number; n: number } | null {
  const prices = points.map((p) => p.price);
  let n = 0, in50 = 0, beyond = 0;
  for (let i = 0; i < points.length; i += step) {
    const hit = bandHit(points, prices, i, H);
    if (!hit) continue;
    n++;
    if (hit.in50) in50++;
    if (hit.beyond) beyond++;
  }
  if (n < 30) return null;
  return {
    endIn50: Math.round((in50 / n) * 100),
    dipBeyond10: Math.round((beyond / n) * 100),
    n,
  };
}

/** Chỉ số phiên ĐẦU của mỗi năm-tháng (YYYY-MM) — mốc snap cho slider tháng. dates phải tăng dần. */
export function monthAnchors(dates: string[]): number[] {
  const out: number[] = [];
  let prev = "";
  for (let i = 0; i < dates.length; i++) {
    const ym = dates[i].slice(0, 7);
    if (ym !== prev) { out.push(i); prev = ym; }
  }
  return out;
}

/** Vị trí tháng của idx = chỉ số anchor lớn nhất ≤ idx (anchors tăng dần). 0 nếu idx trước anchor đầu. */
export function monthPosOf(anchors: number[], idx: number): number {
  let pos = 0;
  for (let k = 0; k < anchors.length; k++) {
    if (anchors[k] <= idx) pos = k;
    else break;
  }
  return pos;
}

// ── Độ tin cậy dải Triển vọng (2026-11-12, scripts/bear-downside-forecast-study.ts) ──
// 6 cách dựng dải thay thế (unweighted, rec252, FHS ×3, conformal) đều KHÔNG thắng card;
// thứ đo được là BIẾT KHI NÀO card kém tin: cờ "bão" σ + chuông báo trượt coverage.

export const STORM_RATIO = 1.3;
export const STORM_LOOKBACK = 504;
const HKEYS = ["21", "63", "126"] as const;

/** σ EWMA(λ=0.94) của log-return ngày. Mồi = TB bình phương 20 log-return ĐẦU ⇒ σ[0..19] không strictly past-only; từ σ[20] trở đi chỉ dùng giá ≤ X (stormRatio cần X≥504 nên không bị ảnh hưởng). */
export function ewmaSigma(prices: number[]): number[] {
  const n = prices.length;
  if (n < 2) return prices.map(() => 0);
  const k = Math.min(20, n - 1);
  let s2 = 0;
  for (let i = 0; i < k; i++) s2 += Math.log(prices[i + 1] / prices[i]) ** 2;
  s2 /= k;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) { const r = Math.log(prices[i] / prices[i - 1]); s2 = 0.94 * s2 + 0.06 * r * r; }
    out.push(Math.sqrt(s2));
  }
  return out;
}

/** σ[X] / trung vị σ của 504 phiên TRƯỚC X. null khi chưa đủ 504 phiên. */
export function stormRatio(sigma: number[], X: number): number | null {
  if (X < STORM_LOOKBACK || X >= sigma.length) return null;
  const past = sigma.slice(X - STORM_LOOKBACK, X).sort((a, b) => a - b);
  const med = past[past.length >> 1];
  return med > 0 ? sigma[X] / med : null;
}

/** Thị trường "dữ" bất thường tại X: σ ≥ 1.3× trung vị 2 năm trước đó. */
export function stormAt(sigma: number[], X: number): boolean {
  const r = stormRatio(sigma, X);
  return r !== null && r >= STORM_RATIO;
}

export type StormEvidence = Record<"21" | "63" | "126", { onDip10: number; offDip10: number; onClusters: number } | null>;

/**
 * Bằng chứng cờ bão trên lịch sử đã đáo hạn: % lần đáy thực thủng p10 của dải as-of
 * khi cờ BẬT vs TẮT. Tính lại từ timeline (không hằng số) — mỗi cron thêm ngày đáo hạn.
 * null cho kỳ hạn khi không có ngày bão nào đáo hạn.
 */
export function stormEvidence(points: TimelinePoint[], sigma: number[], step = 3): StormEvidence {
  const prices = points.map((p) => p.price);
  const out = {} as StormEvidence;
  for (const H of HKEYS) {
    const Hn = Number(H);
    let on = 0, onB = 0, off = 0, offB = 0;
    const blocks = new Set<number>();
    for (let i = 0; i < points.length; i += step) {
      const b = points[i].bearAsOf?.[H];
      if (!b) continue;
      const dip = furtherDrawdownPct(prices, i, Hn);
      if (dip === null) continue;
      const r = stormRatio(sigma, i);
      if (r === null) continue; // chưa đủ lịch sử ⇒ không tính là "tắt"
      if (r >= STORM_RATIO) { on++; if (dip < b.p10) onB++; blocks.add(Math.floor(i / Hn)); }
      else { off++; if (dip < b.p10) offB++; }
    }
    out[H] = on && off
      ? { onDip10: Math.round((onB / on) * 100), offDip10: Math.round((offB / off) * 100), onClusters: blocks.size }
      : null;
  }
  return out;
}

export type BdoHealthItem = {
  H: "21" | "63" | "126";
  status: "ok" | "degraded" | "insufficient";
  clusters: number;
  endIn50: number | null;
  dipBeyond10: number | null;
};
export type BdoHealth = { generatedAt: string; items: BdoHealthItem[] };

/**
 * Chuông báo trượt: dải as-of có gốc trong 504 phiên gần nhất VÀ đã đáo hạn — kết cục
 * thực có rơi vào p25–p75 ~50% và đáy thủng p10 ~10% không? Dải nhiễu theo SỐ CỤM độc
 * lập k (khối H phiên cố định, không chuỗi hóa), không theo số ngày chồng lấn. k<6 ⇒
 * insufficient (6T gần như luôn vậy: 2 năm ≈ 4 cửa sổ). Chỉ báo khi thủng đáy QUÁ NHIỀU.
 */
export function monitorBearDownside(points: TimelinePoint[], step = 3): BdoHealth {
  const prices = points.map((p) => p.price);
  const last = points.length - 1;
  const items: BdoHealthItem[] = HKEYS.map((H) => {
    const Hn = Number(H);
    let n = 0, in50 = 0, beyond = 0;
    const blocks = new Set<number>();
    // lưới gốc 0 (cùng pha coverageStats): chỉ số bắt đầu = bội số `step` đầu tiên ≥ last−504, không trôi theo `last`
    const start = Math.ceil(Math.max(0, last - STORM_LOOKBACK) / step) * step;
    for (let i = start; i + Hn <= last; i += step) {
      const hit = bandHit(points, prices, i, H);
      if (!hit) continue;
      n++;
      if (hit.in50) in50++;
      if (hit.beyond) beyond++;
      blocks.add(Math.floor(i / Hn));
    }
    const k = blocks.size;
    if (k < 6) return { H, status: "insufficient", clusters: k, endIn50: null, dipBeyond10: null };
    const c50 = in50 / n, d10 = beyond / n;
    const bad = Math.abs(c50 - 0.5) > 1.96 * Math.sqrt(0.25 / k) || d10 - 0.1 > 1.96 * Math.sqrt(0.09 / k);
    return { H, status: bad ? "degraded" : "ok", clusters: k, endIn50: Math.round(c50 * 100), dipBeyond10: Math.round(d10 * 100) };
  });
  return { generatedAt: new Date().toISOString(), items };
}
