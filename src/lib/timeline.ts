/** Toán composite cho điểm timeline — thuần, không React. */

import type { CriterionKey, TimelinePoint, BottomHistoryRow, BearAsOfRow, BearPhase } from "./types";

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
      pt.cycleProbUw = c.probUnweighted ?? null;
      pt.swingProbUw = s.probUnweighted ?? null;
    }
  }
}

/** Forward-fill dải Bear Downside as-of lên timeline (snap nút gần nhất ≤ ngày). */
export function forwardFillBearAsOf(points: TimelinePoint[], rows: BearAsOfRow[]): void {
  if (!rows.length) return;
  let h = 0;
  for (const pt of points) {
    while (h + 1 < rows.length && rows[h + 1].date <= pt.date) h++;
    if (rows[h].date <= pt.date) pt.bearAsOf = rows[h].bands;
  }
}

/**
 * Các ngày "gom rải" của Máy thời gian — PHẢI trùng TỪNG NGÀY với
 * deriveGuidance(...).level === "dca" của card guidance lịch sử (golden-tested,
 * tests/dca-band.test.ts): điểm mua trung tính (không buy, không headwind) VÀ
 * xác suất đáy chu kỳ as-of ≥60% đã kiểm chứng (n≥10), với cổng acute-crash
 * từng ngày (pha "acute" ⇒ rớt về probUnweighted — cùng chính sách live).
 * Nếu điều kiện của histGuidance đổi, hàm này phải đổi theo — đừng để dải
 * trên chart nói khác card bên dưới (bài học Time Machine ×0.25 vs card ×1.0).
 */
export function gomRaiIdxs(
  points: TimelinePoint[],
  comps: number[],
  buyThreshold: number,
  phases: BearPhase[]
): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const c = comps[i];
    if (c >= buyThreshold || c <= -40) continue; // vùng mua hoặc gió ngược — không phải gom rải
    const p = points[i];
    const rec = p.cycleProb ?? null;
    const prob = phases[i] === "acute" ? (p.cycleProbUw ?? rec) : rec;
    if (prob !== null && (p.cycleN ?? 0) >= 10 && prob >= 60) out.push(i);
  }
  return out;
}

/** Gộp danh sách index tăng dần thành các cụm liên tục [đầu, cuối] (bao gồm 2 đầu). */
export function idxRuns(idxs: number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const i of idxs) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

/** Các ngày "bắt đầu vùng đáy" = cạnh lên bin đáy cao nhất:
 *  cycleBin[i]===3 && cycleBin[i-1]!==3 (oversold+vĩ mô vừa bật). Walk-forward. */
export function bottomStartIdxs(points: TimelinePoint[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (points[i].cycleBin === 3 && points[i - 1]?.cycleBin !== 3) out.push(i);
  }
  return out;
}
