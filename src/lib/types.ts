export type CriterionKey = "technical" | "premium" | "macro" | "stats" | "momentum";

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
  /** chuỗi chênh lệch VN-thế giới (%) theo ngày, để vẽ biểu đồ */
  premiumSeries?: { date: string; value: number }[];
  /** percentile 20/50/80 của premium lịch sử */
  premiumPercentiles?: { p20: number; p50: number; p80: number };
  /** ISO thời điểm chụp theo nguồn; null = nguồn lỗi/không có lần chạy này.
   *  world/dxy/yield10y = epoch bar ngày cuối (≈ cập nhật cuối phiên, KHÔNG phải tick live).
   *  vnGold/usdVnd = giờ fetch của ta (nguồn không có giờ server đáng tin).
   *  fed = giờ fetch của ta khi lấy FRED thành công. */
  sourceTimes?: {
    world?: string | null;
    dxy?: string | null;
    yield10y?: string | null;
    vnGold?: string | null;
    usdVnd?: string | null;
    fed?: string | null;
  };
}

/** Sức khỏe preset — tính lại mỗi cron bởi scripts/monitor-presets.ts */
export interface PresetHealth {
  presetId: string;
  /** min-excess (điểm lợi thế tệ nhất 2 giai đoạn) trên timeline MỚI NHẤT, đơn vị pt (0..100) */
  minExcessNowPt: number | null;
  /** hiệu quả 2 năm gần nhất */
  recentFavPct: number | null;
  recentBaselinePct: number | null;
  recentN: number;
  /** khoảng tin cậy 95% (block bootstrap) cho % đúng giai đoạn test */
  testFavCi95: [number, number] | null;
  status: "ok" | "degraded" | "insufficient";
}

export interface PresetHealthFile {
  generatedAt: string;
  items: PresetHealth[];
}

/** Sức khỏe tầng "MUA độ tin cao" 3m — tính lại mỗi cron bởi scripts/monitor-fusion.ts.
 *  degraded khi B (composite∧đáy) KHÔNG còn vượt composite ở cả 2 giai đoạn,
 *  hoặc placebo đồng-n train ≤ 0 (đáy hết thông tin trực giao). */
export interface FusionHealth {
  presetId: "3m";
  bTrainFav: number | null;
  bTestFav: number | null;
  compTrainFav: number | null;
  compTestFav: number | null;
  bTestN: number;
  bTestCi95: [number, number] | null;
  /** placebo đồng-n train: B − composite-top-n (pt) */
  orthoTrainPt: number | null;
  status: "ok" | "degraded" | "insufficient";
}

export interface FusionHealthFile {
  generatedAt: string;
  item: FusionHealth;
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
  /** bin đáy past-only tại ngày này (0..binEdges.length); undefined nếu trước warmup đáy. Optional — timeline.json cũ không có. */
  cycleBin?: number;
  swingBin?: number;
  /** xác suất gần đáy as-of-ngày (walk-forward, forward-fill từ lưới thưa). null = đã đủ warmup nhưng <10 mẫu; undefined = trước nút đầu. */
  cycleProb?: number | null;
  cycleCi?: [number, number] | null;
  cycleN?: number;
  swingProb?: number | null;
  swingCi?: [number, number] | null;
  swingN?: number;
  /** hệ số phanh DCA as-of-ngày (lớp Vùng tích lũy). undefined = timeline.json cũ. */
  accumMult?: number;
  /** percentile giá so dải 2 năm (0..1) tại ngày này. undefined = timeline.json cũ. */
  pricePct2y?: number | null;
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
  momentum: 0,
};

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  technical: "Kỹ thuật giá thế giới (XAU/USD)",
  premium: "Chênh lệch VN — thế giới",
  macro: "Vĩ mô (USD, lãi suất, tỷ giá)",
  stats: "Thống kê lịch sử",
  momentum: "Động lượng XAU 12 tháng",
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
    weights: { technical: 0.1, premium: 0, macro: 0.6, stats: 0.1, momentum: 0.2 },
    buyThreshold: 40,
    evidence: {
      trainFav: 75.7,
      trainN: 37,
      trainBaseline: 51.9,
      testFav: 82.9,
      testN: 70,
      testBaseline: 60.6,
      medianTestReturnPct: 4.6,
    },
  },
  {
    id: "3m",
    label: "Sóng 3 tháng",
    horizonDays: 63,
    weights: { technical: 0.1, premium: 0, macro: 0.9, stats: 0, momentum: 0 },
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
    weights: { technical: 0, premium: 0, macro: 0.9, stats: 0.1, momentum: 0 },
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

export type BottomTier = "cycle" | "swing";

/** Một feature của tầng đáy: điểm -2..+2 + giải thích tiếng Việt. Cấu trúc trùng SubSignal nhưng giữ độc lập — hai miền có thể tách hướng. */
export interface BottomDriver {
  id: string;
  label: string;
  /** -2 (xa đáy) .. +2 (rất gần đáy) */
  score: number;
  explanation: string;
  available: boolean;
}

/** Một đáy đã xác nhận trong lịch sử (để vẽ overlay). */
export interface ConfirmedBottom {
  date: string;
  price: number;
  tier: BottomTier;
}

export interface BottomTierResult {
  /** xác suất gần đáy 0..100 */
  prob: number;
  /** CI 95% block-bootstrap [lo, hi] hoặc null nếu thiếu mẫu */
  ci: [number, number] | null;
  /** chỉ số bin của bottomScore hiện tại (0..binEdges.length) */
  bin: number;
  /** số quan sát lịch sử trong cùng bin */
  n: number;
  drivers: BottomDriver[];
}

/** Bin đáy past-only theo ngày (cho Time Machine). bin: 0..binEdges.length. */
export interface BottomSignalRow {
  date: string;
  cycleBin: number;
  swingBin: number;
}

/** Một mục xác suất đáy as-of-ngày (walk-forward) cho 1 tầng. prob/ci null khi n<10. */
export interface BottomHistoryEntry {
  bin: number;
  prob: number | null;
  ci: [number, number] | null;
  n: number;
}

/** Hàng walk-forward thưa (STEP grid): xác suất đáy 2 tầng tính chỉ bằng dữ liệu đến ngày này. */
export interface BottomHistoryRow {
  date: string;
  cycle: BottomHistoryEntry;
  swing: BottomHistoryEntry;
}

export interface BottomAnalysis {
  generatedAt: string;
  dataDate: string;
  cycle: BottomTierResult;
  swing: BottomTierResult;
  confirmedBottoms: ConfirmedBottom[];
  /** lịch sử bin đáy theo ngày (past-only) để dựng gợi ý hành động lịch sử */
  signalHistory: BottomSignalRow[];
  /** xác suất đáy as-of-ngày (walk-forward, lưới thưa) — Time Machine forward-fill để "quá khứ = hiện tại" */
  bottomHistory: BottomHistoryRow[];
  note: string;
}

/** Cấu hình một tầng đáy. weights: trọng số feature; binEdges: ranh giới bin của bottomScore (-100..+100). */
export interface BottomTierConfig {
  horizonDays: number;
  epsPct: number;
  /** trọng số feature; khóa hợp lệ: dd, spd, rsi, macd, macro, mom */
  weights: Record<string, number>;
  /** ranh giới bin tăng dần trong (-100, 100); k ranh giới -> k+1 bin */
  binEdges: number[];
  /** true = chưa có cấu hình vượt baseline 2 giai đoạn — UI ghi "chưa đủ dữ liệu kiểm chứng" */
  provisional?: boolean;
}

/** Cấu hình 2 tầng đáy: chu kỳ + sóng. */
export interface BottomConfig {
  cycle: BottomTierConfig;
  swing: BottomTierConfig;
}

/**
 * Cấu hình tầng đáy. `bottom-study.ts` chạy lại 2026-06 với LƯỚI trọng số bước 0.25
 * (126 hồ sơ) × 3 bộ ranh giới bin: CẢ HAI tầng có cấu hình vượt base-rate vô điều kiện
 * ở CẢ HAI giai đoạn train (<2019) và test (>=2019) → bỏ `provisional`.
 *   cycle: H=126 eps=3% edges=[-40,0,40] | lift train +19.5pt (n=81) / test +26.5pt (n=57), min-excess +19.5pt
 *   swing: H=30  eps=2% edges=[-40,0,40] | lift train +13.9pt (n=81) / test +12.5pt (n=63), min-excess +12.5pt
 * Cả hai chốt cùng trọng số {rsi:0.5, macro:0.5} — quá bán + vĩ mô đảo chiều là 2 feature mang tín hiệu đáy.
 * Tên feature: dd=drawdown, spd=tốc độ rơi, rsi=quá bán+phân kỳ, macd, macro=vĩ mô đảo chiều, mom=động lượng 12m.
 */
export const BOTTOM_CONFIG: BottomConfig = {
  cycle: {
    horizonDays: 126,
    epsPct: 3,
    weights: { dd: 0, spd: 0, rsi: 0.5, macd: 0, macro: 0.5, mom: 0 },
    binEdges: [-40, 0, 40],
  },
  swing: {
    horizonDays: 30,
    epsPct: 2,
    weights: { dd: 0, spd: 0, rsi: 0.5, macd: 0, macro: 0.5, mom: 0 },
    binEdges: [-40, 0, 40],
  },
};

/** Một điểm tối thiểu để chấm Vùng tích lũy (lấy từ timeline.points). */
export interface AccumPoint {
  date: string;
  price: number;
}

/** Một phanh đang bật + giải thích tiếng Việt. */
export interface AccumBrake {
  id: "price-top";
  label: string;
  explanation: string;
}

/**
 * Cấu hình phanh DCA "Vùng tích lũy". Tuyển bằng scripts/accumulation-study.ts
 * (cổng 2 giai đoạn train<2019/test>=2019, xếp min-excess + CI block-bootstrap +
 * placebo). MỘT cổng duy nhất: ghìm khi giá đắt so dải 2 năm. Cổng composite cũ đã
 * bị loại bằng ablation (đóng góp biên ≈0 train, CI chồng — scripts/accumulation-ablation.ts).
 * Chỉ phanh, không boost. Cũng đã loại: Bottom Hunter (train âm), real-yield (overfit
 * bull). Chi tiết: docs/accumulation.md.
 */
export interface AccumConfig {
  /** cửa sổ percentile giá (phiên), past-only */
  win: number;
  /** phanh khi percentile giá > expHi (0..1) */
  expHi: number;
  /** hệ số khi giá đắt */
  mExp: number;
  /** sàn hệ số */
  floor: number;
  evidence: {
    trainImprPct: number;
    trainCi: [number, number];
    testImprPct: number;
    testCi: [number, number];
  };
}

export const ACCUM_CONFIG: AccumConfig = {
  win: 504,
  expHi: 0.75,
  mExp: 0.25,
  floor: 0.2,
  evidence: {
    trainImprPct: 2.82,
    trainCi: [0.92, 5.02],
    testImprPct: 7.15,
    testCi: [1.71, 12.37],
  },
};

export interface AccumulationAnalysis {
  generatedAt: string;
  dataDate: string;
  /** percentile giá so 2 năm hôm nay (0..1); null nếu < warmup */
  pricePct2y: number | null;
  /** hệ số phanh hôm nay ∈ {1, 0.25} */
  mult: number;
  /** các phanh đang bật */
  brakes: AccumBrake[];
  /** true khi chưa đủ 2 năm lịch sử (pricePct2y null) */
  provisional: boolean;
  /** hệ số + percentile theo NGÀY (mọi phiên) cho Time Machine */
  history: { date: string; pricePct2y: number | null; mult: number }[];
  note: string;
}

/** Sức khỏe lớp Vùng tích lũy — tính lại mỗi cron bởi scripts/monitor-accumulation.ts. */
export interface AccumulationHealth {
  generatedAt: string;
  /** cải thiện giá vốn vs phẳng trên ~2 năm gần nhất (pt %) */
  recentImprPct: number | null;
  recentBrakedMonths: number;
  status: "ok" | "degraded" | "insufficient";
}

export interface BearDcaPoint {
  date: string;
  price: number;
  pricePct2y: number | null; // từ accumulation engine (win=504)
  cycleProb: number | null;  // từ timeline
  swingProb: number | null;
}

export type BearDcaMode = "bull" | "normal" | "acute";

export interface BearDcaAnalysis {
  generatedAt: string;
  dataDate: string;
  isBear: boolean;           // ddFromAth >= 0.15
  ddFromAth: number;         // 0..1, rolling ATH
  ddChange: number;          // dd hôm nay - dd 21 phiên trước (pp/tháng)
  isAcute: boolean;          // ddChange > 0.03
  pricePct2y: number | null;
  mult: number;              // ∈ {0.5, 0.75, 1.0, 1.5}
  mode: BearDcaMode;
  bhFiredThisCycle: boolean; // BH bắn trong 21 phiên gần nhất
  note: string;              // giải thích tiếng Việt
}

export interface BearDcaHealth {
  generatedAt: string;
  recentImprPct: number | null; // % cải thiện giá vốn vs BASE trên ~2 năm gần nhất
  status: "ok" | "degraded" | "insufficient";
}
