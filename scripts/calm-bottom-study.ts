/**
 * Study "thị trường êm" làm tín hiệu Săn đáy — spec
 * docs/superpowers/specs/2026-09-25-calm-market-bottom-study-design.md (cổng pre-registered).
 *
 * Feature: rangeExp(w) = trung bình (high−low)/close w phiên gần nhất / trung vị 60 phiên
 * trước đó. "Êm" = rangeExp ≤ ngưỡng percentile p tính CHỈ trên train.
 * Grid: p ∈ {10,20,30} × w ∈ {5,10} × tầng {cycle, swing} = 12 ô.
 * Cổng GO (cả 4, cho một tầng):
 *   G1 lift>0 ở CẢ train/test VÀ CI95 theo cụm nằm trên nền ở cả hai
 *   G2 lift > p95 placebo khối liền kề cùng số ngày (200 seed) ở cả hai giai đoạn
 *   G3 trong nhóm momentum-12m > 0, êm vẫn lift > 0 so nền của nhóm đó ở cả hai (không phải chỉ báo bull)
 *   G4 ≥ 8 đợt độc lập mỗi giai đoạn
 * Ô lẻ loi qua cổng mà ô kề bên không qua ⇒ nhiễu.
 * Cần mạng (Yahoo OHLCV). Chạy: npx tsx scripts/calm-bottom-study.ts
 */
import { clusterBootstrapCiWeighted, seededRandom } from "../src/lib/indicators";

const PERIOD1 = 1159142400; // cùng mốc cố định với scripts/fetch.ts
const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3;
const SEEDS = 200;
const TIERS = { cycle: { H: 126, eps: 3 }, swing: { H: 30, eps: 2 } } as const;

type Bar = { d: string; h: number; l: number; c: number };

async function loadBars(): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?period1=${PERIOD1}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30000) });
  const r = (await res.json()).chart.result[0];
  const q = r.indicators.quote[0];
  const out: Bar[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
    out.push({ d: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10), h: q.high[i], l: q.low[i], c: q.close[i] });
  }
  return out;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

async function main() {
  const bars = await loadBars();
  console.log(`GC=F OHLC: ${bars.length} phiên (${bars[0].d} → ${bars[bars.length - 1].d})\n`);
  const rng = (k: number) => (bars[k].h - bars[k].l) / bars[k].c;
  const rangeExp = (i: number, w: number) => {
    if (i < 60 + w) return null;
    const base = median([...Array(60)].map((_, j) => rng(i - w - j)));
    if (!base) return null;
    let s = 0;
    for (let k = i - w + 1; k <= i; k++) s += rng(k);
    return s / w / base;
  };
  const mom12 = (i: number) => (i >= 252 ? bars[i].c / bars[i - 252].c - 1 : null);

  let passCells = 0;
  const results: string[] = [];
  for (const [tier, { H, eps }] of Object.entries(TIERS)) {
    const label = (i: number) => {
      if (i + H >= bars.length) return null;
      let m = Infinity;
      for (let j = i + 1; j <= i + H; j++) m = Math.min(m, bars[j].c);
      return m >= bars[i].c * (1 - eps / 100);
    };
    console.log(`=== tầng ${tier} (H=${H}, ε=${eps}%)`);
    for (const w of [5, 10]) {
      type Row = { i: number; test: boolean; ok: boolean; re: number; up: boolean };
      const rows: Row[] = [];
      for (let i = WARMUP; i < bars.length; i += STEP) {
        const ok = label(i);
        const re = rangeExp(i, w);
        const m = mom12(i);
        if (ok === null || re === null || m === null) continue;
        rows.push({ i, test: bars[i].d >= SPLIT, ok, re, up: m > 0 });
      }
      const trVals = rows.filter((r) => !r.test).map((r) => r.re).sort((a, b) => a - b);
      for (const p of [10, 20, 30]) {
        const thr = trVals[Math.floor((p / 100) * (trVals.length - 1))];
        const g: Record<string, boolean> = { G1: true, G2: true, G3: true, G4: true };
        const parts: string[] = [];
        for (const test of [false, true]) {
          const era = rows.filter((r) => r.test === test);
          const sig = era.filter((r) => r.re <= thr);
          const rate = (a: Row[]) => (a.length ? a.filter((r) => r.ok).length / a.length : 0);
          const base = rate(era);
          const lift = rate(sig) - base;
          const clusters = new Set(sig.map((r) => Math.floor(r.i / H))).size;
          const ci = clusterBootstrapCiWeighted(
            sig.map((r) => (r.ok ? 1 : -1)),
            sig.map(() => 1),
            sig.map((r) => r.i),
            H
          );
          // placebo: khối liền kề cùng số ngày, bắt đầu ngẫu nhiên (giữ cấu trúc cụm)
          const rand = seededRandom(20260925 + p * 10 + w + (test ? 1 : 0));
          const pl: number[] = [];
          for (let s = 0; s < SEEDS; s++) {
            const st = Math.floor(rand() * Math.max(1, era.length - sig.length));
            pl.push(rate(era.slice(st, st + sig.length)) - base);
          }
          pl.sort((a, b) => a - b);
          const p95 = pl[Math.floor(0.95 * (pl.length - 1))];
          // bull-control: chỉ ngày momentum 12m > 0
          const upEra = era.filter((r) => r.up);
          const upLift = rate(upEra.filter((r) => r.re <= thr)) - rate(upEra);
          if (!(lift > 0 && ci !== null && ci[0] > base * 100)) g.G1 = false;
          if (!(lift > p95)) g.G2 = false;
          if (!(upLift > 0)) g.G3 = false;
          if (clusters < 8) g.G4 = false;
          parts.push(
            `${test ? "test " : "train"} lift ${(lift * 100).toFixed(1)}pt (nền ${(base * 100).toFixed(1)}%, ${sig.length}n/${clusters}c, ` +
              `CI ${ci ? ci[0] + "–" + ci[1] : "—"}, placebo p95 ${(p95 * 100).toFixed(1)}pt, trong-bull ${(upLift * 100).toFixed(1)}pt)`
          );
        }
        const pass = g.G1 && g.G2 && g.G3 && g.G4;
        if (pass) passCells++;
        const gates = Object.entries(g).map(([k, v]) => `${k}${v ? "✓" : "✗"}`).join(" ");
        const line = `  w=${w} p${p}: ${gates} ${pass ? "⇒ QUA" : ""}\n    ${parts.join("\n    ")}`;
        console.log(line);
        results.push(`${tier} w=${w} p${p}: ${gates}`);
      }
    }
    console.log("");
  }
  console.log(`=== TỔNG: ${passCells}/12 ô qua cả 4 cổng`);
  console.log(passCells === 0 ? "⇒ PHÁN QUYẾT: NO-GO" : "⇒ xem ô kề bên trước khi kết luận (luật chống nhiễu đa kiểm định)");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
