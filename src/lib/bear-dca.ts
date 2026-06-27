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

function noteFor(phase: BearPhase, dd: number, ddChange: number, pct2y: number | null): string {
  const ddP = Math.round(dd * 100);
  const chP = Math.round(ddChange * 100);
  switch (phase) {
    case "bull":
      return "Thị trường không ở vùng Bear — gom đều tay.";
    case "acute":
      return `Giá đang sụp cấp tính (−${chP}%/tháng). Cách đỉnh ${ddP}% — dùng độ sâu để tính khối lượng.`;
    case "recovery":
      return `Giá đang hồi phục (+${Math.abs(chP)}%/tháng từ đáy). Gom mạnh ×1.5 — đây là cược giá tiếp tục lên.`;
    case "grind":
      return pct2y !== null
        ? `Bear rỉ máu. Giá ở ${Math.round(pct2y * 100)}% dải 2 năm — dùng vị trí giá để tính khối lượng.`
        : "Bear rỉ máu. Chưa đủ dữ liệu pct2y — dùng mức trung bình.";
  }
}

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

  if (recent.length < 12) {
    return { generatedAt: new Date().toISOString(), recentImprPct: null, status: "insufficient" };
  }

  let bV = 0, bL = 0, cV = 0, cL = 0;
  for (const i of recent) {
    const ddNow = (ath[i] - prices[i]) / ath[i];
    const prevIdx = Math.max(0, i - CYCLE_STEP);
    const ddPrev = (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx];
    const phase = classifyPhase(ddNow, ddNow - ddPrev);
    const q = qtyForPhase(phase, ddNow, points[i].pricePct2y);
    bV += 1; bL += 1 / prices[i];
    cV += q; cL += q / prices[i];
  }

  const impr = bL > 0 && cL > 0 ? (bV / bL - cV / cL) / (bV / bL) : 0;
  return {
    generatedAt: new Date().toISOString(),
    recentImprPct: Math.round(impr * 1000) / 10,
    status: impr > 0 ? "ok" : "degraded",
  };
}
