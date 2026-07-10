/**
 * Sell-timing v3 — robustness cho ứng viên duy nhất qua cổng v2: zscore(10, k=2)
 * ("cần bán trong cửa sổ H: bán ở phiên đầu tiên giá ≥ 2σ trên trung bình 10 phiên,
 * không có thì bán cuối cửa sổ").
 *
 * Kiểm tra: (a) dịch pha neo 0/+7/+14 phiên (kết quả không được phụ thuộc cách đặt
 * lưới neo); (b) H=42 (người bán có 2 tháng); (c) lân cận tham số (window 10/21 ×
 * k 1.5/2/2.5). Mỗi ô báo ΔNow (CI), ΔEnd, meanPos test.
 *
 * Chạy: npx tsx scripts/sell-timing-study3.ts
 */
import { fetchXau } from "./fetch";
import { rangePos } from "../src/lib/dca-window";
import { pairedBlockBootstrapCi, seededRandom } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const WARMUP = 252;

function zscoreHit(closes: number[], i: number, W: number, k: number): boolean {
  if (i + 1 < W) return false;
  const w = closes.slice(i + 1 - W, i + 1);
  const mean = w.reduce((a, b) => a + b, 0) / W;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / W);
  if (sd === 0) return false;
  return (closes[i] - mean) / sd >= k;
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  for (const H of [21, 42]) {
    console.log(`\n================ H=${H} ================`);
    for (const offset of [0, 7, 14]) {
      const anchors: number[] = [];
      for (let t = WARMUP + offset; t + H < closes.length; t += H) anchors.push(t);
      const trA = anchors.filter((t) => dates[t] < SPLIT);
      const teA = anchors.filter((t) => dates[t] >= SPLIT);
      const rand = seededRandom(20260710 + offset + H);

      const baseNow = new Map<number, number>();
      const baseEnd = new Map<number, number>();
      const basePla = new Map<number, number>();
      for (const t of anchors) {
        let lo = Infinity, hi = -Infinity;
        for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
        baseNow.set(t, rangePos(closes[t], lo, hi));
        baseEnd.set(t, rangePos(closes[t + H], lo, hi));
        basePla.set(t, rangePos(closes[t + Math.floor(rand() * (H + 1))], lo, hi));
      }

      const block = 4;
      const run = (A: number[], W: number, k: number) => {
        const dNow: number[] = [], dEnd: number[] = [], dPla: number[] = [], pos: number[] = [];
        for (const t of A) {
          let lo = Infinity, hi = -Infinity;
          for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
          let sellIdx = t + H;
          for (let i = t; i <= t + H; i++) if (zscoreHit(closes, i, W, k)) { sellIdx = i; break; }
          const p = rangePos(closes[sellIdx], lo, hi);
          pos.push(p);
          dNow.push(p - baseNow.get(t)!);
          dEnd.push(p - baseEnd.get(t)!);
          dPla.push(p - basePla.get(t)!);
        }
        return {
          n: pos.length,
          meanPos: mean(pos),
          dNow: mean(dNow),
          ciNow: pairedBlockBootstrapCi(dNow, block),
          dEnd: mean(dEnd),
          dPla: mean(dPla),
        };
      };

      for (const [W, k] of [[10, 2]] as const) {
        const tr = run(trA, W, k);
        const te = run(teA, W, k);
        const pass =
          tr.dNow > 0 && te.dNow > 0 && tr.dPla > 0 && te.dPla > 0 && tr.dEnd > 0 && te.dEnd > 0 &&
          tr.ciNow && tr.ciNow[0] > 0 && te.ciNow && te.ciNow[0] > 0;
        console.log(
          `offset+${offset} z(${W},${k}): refs now ${mean(trA.map((t) => baseNow.get(t)!)).toFixed(2)}/${mean(teA.map((t) => baseNow.get(t)!)).toFixed(2)} end ${mean(trA.map((t) => baseEnd.get(t)!)).toFixed(2)}/${mean(teA.map((t) => baseEnd.get(t)!)).toFixed(2)} | ` +
            `tr ΔNow +${tr.dNow.toFixed(3)} (CI ${tr.ciNow?.map((x) => x.toFixed(3)).join("..")}) ΔEnd ${tr.dEnd >= 0 ? "+" : ""}${tr.dEnd.toFixed(3)} | ` +
            `te ΔNow +${te.dNow.toFixed(3)} (CI ${te.ciNow?.map((x) => x.toFixed(3)).join("..")}) ΔEnd ${te.dEnd >= 0 ? "+" : ""}${te.dEnd.toFixed(3)} pos ${te.meanPos.toFixed(3)} → ${pass ? "✓" : "✗"}`
        );
      }
    }
    // lân cận tham số ở offset 0
    console.log(`  lân cận (offset 0):`);
    const anchors: number[] = [];
    for (let t = WARMUP; t + H < closes.length; t += H) anchors.push(t);
    const trA = anchors.filter((t) => dates[t] < SPLIT);
    const teA = anchors.filter((t) => dates[t] >= SPLIT);
    const baseNow = new Map<number, number>();
    const baseEnd = new Map<number, number>();
    for (const t of anchors) {
      let lo = Infinity, hi = -Infinity;
      for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
      baseNow.set(t, rangePos(closes[t], lo, hi));
      baseEnd.set(t, rangePos(closes[t + H], lo, hi));
    }
    for (const [W, k] of [[10, 1.5], [10, 2.5], [21, 1.5], [21, 2], [21, 2.5]] as const) {
      const run = (A: number[]) => {
        const dNow: number[] = [], dEnd: number[] = [];
        for (const t of A) {
          let lo = Infinity, hi = -Infinity;
          for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
          let sellIdx = t + H;
          for (let i = t; i <= t + H; i++) if (zscoreHit(closes, i, W, k)) { sellIdx = i; break; }
          const p = rangePos(closes[sellIdx], lo, hi);
          dNow.push(p - baseNow.get(t)!);
          dEnd.push(p - baseEnd.get(t)!);
        }
        return { dNow: mean(dNow), dEnd: mean(dEnd) };
      };
      const tr = run(trA);
      const te = run(teA);
      console.log(
        `    z(${W},${k}): tr ΔNow +${tr.dNow.toFixed(3)} ΔEnd ${tr.dEnd >= 0 ? "+" : ""}${tr.dEnd.toFixed(3)} | te ΔNow +${te.dNow.toFixed(3)} ΔEnd ${te.dEnd >= 0 ? "+" : ""}${te.dEnd.toFixed(3)}`
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
