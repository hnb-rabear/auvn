/**
 * Validate tín hiệu premium_streak và sjc_momentum:
 * 1. Premium cao (≥p80) liên tục N ngày → lợi suất SJC 21/42 ngày tới
 * 2. SJC tăng >10% trong 21 ngày + premium cao → kết hợp có mạnh hơn không?
 * 3. Tìm threshold tối ưu cho streak (11 hay 15 hay 20 ngày?)
 *
 * Chạy: npx tsx scripts/premium-streak-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VnGoldEntry } from "../src/lib/types";
import { median } from "../src/lib/indicators";

const history: VnGoldEntry[] = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "history", "vn-gold.json"), "utf8")
);
const days = history.filter((e) => e.sjcSell !== null && e.premiumPct !== null);

function trailingPercentile(i: number, window = 180): number | null {
  const from = Math.max(0, i - window);
  if (i - from < 60) return null;
  const hist = days.slice(from, i).map((e) => e.premiumPct!);
  const cur = days[i].premiumPct!;
  return (hist.filter((v) => v < cur).length / hist.length) * 100;
}

function forwardReturn(i: number, calDays: number): number | null {
  const target = new Date(days[i].date).getTime() + calDays * 86400000;
  for (let j = i + 1; j < days.length; j++) {
    if (new Date(days[j].date).getTime() >= target)
      return ((days[j].sjcSell! - days[i].sjcSell!) / days[i].sjcSell!) * 100;
  }
  return null;
}

function computeStreak(i: number, threshold = 80, window = 180, minHist = 60): number {
  const pr = trailingPercentile(i, window);
  if (pr === null || pr < threshold) return 0;
  let streak = 1;
  for (let j = i - 1; j >= 0 && streak < 90; j--) {
    const from = Math.max(0, j - window);
    if (j - from < minHist) break;
    const hist = days.slice(from, j).map((e) => e.premiumPct!);
    const val = days[j].premiumPct!;
    const rank = (hist.filter((v) => v < val).length / hist.length) * 100;
    if (rank < threshold) break;
    streak++;
  }
  return streak;
}

function sjcMom21(i: number): number | null {
  if (i < 21) return null;
  const prev = days[i - 21].sjcSell;
  const cur = days[i].sjcSell;
  if (!prev || !cur) return null;
  return (cur / prev - 1) * 100;
}

function printStats(label: string, rets: number[]) {
  if (!rets.length) return;
  const up = (rets.filter((r) => r > 0).length / rets.length) * 100;
  const down = (rets.filter((r) => r < 0).length / rets.length) * 100;
  const med = median(rets)!;
  console.log(
    `  ${label.padEnd(38)}: n=${String(rets.length).padStart(3)} | %giảm=${down.toFixed(0).padStart(3)}% | %tăng=${up.toFixed(0).padStart(3)}% | trung_vị=${(med >= 0 ? "+" : "") + med.toFixed(1)}%`
  );
}

function main() {
  console.log(
    `dữ liệu: ${days.length} ngày (${days[0]?.date}..${days[days.length - 1]?.date})\n`
  );

  // ── Study 1: Streak thresholds ──
  console.log("════ Study 1: Streak threshold tối ưu (threshold p80, forward 21 ngày) ════");
  const streakBuckets: Record<string, number[]> = {
    "0 ngày (không cao)": [],
    "1–5 ngày": [],
    "6–10 ngày": [],
    "11–15 ngày": [],
    "16–20 ngày": [],
    ">20 ngày": [],
  };
  for (let i = 0; i < days.length; i++) {
    const streak = computeStreak(i);
    const r21 = forwardReturn(i, 21);
    if (r21 === null) continue;
    if (streak === 0) streakBuckets["0 ngày (không cao)"].push(r21);
    else if (streak <= 5) streakBuckets["1–5 ngày"].push(r21);
    else if (streak <= 10) streakBuckets["6–10 ngày"].push(r21);
    else if (streak <= 15) streakBuckets["11–15 ngày"].push(r21);
    else if (streak <= 20) streakBuckets["16–20 ngày"].push(r21);
    else streakBuckets[">20 ngày"].push(r21);
  }
  for (const [k, rets] of Object.entries(streakBuckets)) printStats(k, rets);

  // ── Study 2: Forward 42 ngày ──
  console.log("\n════ Study 2: Forward 42 ngày theo streak ════");
  const s42: Record<string, number[]> = { "1–10 ngày": [], "11–20 ngày": [], ">20 ngày": [] };
  for (let i = 0; i < days.length; i++) {
    const streak = computeStreak(i);
    if (streak === 0) continue;
    const r42 = forwardReturn(i, 42);
    if (r42 === null) continue;
    if (streak <= 10) s42["1–10 ngày"].push(r42);
    else if (streak <= 20) s42["11–20 ngày"].push(r42);
    else s42[">20 ngày"].push(r42);
  }
  for (const [k, rets] of Object.entries(s42)) printStats(k, rets);

  // ── Study 3: Kết hợp streak + SJC momentum ──
  console.log("\n════ Study 3: Streak >15 ngày + SJC momentum (forward 21 ngày) ════");
  const combo: Record<string, number[]> = {
    "streak>15 VÀ SJC +>10%": [],
    "streak>15 VÀ SJC +5..10%": [],
    "streak>15 (SJC ổn định)": [],
    "chỉ SJC +>10% (streak≤5)": [],
    "không có tín hiệu nào": [],
  };
  for (let i = 0; i < days.length; i++) {
    const streak = computeStreak(i);
    const mom = sjcMom21(i);
    const r21 = forwardReturn(i, 21);
    if (r21 === null) continue;
    if (streak > 15 && mom !== null && mom > 10) combo["streak>15 VÀ SJC +>10%"].push(r21);
    else if (streak > 15 && mom !== null && mom > 5) combo["streak>15 VÀ SJC +5..10%"].push(r21);
    else if (streak > 15) combo["streak>15 (SJC ổn định)"].push(r21);
    else if (streak <= 5 && mom !== null && mom > 10) combo["chỉ SJC +>10% (streak≤5)"].push(r21);
    else combo["không có tín hiệu nào"].push(r21);
  }
  for (const [k, rets] of Object.entries(combo)) printStats(k, rets);

  // ── Study 4: Threshold p80 vs p70 vs p75 ──
  console.log("\n════ Study 4: Độ nhạy của ngưỡng percentile (forward 21 ngày, streak >15 ngày) ════");
  for (const thr of [70, 75, 80, 85]) {
    const rets: number[] = [];
    for (let i = 0; i < days.length; i++) {
      const streak = computeStreak(i, thr);
      if (streak <= 15) continue;
      const r = forwardReturn(i, 21);
      if (r !== null) rets.push(r);
    }
    printStats(`ngưỡng p${thr}, streak>15`, rets);
  }

  // ── Tổng kết ──
  console.log("\n════ Tổng kết: Giá trị tín hiệu ════");
  const all21: number[] = [];
  const streakSell21: number[] = [];
  const combined21: number[] = [];
  for (let i = 0; i < days.length; i++) {
    const streak = computeStreak(i);
    const mom = sjcMom21(i);
    const r = forwardReturn(i, 21);
    if (r === null) continue;
    all21.push(r);
    if (streak > 15) streakSell21.push(r);
    if (streak > 15 && mom !== null && mom > 10) combined21.push(r);
  }
  printStats("Baseline (tất cả ngày)", all21);
  printStats("Tín hiệu streak >15 ngày", streakSell21);
  printStats("Tín hiệu streak>15 + SJC>10%", combined21);
  if (streakSell21.length) {
    const base = all21.filter(r => r < 0).length / all21.length * 100;
    const sig = streakSell21.filter(r => r < 0).length / streakSell21.length * 100;
    console.log(`\n  Lợi thế tín hiệu streak: ${(sig - base).toFixed(1)}pp trên baseline`);
  }
}
main();
