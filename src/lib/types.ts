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

/** Một điểm giả lập lịch sử: engine nói gì tại ngày đó và sau đó giá đi thế nào. */
export interface TimelinePoint {
  date: string;
  /** giá XAU/USD đóng cửa ngày đó */
  price: number;
  composite: number;
  zone: Zone;
  /** điểm -2..+2 của từng tiêu chí thế giới tham gia giả lập */
  scores: Partial<Record<CriterionKey, number>>;
  /** lợi suất % sau 21/63/126 phiên; null nếu chưa đủ tương lai */
  returns: Record<"21" | "63" | "126", number | null>;
}

export interface Timeline {
  generatedAt: string;
  note: string;
  points: TimelinePoint[];
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
  /** true = nhập từ nguồn lịch sử (CafeF), không phải cron tự thu thập */
  backfilled?: boolean;
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

export function zoneOf(composite: number, buyThreshold = 40): Zone {
  if (composite >= buyThreshold + 30) return "strong-buy";
  if (composite >= buyThreshold) return "buy";
  if (composite <= -70) return "strong-sell";
  if (composite <= -40) return "sell";
  return "neutral";
}

/** Bộ cấu hình theo kỳ hạn, tuyển bằng scripts/presets-study.ts. Chi tiết: docs/presets.md */
export interface Preset {
  id: string;
  label: string;
  horizonDays: 21 | 63 | 126;
  /** premium = 0: tiêu chí chênh lệch VN chưa có lịch sử dài để kiểm chứng nên không tham gia preset */
  weights: Record<CriterionKey, number>;
  buyThreshold: number;
  evidence: {
    /** % tín hiệu mua đúng (giá tăng sau kỳ hạn) trên giai đoạn 2009–2018 / 2019–2026 */
    trainFav: number;
    trainN: number;
    trainBaseline: number;
    testFav: number;
    testN: number;
    testBaseline: number;
    medianTestReturnPct: number;
  };
}

export const PRESETS: Preset[] = [
  {
    id: "1m",
    label: "Sóng 1 tháng",
    horizonDays: 21,
    weights: { technical: 0, premium: 0, macro: 0.9, stats: 0.1 },
    buyThreshold: 40,
    evidence: {
      trainFav: 73.4,
      trainN: 94,
      trainBaseline: 51.9,
      testFav: 77.4,
      testN: 106,
      testBaseline: 60.6,
      medianTestReturnPct: 4.0,
    },
  },
  {
    id: "3m",
    label: "Sóng 3 tháng",
    horizonDays: 63,
    weights: { technical: 0.1, premium: 0, macro: 0.9, stats: 0 },
    buyThreshold: 50,
    evidence: {
      trainFav: 82.2,
      trainN: 45,
      trainBaseline: 55.7,
      testFav: 95.7,
      testN: 69,
      testBaseline: 69.7,
      medianTestReturnPct: 7.4,
    },
  },
  {
    id: "6m",
    label: "Tích lũy 6 tháng",
    horizonDays: 126,
    weights: { technical: 0, premium: 0, macro: 0.9, stats: 0.1 },
    buyThreshold: 50,
    evidence: {
      trainFav: 89.4,
      trainN: 47,
      trainBaseline: 57.7,
      testFav: 100.0,
      testN: 66,
      testBaseline: 79.9,
      medianTestReturnPct: 14.3,
    },
  },
];
