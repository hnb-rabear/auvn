import type { BearDcaPoint, BearDcaAnalysis, BearDcaHealth, BearDcaMode } from "./types";

const BEAR_DD_THRESHOLD = 0.15;
const ACUTE_DD_CHANGE   = 0.03;
const CYCLE_STEP        = 21;

/** Qty theo drawdown từ ATH (chế độ cấp tính). */
export function depthQty(dd: number): number {
  if (dd >= 0.40) return 1.5;
  if (dd >= 0.25) return 1.0;
  if (dd >= 0.15) return 0.75;
  return 0.5;
}

/** Qty theo percentile giá 2 năm (chế độ bình thường). */
export function boostQty(pct2y: number): number {
  if (pct2y < 0.25) return 1.5;
  if (pct2y < 0.50) return 1.0;
  if (pct2y < 0.75) return 0.75;
  return 0.5;
}

/** Rolling ATH tại mỗi index. */
function rollingAth(prices: number[]): number[] {
  const ath: number[] = [];
  let mx = 0;
  for (const p of prices) { if (p > mx) mx = p; ath.push(mx); }
  return ath;
}

export function runBearDca(points: BearDcaPoint[]): BearDcaAnalysis {
  const prices = points.map(p => p.price);
  const ath = rollingAth(prices);
  const last = points.length - 1;

  const ddNow  = last >= 0 ? (ath[last] - prices[last]) / ath[last] : 0;
  const prevIdx = Math.max(0, last - CYCLE_STEP);
  const ddPrev = (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx];
  const ddChange = ddNow - ddPrev;

  const isBear   = ddNow >= BEAR_DD_THRESHOLD;
  const isAcute  = isBear && ddChange > ACUTE_DD_CHANGE;
  const pct2y    = points[last]?.pricePct2y ?? null;

  let mode: BearDcaMode;
  let mult: number;
  let note: string;

  if (!isBear) {
    mode = "bull";
    mult = 1.0;
    note = "Thị trường không ở vùng Bear — card này không áp dụng.";
  } else if (isAcute) {
    mode = "acute";
    mult = depthQty(ddNow);
    note = `Giá đang sụp cấp tính (−${Math.round(ddChange * 100)}%/tháng). Dùng độ sâu từ đỉnh (${Math.round(ddNow * 100)}%) để tính khối lượng.`;
  } else {
    mode = "normal";
    mult = pct2y !== null ? boostQty(pct2y) : 0.75;
    note = pct2y !== null
      ? `Bear bình thường. Giá ở ${Math.round(pct2y * 100)}% dải 2 năm — dùng vị trí giá để tính khối lượng.`
      : "Chưa đủ dữ liệu pct2y — dùng mức trung bình.";
  }

  // BH bắn trong 21 phiên gần nhất?
  const cycleStart = Math.max(0, last - CYCLE_STEP + 1);
  const bhFiredThisCycle = points.slice(cycleStart).some(
    p => (p.cycleProb ?? -1) >= 60 || (p.swingProb ?? -1) >= 60
  );

  return {
    generatedAt: new Date().toISOString(),
    dataDate: points[last]?.date ?? "",
    isBear, ddFromAth: ddNow, ddChange, isAcute,
    pricePct2y: pct2y, mult, mode, bhFiredThisCycle, note,
  };
}

export function monitorBearDca(points: BearDcaPoint[]): BearDcaHealth {
  const prices  = points.map(p => p.price);
  const ath     = rollingAth(prices);
  const dates   = points.map(p => p.date);
  const lastDate = dates[dates.length - 1] ?? "";
  const cutoff   = lastDate
    ? new Date(new Date(lastDate).getTime() - 730 * 86400000).toISOString().slice(0, 10)
    : "";

  // Monthly indices trong ~2 năm gần nhất
  const recent: number[] = [];
  for (let i = 0; i < points.length; i += CYCLE_STEP) {
    if (dates[i] >= cutoff) recent.push(i);
  }

  if (recent.length < 12) {
    return { generatedAt: new Date().toISOString(), recentImprPct: null, status: "insufficient" };
  }

  // Tính cải thiện giá vốn ADAPTIVE vs BASE
  let bV = 0, bL = 0, cV = 0, cL = 0;
  for (const i of recent) {
    const ddNow  = (ath[i] - prices[i]) / ath[i];
    const prevIdx = Math.max(0, i - CYCLE_STEP);
    const ddPrev  = (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx];
    const ddCh    = ddNow - ddPrev;
    const isBear  = ddNow >= BEAR_DD_THRESHOLD;
    const isAcute = isBear && ddCh > ACUTE_DD_CHANGE;
    const pct2y   = points[i].pricePct2y;

    const q = !isBear ? 1.0
      : isAcute ? depthQty(ddNow)
      : pct2y !== null ? boostQty(pct2y) : 0.75;

    bV += 1; bL += 1 / prices[i];
    cV += q; cL += q / prices[i];
  }

  const impr = bL > 0 && cL > 0 ? (bV / bL - cV / cL) / (bV / bL) : 0;
  const recentImprPct = Math.round(impr * 1000) / 10;
  return {
    generatedAt: new Date().toISOString(),
    recentImprPct,
    status: impr > 0 ? "ok" : "degraded",
  };
}
