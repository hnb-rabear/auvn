/**
 * Study tín hiệu BÁN XAU/USD từ 17 năm dữ liệu timeline.
 *
 * Câu hỏi: khi composite âm (≤ ngưỡng), giá XAU có giảm N ngày sau không?
 *
 * Study 1: Phân phối forward return theo bucket composite (nhìn tổng thể)
 * Study 2: Grid search weights + threshold → tối ưu hóa accuracy bán
 * Study 3: Filter "kéo dài N điểm liên tiếp" → có cải thiện không?
 * Study 4: Horizon 21 / 63 / 126 ngày — accuracy suy giảm thế nào?
 *
 * Chạy: npx tsx scripts/sell-signal-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TimelinePoint } from "../src/lib/types";

const SPLIT = "2019-01-01";
const MIN_N = 15; // tín hiệu tối thiểu mỗi giai đoạn

const { points: raw }: { points: TimelinePoint[] } = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8")
);

// ── Thêm momentum score (giống factor-study-momentum-offline.ts) ──────────
function addMomentum(pts: TimelinePoint[]): void {
  for (let i = 0; i < pts.length; i++) {
    const target = new Date(pts[i].date).getTime() - 252 * 86400000;
    let best = -1;
    for (let j = 0; j < i; j++) {
      if (new Date(pts[j].date).getTime() <= target) best = j;
      else break;
    }
    if (best < 0) continue;
    const diff = (new Date(pts[i].date).getTime() - new Date(pts[best].date).getTime()) / 86400000;
    if (diff < 240 || diff > 280) continue;
    const mom = (pts[i].price / pts[best].price - 1) * 100;
    let ms = 0;
    if (mom > 20) ms = 2;
    else if (mom > 5) ms = 1;
    else if (mom > -10) ms = 0;
    else if (mom > -25) ms = -1;
    else ms = -2;
    (pts[i].scores as Record<string, number>)["momentum"] = ms;
  }
}
addMomentum(raw);
const pts = raw;

// ── Helpers ───────────────────────────────────────────────────────────────
type H = "21" | "63" | "126";

function recompute(p: TimelinePoint, w: Record<string, number>): number {
  const sc = p.scores as Record<string, number>;
  let s = 0, tw = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (wk > 0 && sc[k] !== undefined) { s += sc[k] * wk; tw += wk; }
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

function fmt(n: number, d = 1) { return (n >= 0 ? "+" : "") + n.toFixed(d); }

function sellRow(label: string, sigs: TimelinePoint[], h: H, baseline: number) {
  if (!sigs.length) return;
  const rets = sigs.map(p => p.returns[h]!).filter(r => r !== null);
  const down = rets.filter(r => r < 0).length;
  const downPct = (down / rets.length) * 100;
  const excess = downPct - baseline;
  const sortedR = [...rets].sort((a, b) => a - b);
  const med = sortedR[Math.floor(sortedR.length / 2)];
  const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
  console.log(
    `  ${label.padEnd(36)}: n=${String(rets.length).padStart(3)}` +
    ` | %giảm=${downPct.toFixed(0).padStart(3)}%` +
    ` (${excess >= 0 ? "+" : ""}${excess.toFixed(0)}pp vs baseline)` +
    ` | trung_vị=${fmt(med)}%  avg=${fmt(avg)}%`
  );
}

// ── Study 1: Phân phối theo bucket composite hiện tại ─────────────────────
function study1() {
  console.log("════ Study 1: Phân phối forward return 21 ngày theo composite (weights hiện tại) ════");
  const h: H = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const train = valid.filter(p => p.date < SPLIT);
  const test = valid.filter(p => p.date >= SPLIT);

  const bTrain = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTest = test.filter(p => p.returns[h]! < 0).length / test.length * 100;
  console.log(`  Baseline train (2009-2018): ${bTrain.toFixed(1)}% giảm (n=${train.length})`);
  console.log(`  Baseline test  (2019-2026): ${bTest.toFixed(1)}% giảm (n=${test.length})\n`);

  const buckets: [string, (c: number) => boolean][] = [
    ["> +40 (vùng mua)", c => c > 40],
    ["+20..+40",          c => c > 20 && c <= 40],
    ["-20..+20 (trung tính)", c => c >= -20 && c <= 20],
    ["-40..-20",          c => c >= -40 && c < -20],
    ["< -40 (vùng bán)",  c => c < -40],
    ["< -50",             c => c < -50],
    ["< -60",             c => c < -60],
  ];

  for (const period of [["TRAIN", train, bTrain], ["TEST", test, bTest]] as const) {
    const [label, subset, base] = period;
    console.log(`  [${label}]`);
    for (const [name, fn] of buckets) {
      const sigs = (subset as TimelinePoint[]).filter(p => fn(p.composite));
      sellRow(name, sigs, h, base as number);
    }
    console.log();
  }
}

// ── Study 2: Grid search weights + threshold ──────────────────────────────
interface SellConfig {
  w: Record<string, number>;
  threshold: number;
  h: H;
  trainN: number; trainDown: number; trainExcess: number;
  testN: number; testDown: number; testExcess: number;
  minExcess: number;
}

function study2() {
  console.log("════ Study 2: Grid search weights + threshold (horizon 21 ngày) ════");

  const h: H = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const train = valid.filter(p => p.date < SPLIT);
  const test = valid.filter(p => p.date >= SPLIT);
  const bTrain = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTest = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  const hasMom = pts.some(p => (p.scores as Record<string, number>)["momentum"] !== undefined);
  const thresholds = [-40, -45, -50, -55, -60];
  const best: SellConfig[] = [];

  // 4D grid: technical / stats / macro / momentum (bước 10%)
  for (let wt = 0; wt <= 10; wt++) {
    for (let ws = 0; ws <= 10 - wt; ws++) {
      for (let wmom = 0; wmom <= (hasMom ? 10 - wt - ws : 0); wmom++) {
        const wm = 10 - wt - ws - wmom;
        const w = {
          technical: wt / 10,
          stats: ws / 10,
          macro: wm / 10,
          ...(hasMom ? { momentum: wmom / 10 } : {}),
        };
        if (wt + ws + wm + wmom !== 10) continue;

        const withComp = valid.map(p => ({ p, c: recompute(p, w) }));
        const trainC = withComp.filter(x => x.p.date < SPLIT);
        const testC = withComp.filter(x => x.p.date >= SPLIT);

        for (const thr of thresholds) {
          const trSigs = trainC.filter(x => x.c <= thr).map(x => x.p);
          const teSigs = testC.filter(x => x.c <= thr).map(x => x.p);
          if (trSigs.length < MIN_N || teSigs.length < MIN_N) continue;

          const trDown = trSigs.filter(p => p.returns[h]! < 0).length / trSigs.length * 100;
          const teDown = teSigs.filter(p => p.returns[h]! < 0).length / teSigs.length * 100;
          const trEx = trDown - bTrain;
          const teEx = teDown - bTest;
          const minEx = Math.min(trEx, teEx);
          if (minEx < 0) continue;

          best.push({
            w, threshold: thr, h,
            trainN: trSigs.length, trainDown: trDown, trainExcess: trEx,
            testN: teSigs.length, testDown: teDown, testExcess: teEx,
            minExcess: minEx,
          });
        }
      }
    }
  }

  best.sort((a, b) => b.minExcess - a.minExcess);
  const top = best.slice(0, 10);

  console.log(`  Baseline train ${bTrain.toFixed(1)}% / test ${bTest.toFixed(1)}% giảm`);
  console.log(`  Tổng cấu hình hợp lệ (min-excess ≥ 0): ${best.length}\n`);

  if (!top.length) {
    console.log("  Không tìm được cấu hình nào vượt baseline ở CẢ HAI giai đoạn.\n");
    return null;
  }

  console.log("  Top 10 cấu hình (xếp theo min-excess):");
  console.log("  " + "Weights (KT/TK/VM/MOM)".padEnd(28) + "Thr  | Train              | Test               | MinExcess");
  for (const c of top) {
    const { w, threshold: t } = c;
    const wStr = `${(w.technical*10).toFixed(0)}/${(w.stats*10).toFixed(0)}/${(w.macro*10).toFixed(0)}/${((w.momentum??0)*10).toFixed(0)}`;
    console.log(
      `  ${wStr.padEnd(28)}${String(t).padStart(4)} |` +
      ` ${c.trainDown.toFixed(1)}% (n=${c.trainN}, +${c.trainExcess.toFixed(1)}pp) |` +
      ` ${c.testDown.toFixed(1)}% (n=${c.testN}, +${c.testExcess.toFixed(1)}pp) |` +
      ` +${c.minExcess.toFixed(1)}pt`
    );
  }
  console.log();
  return top[0];
}

// ── Study 3: Duration filter ───────────────────────────────────────────────
function study3(best: SellConfig) {
  console.log("════ Study 3: Filter kéo dài liên tiếp (dùng cấu hình tốt nhất từ Study 2) ════");
  const { w, threshold: thr } = best;
  const h: H = "21";
  const valid = pts.filter(p => p.returns[h] !== null);

  // Gắn composite cho từng điểm
  const withC = valid.map(p => ({ p, c: recompute(p, w) }));

  const bAll = withC.filter(x => x.p.returns[h]! < 0).length / withC.length * 100;
  const bTrain = withC.filter(x => x.p.date < SPLIT && x.p.returns[h]! < 0).length /
    withC.filter(x => x.p.date < SPLIT).length * 100;
  const bTest = withC.filter(x => x.p.date >= SPLIT && x.p.returns[h]! < 0).length /
    withC.filter(x => x.p.date >= SPLIT).length * 100;

  console.log(`  Cấu hình: KT=${best.w.technical*10}/TK=${best.w.stats*10}/VM=${best.w.macro*10}/MOM=${(best.w.momentum??0)*10}, ngưỡng ${thr}`);
  console.log(`  Baseline: train ${bTrain.toFixed(1)}% / test ${bTest.toFixed(1)}%\n`);

  for (const k of [1, 2, 3, 5]) {
    // k = số điểm liên tiếp ≤ threshold (~k×4 ngày lịch)
    const signals: TimelinePoint[] = [];
    let streak = 0;
    for (const { p, c } of withC) {
      if (c <= thr) { streak++; if (streak >= k) signals.push(p); }
      else streak = 0;
    }
    const trSigs = signals.filter(p => p.date < SPLIT);
    const teSigs = signals.filter(p => p.date >= SPLIT);
    const trDown = trSigs.length ? trSigs.filter(p => p.returns[h]! < 0).length / trSigs.length * 100 : 0;
    const teDown = teSigs.length ? teSigs.filter(p => p.returns[h]! < 0).length / teSigs.length * 100 : 0;
    const approxDays = k * 4;
    console.log(
      `  Kéo dài ≥${k} điểm (~${approxDays} ngày): n_total=${signals.length}` +
      ` | train ${trDown.toFixed(1)}% (n=${trSigs.length}, +${(trDown-bTrain).toFixed(1)}pp)` +
      ` | test ${teDown.toFixed(1)}% (n=${teSigs.length}, +${(teDown-bTest).toFixed(1)}pp)`
    );
  }
  console.log();
}

// ── Study 4: Horizon comparison ────────────────────────────────────────────
function study4(best: SellConfig) {
  console.log("════ Study 4: Horizon 21 / 63 / 126 ngày (cấu hình tốt nhất) ════");
  const { w, threshold: thr } = best;

  for (const h of ["21", "63", "126"] as H[]) {
    const valid = pts.filter(p => p.returns[h] !== null);
    const withC = valid.map(p => ({ p, c: recompute(p, w) }));
    const sigs = withC.filter(x => x.c <= thr).map(x => x.p);
    const trSigs = sigs.filter(p => p.date < SPLIT);
    const teSigs = sigs.filter(p => p.date >= SPLIT);

    const bAll = valid.filter(p => p.returns[h]! < 0).length / valid.length * 100;
    const bTrain = valid.filter(p => p.date < SPLIT && p.returns[h]! < 0).length /
      valid.filter(p => p.date < SPLIT).length * 100;
    const bTest = valid.filter(p => p.date >= SPLIT && p.returns[h]! < 0).length /
      valid.filter(p => p.date >= SPLIT).length * 100;

    const trDown = trSigs.length ? trSigs.filter(p => p.returns[h]! < 0).length / trSigs.length * 100 : NaN;
    const teDown = teSigs.length ? teSigs.filter(p => p.returns[h]! < 0).length / teSigs.length * 100 : NaN;

    const label = h === "21" ? "~1 tháng" : h === "63" ? "~3 tháng" : "~6 tháng";
    console.log(
      `  ${label} (${h} bars): baseline ${bTrain.toFixed(1)}%/${bTest.toFixed(1)}%` +
      ` | tín hiệu: train ${trDown.toFixed(1)}% (n=${trSigs.length}, +${(trDown-bTrain).toFixed(1)}pp)` +
      ` | test ${teDown.toFixed(1)}% (n=${teSigs.length}, +${(teDown-bTest).toFixed(1)}pp)`
    );
  }
  console.log();
}

// ── Study 5: Combination World + VN premium (conceptual) ──────────────────
function study5(best: SellConfig) {
  console.log("════ Study 5: Phân tích thành phần — signal bán mạnh nhất đến từ đâu? ════");
  const h: H = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const bAll = valid.filter(p => p.returns[h]! < 0).length / valid.length * 100;

  // So sánh: chỉ technical, chỉ macro, kết hợp optimal
  const configs: [string, Record<string, number>, number][] = [
    ["Chỉ technical (10/0/0/0), thr -40",    { technical: 1, stats: 0, macro: 0, momentum: 0 }, -40],
    ["Chỉ macro (0/0/10/0), thr -40",         { technical: 0, stats: 0, macro: 1, momentum: 0 }, -40],
    ["Chỉ momentum (0/0/0/10), thr -40",      { technical: 0, stats: 0, macro: 0, momentum: 1 }, -40],
    ["Tech+macro (5/0/5/0), thr -40",         { technical: 0.5, stats: 0, macro: 0.5, momentum: 0 }, -40],
    [`Cấu hình tốt nhất, thr ${best.threshold}`,
      best.w, best.threshold],
  ];

  console.log(`  Baseline (tất cả ngày): ${bAll.toFixed(1)}% giảm\n`);
  for (const [label, w, thr] of configs) {
    const sigs = valid.filter(p => recompute(p, w) <= thr);
    const trSigs = sigs.filter(p => p.date < SPLIT);
    const teSigs = sigs.filter(p => p.date >= SPLIT);
    const bTrain = valid.filter(p => p.date < SPLIT && p.returns[h]! < 0).length /
      valid.filter(p => p.date < SPLIT).length * 100;
    const bTest = valid.filter(p => p.date >= SPLIT && p.returns[h]! < 0).length /
      valid.filter(p => p.date >= SPLIT).length * 100;
    const trDown = trSigs.length ? trSigs.filter(p => p.returns[h]! < 0).length / trSigs.length * 100 : NaN;
    const teDown = teSigs.length ? teSigs.filter(p => p.returns[h]! < 0).length / teSigs.length * 100 : NaN;
    console.log(`  ${label}`);
    console.log(
      `    n=${sigs.length} | train ${isNaN(trDown) ? "N/A" : trDown.toFixed(1)+"% (+"+((trDown-bTrain)).toFixed(1)+"pp)"}` +
      ` | test ${isNaN(teDown) ? "N/A" : teDown.toFixed(1)+"% (+"+((teDown-bTest)).toFixed(1)+"pp)"}`
    );
  }
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  const hasMom = pts.some(p => (p.scores as Record<string, number>)["momentum"] !== undefined);
  console.log(`Dữ liệu: ${pts.length} điểm (${pts[0].date}..${pts[pts.length-1].date})`);
  console.log(`Momentum: ${hasMom ? "có" : "không"} | Split: ${SPLIT}\n`);

  study1();
  const bestConfig = study2();
  if (!bestConfig) {
    console.log("Không tìm được cấu hình khả dụng — kết thúc.");
    return;
  }
  study3(bestConfig);
  study4(bestConfig);
  study5(bestConfig);

  console.log("════ Kết luận ════");
  const { trainDown: td, testDown: ted, trainN: tn, testN: ten, minExcess: me, w, threshold: thr } = bestConfig;
  const wStr = `KT=${w.technical*10}/TK=${w.stats*10}/VM=${w.macro*10}/MOM=${(w.momentum??0)*10}`;
  console.log(`  Cấu hình tốt nhất: ${wStr}, ngưỡng ${thr}`);
  console.log(`  Train: ${td.toFixed(1)}% bán đúng (n=${tn})`);
  console.log(`  Test:  ${ted.toFixed(1)}% bán đúng (n=${ten})`);
  console.log(`  Min-excess: +${me.toFixed(1)}pt — ${me >= 15 ? "ĐỦ MẠNH để tích hợp" : me >= 8 ? "TRUNG BÌNH — tham khảo được" : "YẾU — cần thêm dữ liệu"}`);
  if (td >= 60 || ted >= 60) {
    console.log(`  Đạt ngưỡng 60% — khả thi tích hợp sell signal vào engine.`);
  } else {
    console.log(`  Chưa đạt ngưỡng 60% — sell signal từ XAU/USD đơn thuần còn yếu.`);
  }
}
main();
