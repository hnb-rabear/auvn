export type CriterionKey = "technical" | "premium" | "macro" | "stats";

export interface SubSignal {
  id: string;
  label: string;
  /** -2 (nghiêng bán mạnh) .. +2 (nghiêng mua mạnh) */
  score: number;
  explanation: string;
  available: boolean;
}

export interface CriterionResult {
  key: CriterionKey;
  label: string;
  signals: SubSignal[];
  /** trung bình các tín hiệu khả dụng, -2..+2 */
  score: number;
  available: boolean;
  provisional?: boolean;
}

export type Zone = "strong-buy" | "buy" | "neutral" | "sell" | "strong-sell";

export interface Prices {
  sjcBuy: number | null;
  sjcSell: number | null;
  ringBuy: number | null;
  ringSell: number | null;
  xauUsd: number | null;
  usdVnd: number | null;
  /** giá thế giới quy đổi VND/lượng */
  worldVndPerLuong: number | null;
  premiumPct: number | null;
  premiumVnd: number | null;
}

export interface Analysis {
  generatedAt: string;
  dataDate: string;
  stale: boolean;
  staleDays: number;
  prices: Prices;
  criteria: CriterionResult[];
  defaultWeights: Record<CriterionKey, number>;
  composite: number;
  zone: Zone;
  vnHistoryDays: number;
  warnings: string[];
}

export interface BacktestBucket {
  zone: Zone;
  horizonDays: number;
  count: number;
  /** % trường hợp diễn biến thuận chiều tín hiệu (mua: giá tăng, bán: giá giảm) */
  pctFavorable: number | null;
  medianReturnPct: number | null;
}

export interface Backtest {
  generatedAt: string;
  fromDate: string;
  toDate: string;
  observations: number;
  horizons: number[];
  buckets: BacktestBucket[];
  note: string;
}

export interface VnGoldEntry {
  date: string;
  sjcBuy: number | null;
  sjcSell: number | null;
  ringBuy: number | null;
  ringSell: number | null;
  usdVnd: number | null;
  xauUsd: number | null;
  premiumPct: number | null;
}

export const DEFAULT_WEIGHTS: Record<CriterionKey, number> = {
  technical: 0.35,
  premium: 0.25,
  macro: 0.2,
  stats: 0.2,
};

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  technical: "Kỹ thuật giá thế giới (XAU/USD)",
  premium: "Chênh lệch VN — thế giới",
  macro: "Vĩ mô (USD, lãi suất, tỷ giá)",
  stats: "Thống kê lịch sử",
};

export const ZONE_LABELS: Record<Zone, string> = {
  "strong-buy": "VÙNG MUA MẠNH",
  buy: "VÙNG MUA",
  neutral: "TRUNG LẬP",
  sell: "VÙNG BÁN",
  "strong-sell": "VÙNG BÁN MẠNH",
};

/** Tổng hợp điểm các tiêu chí (đã -2..+2) thành composite -100..+100 với trọng số tự chuẩn hóa theo tiêu chí khả dụng. */
export function compositeScore(
  criteria: Pick<CriterionResult, "key" | "score" | "available">[],
  weights: Record<CriterionKey, number>
): number {
  let sum = 0;
  let totalW = 0;
  for (const c of criteria) {
    if (!c.available) continue;
    const w = weights[c.key] ?? 0;
    sum += c.score * w;
    totalW += w;
  }
  if (totalW === 0) return 0;
  return Math.round((sum / totalW) * 50 * 10) / 10;
}

export function zoneOf(composite: number): Zone {
  if (composite >= 70) return "strong-buy";
  if (composite >= 40) return "buy";
  if (composite <= -70) return "strong-sell";
  if (composite <= -40) return "sell";
  return "neutral";
}
