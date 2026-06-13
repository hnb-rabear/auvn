/** Giám sát calibration tầng đáy 2 năm gần nhất. Gọi trong run.ts; ghi bottom-health.json. */
import { labelNearBottom, bottomFeatures, bottomScore, binOf } from "../src/lib/bottom";
import { BOTTOM_CONFIG } from "../src/lib/types";
import type { DailyBar } from "./fetch";

export interface BottomHealth {
  generatedAt: string;
  items: { tier: "cycle" | "swing"; recentTopFav: number | null; recentBaseline: number | null; n: number; status: "ok" | "degraded" | "insufficient" }[];
}

const WARMUP = 756;
const STEP = 3;

export function monitorBottom(
  xau: DailyBar[],
  dxy: DailyBar[] | null,
  fed: { date: string; value: number }[] | null,
  yieldBars: DailyBar[] | null
): BottomHealth {
  const closes = xau.map((b) => b.close);
  const dates = xau.map((b) => b.date);
  const cutoff = dates.length ? new Date(new Date(dates[dates.length - 1]).getTime() - 730 * 86400000).toISOString().slice(0, 10) : "";
  const items: BottomHealth["items"] = [];

  for (const tier of ["cycle", "swing"] as const) {
    const cfg = BOTTOM_CONFIG[tier];
    const rows: { date: string; bin: number; y: boolean }[] = [];
    for (let i = WARMUP; i < closes.length; i += STEP) {
      const y = labelNearBottom(closes, i, cfg.horizonDays, cfg.epsPct);
      if (y === null) continue;
      const di = dates[i];
      const drv = bottomFeatures({
        closes: closes.slice(0, i + 1),
        dxyCloses: dxy ? dxy.filter((b) => b.date <= di).map((b) => b.close) : [],
        yieldCloses: yieldBars ? yieldBars.filter((b) => b.date <= di).map((b) => b.close) : null,
        fedRates: fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [],
      });
      rows.push({ date: di, bin: binOf(bottomScore(drv, cfg.weights), cfg.binEdges), y });
    }
    const recent = rows.filter((r) => r.date >= cutoff);
    const top = recent.filter((r) => r.bin === cfg.binEdges.length);
    const recentBaseline = recent.length ? recent.filter((r) => r.y).length / recent.length : null;
    const recentTopFav = top.length ? top.filter((r) => r.y).length / top.length : null;
    let status: "ok" | "degraded" | "insufficient" = "insufficient";
    if (top.length >= 10 && recentTopFav !== null && recentBaseline !== null) {
      status = recentTopFav >= recentBaseline ? "ok" : "degraded";
    }
    items.push({
      tier,
      recentTopFav: recentTopFav === null ? null : Math.round(recentTopFav * 1000) / 10,
      recentBaseline: recentBaseline === null ? null : Math.round(recentBaseline * 1000) / 10,
      n: top.length,
      status,
    });
  }
  return { generatedAt: new Date().toISOString(), items };
}
