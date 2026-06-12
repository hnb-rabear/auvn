/** Toán composite cho điểm timeline — thuần, không React. */

import type { CriterionKey, TimelinePoint } from "./types";

/** Composite từ điểm tiêu chí của một ngày timeline, theo trọng số đang chọn. */
export function pointComposite(
  p: TimelinePoint,
  weights: Record<CriterionKey, number>
): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores)) {
    const w = weights[k as CriterionKey] ?? 0;
    s += (score as number) * w;
    tw += w;
  }
  return tw === 0 ? 0 : Math.round((s / tw) * 50 * 10) / 10;
}

/** Index các điểm có composite >= ngưỡng (dùng cho marker tín hiệu/ngưỡng thử). */
export function thresholdIdxs(
  points: TimelinePoint[],
  weights: Record<CriterionKey, number>,
  threshold: number
): number[] {
  return points.reduce<number[]>((acc, p, i) => {
    if (pointComposite(p, weights) >= threshold) acc.push(i);
    return acc;
  }, []);
}
