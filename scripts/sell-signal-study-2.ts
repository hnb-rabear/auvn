/**
 * Sell signal — nghiên cứu tiếp theo (sau sell-signal-study.ts)
 *
 * 3 câu hỏi cần trả lời trước khi triển khai:
 *
 * Study 6: Sub-period breakdown — test period 2019-2026 có đồng đều không,
 *          hay accuracy bị dominate bởi đợt 2022 Fed hiking duy nhất?
 *
 * Study 7: Macro vs Stats — thành phần nào làm việc thật?
 *          (buy signal driven by macro; sell signal có cùng cơ chế không?)
 *
 * Study 8: Threshold sensitivity — -45 có robust không, hay chỉ là lucky cut?
 *          Nếu threshold thay đổi ±10 thì accuracy dao động thế nào?
 *
 * Study 9: False positive analysis — khi signal bắn sai (bán mà giá tăng),
 *          bối cảnh là gì? Có thể lọc thêm không?
 *
 * Chạy: npx tsx scripts/sell-signal-study-2.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TimelinePoint } from "../src/lib/types";

const SPLIT = "2019-01-01";

const { points: raw }: { points: TimelinePoint[] } = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8")
);

// ── Momentum (giống các study trước) ─────────────────────────────────────
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

// Cấu hình tốt nhất từ Study 2
const BEST_W = { technical: 0, stats: 0.4, macro: 0.5, momentum: 0.1 };
const BEST_THR = -45;
const H21: "21" = "21";
const H63: "63" = "63";
const H126: "126" = "126";

function recompute(p: TimelinePoint, w: Record<string, number>): number {
  const sc = p.scores as Record<string, number>;
  let s = 0, tw = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (wk > 0 && sc[k] !== undefined) { s += sc[k] * wk; tw += wk; }
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

function pct(n: number, d: number) { return d > 0 ? (n / d * 100).toFixed(1) + "%" : "N/A"; }
function fmt(n: number, d = 1) { return (n >= 0 ? "+" : "") + n.toFixed(d); }

// ── Study 6: Sub-period breakdown ─────────────────────────────────────────
function study6() {
  console.log("════ Study 6: Sub-period breakdown — tín hiệu có nhất quán qua các giai đoạn? ════\n");

  const periods: [string, string, string][] = [
    ["Train: 2009–2013 (bull→top)", "2009-01-01", "2013-12-31"],
    ["Train: 2014–2018 (bear→recovery)", "2014-01-01", "2018-12-31"],
    ["Test:  2019–2020 (COVID)", "2019-01-01", "2020-12-31"],
    ["Test:  2021–2022 (Fed hiking)", "2021-01-01", "2022-12-31"],
    ["Test:  2023–2026 (new bull)", "2023-01-01", "2026-12-31"],
  ];

  for (const h of [H21, H63] as const) {
    const label = h === "21" ? "Horizon ~1 tháng (21 bars)" : "Horizon ~3 tháng (63 bars)";
    console.log(`  [${label}]`);
    console.log(`  ${"Giai đoạn".padEnd(36)} ${"Baseline".padStart(8)} ${"Tín hiệu".padStart(10)} ${"n".padStart(4)} ${"Excess".padStart(8)}`);

    for (const [name, from, to] of periods) {
      const sub = pts.filter(p => p.date >= from && p.date <= to && p.returns[h] !== null);
      if (!sub.length) continue;
      const base = sub.filter(p => p.returns[h]! < 0).length / sub.length * 100;
      const sigs = sub.filter(p => recompute(p, BEST_W) <= BEST_THR);
      const sigDown = sigs.length ? sigs.filter(p => p.returns[h]! < 0).length / sigs.length * 100 : NaN;
      const excess = sigDown - base;
      const flag = isNaN(sigDown) ? "N/A   " : sigDown >= 60 ? "✓✓" : sigDown >= 50 ? "✓ " : "✗ ";
      console.log(
        `  ${name.padEnd(36)} ${base.toFixed(1).padStart(7)}%` +
        ` ${isNaN(sigDown) ? "   N/A  " : (sigDown.toFixed(1) + "%").padStart(9)}` +
        ` ${String(sigs.length).padStart(4)}` +
        ` ${isNaN(sigDown) ? "     N/A" : (fmt(excess) + "pp").padStart(8)} ${flag}`
      );
    }
    console.log();
  }
}

// ── Study 7: Macro vs Stats isolation ─────────────────────────────────────
function study7() {
  console.log("════ Study 7: Macro vs Stats — thành phần nào tạo ra edge? ════\n");

  const h = H21;
  const train = pts.filter(p => p.date < SPLIT && p.returns[h] !== null);
  const test  = pts.filter(p => p.date >= SPLIT && p.returns[h] !== null);
  const bTr = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTe = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  console.log(`  Baseline train ${bTr.toFixed(1)}% / test ${bTe.toFixed(1)}%\n`);

  const configs: [string, Record<string, number>, number[]][] = [
    // Chỉ stats ở các threshold
    ["Stats only  (0/10/0/0), thr -35", { stats: 1 }, [-35]],
    ["Stats only  (0/10/0/0), thr -40", { stats: 1 }, [-40]],
    ["Stats only  (0/10/0/0), thr -45", { stats: 1 }, [-45]],
    ["Stats only  (0/10/0/0), thr -50", { stats: 1 }, [-50]],
    // Chỉ macro
    ["Macro only  (0/0/10/0), thr -35", { macro: 1 }, [-35]],
    ["Macro only  (0/0/10/0), thr -40", { macro: 1 }, [-40]],
    ["Macro only  (0/0/10/0), thr -45", { macro: 1 }, [-45]],
    ["Macro only  (0/0/10/0), thr -50", { macro: 1 }, [-50]],
    // Kết hợp best (stats+macro) ở các tỷ lệ
    ["Stats+Macro (0/3/7/0), thr -45",  { stats: 0.3, macro: 0.7 }, [-45]],
    ["Stats+Macro (0/4/6/0), thr -45",  { stats: 0.4, macro: 0.6 }, [-45]],
    ["Stats+Macro (0/5/5/0), thr -45",  { stats: 0.5, macro: 0.5 }, [-45]],
    ["Stats+Macro (0/6/4/0), thr -45",  { stats: 0.6, macro: 0.4 }, [-45]],
    // Best config từ Study 2
    ["BEST (0/4/5/1),        thr -45",  BEST_W, [-45]],
  ];

  console.log(`  ${"Cấu hình".padEnd(38)} ${"Train".padStart(7)} ${"(n)".padStart(5)} ${"Test".padStart(7)} ${"(n)".padStart(5)} ${"MinEx".padStart(7)}`);
  for (const [name, w, thrs] of configs) {
    for (const thr of thrs) {
      const trS = train.filter(p => recompute(p, w) <= thr);
      const teS = test.filter(p => recompute(p, w) <= thr);
      if (!trS.length || !teS.length) continue;
      const trD = trS.filter(p => p.returns[h]! < 0).length / trS.length * 100;
      const teD = teS.filter(p => p.returns[h]! < 0).length / teS.length * 100;
      const minEx = Math.min(trD - bTr, teD - bTe);
      const flag = trD >= 60 && teD >= 60 ? " ★" : teD >= 60 ? " ●" : "";
      console.log(
        `  ${name.padEnd(38)}` +
        ` ${(trD.toFixed(1)+"%").padStart(7)} (${String(trS.length).padStart(3)})` +
        ` ${(teD.toFixed(1)+"%").padStart(7)} (${String(teS.length).padStart(3)})` +
        ` ${(fmt(minEx)+"pt").padStart(7)}${flag}`
      );
    }
  }
  console.log("\n  ★ = cả 2 ≥60%   ● = chỉ test ≥60%\n");
}

// ── Study 8: Threshold sensitivity ────────────────────────────────────────
function study8() {
  console.log("════ Study 8: Threshold sensitivity — -45 có robust không? ════\n");

  const h = H21;
  const train = pts.filter(p => p.date < SPLIT && p.returns[h] !== null);
  const test  = pts.filter(p => p.date >= SPLIT && p.returns[h] !== null);
  const bTr = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTe = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  console.log(`  Baseline train ${bTr.toFixed(1)}% / test ${bTe.toFixed(1)}%`);
  console.log(`  Dùng weights tốt nhất: KT=0/TK=40/VM=50/MOM=10\n`);
  console.log(`  ${"Threshold".padEnd(12)} ${"Train%".padStart(7)} ${"(n)".padStart(5)} ${"Test%".padStart(7)} ${"(n)".padStart(5)} ${"MinEx".padStart(7)} ${"Flag"}`);

  for (let thr = -30; thr >= -70; thr -= 5) {
    const trS = train.filter(p => recompute(p, BEST_W) <= thr);
    const teS = test.filter(p => recompute(p, BEST_W) <= thr);
    if (!trS.length && !teS.length) continue;
    const trD = trS.length ? trS.filter(p => p.returns[h]! < 0).length / trS.length * 100 : NaN;
    const teD = teS.length ? teS.filter(p => p.returns[h]! < 0).length / teS.length * 100 : NaN;
    const minEx = (!isNaN(trD) && !isNaN(teD)) ? Math.min(trD - bTr, teD - bTe) : NaN;
    const flag = (!isNaN(trD) && trD >= 60 && !isNaN(teD) && teD >= 60) ? "★ both≥60%"
               : (!isNaN(teD) && teD >= 60) ? "● test≥60%"
               : "";
    console.log(
      `  ${("≤ " + thr).padEnd(12)}` +
      ` ${isNaN(trD) ? "    N/A" : (trD.toFixed(1)+"%").padStart(7)}` +
      ` (${String(trS.length).padStart(3)})` +
      ` ${isNaN(teD) ? "    N/A" : (teD.toFixed(1)+"%").padStart(7)}` +
      ` (${String(teS.length).padStart(3)})` +
      ` ${isNaN(minEx) ? "    N/A" : (fmt(minEx)+"pt").padStart(7)}` +
      ` ${flag}`
    );
  }
  console.log();
}

// ── Study 9: False positive analysis ──────────────────────────────────────
function study9() {
  console.log("════ Study 9: False positive analysis — khi signal sai, bối cảnh là gì? ════\n");

  const h = H21;
  const valid = pts.filter(p => p.returns[h] !== null);
  const sigs = valid.filter(p => recompute(p, BEST_W) <= BEST_THR);

  const correct  = sigs.filter(p => p.returns[h]! < 0);   // signal đúng
  const fp       = sigs.filter(p => p.returns[h]! >= 0);  // false positive

  console.log(`  Tổng tín hiệu bán: ${sigs.length} | Đúng: ${correct.length} | Sai: ${fp.length}\n`);

  // Phân tích scores trung bình của correct vs false positive
  const avgScore = (group: TimelinePoint[], key: string) => {
    const sc = group.map(p => (p.scores as Record<string,number>)[key]).filter(v => v !== undefined);
    return sc.length ? sc.reduce((a,b)=>a+b,0)/sc.length : NaN;
  };

  console.log("  Score trung bình theo thành phần:");
  console.log(`  ${"".padEnd(16)} ${"Correct (bán đúng)".padStart(20)} ${"False positive".padStart(18)}`);
  for (const key of ["technical","stats","macro","momentum"]) {
    const c = avgScore(correct, key);
    const f = avgScore(fp, key);
    console.log(
      `  ${key.padEnd(16)}` +
      ` ${isNaN(c) ? "N/A".padStart(20) : c.toFixed(2).padStart(20)}` +
      ` ${isNaN(f) ? "N/A".padStart(18) : f.toFixed(2).padStart(18)}`
    );
  }

  // Giá trị composite
  const cComp = correct.map(p => recompute(p, BEST_W));
  const fpComp = fp.map(p => recompute(p, BEST_W));
  const avg = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : NaN;
  console.log(`\n  Composite trung bình: đúng=${avg(cComp).toFixed(1)} | sai=${avg(fpComp).toFixed(1)}`);

  // Forward return distribution khi sai
  const fpRets = fp.map(p => p.returns[h]!).sort((a,b)=>a-b);
  const med = fpRets[Math.floor(fpRets.length/2)];
  const maxUp = Math.max(...fpRets);
  console.log(`  False positive returns: trung_vị=${fmt(med)}%  max=${fmt(maxUp)}%`);

  // Theo giai đoạn
  console.log("\n  False positives theo giai đoạn:");
  const subPeriods: [string, string, string][] = [
    ["Train 2009-2013", "2009-01-01", "2013-12-31"],
    ["Train 2014-2018", "2014-01-01", "2018-12-31"],
    ["Test  2019-2022", "2019-01-01", "2022-12-31"],
    ["Test  2023-2026", "2023-01-01", "2026-12-31"],
  ];
  for (const [name, from, to] of subPeriods) {
    const sub = sigs.filter(p => p.date >= from && p.date <= to);
    const subFP = sub.filter(p => p.returns[h]! >= 0);
    if (!sub.length) continue;
    const fpRate = subFP.length / sub.length * 100;
    console.log(`  ${name}: ${subFP.length}/${sub.length} sai (${fpRate.toFixed(0)}% FP rate)`);
  }

  // Top 5 false positives — những ngày giá tăng mạnh nhất sau signal bán
  console.log("\n  Top false positives (giá tăng mạnh nhất sau signal bán):");
  const topFP = [...fp].sort((a,b)=>b.returns[h]!-a.returns[h]!).slice(0,5);
  for (const p of topFP) {
    const sc = p.scores as Record<string,number>;
    console.log(
      `  ${p.date}: +${p.returns[h]!.toFixed(1)}% | comp=${recompute(p,BEST_W).toFixed(1)}` +
      ` | mac=${sc.macro?.toFixed(1)??"-"} stats=${sc.stats?.toFixed(1)??"-"} mom=${sc.momentum?.toFixed(1)??"-"}`
    );
  }
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log(`Dữ liệu: ${pts.length} điểm (${pts[0].date}..${pts[pts.length-1].date})`);
  console.log(`Cấu hình nghiên cứu: KT=0/TK=40/VM=50/MOM=10, ngưỡng ${BEST_THR}\n`);
  study6();
  study7();
  study8();
  study9();
}
main();
