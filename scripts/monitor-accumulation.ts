/** Giám sát lớp Vùng tích lũy ~2 năm gần nhất. Gọi trong run.ts; ghi accumulation-health.json. */
import { realizedCostImpr, pricePct2y, accumMult } from "../src/lib/accumulation";
import { ACCUM_CONFIG, type AccumPoint, type AccumulationHealth } from "../src/lib/types";

const STEP = 21; // nhịp DCA tháng
const MIN_RECENT = 12; // tối thiểu tháng gần đây để đánh giá

export function monitorAccumulation(points: AccumPoint[]): AccumulationHealth {
  const closes = points.map((p) => p.price);
  const composites = points.map((p) => p.composite);
  const dates = points.map((p) => p.date);
  const lastDate = dates.length ? dates[dates.length - 1] : "";
  const cutoff = lastDate
    ? new Date(new Date(lastDate).getTime() - 730 * 86400000).toISOString().slice(0, 10)
    : "";

  const recent: number[] = [];
  for (let i = 0; i < points.length; i += STEP) if (dates[i] >= cutoff) recent.push(i);
  const braked = recent.filter(
    (i) => accumMult(pricePct2y(closes, i, ACCUM_CONFIG.win), composites[i]) < 1
  ).length;

  let status: "ok" | "degraded" | "insufficient" = "insufficient";
  let recentImprPct: number | null = null;
  if (recent.length >= MIN_RECENT && braked > 0) {
    const impr = realizedCostImpr(closes, composites, recent);
    recentImprPct = Math.round(impr * 1000) / 10;
    status = impr > 0 ? "ok" : "degraded";
  }
  return {
    generatedAt: new Date().toISOString(),
    recentImprPct,
    recentBrakedMonths: braked,
    status,
  };
}
