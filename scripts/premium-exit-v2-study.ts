/**
 * Premium-exit v2 — nâng cấp bằng chứng "chênh SJC cao = vùng bán VN" từ sơ bộ
 * (gradient 1 lần, không era split, không placebo) lên chuẩn 2-phase của dự án.
 *
 * Grid: trailing window {120, 180} phiên × ngưỡng percentile {70, 80, 90} ×
 * H {21, 42, 63} ngày dương lịch. Tín hiệu = percentile premium (trailing) ≥ thr.
 * Objective: fav-down = P(giá SJC sau H < 0) + excess trung vị so baseline era.
 * Cổng: n ≥ 25 cả hai nửa (chia đôi lịch sử theo thời gian), excess fav-down > 0
 * cả hai nửa, thắng placebo cùng-n (200 draws, p95), CI block-bootstrap fav-down
 * (block = số phiên/H tín hiệu chồng lấn) tách khỏi baseline ở nửa sau.
 *
 * Dữ liệu: public/data/history/vn-gold.json (SJC thật, tự tích + backfill CafeF).
 * Chạy: npx tsx scripts/premium-exit-v2-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blockBootstrapCi, seededRandom, median } from "../src/lib/indicators";
import type { VnGoldEntry } from "../src/lib/types";

const history: VnGoldEntry[] = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "history", "vn-gold.json"), "utf8")
);
const days = history.filter((e) => e.sjcSell !== null && e.premiumPct !== null);

function forwardReturn(i: number, calDays: number): number | null {
  const target = new Date(days[i].date).getTime() + calDays * 86400000;
  for (let j = i + 1; j < days.length; j++) {
    if (new Date(days[j].date).getTime() >= target) {
      return ((days[j].sjcSell! - days[i].sjcSell!) / days[i].sjcSell!) * 100;
    }
  }
  return null;
}

function trailingPercentile(i: number, window: number): number | null {
  const from = Math.max(0, i - window);
  if (i - from < 60) return null;
  const w = days.slice(from, i).map((e) => e.premiumPct!);
  const cur = days[i].premiumPct!;
  return (w.filter((v) => v < cur).length / w.length) * 100;
}

function statsDown(rets: number[]) {
  if (!rets.length) return { n: 0, fav: 0, med: 0 };
  const fav = rets.filter((r) => r < 0).length / rets.length;
  return { n: rets.length, fav, med: median(rets)! };
}

function main() {
  console.log(`tổng ${days.length} ngày SJC (${days[0]?.date} .. ${days[days.length - 1]?.date})`);
  const mid = Math.floor(days.length / 2);
  const splitDate = days[mid].date;
  console.log(`chia đôi era tại ${splitDate} (A: ${mid} ngày, B: ${days.length - mid} ngày)\n`);

  interface Row { i: number; date: string; pct: Record<number, number | null>; ret: Record<number, number | null>; }
  const rows: Row[] = days.map((_, i) => ({
    i,
    date: days[i].date,
    pct: { 120: trailingPercentile(i, 120), 180: trailingPercentile(i, 180) },
    ret: { 21: forwardReturn(i, 21), 42: forwardReturn(i, 42), 63: forwardReturn(i, 63) },
  }));

  const rand = seededRandom(20260710);
  let anyPass = false;

  for (const H of [21, 42, 63]) {
    console.log(`================ H=${H} ngày dương lịch ================`);
    const valid = rows.filter((r) => r.ret[H] !== null);
    const eraA = valid.filter((r) => r.date < splitDate);
    const eraB = valid.filter((r) => r.date >= splitDate);
    const blA = statsDown(eraA.map((r) => r.ret[H] as number));
    const blB = statsDown(eraB.map((r) => r.ret[H] as number));
    console.log(
      `  baseline down: A ${(blA.fav * 100).toFixed(0)}% (n=${blA.n}, med ${blA.med.toFixed(1)}%) | ` +
        `B ${(blB.fav * 100).toFixed(0)}% (n=${blB.n}, med ${blB.med.toFixed(1)}%)`
    );

    for (const win of [120, 180]) {
      for (const thr of [70, 80, 90]) {
        const sigA = eraA.filter((r) => r.pct[win] !== null && (r.pct[win] as number) >= thr);
        const sigB = eraB.filter((r) => r.pct[win] !== null && (r.pct[win] as number) >= thr);
        const sA = statsDown(sigA.map((r) => r.ret[H] as number));
        const sB = statsDown(sigB.map((r) => r.ret[H] as number));
        if (sA.n < 25 || sB.n < 25) {
          console.log(`  win=${win} thr=p${thr}: n không đủ (A ${sA.n}, B ${sB.n})`);
          continue;
        }
        const exA = sA.fav - blA.fav;
        const exB = sB.fav - blB.fav;
        // placebo cùng-n: bốc ngày ngẫu nhiên trong era
        const draw = (pool: Row[], n: number) => {
          const rets: number[] = [];
          for (let k = 0; k < n; k++) rets.push(pool[Math.floor(rand() * pool.length)].ret[H] as number);
          return statsDown(rets).fav;
        };
        const plaA: number[] = [];
        const plaB: number[] = [];
        for (let d = 0; d < 200; d++) { plaA.push(draw(eraA, sA.n)); plaB.push(draw(eraB, sB.n)); }
        const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
        // CI fav-down era B: block ≈ H phiên chồng lấn (ngày giao dịch ~ 5/7 ngày lịch),
        // NHƯNG cap ở n/3 để tránh CI thoái hóa (block ≥ n ⇒ 1 khối = toàn mẫu, CI [x,x]).
        // Cap này LÀM ĐẸP CI hơn thực tế khi n < 3×overlap — đọc kèm số cửa sổ độc lập.
        const overlap = Math.round((H * 5) / 7);
        const block = Math.max(2, Math.min(Math.floor(sigB.length / 3), overlap));
        const indepB = Math.max(1, Math.round(sigB.length / overlap));
        const ciB = blockBootstrapCi(sigB.map((r) => -(r.ret[H] as number)), block);
        const pass = exA > 0 && exB > 0 && sA.fav > p95(plaA) && sB.fav > p95(plaB) && ciB !== null && ciB[0] / 100 > blB.fav;
        if (pass) anyPass = true;
        console.log(
          `  win=${win} thr=p${thr}: A ${(sA.fav * 100).toFixed(0)}% (n=${sA.n}, med ${sA.med.toFixed(1)}%, ex ${(exA * 100).toFixed(1)}pt, pla-p95 ${(p95(plaA) * 100).toFixed(0)}%) | ` +
            `B ${(sB.fav * 100).toFixed(0)}% (n=${sB.n}, med ${sB.med.toFixed(1)}%, ex ${(exB * 100).toFixed(1)}pt, pla-p95 ${(p95(plaB) * 100).toFixed(0)}%) | ` +
            `CI-B [${ciB ? ciB.join(", ") : "—"}] (≈${indepB} cửa sổ độc lập) vs bl ${(blB.fav * 100).toFixed(0)}% → ${pass ? "✓ QUA CỔNG" : "✗"}`
        );
      }
    }
    console.log("");
  }
  console.log(anyPass ? "→ CÓ cấu hình qua đủ cổng — đọc chi tiết phía trên." : "→ KHÔNG cấu hình nào qua đủ cổng 2-phase + placebo + CI.");
}

main();
