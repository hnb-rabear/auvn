/**
 * Sell signal — Study 3: Fed regime detector
 *
 * Hypothesis: sell signal XAU/USD chỉ đáng tin khi Fed đang tăng lãi suất.
 * Mục tiêu: tìm định nghĩa "hiking cycle" tự động, tối giản, dễ implement.
 *
 * Study 10: Test 4 định nghĩa hiking regime → accuracy IN vs OUT regime
 * Study 11: Tìm ngưỡng tốt nhất cho định nghĩa được chọn
 * Study 12: Kiểm tra "pause cycle" (Fed giữ nguyên cao) — có giá trị không?
 * Study 13: Regime detector + sell signal → accuracy cuối cùng
 *
 * Chạy: npx tsx scripts/sell-signal-study-3.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TimelinePoint } from "../src/lib/types";

const { points: raw }: { points: TimelinePoint[] } = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8")
);

const fedRaw: { date: string; value: number }[] = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/history/fed-funds.json"), "utf8")
);

const SPLIT = "2019-01-01";
const BEST_W = { technical: 0, stats: 0.4, macro: 0.5, momentum: 0.1 };
const BEST_THR = -45;

// ── Momentum ─────────────────────────────────────────────────────────────
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

function recompute(p: TimelinePoint, w: Record<string, number>): number {
  const sc = p.scores as Record<string, number>;
  let s = 0, tw = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (wk > 0 && sc[k] !== undefined) { s += sc[k] * wk; tw += wk; }
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

// ── Fed lookup: lấy rate tháng gần nhất với ngày d ──────────────────────
function fedAtDate(d: string): number | null {
  const t = new Date(d).getTime();
  let best: { date: string; value: number } | null = null;
  for (const f of fedRaw) {
    if (new Date(f.date).getTime() <= t) best = f;
    else break;
  }
  return best?.value ?? null;
}

function fedNMonthsAgo(d: string, months: number): number | null {
  const t = new Date(d);
  t.setMonth(t.getMonth() - months);
  return fedAtDate(t.toISOString().slice(0, 10));
}

// ── 4 định nghĩa regime detector ─────────────────────────────────────────

/** A: Thay đổi 3 tháng > 0 (đang tăng) */
function regimeA(d: string): boolean {
  const now = fedAtDate(d);
  const ago3 = fedNMonthsAgo(d, 3);
  if (now === null || ago3 === null) return false;
  return now > ago3;
}

/** B: Thay đổi 6 tháng ≥ +0.25% (ít nhất 1 hike rõ ràng) */
function regimeB(d: string): boolean {
  const now = fedAtDate(d);
  const ago6 = fedNMonthsAgo(d, 6);
  if (now === null || ago6 === null) return false;
  return now >= ago6 + 0.25;
}

/** C: Thay đổi 12 tháng ≥ +0.5% (chu kỳ hike bền vững) */
function regimeC(d: string): boolean {
  const now = fedAtDate(d);
  const ago12 = fedNMonthsAgo(d, 12);
  if (now === null || ago12 === null) return false;
  return now >= ago12 + 0.5;
}

/** D: Rate hiện tại ≥ cycle_low_2y + 1.0% (đã tăng đủ nhiều so với đáy) */
function regimeD(d: string): boolean {
  const now = fedAtDate(d);
  if (now === null) return false;
  const t = new Date(d).getTime();
  const twoYearsAgo = t - 730 * 86400000;
  let low = Infinity;
  for (const f of fedRaw) {
    const ft = new Date(f.date).getTime();
    if (ft >= twoYearsAgo && ft <= t) low = Math.min(low, f.value);
  }
  return low < Infinity && now >= low + 1.0;
}

/** E: Rate hiện tại ≥ cycle_low_2y + 0.5% VÀ đang tăng (3m) */
function regimeE(d: string): boolean {
  return regimeB(d) && regimeD(d);
}

type RegimeFn = (d: string) => boolean;

function fmt(n: number, d = 1) { return (n >= 0 ? "+" : "") + n.toFixed(d); }

// ── Study 10: So sánh 4 regime định nghĩa ────────────────────────────────
function study10() {
  console.log("════ Study 10: Hiệu quả 4 định nghĩa hiking regime ════\n");

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const sigs = valid.filter(p => recompute(p, BEST_W) <= BEST_THR);
  const bAll = valid.filter(p => p.returns[h]! < 0).length / valid.length * 100;
  const bTrain = valid.filter(p => p.date < SPLIT && p.returns[h]! < 0).length /
    valid.filter(p => p.date < SPLIT).length * 100;
  const bTest = valid.filter(p => p.date >= SPLIT && p.returns[h]! < 0).length /
    valid.filter(p => p.date >= SPLIT).length * 100;

  console.log(`  Baseline: ${bAll.toFixed(1)}% | Sell signal tổng: ${sigs.length} tín hiệu`);
  console.log(`  Baseline train ${bTrain.toFixed(1)}% / test ${bTest.toFixed(1)}%\n`);

  const regimes: [string, RegimeFn][] = [
    ["A: rate tăng 3 tháng (bất kỳ)", regimeA],
    ["B: tăng ≥+0.25% / 6 tháng",    regimeB],
    ["C: tăng ≥+0.5%  / 12 tháng",   regimeC],
    ["D: ≥+1.0% vs đáy 2 năm",       regimeD],
    ["E: B AND D (kết hợp)",          regimeE],
  ];

  console.log(`  ${"Định nghĩa".padEnd(34)} ${"IN regime".padStart(11)} ${"n".padStart(4)} ${"OUT regime".padStart(12)} ${"n".padStart(4)} ${"Lift".padStart(7)}`);
  for (const [name, fn] of regimes) {
    const inR  = sigs.filter(p => fn(p.date));
    const outR = sigs.filter(p => !fn(p.date));
    const inDown  = inR.length  ? inR.filter(p => p.returns[h]! < 0).length / inR.length * 100 : NaN;
    const outDown = outR.length ? outR.filter(p => p.returns[h]! < 0).length / outR.length * 100 : NaN;
    const lift = (!isNaN(inDown) && !isNaN(outDown)) ? inDown - outDown : NaN;
    const flag = (!isNaN(inDown) && inDown >= 65) ? " ✓" : "";
    console.log(
      `  ${name.padEnd(34)}` +
      ` ${isNaN(inDown) ? "    N/A    " : (inDown.toFixed(1)+"%").padStart(11)}` +
      ` ${String(inR.length).padStart(4)}` +
      ` ${isNaN(outDown) ? "     N/A    " : (outDown.toFixed(1)+"%").padStart(12)}` +
      ` ${String(outR.length).padStart(4)}` +
      ` ${isNaN(lift) ? "    N/A" : (fmt(lift)+"pp").padStart(7)}${flag}`
    );
  }

  // Thêm: IN regime phân theo train/test
  console.log("\n  Chi tiết IN regime theo train/test:\n");
  console.log(`  ${"Định nghĩa".padEnd(34)} ${"Train".padStart(8)} ${"n".padStart(4)} ${"Test".padStart(8)} ${"n".padStart(4)} ${"MinEx".padStart(7)}`);
  for (const [name, fn] of regimes) {
    const trIn = sigs.filter(p => p.date < SPLIT && fn(p.date));
    const teIn = sigs.filter(p => p.date >= SPLIT && fn(p.date));
    const trD = trIn.length ? trIn.filter(p => p.returns[h]! < 0).length / trIn.length * 100 : NaN;
    const teD = teIn.length ? teIn.filter(p => p.returns[h]! < 0).length / teIn.length * 100 : NaN;
    const minEx = (!isNaN(trD) && !isNaN(teD)) ? Math.min(trD - bTrain, teD - bTest) : NaN;
    const flag = (!isNaN(trD) && !isNaN(teD) && trD >= 65 && teD >= 65) ? " ★" :
                 (!isNaN(teD) && teD >= 65) ? " ●" : "";
    console.log(
      `  ${name.padEnd(34)}` +
      ` ${isNaN(trD) ? "     N/A" : (trD.toFixed(1)+"%").padStart(8)}` +
      ` ${String(trIn.length).padStart(4)}` +
      ` ${isNaN(teD) ? "     N/A" : (teD.toFixed(1)+"%").padStart(8)}` +
      ` ${String(teIn.length).padStart(4)}` +
      ` ${isNaN(minEx) ? "    N/A" : (fmt(minEx)+"pt").padStart(7)}${flag}`
    );
  }
  console.log("\n  ★ = cả 2 ≥65%   ● = chỉ test ≥65%\n");
}

// ── Study 11: Threshold sensitivity cho định nghĩa được chọn ─────────────
function study11(bestFn: RegimeFn, fnName: string) {
  console.log(`════ Study 11: Threshold sensitivity (IN ${fnName}) ════\n`);

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const train = valid.filter(p => p.date < SPLIT);
  const test  = valid.filter(p => p.date >= SPLIT);
  const bTr = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTe = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  console.log(`  Baseline train ${bTr.toFixed(1)}% / test ${bTe.toFixed(1)}%\n`);
  console.log(`  ${"Threshold".padEnd(10)} ${"Train%".padStart(7)} ${"(n)".padStart(5)} ${"Test%".padStart(7)} ${"(n)".padStart(5)} ${"MinEx".padStart(7)} Flag`);

  for (let thr = -30; thr >= -65; thr -= 5) {
    const trS = train.filter(p => recompute(p, BEST_W) <= thr && bestFn(p.date));
    const teS = test.filter(p => recompute(p, BEST_W) <= thr && bestFn(p.date));
    if (!trS.length && !teS.length) continue;
    const trD = trS.length ? trS.filter(p => p.returns[h]! < 0).length / trS.length * 100 : NaN;
    const teD = teS.length ? teS.filter(p => p.returns[h]! < 0).length / teS.length * 100 : NaN;
    const minEx = (!isNaN(trD) && !isNaN(teD)) ? Math.min(trD - bTr, teD - bTe) : NaN;
    const flag = (!isNaN(trD) && trD >= 65 && !isNaN(teD) && teD >= 65) ? "★" :
                 (!isNaN(teD) && teD >= 65) ? "●" : "";
    console.log(
      `  ${("≤ " + thr).padEnd(10)}` +
      ` ${isNaN(trD) ? "    N/A" : (trD.toFixed(1)+"%").padStart(7)}` +
      ` (${String(trS.length).padStart(3)})` +
      ` ${isNaN(teD) ? "    N/A" : (teD.toFixed(1)+"%").padStart(7)}` +
      ` (${String(teS.length).padStart(3)})` +
      ` ${isNaN(minEx) ? "    N/A" : (fmt(minEx)+"pt").padStart(7)} ${flag}`
    );
  }
  console.log();
}

// ── Study 12: "Pause high" regime — Fed giữ cao — có giá trị không? ──────
function study12() {
  console.log("════ Study 12: Pause-high regime — Fed giữ cao sau hiking ════\n");
  console.log("  (ví dụ: 2023-2024 Fed giữ 5.25–5.5% — có nên tin sell signal không?)\n");

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const bAll = valid.filter(p => p.returns[h]! < 0).length / valid.length * 100;
  const sigs = valid.filter(p => recompute(p, BEST_W) <= BEST_THR);

  // Pause high = rate > 3.0% VÀ không tăng 6 tháng qua (±0.1%)
  const pauseHigh = (d: string): boolean => {
    const now = fedAtDate(d);
    const ago6 = fedNMonthsAgo(d, 6);
    if (now === null || ago6 === null) return false;
    return now >= 3.0 && Math.abs(now - ago6) < 0.25;
  };

  // Cutting = rate giảm 3 tháng
  const cutting = (d: string): boolean => {
    const now = fedAtDate(d);
    const ago3 = fedNMonthsAgo(d, 3);
    if (now === null || ago3 === null) return false;
    return now < ago3 - 0.1;
  };

  // Near zero = rate < 0.5%
  const nearZero = (d: string): boolean => {
    const now = fedAtDate(d);
    return now !== null && now < 0.5;
  };

  const groups: [string, (d: string) => boolean][] = [
    ["Hiking (regime B: +0.25/6m)", regimeB],
    ["Pause high (rate≥3%, stable)", pauseHigh],
    ["Cutting (rate giảm 3m)",       cutting],
    ["Near zero (rate < 0.5%)",       nearZero],
  ];

  console.log(`  Baseline: ${bAll.toFixed(1)}% | Tổng sell signals: ${sigs.length}\n`);
  console.log(`  ${"Regime".padEnd(32)} ${"% ngày".padStart(8)} ${"Sell acc".padStart(10)} ${"n".padStart(4)} ${"vs baseline".padStart(12)}`);
  for (const [name, fn] of groups) {
    const inDays = valid.filter(p => fn(p.date));
    const inBase = inDays.filter(p => p.returns[h]! < 0).length / (inDays.length || 1) * 100;
    const inSigs = sigs.filter(p => fn(p.date));
    const inDown = inSigs.length ? inSigs.filter(p => p.returns[h]! < 0).length / inSigs.length * 100 : NaN;
    const excess = !isNaN(inDown) ? inDown - inBase : NaN;
    console.log(
      `  ${name.padEnd(32)}` +
      ` ${(inDays.length / valid.length * 100).toFixed(0).padStart(7)}%` +
      ` ${isNaN(inDown) ? "     N/A  " : (inDown.toFixed(1)+"%").padStart(10)}` +
      ` ${String(inSigs.length).padStart(4)}` +
      ` ${isNaN(excess) ? "         N/A" : (fmt(excess)+"pp").padStart(12)}`
    );
  }
  console.log();
}

// ── Study 13: Kết quả cuối — Sell signal + regime gate ────────────────────
function study13(bestFn: RegimeFn, fnName: string, bestThr: number) {
  console.log(`════ Study 13: Kết quả cuối — Sell signal gated by ${fnName} ════\n`);

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const train = valid.filter(p => p.date < SPLIT);
  const test  = valid.filter(p => p.date >= SPLIT);
  const bTr = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTe = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  // Gated sell signal
  const trGated = train.filter(p => recompute(p, BEST_W) <= bestThr && bestFn(p.date));
  const teGated = test.filter(p => recompute(p, BEST_W) <= bestThr && bestFn(p.date));
  const trD = trGated.length ? trGated.filter(p => p.returns[h]! < 0).length / trGated.length * 100 : NaN;
  const teD = teGated.length ? teGated.filter(p => p.returns[h]! < 0).length / teGated.length * 100 : NaN;
  const minEx = (!isNaN(trD) && !isNaN(teD)) ? Math.min(trD - bTr, teD - bTe) : NaN;

  console.log(`  Cấu hình: KT=0/TK=40/VM=50/MOM=10, ngưỡng ${bestThr}, gated by ${fnName}`);
  console.log(`  Baseline:  train ${bTr.toFixed(1)}% / test ${bTe.toFixed(1)}%`);
  console.log(`  Kết quả:   train ${isNaN(trD)?'N/A':trD.toFixed(1)+'%'} (n=${trGated.length}) / test ${isNaN(teD)?'N/A':teD.toFixed(1)+'%'} (n=${teGated.length})`);
  console.log(`  Min-excess: ${isNaN(minEx)?'N/A':fmt(minEx)+'pt'}`);

  // Cho thấy signal hiện bắn trong chế độ nào
  console.log("\n  Phân phối tín hiệu theo regime hiện tại:");
  const recentSigs = valid.filter(p => p.date >= "2023-01-01" && recompute(p, BEST_W) <= bestThr);
  const recentGated = recentSigs.filter(p => bestFn(p.date));
  const recentBlocked = recentSigs.filter(p => !bestFn(p.date));
  console.log(`  Tín hiệu bán 2023-2026: ${recentSigs.length} tổng`);
  console.log(`    → Được hiển thị (IN regime): ${recentGated.length}`);
  console.log(`    → Bị chặn (OUT regime):      ${recentBlocked.length}`);
  if (recentGated.length) {
    const acc = recentGated.filter(p => p.returns[h]! < 0).length / recentGated.length * 100;
    console.log(`    → Accuracy khi hiển thị: ${acc.toFixed(1)}%`);
  }
  if (recentBlocked.length) {
    const wouldBeAcc = recentBlocked.filter(p => p.returns[h]! < 0).length / recentBlocked.length * 100;
    console.log(`    → Accuracy nếu không chặn: ${wouldBeAcc.toFixed(1)}% (đây là false positive bị giữ lại)`);
  }

  console.log(`\n  Chế độ Fed hiện tại (${valid[valid.length-1].date}):`);
  const lastDate = valid[valid.length-1].date;
  const nowRate = fedAtDate(lastDate);
  const ago3 = fedNMonthsAgo(lastDate, 3);
  const ago6 = fedNMonthsAgo(lastDate, 6);
  const ago12 = fedNMonthsAgo(lastDate, 12);
  console.log(`    Fed funds: ${nowRate?.toFixed(2)}% | -3m: ${ago3?.toFixed(2)}% | -6m: ${ago6?.toFixed(2)}% | -12m: ${ago12?.toFixed(2)}%`);
  console.log(`    Regime gate (${fnName}): ${bestFn(lastDate) ? "HIKING → sell signal ACTIVE" : "NOT HIKING → sell signal SUPPRESSED"}`);

  console.log("\n  Đánh giá tổng thể:");
  const quality = !isNaN(minEx) && minEx >= 20 ? "ĐỦ MẠNH ✓✓" :
                  !isNaN(minEx) && minEx >= 10 ? "THAM KHẢO ĐƯỢC ✓" : "YẾU ✗";
  console.log(`    ${quality} | min-excess ${isNaN(minEx)?'N/A':fmt(minEx)+'pt'} | train ${isNaN(trD)?'N/A':trD.toFixed(1)+'%'} | test ${isNaN(teD)?'N/A':teD.toFixed(1)+'%'}`);
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log(`Dữ liệu: ${pts.length} điểm (${pts[0].date}..${pts[pts.length-1].date})`);
  console.log(`Fed data: ${fedRaw.length} tháng (${fedRaw[0].date}..${fedRaw[fedRaw.length-1].date})\n`);

  study10();
  // Dựa trên study 10, chọn định nghĩa tốt nhất để đi tiếp
  // (sẽ update sau khi xem kết quả — dùng C làm default)
  study11(regimeC, "C: +0.5%/12m");
  study12();

  // Chọn threshold tốt nhất từ study 11 (sẽ cập nhật sau khi xem kết quả)
  study13(regimeC, "C: +0.5%/12m", BEST_THR);
}
main();
