import type { BearDcaPoint, BearDcaAnalysis, BearDcaHealth, BearPhase } from "./types";

const BEAR_DD_THRESHOLD = 0.15;
const ACUTE_DD_CHANGE   = 0.03;
const CYCLE_STEP        = 21;

/** Qty theo drawdown từ ATH (pha cấp tính). */
export function depthQty(dd: number): number {
  if (dd >= 0.40) return 1.5;
  if (dd >= 0.25) return 1.0;
  if (dd >= 0.15) return 0.75;
  return 0.5;
}

/** Qty theo percentile giá 2 năm (pha rỉ máu). */
export function boostQty(pct2y: number): number {
  if (pct2y < 0.25) return 1.5;
  if (pct2y < 0.50) return 1.0;
  if (pct2y < 0.75) return 0.75;
  return 0.5;
}

/** Phân loại pha — chỉ dùng quá khứ (dd rolling ATH + ddChange 21 phiên). */
export function classifyPhase(dd: number, ddChange: number): BearPhase {
  if (dd < BEAR_DD_THRESHOLD) return "bull";
  if (ddChange > ACUTE_DD_CHANGE) return "acute";
  if (ddChange < -ACUTE_DD_CHANGE) return "recovery";
  return "grind";
}

/** Hệ số khối lượng cho một pha. Pure — UI dùng để tính lại khi người dùng đè pha. */
export function qtyForPhase(phase: BearPhase, dd: number, pct2y: number | null): number {
  switch (phase) {
    case "bull": return 1.0;
    case "acute": return depthQty(dd);
    case "recovery": return 1.5;
    case "grind": return pct2y !== null ? boostQty(pct2y) : 0.75;
  }
}

// Quy ước dấu THỐNG NHẤT với dòng "Gợi ý" trên card: ddChange dương = đáy SÂU THÊM
// (điểm % của drawdown/tháng — không phải % giá, hai số lệch nhau khi dd sâu).
function noteFor(phase: BearPhase, dd: number, ddChange: number, pct2y: number | null): string {
  const ddP = Math.round(dd * 100);
  const chP = Math.round(Math.abs(ddChange) * 100);
  switch (phase) {
    case "bull":
      return "Thị trường không ở vùng Bear — gom đều tay.";
    case "acute":
      return `Giá đang sụp cấp tính (đáy sâu thêm +${chP} điểm %/tháng). Cách đỉnh ${ddP}% — dùng độ sâu để tính khối lượng.`;
    case "recovery":
      return `Giá đang hồi phục (đáy thu hẹp ${chP} điểm %/tháng). Gom mạnh ×1.5 — đây là cược giá tiếp tục lên.`;
    case "grind":
      return pct2y !== null
        ? `Bear rỉ máu. Giá ở percentile ${Math.round(pct2y * 100)}% của 2 năm gần — dùng vị trí giá để tính khối lượng.`
        : "Bear rỉ máu. Chưa đủ dữ liệu pct2y — dùng mức trung bình.";
  }
}

function rollingAth(prices: number[]): number[] {
  const ath: number[] = [];
  let mx = 0;
  for (const p of prices) { if (p > mx) mx = p; ath.push(mx); }
  return ath;
}

/**
 * Pha + hệ số Bear DCA as-of index i (past-only, walk-forward): dd từ rolling ATH
 * tới i, ddChange so CYCLE_STEP phiên trước. Cho Time Machine hiển thị CÙNG con số
 * với card "Mức mua tháng này" — trước đây Time Machine hiện lớp phanh cũ (×0.25)
 * mâu thuẫn với card (×1.0) cùng ngày.
 */
export function bearDcaAt(
  prices: number[],
  i: number,
  pct2y: number | null
): { phase: BearPhase; mult: number; dd: number } {
  if (i < 0 || i >= prices.length) return { phase: "bull", mult: 1, dd: 0 };
  const prevIdx = Math.max(0, i - CYCLE_STEP);
  let athNow = -Infinity;
  let athPrev = -Infinity;
  for (let j = 0; j <= i; j++) {
    if (prices[j] > athNow) athNow = prices[j];
    if (j <= prevIdx && prices[j] > athPrev) athPrev = prices[j];
  }
  const dd = athNow > 0 ? (athNow - prices[i]) / athNow : 0;
  const ddPrev = athPrev > 0 ? (athPrev - prices[prevIdx]) / athPrev : 0;
  const phase = classifyPhase(dd, dd - ddPrev);
  return { phase, mult: qtyForPhase(phase, dd, pct2y), dd };
}

/**
 * Pha Bear DCA cho MỌI index một lần, O(n) — cùng công thức với bearDcaAt
 * (golden-tested từng index). Cho các lớp cần pha của cả chuỗi (vd dải gom rải
 * của Máy thời gian: cổng acute từng ngày) — gọi bearDcaAt lặp sẽ thành O(n²).
 */
export function bearPhases(prices: number[]): BearPhase[] {
  const ath = rollingAth(prices);
  return prices.map((p, i) => {
    const prevIdx = Math.max(0, i - CYCLE_STEP);
    const dd = ath[i] > 0 ? (ath[i] - p) / ath[i] : 0;
    const ddPrev = ath[prevIdx] > 0 ? (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx] : 0;
    return classifyPhase(dd, dd - ddPrev);
  });
}

export function runBearDca(points: BearDcaPoint[]): BearDcaAnalysis {
  const prices = points.map(p => p.price);
  const ath = rollingAth(prices);
  const last = points.length - 1;

  const ddNow = last >= 0 ? (ath[last] - prices[last]) / ath[last] : 0;
  const prevIdx = Math.max(0, last - CYCLE_STEP);
  const ddPrev = last >= 0 ? (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx] : 0;
  const ddChange = ddNow - ddPrev;
  const pct2y = points[last]?.pricePct2y ?? null;

  const phase = classifyPhase(ddNow, ddChange);
  const mult = qtyForPhase(phase, ddNow, pct2y);

  return {
    generatedAt: new Date().toISOString(),
    dataDate: points[last]?.date ?? "",
    isBear: phase !== "bull",
    ddFromAth: ddNow,
    ddChange,
    phase,
    pricePct2y: pct2y,
    mult,
    recoveryRisk: phase === "recovery",
    note: noteFor(phase, ddNow, ddChange, pct2y),
  };
}

const HEALTH_MIN_CYCLES = 12;  // tổng nhịp tối thiểu trong cửa sổ 2 năm
const HEALTH_MIN_BEAR   = 6;   // nhịp bear tối thiểu — dưới mức này lớp gần như chưa can thiệp
const HEALTH_NOISE_PP   = 0.5; // vùng nhiễu (điểm %): chỉ "degraded" khi RÕ RÀNG âm

/**
 * Sức khỏe lớp trên ~2 năm gần. Ba nguyên tắc (sửa 2026-07-03):
 * 1. Chỉ chấm khi có ≥HEALTH_MIN_BEAR nhịp bear — nhịp bull q=1 y hệt baseline nên
 *    gộp vào chỉ pha loãng điểm về 0 (phiên bản cũ cho "degraded" oan ngay khi bear
 *    vừa bắt đầu, hoặc mặc định degraded trong bull thuần vì impr=0 không > 0).
 * 2. Giá vốn tính TRÊN NHỊP BEAR; kèm metric tài sản cuối TOÀN cửa sổ — chính
 *    docs/bear-dca.md: "giá vốn thuần đánh lừa" (gom ít → giá vốn đẹp nhưng ít vàng).
 * 3. Vùng nhiễu ±HEALTH_NOISE_PP: một nhịp xấu không được lật banner cảnh báo.
 */
export function monitorBearDca(points: BearDcaPoint[]): BearDcaHealth {
  const prices = points.map(p => p.price);
  const ath = rollingAth(prices);
  const dates = points.map(p => p.date);
  const lastDate = dates[dates.length - 1] ?? "";
  const cutoff = lastDate
    ? new Date(new Date(lastDate).getTime() - 730 * 86400000).toISOString().slice(0, 10)
    : "";

  const recent: number[] = [];
  for (let i = 0; i < points.length; i += CYCLE_STEP) {
    if (dates[i] >= cutoff) recent.push(i);
  }

  const generatedAt = new Date().toISOString();
  if (recent.length < HEALTH_MIN_CYCLES) {
    return { generatedAt, recentImprPct: null, recentAssetImprPct: null, recentBearCycles: 0, status: "insufficient" };
  }

  const cycles = recent.map((i) => {
    const ddNow = (ath[i] - prices[i]) / ath[i];
    const prevIdx = Math.max(0, i - CYCLE_STEP);
    const ddPrev = (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx];
    const phase = classifyPhase(ddNow, ddNow - ddPrev);
    return { phase, q: qtyForPhase(phase, ddNow, points[i].pricePct2y), price: prices[i] };
  });
  const bear = cycles.filter((c) => c.phase !== "bull");
  if (bear.length < HEALTH_MIN_BEAR) {
    return { generatedAt, recentImprPct: null, recentAssetImprPct: null, recentBearCycles: bear.length, status: "insufficient" };
  }

  // Giá vốn vs gom đều — chỉ nhịp bear (nơi q ≠ 1).
  let bV = 0, bL = 0, cV = 0, cL = 0;
  for (const c of bear) {
    bV += 1; bL += 1 / c.price;
    cV += c.q; cL += c.q / c.price;
  }
  const imprCost = bL > 0 && cL > 0 ? (bV / bL - cV / cL) / (bV / bL) : 0;

  // Tài sản cuối vs gom đều — toàn cửa sổ, ngân sách 1/nhịp, tiền chưa tiêu để mặt
  // (gom quá ngân sách xem như vay 0% — xấp xỉ như study taxonomy).
  const pEnd = prices[prices.length - 1];
  let units = 0, spent = 0, unitsFlat = 0;
  for (const c of cycles) {
    units += c.q / c.price; spent += c.q;
    unitsFlat += 1 / c.price;
  }
  const assetFlat = unitsFlat * pEnd;
  const assetStrat = units * pEnd + (cycles.length - spent);
  const imprAsset = assetFlat > 0 ? (assetStrat - assetFlat) / assetFlat : 0;

  const cPct = Math.round(imprCost * 1000) / 10;
  const aPct = Math.round(imprAsset * 1000) / 10;
  return {
    generatedAt,
    recentImprPct: cPct,
    recentAssetImprPct: aPct,
    recentBearCycles: bear.length,
    status: cPct < -HEALTH_NOISE_PP || aPct < -HEALTH_NOISE_PP ? "degraded" : "ok",
  };
}
