/**
 * Kiểm chứng đề xuất: preset "Toàn cảnh" (composite mặc định 35/20/20, premium
 * bỏ qua vì backtest chưa có dữ liệu premium lịch sử — xem DEFAULT_WEIGHTS +
 * ghi chú "VN-premium criterion is only backtested once ≥6 months..." trong
 * CLAUDE.md) với ngưỡng mua hạ xuống +10 thay vì +40 mặc định.
 *
 * Không phải mở lại grid search trọng số (đã ĐÓNG HỒ SƠ, docs/presets.md) —
 * đây là kiểm tra MỘT ngưỡng cụ thể người dùng đề xuất, trọng số giữ nguyên
 * mặc định. Train <2019 / test ≥2019 (walk-forward), + placebo ngưỡng lân cận
 * để tách "ngưỡng thấp tự nhiên bắt nhiều điểm hơn" khỏi "ngưỡng +10 có biên"
 * thật.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline, TimelinePoint } from "../src/lib/types";
import { bearPhases } from "../src/lib/bear-dca";

const SPLIT_DATE = "2019-01-01";
const MIN_SIGNALS = 20;
const HORIZONS = ["21", "63", "126"] as const;
const W = { technical: 0.35, stats: 0.2, macro: 0.2 }; // premium: không có trong timeline lịch sử
const BOTTOM_WINDOW = 21; // phiên nhìn tới trước để định nghĩa "đáy cục bộ"
const NEAR_BOTTOM_PCT = 0.02; // trong vòng 2% của đáy 21 phiên tới = "bắt đáy"

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const phases = bearPhases(tl.points.map((p) => p.price));
const points = tl.points.map((p, i) => ({ ...p, phase: phases[i] }));
type Pt = (typeof points)[number];

function nearBottomFlags(pts: Pt[]): boolean[] {
  return pts.map((p, i) => {
    const win = pts.slice(i, i + BOTTOM_WINDOW + 1).map((q) => q.price);
    if (win.length < 2) return false;
    const fMin = Math.min(...win);
    return p.price <= fMin * (1 + NEAR_BOTTOM_PCT);
  });
}
const nearBottom = nearBottomFlags(points);
const pointsF = points.map((p, i) => ({ ...p, nearBottom: nearBottom[i] }));
type PtF = (typeof pointsF)[number];

function composite(p: TimelinePoint): number {
  let s = 0;
  let tw = 0;
  for (const [k, wk] of Object.entries(W)) {
    const sc = (p.scores as Record<string, number | undefined>)[k];
    if (sc === undefined) continue;
    s += sc * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

function evalAt(
  data: TimelinePoint[],
  horizon: (typeof HORIZONS)[number],
  thr: number
): { n: number; fav: number; med: number } | null {
  const rets = data
    .filter((p) => composite(p) >= thr && p.returns[horizon] !== null)
    .map((p) => p.returns[horizon] as number);
  if (rets.length < MIN_SIGNALS) return null;
  const fav = rets.filter((r) => r > 0).length / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  return { n: rets.length, fav, med: sorted[Math.floor(sorted.length / 2)] };
}

function baseline(
  data: TimelinePoint[],
  horizon: (typeof HORIZONS)[number]
): { fav: number; med: number } {
  const rets = data
    .filter((p) => p.returns[horizon] !== null)
    .map((p) => p.returns[horizon] as number);
  const fav = rets.filter((r) => r > 0).length / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  return { fav, med: sorted[Math.floor(sorted.length / 2)] };
}

function bottomRate(data: PtF[]): { n: number; rate: number } {
  const limit = pointsF.length - BOTTOM_WINDOW - 1; // loại điểm cuối chuỗi (cửa sổ tương lai cụt, thiên vị)
  const eligible = data.filter((p) => pointsF.indexOf(p) <= limit); // ok: n nhỏ, không phải hot path
  if (eligible.length === 0) return { n: 0, rate: 0 };
  const hits = eligible.filter((p) => p.nearBottom).length;
  return { n: eligible.length, rate: hits / eligible.length };
}

function main() {
  const train = pointsF.filter((p) => p.date < SPLIT_DATE);
  const test = pointsF.filter((p) => p.date >= SPLIT_DATE);
  console.log(`train n=${train.length} (từ ${train[0]?.date}), test n=${test.length} (từ ${test[0]?.date})`);

  for (const h of HORIZONS) {
    console.log(`\n=== horizon ${h} phiên (mọi regime) ===`);
    const bTr = baseline(train, h);
    const bTe = baseline(test, h);
    console.log(
      `BASELINE: train fav=${(bTr.fav * 100).toFixed(1)}% med=${bTr.med.toFixed(1)}% | test fav=${(bTe.fav * 100).toFixed(1)}% med=${bTe.med.toFixed(1)}%`
    );
    for (const thr of [10, 20, 30, 40]) {
      const tr = evalAt(train, h, thr);
      const te = evalAt(test, h, thr);
      const trS = tr ? `fav=${(tr.fav * 100).toFixed(1)}% n=${tr.n} med=${tr.med.toFixed(1)}%` : "n<min";
      const teS = te ? `fav=${(te.fav * 100).toFixed(1)}% n=${te.n} med=${te.med.toFixed(1)}%` : "n<min";
      console.log(`thr=+${thr}: train ${trS} -> test ${teS}`);
    }
  }

  console.log(`\n=== CHỈ ngày phase != bull (dd từ ATH ≥15%, bear-dca.ts classifyPhase) ===`);
  const trainBear = train.filter((p) => p.phase !== "bull");
  const testBear = test.filter((p) => p.phase !== "bull");
  console.log(`bear-days: train n=${trainBear.length}/${train.length}, test n=${testBear.length}/${test.length}`);
  for (const h of HORIZONS) {
    console.log(`\n--- horizon ${h} phiên, bear-only ---`);
    const bTr = baseline(trainBear, h);
    const bTe = baseline(testBear, h);
    console.log(
      `BASELINE (bear-only, mua bất kỳ ngày bear): train fav=${(bTr.fav * 100).toFixed(1)}% med=${bTr.med.toFixed(1)}% | test fav=${(bTe.fav * 100).toFixed(1)}% med=${bTe.med.toFixed(1)}%`
    );
    for (const thr of [10, 20, 30, 40]) {
      const tr = evalAt(trainBear, h, thr);
      const te = evalAt(testBear, h, thr);
      const trS = tr ? `fav=${(tr.fav * 100).toFixed(1)}% n=${tr.n} med=${tr.med.toFixed(1)}%` : "n<min";
      const teS = te ? `fav=${(te.fav * 100).toFixed(1)}% n=${te.n} med=${te.med.toFixed(1)}%` : "n<min";
      console.log(`thr=+${thr} (bear-only): train ${trS} -> test ${teS}`);
    }
  }

  console.log(`\n=== Độ "bắt đáy": % ngày tín hiệu nằm trong ${NEAR_BOTTOM_PCT * 100}% của đáy ${BOTTOM_WINDOW} phiên tới ===`);
  for (const [label, data] of [
    ["ALL train", train],
    ["ALL test", test],
    ["bear train", trainBear],
    ["bear test", testBear],
  ] as const) {
    const base = bottomRate(data);
    const sig10 = bottomRate(data.filter((p) => composite(p) >= 10));
    const sig40 = bottomRate(data.filter((p) => composite(p) >= 40));
    console.log(
      `${label}: baseline=${(base.rate * 100).toFixed(1)}% (n=${base.n}) | thr+10=${(sig10.rate * 100).toFixed(1)}% (n=${sig10.n}) | thr+40=${(sig40.rate * 100).toFixed(1)}% (n=${sig40.n})`
    );
  }
}
main();
