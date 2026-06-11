/**
 * Khảo sát tối ưu trọng số + ngưỡng mua trên timeline thật.
 * Train 2009–2018, test 2019–2026 (walk-forward) để tránh overfit.
 * Đọc public/data/timeline.json — chạy `npm run collect` trước.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline, TimelinePoint } from "../src/lib/types";

const HORIZON = (process.env.HORIZON ?? "63") as "21" | "63" | "126";
const SPLIT_DATE = "2019-01-01";
const MIN_SIGNALS = 30;

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const pts = tl.points.filter((p) => p.returns[HORIZON] !== null);
const train = pts.filter((p) => p.date < SPLIT_DATE);
const test = pts.filter((p) => p.date >= SPLIT_DATE);

function composite(p: TimelinePoint, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores)) {
    const wk = w[k] ?? 0;
    s += (score as number) * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

function evalBuy(
  data: TimelinePoint[],
  w: Record<string, number>,
  thr: number
): { n: number; fav: number; med: number } {
  const rets = data
    .filter((p) => composite(p, w) >= thr)
    .map((p) => p.returns[HORIZON] as number);
  if (rets.length === 0) return { n: 0, fav: 0, med: 0 };
  const fav = rets.filter((r) => r > 0).length / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  return { n: rets.length, fav, med: sorted[Math.floor(sorted.length / 2)] };
}

function baseline(data: TimelinePoint[]): number {
  const rets = data.map((p) => p.returns[HORIZON] as number);
  return rets.filter((r) => r > 0).length / rets.length;
}

function main() {
  console.log(`train n=${train.length} (${train[0]?.date}..), test n=${test.length} (${test[0]?.date}..)`);
  console.log(
    `BASELINE mua ngày bất kỳ, lãi sau 3 tháng: train=${(baseline(train) * 100).toFixed(1)}%  test=${(baseline(test) * 100).toFixed(1)}%`
  );

  const DEFAULT = { technical: 0.35, stats: 0.2, macro: 0.2 };
  for (const thr of [40]) {
    const tr = evalBuy(train, DEFAULT, thr);
    const te = evalBuy(test, DEFAULT, thr);
    console.log(
      `\nMẶC ĐỊNH w=${JSON.stringify(DEFAULT)} thr=${thr}: train fav=${(tr.fav * 100).toFixed(1)}% n=${tr.n} | test fav=${(te.fav * 100).toFixed(1)}% n=${te.n} med=${te.med.toFixed(1)}%`
    );
  }

  // grid search trên train
  let best: { w: Record<string, number>; thr: number; fav: number; n: number } | null = null;
  const results: typeof best[] = [];
  for (let wt = 0; wt <= 10; wt++) {
    for (let ws = 0; ws <= 10 - wt; ws++) {
      const wm = 10 - wt - ws;
      const w = { technical: wt / 10, stats: ws / 10, macro: wm / 10 };
      for (const thr of [20, 30, 40, 50, 60]) {
        const { n, fav } = evalBuy(train, w, thr);
        if (n < MIN_SIGNALS) continue;
        // điểm có shrinkage để không thưởng mẫu nhỏ
        const adj = (fav * n + 0.55 * 20) / (n + 20);
        const cand = { w, thr, fav: adj, n };
        results.push(cand);
        if (!best || adj > best.fav) best = cand;
      }
    }
  }

  if (!best) {
    console.log("Không tổ hợp nào đủ tín hiệu trên train.");
    return;
  }

  console.log(`\nTOP 5 trên train (đã shrinkage):`);
  results
    .sort((a, b) => b!.fav - a!.fav)
    .slice(0, 5)
    .forEach((c) => {
      const tr = evalBuy(train, c!.w, c!.thr);
      const te = evalBuy(test, c!.w, c!.thr);
      console.log(
        `w=${JSON.stringify(c!.w)} thr=${c!.thr}: train fav=${(tr.fav * 100).toFixed(1)}% n=${tr.n} -> TEST fav=${(te.fav * 100).toFixed(1)}% n=${te.n} med=${te.med.toFixed(1)}%`
      );
    });
}
main();
