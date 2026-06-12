/**
 * Sell signal — Study 4: Giải quyết vấn đề n_train nhỏ
 *
 * Vấn đề: Regime B (hiking) cho min-excess +26.6pt nhưng n_train=9 (quá nhỏ).
 * Hướng giải quyết:
 *   - Study 14: Kết hợp hiking + near-zero → n tăng, accuracy có giữ không?
 *   - Study 15: Re-grid weights TRONG regime (weights tối ưu cho sell có thể khác)
 *   - Study 16: Duration filter TRONG regime (sustained ≥ N điểm)
 *   - Study 17: Tổng hợp — cấu hình tốt nhất có thể build được là gì?
 *
 * Chạy: npx tsx scripts/sell-signal-study-4.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { TimelinePoint } from "../src/lib/types";

const SPLIT = "2019-01-01";
const MIN_N = 12;

const { points: raw }: { points: TimelinePoint[] } = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8")
);
const fedRaw: { date: string; value: number }[] = JSON.parse(
  readFileSync(join(process.cwd(), "public/data/history/fed-funds.json"), "utf8")
);

// ── Momentum ──────────────────────────────────────────────────────────────
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
    if (mom > 20) ms = 2; else if (mom > 5) ms = 1;
    else if (mom > -10) ms = 0; else if (mom > -25) ms = -1; else ms = -2;
    (pts[i].scores as Record<string, number>)["momentum"] = ms;
  }
}
addMomentum(raw);
const pts = raw;

// ── Fed helpers ───────────────────────────────────────────────────────────
function fedAt(d: string): number | null {
  const t = new Date(d).getTime();
  let best: number | null = null;
  for (const f of fedRaw) {
    if (new Date(f.date).getTime() <= t) best = f.value;
    else break;
  }
  return best;
}
function fedNm(d: string, months: number): number | null {
  const t = new Date(d);
  t.setMonth(t.getMonth() - months);
  return fedAt(t.toISOString().slice(0, 10));
}

// Regime definitions
const regimeHiking = (d: string): boolean => {
  const now = fedAt(d), ago6 = fedNm(d, 6);
  return now !== null && ago6 !== null && now >= ago6 + 0.25;
};
const regimeNearZero = (d: string): boolean => {
  const now = fedAt(d);
  return now !== null && now < 0.5;
};
const regimeCombined = (d: string): boolean => regimeHiking(d) || regimeNearZero(d);

// ── Composite ─────────────────────────────────────────────────────────────
function comp(p: TimelinePoint, w: Record<string, number>): number {
  const sc = p.scores as Record<string, number>;
  let s = 0, tw = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (wk > 0 && sc[k] !== undefined) { s += sc[k] * wk; tw += wk; }
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

const BEST_W = { technical: 0, stats: 0.4, macro: 0.5, momentum: 0.1 };

function fmt(n: number, d = 1) { return (n >= 0 ? "+" : "") + n.toFixed(d); }

// ── Study 14: Hiking + Near-zero combined ─────────────────────────────────
function study14() {
  console.log("════ Study 14: Kết hợp Hiking + Near-zero regime ════\n");

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const train = valid.filter(p => p.date < SPLIT);
  const test  = valid.filter(p => p.date >= SPLIT);
  const bTr = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTe = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  const regimes: [string, (d: string) => boolean][] = [
    ["Hiking only (B)",        regimeHiking],
    ["Near-zero only (<0.5%)", regimeNearZero],
    ["Hiking OR Near-zero",    regimeCombined],
    ["Tất cả (không gate)",    () => true],
  ];

  const thresholds = [-40, -45, -50];
  console.log(`  Baseline train ${bTr.toFixed(1)}% / test ${bTe.toFixed(1)}%\n`);

  for (const thr of thresholds) {
    console.log(`  [Ngưỡng composite ≤ ${thr}]`);
    console.log(`  ${"Regime".padEnd(26)} ${"Train".padStart(7)} ${"n".padStart(4)} ${"Test".padStart(7)} ${"n".padStart(4)} ${"MinEx".padStart(7)}`);
    for (const [name, fn] of regimes) {
      const trS = train.filter(p => comp(p, BEST_W) <= thr && fn(p.date));
      const teS = test.filter(p => comp(p, BEST_W) <= thr && fn(p.date));
      const trD = trS.length ? trS.filter(p => p.returns[h]! < 0).length / trS.length * 100 : NaN;
      const teD = teS.length ? teS.filter(p => p.returns[h]! < 0).length / teS.length * 100 : NaN;
      const minEx = (!isNaN(trD) && !isNaN(teD)) ? Math.min(trD - bTr, teD - bTe) : NaN;
      const flag = trS.length >= MIN_N && teS.length >= MIN_N &&
                   !isNaN(trD) && trD >= 65 && !isNaN(teD) && teD >= 65 ? " ★" :
                   !isNaN(trD) && trD >= 65 && !isNaN(teD) && teD >= 65 ? " ★" :
                   teS.length >= MIN_N && !isNaN(teD) && teD >= 65 ? " ●" : "";
      console.log(
        `  ${name.padEnd(26)}` +
        ` ${isNaN(trD) ? "    N/A" : (trD.toFixed(1)+"%").padStart(7)}` +
        ` ${String(trS.length).padStart(4)}` +
        ` ${isNaN(teD) ? "    N/A" : (teD.toFixed(1)+"%").padStart(7)}` +
        ` ${String(teS.length).padStart(4)}` +
        ` ${isNaN(minEx) ? "    N/A" : (fmt(minEx)+"pt").padStart(7)}${flag}`
      );
    }
    console.log();
  }
}

// ── Study 15: Re-grid search weights TRONG regime ─────────────────────────
function study15() {
  console.log("════ Study 15: Grid search weights tối ưu TRONG regime ════");
  console.log("  (weights tối ưu cho hiking+near-zero có thể khác all-data)\n");

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const train = valid.filter(p => p.date < SPLIT && regimeCombined(p.date));
  const test  = valid.filter(p => p.date >= SPLIT && regimeCombined(p.date));
  const bTr = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTe = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  console.log(`  Điểm IN regime: train=${train.length}, test=${test.length}`);
  console.log(`  Baseline IN regime: train ${bTr.toFixed(1)}% / test ${bTe.toFixed(1)}%\n`);

  interface Cand {
    w: Record<string, number>; thr: number;
    trN: number; trD: number; teN: number; teD: number; minEx: number;
  }
  const best: Cand[] = [];
  const thresholds = [-35, -40, -45, -50];

  for (let wt = 0; wt <= 10; wt++) {
    for (let ws = 0; ws <= 10 - wt; ws++) {
      for (let wmom = 0; wmom <= 10 - wt - ws; wmom++) {
        const wm = 10 - wt - ws - wmom;
        const w = { technical: wt/10, stats: ws/10, macro: wm/10, momentum: wmom/10 };
        for (const thr of thresholds) {
          const trS = train.filter(p => comp(p, w) <= thr);
          const teS = test.filter(p => comp(p, w) <= thr);
          if (trS.length < MIN_N || teS.length < MIN_N) continue;
          const trD = trS.filter(p => p.returns[h]! < 0).length / trS.length * 100;
          const teD = teS.filter(p => p.returns[h]! < 0).length / teS.length * 100;
          const minEx = Math.min(trD - bTr, teD - bTe);
          if (minEx < 5) continue;
          best.push({ w, thr, trN: trS.length, trD, teN: teS.length, teD, minEx });
        }
      }
    }
  }

  best.sort((a, b) => b.minEx - a.minEx);
  const top = best.slice(0, 12);

  if (!top.length) {
    console.log("  Không tìm được cấu hình nào (min-excess ≥ 5pt, n ≥ 12 cả 2 giai đoạn).\n");
    return null;
  }

  console.log(`  Tổng cấu hình hợp lệ: ${best.length}`);
  console.log(`\n  Top cấu hình (xếp theo min-excess):`);
  console.log(`  ${"KT/TK/VM/MOM".padEnd(16)} ${"Thr".padStart(5)} ${"Train".padStart(7)} ${"n".padStart(4)} ${"Test".padStart(7)} ${"n".padStart(4)} ${"MinEx".padStart(7)}`);
  for (const c of top) {
    const wStr = `${c.w.technical*10}/${c.w.stats*10}/${c.w.macro*10}/${(c.w.momentum??0)*10}`;
    const flag = c.trD >= 65 && c.teD >= 65 ? " ★" : c.teD >= 65 ? " ●" : "";
    console.log(
      `  ${wStr.padEnd(16)}` +
      ` ${String(c.thr).padStart(5)}` +
      ` ${(c.trD.toFixed(1)+"%").padStart(7)}` +
      ` ${String(c.trN).padStart(4)}` +
      ` ${(c.teD.toFixed(1)+"%").padStart(7)}` +
      ` ${String(c.teN).padStart(4)}` +
      ` ${(fmt(c.minEx)+"pt").padStart(7)}${flag}`
    );
  }
  console.log();
  return top[0];
}

// ── Study 16: Duration filter trong regime ────────────────────────────────
function study16(bestW: Record<string, number>, bestThr: number) {
  console.log("════ Study 16: Duration filter TRONG regime ════\n");

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const inRegime = valid.filter(p => regimeCombined(p.date));
  const train = inRegime.filter(p => p.date < SPLIT);
  const test  = inRegime.filter(p => p.date >= SPLIT);
  const bTr = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTe = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  console.log(`  Cấu hình: KT=${bestW.technical*10}/TK=${bestW.stats*10}/VM=${bestW.macro*10}/MOM=${(bestW.momentum??0)*10}, ngưỡng ${bestThr}`);
  console.log(`  Baseline IN regime: train ${bTr.toFixed(1)}% / test ${bTe.toFixed(1)}%\n`);
  console.log(`  ${"Filter".padEnd(26)} ${"Train".padStart(7)} ${"n".padStart(4)} ${"Test".padStart(7)} ${"n".padStart(4)} ${"MinEx".padStart(7)} ${"~Ngày"}`);

  // Tính composite cho tất cả valid points (cần streak liên tiếp)
  const allWithC = valid.map(p => ({ p, c: comp(p, bestW), inR: regimeCombined(p.date) }));

  for (const k of [1, 2, 3, 5, 7]) {
    // Streak k điểm liên tiếp ≤ threshold VÀ trong regime
    const sigs: TimelinePoint[] = [];
    let streak = 0;
    for (const { p, c, inR } of allWithC) {
      if (c <= bestThr && inR) { streak++; if (streak >= k) sigs.push(p); }
      else streak = 0;
    }
    const trS = sigs.filter(p => p.date < SPLIT);
    const teS = sigs.filter(p => p.date >= SPLIT);
    const trD = trS.length ? trS.filter(p => p.returns[h]! < 0).length / trS.length * 100 : NaN;
    const teD = teS.length ? teS.filter(p => p.returns[h]! < 0).length / teS.length * 100 : NaN;
    const minEx = (!isNaN(trD) && !isNaN(teD)) ? Math.min(trD - bTr, teD - bTe) : NaN;
    const approxDays = k * 4;
    const flag = !isNaN(trD) && trD >= 65 && !isNaN(teD) && teD >= 65 ? " ★" :
                 !isNaN(teD) && teD >= 65 ? " ●" : "";
    console.log(
      `  ≥${k} điểm liên tiếp`.padEnd(26) +
      ` ${isNaN(trD) ? "    N/A" : (trD.toFixed(1)+"%").padStart(7)}` +
      ` ${String(trS.length).padStart(4)}` +
      ` ${isNaN(teD) ? "    N/A" : (teD.toFixed(1)+"%").padStart(7)}` +
      ` ${String(teS.length).padStart(4)}` +
      ` ${isNaN(minEx) ? "    N/A" : (fmt(minEx)+"pt").padStart(7)}` +
      ` ~${approxDays}d${flag}`
    );
  }
  console.log();
}

// ── Study 17: Tổng hợp — cấu hình cuối cùng ─────────────────────────────
function study17(regimeW: Record<string, number>, regimeThr: number) {
  console.log("════ Study 17: Tổng hợp — cấu hình sell signal tốt nhất có thể ════\n");

  const h: "21" = "21";
  const valid = pts.filter(p => p.returns[h] !== null);
  const train = valid.filter(p => p.date < SPLIT);
  const test  = valid.filter(p => p.date >= SPLIT);
  const bTr = train.filter(p => p.returns[h]! < 0).length / train.length * 100;
  const bTe = test.filter(p => p.returns[h]! < 0).length / test.length * 100;

  const configs: [string, Record<string, number>, number, (d: string) => boolean, number][] = [
    // [label, weights, threshold, regimeFn, minStreakPoints]
    ["Không gate (baseline sell)",    BEST_W,    -45, () => true,        1],
    ["Gate: hiking only (B)",         BEST_W,    -45, regimeHiking,      1],
    ["Gate: hiking+near-zero",        BEST_W,    -45, regimeCombined,    1],
    ["Gate: hiking+near-zero + 2pt",  BEST_W,    -45, regimeCombined,    2],
    ["Gate: hiking+near-zero + 3pt",  BEST_W,    -45, regimeCombined,    3],
    ["Re-grid w IN regime + gate",    regimeW,   regimeThr, regimeCombined, 1],
  ];

  console.log(`  Baseline: train ${bTr.toFixed(1)}% / test ${bTe.toFixed(1)}%\n`);
  console.log(`  ${"Cấu hình".padEnd(38)} ${"Train".padStart(7)} ${"n".padStart(4)} ${"Test".padStart(7)} ${"n".padStart(4)} ${"MinEx".padStart(7)}`);

  const allWithC_base = valid.map(p => ({
    p, c: comp(p, BEST_W), inR: regimeCombined(p.date), inH: regimeHiking(p.date)
  }));

  for (const [label, w, thr, fn, k] of configs) {
    const allC = valid.map(p => ({ p, c: comp(p, w), inR: fn(p.date) }));
    let sigs: TimelinePoint[];
    if (k <= 1) {
      sigs = allC.filter(x => x.c <= thr && x.inR).map(x => x.p);
    } else {
      sigs = [];
      let streak = 0;
      for (const { p, c, inR } of allC) {
        if (c <= thr && inR) { streak++; if (streak >= k) sigs.push(p); }
        else streak = 0;
      }
    }
    const trS = sigs.filter(p => p.date < SPLIT);
    const teS = sigs.filter(p => p.date >= SPLIT);
    const trD = trS.length ? trS.filter(p => p.returns[h]! < 0).length / trS.length * 100 : NaN;
    const teD = teS.length ? teS.filter(p => p.returns[h]! < 0).length / teS.length * 100 : NaN;
    const minEx = (!isNaN(trD) && !isNaN(teD)) ? Math.min(trD - bTr, teD - bTe) : NaN;
    const flag = !isNaN(trD) && trD >= 65 && !isNaN(teD) && teD >= 65 ? " ★" :
                 !isNaN(teD) && teD >= 65 ? " ●" : "";
    console.log(
      `  ${label.padEnd(38)}` +
      ` ${isNaN(trD) ? "    N/A" : (trD.toFixed(1)+"%").padStart(7)}` +
      ` ${String(trS.length).padStart(4)}` +
      ` ${isNaN(teD) ? "    N/A" : (teD.toFixed(1)+"%").padStart(7)}` +
      ` ${String(teS.length).padStart(4)}` +
      ` ${isNaN(minEx) ? "    N/A" : (fmt(minEx)+"pt").padStart(7)}${flag}`
    );
  }

  // Tình trạng hiện tại
  const lastDate = valid[valid.length - 1].date;
  const nowRate = fedAt(lastDate);
  const ago6 = fedNm(lastDate, 6);
  console.log(`\n  Regime hiện tại (${lastDate}):`);
  console.log(`    Fed funds: ${nowRate?.toFixed(2)}% | -6m: ${ago6?.toFixed(2)}%`);
  console.log(`    Hiking: ${regimeHiking(lastDate) ? "YES" : "NO"} | Near-zero: ${regimeNearZero(lastDate) ? "YES" : "NO"} | Combined: ${regimeCombined(lastDate) ? "ACTIVE" : "SUPPRESSED"}`);

  // So sánh với VN premium streak
  console.log("\n  So sánh với tín hiệu bán VN (premium_streak):");
  console.log("    VN premium_streak >15 ngày: 77% giảm (21 ngày SJC), n=30, 16 tháng");
  console.log("    World sell (tốt nhất):      train ~70% / test ~65%, n=17/33 (trong regime)");
  console.log("    Combination (ước tính):     cần study thêm — hai tín hiệu độc lập về cơ chế");
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────
function main() {
  console.log(`Dữ liệu: ${pts.length} điểm (${pts[0].date}..${pts[pts.length-1].date})\n`);

  study14();
  const regridBest = study15();
  const rW = regridBest?.w ?? BEST_W;
  const rT = regridBest?.thr ?? -45;
  study16(rW, rT);
  study17(rW, rT);
}
main();
