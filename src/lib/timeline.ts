/** Toán composite cho điểm timeline — thuần, không React. */

import type { CriterionKey, TimelinePoint, BottomHistoryRow } from "./types";

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

/**
 * Gán xác suất đáy as-of-ngày cho từng điểm timeline: lấy entry lưới thưa gần nhất
 * ≤ ngày (forward-fill). Trước nút đầu ⇒ để undefined. Mutate tại chỗ.
 * points & history đều phải sắp theo date tăng dần.
 */
export function forwardFillBottomHistory(points: TimelinePoint[], history: BottomHistoryRow[]): void {
  if (!history.length) return;
  let h = 0;
  for (const pt of points) {
    while (h + 1 < history.length && history[h + 1].date <= pt.date) h++;
    if (history[h].date <= pt.date) {
      const { cycle: c, swing: s } = history[h];
      pt.cycleProb = c.prob; pt.cycleCi = c.ci; pt.cycleN = c.n;
      pt.swingProb = s.prob; pt.swingCi = s.ci; pt.swingN = s.n;
    }
  }
}

/** Percentile (0..100) của cycleProb mỗi ngày trong cửa sổ trượt windowSessions phiên
 *  (gồm ngày đó, chỉ quá khứ). NaN nếu cycleProb[i]==null hoặc cửa sổ < minSamples mẫu. */
export function bottomPercentileRank(
  points: TimelinePoint[],
  windowSessions: number,
  minSamples = 60
): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i].cycleProb;
    if (cur == null) {
      out.push(NaN);
      continue;
    }
    const lo = Math.max(0, i - windowSessions + 1);
    let le = 0;
    let n = 0;
    for (let j = lo; j <= i; j++) {
      const v = points[j].cycleProb;
      if (v == null) continue;
      n++;
      if (v <= cur) le++;
    }
    out.push(n < minSamples ? NaN : Math.round((le / n) * 1000) / 10);
  }
  return out;
}

/** Gom các dải index có mask[i]===true liên tiếp. */
export function maskRuns(mask: boolean[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let s = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && s === -1) s = i;
    else if (!mask[i] && s !== -1) {
      runs.push({ start: s, end: i - 1 });
      s = -1;
    }
  }
  if (s !== -1) runs.push({ start: s, end: mask.length - 1 });
  return runs;
}
