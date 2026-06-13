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

/** Composite của mọi điểm — tính một lần rồi tái dùng cho các lớp marker/ngưỡng. */
export function composites(
  points: TimelinePoint[],
  weights: Record<CriterionKey, number>
): number[] {
  return points.map((p) => pointComposite(p, weights));
}

/** Index các giá trị >= ngưỡng (marker tín hiệu mua / ngưỡng thử). */
export function idxsAtOrAbove(values: number[], threshold: number): number[] {
  return values.reduce<number[]>((acc, v, i) => {
    if (v >= threshold) acc.push(i);
    return acc;
  }, []);
}

/** Index các giá trị <= ngưỡng (vùng bán tham khảo). */
export function idxsAtOrBelow(values: number[], threshold: number): number[] {
  return values.reduce<number[]>((acc, v, i) => {
    if (v <= threshold) acc.push(i);
    return acc;
  }, []);
}

/**
 * Index điểm đầu tiên có ngày >= target (chuỗi ISO yyyy-mm-dd, đã sắp tăng dần).
 * Mọi ngày đều trước target → index cuối. Mảng rỗng → 0.
 */
export function indexOnOrAfter(dates: string[], target: string): number {
  const i = dates.findIndex((d) => d >= target);
  return i === -1 ? Math.max(0, dates.length - 1) : i;
}

/**
 * Index điểm cuối cùng có ngày <= target. Mọi ngày đều sau target → 0.
 */
export function indexOnOrBefore(dates: string[], target: string): number {
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= target) return i;
  }
  return 0;
}
