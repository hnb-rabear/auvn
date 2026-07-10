/**
 * GSR sell study — tỉ lệ Vàng/Bạc làm tín hiệu BÁN vàng: bạc thường chạy nóng hơn
 * vàng ở cuối sóng tăng (GSR rơi nhanh / xuống thấp so lịch sử) — có báo đỉnh vàng
 * không? Họ factor chưa từng test phía bán (bottom.ts có input gsrCloses nhưng chỉ
 * dùng cho đáy và cũng không được chọn).
 *
 * Tín hiệu thử (past-only, tại ngày i):
 *   - pctl: percentile GSR trailing 252 phiên ≤ {10, 20, 30} (bạc nóng tương đối)
 *   - chg63: GSR thay đổi 63 phiên ≤ {−10%, −15%, −20%} (bạc bứt tốc so vàng)
 *   - AND: pctl ≤ 20 VÀ chg63 ≤ −10%
 * Objective: fav-down = P(XAU sau H < 0), H ∈ {21, 63, 126}.
 * Cổng đủ (học từ sell-preset): n ≥ 25 cả 2 era + excess > 0 cả 2 era + thắng placebo
 * LIỀN-KHỐI cùng cấu trúc run (200 draws) + ≥ 3 cụm độc lập/era (gap > 21 phiên).
 *
 * Chạy: npx tsx scripts/gsr-sell-study.ts
 */
import { fetchXau, fetchSilver } from "./fetch";
import { seededRandom, median } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const WARMUP = 252;
type H = 21 | 63 | 126;
const HS: H[] = [21, 63, 126];

function episodesOf(idxs: number[]): number[][] {
  const eps: number[][] = [];
  let cur: number[] = [];
  let last = -1e9;
  for (const i of idxs) {
    if (i - last > 21 && cur.length) { eps.push(cur); cur = []; }
    cur.push(i);
    last = i;
  }
  if (cur.length) eps.push(cur);
  return eps;
}

async function main() {
  const [xau, silver] = await Promise.all([fetchXau(), fetchSilver()]);
  if (!silver) throw new Error("Không fetch được bạc (SI=F)");
  const dates = xau.bars.map((b) => b.date);
  const gold = xau.bars.map((b) => b.close);
  // ghép bạc theo ngày vàng (forward-fill giá bạc gần nhất ≤ ngày đó)
  const silverByDate = new Map(silver.bars.map((b) => [b.date, b.close]));
  const gsr: (number | null)[] = new Array(dates.length).fill(null);
  let lastAg: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    const ag = silverByDate.get(dates[i]);
    if (ag !== undefined) lastAg = ag;
    gsr[i] = lastAg !== null ? gold[i] / lastAg : null;
  }
  const gsrCov = gsr.filter((v) => v !== null).length;
  console.log(`XAU ${gold.length} bars | bạc ${silver.bars.length} bars (${silver.source}) | GSR phủ ${gsrCov}/${gold.length}`);

  const fwd = (i: number, h: number): number | null =>
    i + h < gold.length ? ((gold[i + h] - gold[i]) / gold[i]) * 100 : null;

  const pctl252 = (i: number): number | null => {
    if (i < WARMUP || gsr[i] === null) return null;
    const w: number[] = [];
    for (let j = i - 252; j < i; j++) if (gsr[j] !== null) w.push(gsr[j] as number);
    if (w.length < 150) return null;
    return (w.filter((v) => v < (gsr[i] as number)).length / w.length) * 100;
  };
  const chg63 = (i: number): number | null => {
    if (i < 63 || gsr[i] === null || gsr[i - 63] === null) return null;
    return (((gsr[i] as number) - (gsr[i - 63] as number)) / (gsr[i - 63] as number)) * 100;
  };

  type Sig = { name: string; fire: (i: number) => boolean };
  const sigs: Sig[] = [];
  for (const p of [10, 20, 30]) sigs.push({ name: `pctl≤${p}`, fire: (i) => { const v = pctl252(i); return v !== null && v <= p; } });
  for (const c of [-10, -15, -20]) sigs.push({ name: `chg63≤${c}%`, fire: (i) => { const v = chg63(i); return v !== null && v <= c; } });
  sigs.push({ name: "pctl≤20 AND chg63≤-10%", fire: (i) => { const p = pctl252(i); const c = chg63(i); return p !== null && c !== null && p <= 20 && c <= -10; } });

  const statsDown = (rets: number[]) => {
    if (!rets.length) return { n: 0, fav: 0, med: 0 };
    return { n: rets.length, fav: rets.filter((r) => r < 0).length / rets.length, med: median(rets)! };
  };

  for (const h of HS) {
    console.log(`\n================ H=${h} ================`);
    const validIdx: number[] = [];
    for (let i = WARMUP; i < gold.length; i++) if (fwd(i, h) !== null) validIdx.push(i);
    const trIdx = validIdx.filter((i) => dates[i] < SPLIT);
    const teIdx = validIdx.filter((i) => dates[i] >= SPLIT);
    const blTr = statsDown(trIdx.map((i) => fwd(i, h) as number));
    const blTe = statsDown(teIdx.map((i) => fwd(i, h) as number));
    console.log(`  baseline down: train ${(blTr.fav * 100).toFixed(0)}% (n=${blTr.n}) | test ${(blTe.fav * 100).toFixed(0)}% (n=${blTe.n})`);

    for (const sig of sigs) {
      const res: string[] = [];
      let passAll = true;
      for (const [era, idxsEra, bl] of [["train", trIdx, blTr], ["test", teIdx, blTe]] as const) {
        const fired = idxsEra.filter((i) => sig.fire(i));
        if (fired.length < 25) { res.push(`${era}: n=${fired.length} <25`); passAll = false; continue; }
        const s = statsDown(fired.map((i) => fwd(i, h) as number));
        const eps = episodesOf(fired);
        // placebo liền khối cùng cấu trúc
        const rand = seededRandom(20260711 + h);
        const pla: number[] = [];
        for (let d = 0; d < 200; d++) {
          let fav = 0, tot = 0;
          for (const e of eps) {
            const L = e.length;
            const start = Math.floor(rand() * Math.max(1, idxsEra.length - L));
            const run = idxsEra.slice(start, start + L);
            fav += run.filter((i) => (fwd(i, h) as number) < 0).length;
            tot += run.length;
          }
          pla.push(fav / tot);
        }
        const p95 = [...pla].sort((a, b) => a - b)[Math.floor(pla.length * 0.95)];
        const ok = s.fav > bl.fav && s.fav > p95 && eps.length >= 3;
        if (!ok) passAll = false;
        res.push(
          `${era}: ${(s.fav * 100).toFixed(0)}% (n=${s.n}/${eps.length} cụm, med ${s.med.toFixed(1)}%, bl ${(bl.fav * 100).toFixed(0)}%, pla-khối p95 ${(p95 * 100).toFixed(0)}%)${ok ? "✓" : "✗"}`
        );
      }
      console.log(`  ${sig.name.padEnd(24)} ${res.join(" | ")} → ${passAll ? "✓ QUA CỔNG" : "✗"}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
