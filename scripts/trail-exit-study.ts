/**
 * Trailing-exit study — người giữ vàng KHÔNG deadline gắt, muốn bán "trong ~3-6-12
 * tháng tới": trailing-stop ratchet (bán khi giá rơi y% từ đỉnh chạy kể từ ngày quyết
 * định) có đưa điểm bán lên cao hơn trong range cửa sổ H-phiên-tới so với bán-ngay /
 * bán-cuối / placebo không? Mở rộng sell-timing-study (H=21 đã đo) lên H ∈ {63,126,252}
 * — kỳ vọng thấp (uptrend → cứ chờ thường thắng) nhưng chưa từng đo.
 *
 * Cổng: ΔNow > 0 + CI tách 0 cả 2 era, thắng placebo, và ΔEnd ≥ 0 cả 2 era (nếu thua
 * bán-cuối thì luật vô dụng — cứ chờ hết cửa sổ tốt hơn). Neo mỗi H phiên (không chồng
 * lấn); n nhỏ ở H=252 — đọc kèm n.
 *
 * Chạy: npx tsx scripts/trail-exit-study.ts
 */
import { fetchXau } from "./fetch";
import { rangePos } from "../src/lib/dca-window";
import { pairedBlockBootstrapCi, seededRandom } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const WARMUP = 252;

type Rule =
  | { kind: "trailStop"; y: number }
  | { kind: "zscore"; W: number; k: number };

function hit(closes: number[], i: number, rule: Rule, windowStart: number): boolean {
  if (rule.kind === "trailStop") {
    let hi = -Infinity;
    for (let j = windowStart; j <= i; j++) if (closes[j] > hi) hi = closes[j];
    return closes[i] <= hi * (1 - rule.y / 100);
  }
  const W = rule.W;
  if (i + 1 < W) return false;
  const w = closes.slice(i + 1 - W, i + 1);
  const mean = w.reduce((a, b) => a + b, 0) / W;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / W);
  return sd > 0 && (closes[i] - mean) / sd >= rule.k;
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const rules: Rule[] = [
    { kind: "trailStop", y: 3 },
    { kind: "trailStop", y: 5 },
    { kind: "trailStop", y: 8 },
    { kind: "trailStop", y: 10 },
    { kind: "zscore", W: 10, k: 2 },
    { kind: "zscore", W: 21, k: 2 },
  ];

  for (const H of [63, 126, 252]) {
    const anchors: number[] = [];
    for (let t = WARMUP; t + H < closes.length; t += H) anchors.push(t);
    const trA = anchors.filter((t) => dates[t] < SPLIT);
    const teA = anchors.filter((t) => dates[t] >= SPLIT);
    const rand = seededRandom(20260710 + H);

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
    console.log(
      `\n================ H=${H} (${anchors.length} neo: train ${trA.length}/test ${teA.length}) ================` +
        `\n  refs: now ${mean(trA.map((t) => baseNow.get(t)!)).toFixed(2)}/${mean(teA.map((t) => baseNow.get(t)!)).toFixed(2)} | ` +
        `pla ${mean(trA.map((t) => basePla.get(t)!)).toFixed(2)}/${mean(teA.map((t) => basePla.get(t)!)).toFixed(2)} | ` +
        `end ${mean(trA.map((t) => baseEnd.get(t)!)).toFixed(2)}/${mean(teA.map((t) => baseEnd.get(t)!)).toFixed(2)} (train/test)`
    );

    const run = (A: number[], rule: Rule) => {
      const dNow: number[] = [], dEnd: number[] = [], dPla: number[] = [], pos: number[] = [];
      for (const t of A) {
        let lo = Infinity, hi = -Infinity;
        for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
        let sellIdx = t + H;
        for (let i = t; i <= t + H; i++) if (hit(closes, i, rule, t)) { sellIdx = i; break; }
        const p = rangePos(closes[sellIdx], lo, hi);
        pos.push(p);
        dNow.push(p - baseNow.get(t)!);
        dEnd.push(p - baseEnd.get(t)!);
        dPla.push(p - basePla.get(t)!);
      }
      return {
        n: pos.length,
        pos: mean(pos),
        dNow: mean(dNow),
        ciNow: pairedBlockBootstrapCi(dNow, 4),
        dEnd: mean(dEnd),
        dPla: mean(dPla),
      };
    };

    for (const rule of rules) {
      const tr = run(trA, rule);
      const te = run(teA, rule);
      const pass =
        tr.dNow > 0 && te.dNow > 0 && tr.dPla > 0 && te.dPla > 0 && tr.dEnd >= 0 && te.dEnd >= 0 &&
        tr.ciNow && tr.ciNow[0] > 0 && te.ciNow && te.ciNow[0] > 0;
      console.log(
        `  ${JSON.stringify(rule).padEnd(30)} tr: pos ${tr.pos.toFixed(2)} ΔNow ${tr.dNow >= 0 ? "+" : ""}${tr.dNow.toFixed(3)} (CI ${tr.ciNow?.map((x) => x.toFixed(2)).join("..")}) ΔEnd ${tr.dEnd >= 0 ? "+" : ""}${tr.dEnd.toFixed(3)} | ` +
          `te: pos ${te.pos.toFixed(2)} ΔNow ${te.dNow >= 0 ? "+" : ""}${te.dNow.toFixed(3)} (CI ${te.ciNow?.map((x) => x.toFixed(2)).join("..")}) ΔEnd ${te.dEnd >= 0 ? "+" : ""}${te.dEnd.toFixed(3)} → ${pass ? "✓ QUA CỔNG" : "✗"}`
      );
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
