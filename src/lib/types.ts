export type CriterionKey = "technical" | "premium" | "macro" | "stats" | "momentum";

/** Sub-signal vĩ mô có thể mang trọng số riêng trong preset (v4, docs/presets.md "Tách sub-signal vĩ mô"). */
export type MacroSubKey = "dxy" | "fed" | "yield10y";

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
  /** ngày giá nhẫn khi CŨ HƠN giá SJC (nguồn dự phòng thiếu nhẫn); null = cùng phiên */
  ringDate?: string | null;
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
 *  degraded khi B (composite∧đáy) THUA composite ở bất kỳ giai đoạn nào (HÒA không tính —
 *  preset 3m v4 đã 100% test nên B không thể vượt tại trần; fix 2026-07-05), hoặc
 *  placebo đồng-n train ≤ 0 (đáy hết thông tin trực giao). */
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
  /** điểm -2..+2 của từng tiêu chí thế giới tham gia giả lập; từ v4 kèm cả sub-signal
   *  vĩ mô (dxy/fed/yield10y) làm key phụ — các đường composite cũ tự bỏ qua (trọng số 0),
   *  chỉ preset có macroSub đọc chúng. timeline.json cũ không có key phụ. */
  scores: Partial<Record<CriterionKey | MacroSubKey, number>>;
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
  /** bản KHÔNG trọng số của cycleProb/swingProb — Time Machine dùng khi phase as-of "acute". undefined = timeline.json cũ. */
  cycleProbUw?: number | null;
  swingProbUw?: number | null;
  /** hệ số phanh DCA as-of-ngày (lớp Vùng tích lũy). undefined = timeline.json cũ. */
  accumMult?: number;
  /** percentile giá so dải 2 năm (0..1) tại ngày này. undefined = timeline.json cũ. */
  pricePct2y?: number | null;
  /** Dải Bear Downside as-of-ngày (walk-forward, forward-fill lưới thưa). undefined = timeline.json cũ; band từng H = null khi chưa đủ mẫu. */
  bearAsOf?: Record<"21" | "63" | "126", BearAsOfBand | null>;
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

/** Bản đồ điểm cho presetComposite. Key tiêu chí + key sub-signal vĩ mô (v4). */
export type ScoreMap = Partial<Record<CriterionKey | MacroSubKey, number>>;

/**
 * Composite của MỘT preset trên bản đồ điểm (TimelinePoint.scores hoặc criteria live đã
 * map qua scoreMapFromCriteria). Preset có macroSub → sub-signal vĩ mô mang trọng số riêng.
 * Sub THIẾU trong scores (timeline/analysis cũ chưa có key phụ, hoặc nguồn dữ liệu hỏng)
 * → trọng số phần thiếu DỒN VỀ điểm macro tổng — không bao giờ âm thầm vứt tín hiệu vĩ mô
 * (bài học FRED 504: mất macro = mất 50–90% trọng số preset = 0 tín hiệu mua giả).
 * Đây là hàm DUY NHẤT được chấm preset (chart ≡ card ≡ monitor ≡ evidence test).
 */
export function presetComposite(
  scores: ScoreMap,
  preset: Pick<Preset, "weights" | "macroSub">
): number {
  const w: ScoreMap = { ...preset.weights };
  if (preset.macroSub) {
    let missing = 0;
    for (const [k, wk] of Object.entries(preset.macroSub) as [MacroSubKey, number][]) {
      if (scores[k] !== undefined) w[k] = (w[k] ?? 0) + wk;
      else missing += wk;
    }
    if (missing > 0) w.macro = (w.macro ?? 0) + missing;
  }
  let sum = 0;
  let totalW = 0;
  for (const [k, wk] of Object.entries(w) as [keyof ScoreMap, number][]) {
    const s = scores[k];
    if (s === undefined || !wk) continue;
    sum += s * wk;
    totalW += wk;
  }
  if (totalW === 0) return 0;
  return Math.round((sum / totalW) * 50 * 10) / 10;
}

/**
 * Bản đồ điểm từ criteria live (analysis.json): điểm các tiêu chí khả dụng + điểm
 * sub-signal vĩ mô khả dụng (dxy/fed/yield10y — usdVnd/vix không tham gia preset).
 */
export function scoreMapFromCriteria(
  criteria: (Pick<CriterionResult, "key" | "score" | "available"> & {
    signals?: Pick<SubSignal, "id" | "score" | "available">[];
  })[]
): ScoreMap {
  const map: ScoreMap = {};
  for (const c of criteria) {
    if (!c.available) continue;
    map[c.key] = c.score;
    if (c.key === "macro" && c.signals) {
      for (const s of c.signals) {
        if (s.available && (s.id === "dxy" || s.id === "fed" || s.id === "yield10y"))
          map[s.id] = s.score;
      }
    }
  }
  return map;
}

export function zoneOf(composite: number, buyThreshold = 40): Zone {
  if (composite >= buyThreshold + 30) return "strong-buy";
  if (composite >= buyThreshold) return "buy";
  if (composite <= -70) return "strong-sell";
  if (composite <= -40) return "sell";
  return "neutral";
}

/** Bộ cấu hình theo kỳ hạn. v3 tuyển bằng scripts/presets-study.ts; v4 (tách sub-signal
 *  vĩ mô, 2026-07-05) tuyển bằng scripts/macro-decomp-study.ts. Chi tiết: docs/presets.md */
export interface Preset {
  id: string;
  label: string;
  horizonDays: 21 | 63 | 126;
  /** premium = 0: tiêu chí chênh lệch VN chưa có lịch sử dài để kiểm chứng nên không tham gia preset */
  weights: Record<CriterionKey, number>;
  /** v4: trọng số RIÊNG cho từng sub-signal vĩ mô (thay tiêu chí macro trung bình cộng —
   *  weights.macro để 0). 1m (v4, FED=0): bằng chứng cho thấy án phạt "Fed đang tăng" đè tín
   *  hiệu DXY/lợi suất đúng các năm 2017/2023. 3m/6m (v4.1 phủ-max, 2026-07-05): Fed nhỏ >0
   *  thay vì ép 0 — phủ tín hiệu rộng hơn (thêm nhiều ngày mua độc lập qua 15 năm, không pha
   *  loãng accuracy) đổi lấy train-margin mỏng hơn đôi chút. Sub thiếu trong dữ liệu →
   *  presetComposite dồn trọng số về điểm macro tổng. */
  macroSub?: Partial<Record<MacroSubKey, number>>;
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

/**
 * PRESETS v4/v4.1 (2026-07-05, scripts/macro-decomp-study.ts — bảng "Tách sub-signal vĩ mô"
 * trong docs/presets.md). 1m = v4: luật chọn trong nhóm ≤1pt của best min-excess, ưu tiên cấu
 * hình bắn được 2023 (mục tiêu tuyển chọn — năm câm có sóng thật); 1 tháng không cấu hình nào
 * bắn 2023 → lấy phủ-max theo n train; rơi vào họ FED=0, YLD-nặng. 3m/6m = v4.1: reopen sau khi
 * v4 (FED=0 ép cứng) làm rớt hẳn "Gom" trên toàn preset — chọn lại candidate phủ-max cùng
 * min-excess (Fed nhỏ >0) đã có sẵn trong lưới grid-search nhưng bị bỏ qua lúc ship v4;
 * so v4: test n 90→104 (3m), 130→311 (6m), thêm episode 2017/2023 độc lập, accuracy KHÔNG
 * pha loãng (test 99%/100%). Số evidence = đầu ra scripts/verify-preset-evidence.ts trên
 * timeline 2026-09-04 (tính lại sau khi bỏ look-ahead mùa vụ #10 — lệch ≤1pt mọi ô, cả 3
 * preset vẫn vượt cổng: biên train +30/+33/+21pt, test +29/+31/+22pt);
 * monitor-presets tính lại mỗi cron.
 */
export const PRESETS: Preset[] = [
  {
    id: "1m",
    label: "Sóng 1 tháng",
    horizonDays: 21,
    weights: { technical: 0.2, premium: 0, macro: 0, stats: 0.1, momentum: 0.3 },
    macroSub: { dxy: 0.1, yield10y: 0.3 },
    buyThreshold: 50,
    evidence: {
      trainFav: 81.3,
      trainN: 107,
      trainBaseline: 51.2,
      testFav: 89.1,
      testN: 64,
      testBaseline: 59.7,
      medianTestReturnPct: 4.1,
    },
  },
  {
    id: "3m",
    label: "Sóng 3 tháng",
    horizonDays: 63,
    weights: { technical: 0.1, premium: 0, macro: 0, stats: 0.2, momentum: 0.2 },
    macroSub: { dxy: 0.2, fed: 0.1, yield10y: 0.2 },
    buyThreshold: 40,
    evidence: {
      trainFav: 88.1,
      trainN: 135,
      trainBaseline: 54.7,
      testFav: 99,
      testN: 104,
      testBaseline: 67.8,
      medianTestReturnPct: 7.1,
    },
  },
  {
    id: "6m",
    label: "Tích lũy 6 tháng",
    horizonDays: 126,
    weights: { technical: 0.1, premium: 0, macro: 0, stats: 0.1, momentum: 0 },
    macroSub: { dxy: 0.2, fed: 0.2, yield10y: 0.4 },
    buyThreshold: 30,
    evidence: {
      trainFav: 76.8,
      trainN: 298,
      trainBaseline: 56,
      testFav: 100,
      testN: 309,
      testBaseline: 77.6,
      medianTestReturnPct: 12.6,
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
  /**
   * Xác suất gần đáy 0..100 — base-rate cùng bin CÓ TRỌNG SỐ RECENCY
   * 0.5^(tuổi/recencyHalflife) (từ 2026-07: sửa undershoot theo chế độ thị trường,
   * xem docs/bottom.md "Recency-504"). Failure mode đã đo: lạc quan giả khi giá
   * đang sụp cấp tính — UI phải rớt về probUnweighted khi Bear DCA phase=="acute".
   */
  prob: number;
  /** CI 95% block-bootstrap CÙNG scheme trọng số với prob (bài học Bear Downside), null nếu thiếu mẫu */
  ci: [number, number] | null;
  /** base-rate KHÔNG trọng số (số cũ) — hiển thị khi đang sụp cấp tính. undefined = bottom.json cũ. */
  probUnweighted?: number;
  /** cỡ mẫu hiệu dụng (Σw)²/Σw² dưới trọng số recency. undefined = bottom.json cũ. */
  ess?: number;
  /** chỉ số bin của bottomScore hiện tại (0..binEdges.length) */
  bin: number;
  /** số quan sát lịch sử trong cùng bin */
  n: number;
  drivers: BottomDriver[];
}

/** Một bucket reliability đo được (walk-forward): máy dự pred% ⇒ thực near-bottom real%. */
export interface BottomCalibrationBucket {
  /** biên bucket theo prob dự (0..100) */
  lo: number;
  hi: number;
  /** trung bình prob máy dự trong bucket */
  pred: number;
  /** tần suất near-bottom thực hiện */
  real: number;
  n: number;
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
  /** recency-weighted (cùng semantics prob live) */
  prob: number | null;
  ci: [number, number] | null;
  /** không trọng số — Time Machine dùng khi phase as-of == "acute". undefined = data cũ. */
  probUnweighted?: number | null;
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
  /**
   * Reliability ĐO ĐƯỢC walk-forward (A2, như coverageStats của Bear Downside): với các
   * ngày lịch sử máy dự prob trong [lo,hi), tần suất near-bottom thực = real%. UI dùng để
   * người đọc kiểm toán được con số %. undefined = bottom.json cũ.
   */
  calibration?: { cycle: BottomCalibrationBucket[]; swing: BottomCalibrationBucket[] };
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
  /**
   * Half-life (phiên) của trọng số recency 0.5^(tuổi/hl) khi gộp base-rate bin.
   * Chốt 504 (≈2 năm) bằng scripts/bottom-calibration-study.ts + bottom-recency-deep-study.ts:
   * duy nhất hl qua cổng no-harm Brier CẢ HAI tầng (252 hại swing), hướng robust ở cycle
   * (mọi hl 126–1008 thắng unweighted ở test), trùng half-life đã validate của Bear Downside.
   * TRUNG THỰC: gain Brier KHÔNG significant (CI vắt 0) — đây là hiệu chỉnh BIAS theo chế độ,
   * không phải cải thiện dự báo; failure mode đo được: overshoot khi đang sụp cấp tính
   * (2020 −19pt, swing 2026 −37pt) ⇒ UI rớt về unweighted khi Bear DCA phase=="acute".
   */
  recencyHalflife: number;
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
/** Luật "vùng giá đẹp" trong tháng cho DCA Co-pilot. Tuyển bằng scripts/dca-timing-study.ts. */
export interface ZoneRule {
  kind: "relpos" | "signal" | "monthdd";
  /** số phiên trailing để xét vị trí tương đối */
  window?: number;
  /** ngưỡng percentile 0..100 (relpos / signal): bật khi giá ≤ pct */
  pct?: number;
  /** % dưới đỉnh-trong-tháng (monthdd): bật khi giá ≤ đỉnh×(1−x/100) */
  x?: number;
}

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
  recencyHalflife: 504,
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
}

export type BearPhase = "bull" | "acute" | "recovery" | "grind";

export interface BearDcaAnalysis {
  generatedAt: string;
  dataDate: string;
  isBear: boolean;          // phase !== "bull" (dd >= 0.15)
  ddFromAth: number;        // 0..1, rolling ATH
  ddChange: number;         // dd hôm nay - dd 21 phiên trước (pp/tháng)
  phase: BearPhase;         // pha gợi ý tự động
  pricePct2y: number | null;
  mult: number;             // hệ số cho pha tự động ∈ {0.5, 0.75, 1.0, 1.5}
  recoveryRisk: boolean;    // true khi phase === "recovery"
  note: string;             // giải thích tiếng Việt
}

export interface BearDcaHealth {
  generatedAt: string;
  /** % cải thiện giá vốn vs gom đều — CHỈ trên các nhịp bear ~2 năm gần (nhịp bull q=1 pha loãng). null khi chưa đủ nhịp bear. */
  recentImprPct: number | null;
  /** % cải thiện tài sản cuối vs gom đều — toàn cửa sổ, ngân sách cố định (giá vốn thuần đánh lừa, xem docs/bear-dca.md). */
  recentAssetImprPct: number | null;
  /** số nhịp bear (phase ≠ bull) trong cửa sổ — cần ≥6 mới chấm điểm */
  recentBearCycles: number;
  /** degraded chỉ khi một trong hai metric < −0.5 điểm % (vùng nhiễu) */
  status: "ok" | "degraded" | "insufficient";
}

export interface BearHorizonStat {
  horizonDays: number;
  median: number;        // % mức rơi thêm
  p10: number;           // % kịch bản xấu
  p90: number;           // %
  pBottomBehind: number; // % (furtherDrawdown ≥ 0)
  /** CI 95% cho pBottomBehind — CÙNG hệ trọng số với điểm ước lượng (weighted khi recency bật) */
  pCi: [number, number] | null;
  /** CI 95% cho median — cùng hệ trọng số với điểm ước lượng */
  medianCi: [number, number] | null;
  endMedian: number;                 // % trung vị lợi suất TẠI MỐC H (giá[t+H]/giá[t]−1) — mặt kết cục
  endP25: number;                    // % p25 lợi suất tại mốc — đầu THẤP dải kết cục điển hình
  endP75: number;                    // % p75 lợi suất tại mốc — đầu CAO dải kết cục điển hình
  pUp: number;                       // % lần giá kết CAO hơn hôm nay tại mốc H
  /** CI 95% cho pUp — cùng hệ trọng số với điểm ước lượng */
  pUpCi: [number, number] | null;
  n: number;
}
export interface BearBucketStat {
  bucketIdx: number;          // 0..3
  ddLowPct: number;           // 0,10,20,30
  ddHighPct: number | null;   // 10,20,30,null
  horizons: BearHorizonStat[];
}
export interface BearDownsideAnalysis {
  generatedAt: string;
  dataDate: string;
  currentPrice: number;       // giá XAU/USD close mà engine dùng làm mốc quy % → giá kịch bản
  currentDdPct: number;       // %
  currentBucketIdx: number;   // 0..3
  conditioningWorks: boolean;
  shownSource: "bucket" | "unconditional";
  shown: BearHorizonStat[];
  buckets: BearBucketStat[];
  unconditional: BearHorizonStat[];
  note: string;
}

/** Một dải Bear Downside as-of-ngày (walk-forward). CI bỏ vì card không hiển thị. */
export interface BearAsOfBand {
  median: number;    // đáy điển hình (worst-dip) %
  p10: number;       // đuôi 1/10 rủi ro %
  endMedian: number; // kết cục điển hình % tại mốc
  endP25: number;    // đầu THẤP dải kết cục (p25) %
  endP75: number;    // đầu CAO dải kết cục (p75) %
  pUp: number;       // % lần giá cao hơn hôm nay
  n: number;
}

/** Dải as-of của một ngày lưới thưa, mọi horizon. band=null khi chưa đủ mẫu (enoughSamples: n≥30 VÀ ≥10 cửa sổ độc lập). */
export interface BearAsOfRow {
  date: string;
  bands: Record<"21" | "63" | "126", BearAsOfBand | null>;
}

export interface BearDownsideConfig {
  conditioningWorks: boolean;
  /**
   * Half-life (phiên) cho trọng số recency của phân phối Triển vọng. Mẫu cũ
   * giảm trọng số theo 0.5^(tuổi/halflife) → phân phối bám CHẾ ĐỘ gần đây, sửa
   * thiên lệch trôi-chế-độ (baseline vô-điều-kiện undershoot ~+7% ở 126p trong
   * bull, CÓ ý nghĩa thống kê — xem scripts/bear-downside-calibration-study.ts).
   * 0 = tắt (đều). Mặc định 504 (~2 năm): giảm undershoot & MAE ở cả train/test,
   * nhưng bảo thủ hơn 252 — vì 252/504 KHÔNG phân biệt được thống kê (CI bias
   * chồng nhau) mà card là decision-support, chọn cái tiết chế đọc số cực đoan ở
   * đỉnh (đỡ footgun mua đỉnh). LƯU Ý: cải thiện MAE KHÔNG significant (variance
   * chi phối) — đây là hiệu chỉnh BIAS/chế-độ, KHÔNG phải dự đoán; đảo chiều mạnh
   * có thể làm overshoot tạm thời (mặt đáy hiển thị cạnh bên là đối trọng rủi ro).
   */
  recencyHalflife?: number;
}
export const BEAR_DOWNSIDE_CONFIG: BearDownsideConfig = { conditioningWorks: false, recencyHalflife: 504 };
