/** Engine "Vùng tích lũy" — phanh DCA chống mua đỉnh. Chi tiết: docs/accumulation.md. */
import {
  ACCUM_CONFIG,
  type AccumConfig,
  type AccumBrake,
  type AccumPoint,
  type AccumulationAnalysis,
} from "./types";

/** Percentile giá[i] so `win` phiên ngay trước (past-only, 0..1). null nếu < warmup. */
export function pricePct2y(closes: number[], i: number, win = ACCUM_CONFIG.win): number | null {
  if (i < win) return null;
  const cur = closes[i];
  let below = 0;
  for (let j = i - win; j < i; j++) if (closes[j] <= cur) below++;
  return below / win;
}

/** Hệ số phanh ∈ {1, 0.25}. Chỉ phanh (≤1), không bao giờ 0. */
export function accumMult(pricePct: number | null, cfg: AccumConfig = ACCUM_CONFIG): number {
  let m = 1;
  if (pricePct !== null && pricePct > cfg.expHi) m *= cfg.mExp;
  return Math.max(cfg.floor, m);
}

const fmtPct = (x: number) => Math.round(x * 100);

/** Các phanh đang bật + giải thích tiếng Việt. */
export function brakeDescriptors(
  pricePct: number | null,
  cfg: AccumConfig = ACCUM_CONFIG
): AccumBrake[] {
  const out: AccumBrake[] = [];
  if (pricePct !== null && pricePct > cfg.expHi) {
    out.push({
      id: "price-top",
      label: "Giá đỉnh vùng 2 năm",
      explanation: `Giá đang ở percentile ${fmtPct(pricePct)}% của dải 2 năm (> ${fmtPct(
        cfg.expHi
      )}%): vùng đắt — ghìm mua ×${cfg.mExp}.`,
    });
  }
  return out;
}

/** Giá vốn TB realized rẻ hơn DCA phẳng (capital-weighted) trên các index mua. */
export function realizedCostImpr(
  closes: number[],
  buyIdxs: number[],
  cfg: AccumConfig = ACCUM_CONFIG
): number {
  let fV = 0,
    fL = 0,
    tV = 0,
    tL = 0;
  for (const i of buyIdxs) {
    const m = accumMult(pricePct2y(closes, i, cfg.win), cfg);
    fV += 1;
    fL += 1 / closes[i];
    tV += m;
    tL += m / closes[i];
  }
  if (fL === 0 || tL === 0) return 0;
  const flat = fV / fL;
  const tilt = tV / tL;
  return (flat - tilt) / flat;
}

export function runAccumulation(
  points: AccumPoint[],
  cfg: AccumConfig = ACCUM_CONFIG
): AccumulationAnalysis {
  const closes = points.map((p) => p.price);
  const history = points.map((p, i) => {
    const pp = pricePct2y(closes, i, cfg.win);
    return { date: p.date, pricePct2y: pp, mult: accumMult(pp, cfg) };
  });
  const last = points.length - 1;
  const pp = history[last]?.pricePct2y ?? null;
  return {
    generatedAt: new Date().toISOString(),
    dataDate: points[last]?.date ?? "",
    pricePct2y: pp,
    mult: history[last]?.mult ?? 1,
    brakes: brakeDescriptors(pp, cfg),
    provisional: pp === null,
    history,
    note: "Phanh DCA chống mua đỉnh: ghìm khi giá đắt so dải 2 năm. Lan can chống FOMO, không phải máy đẻ vàng.",
  };
}
