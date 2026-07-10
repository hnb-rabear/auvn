/**
 * Top Hunter DEEP dive — vòng 2: hai cấu hình thắng của top-hunter-study đều
 * macro:0.75 (nghịch dấu vĩ mô = Fed thắt/DXY mạnh/lợi suất tăng) — nghi cùng
 * bệnh clustering với sell-preset (toàn bộ tín hiệu = 2 chu kỳ Fed thắt).
 * Đo mức CỤM cho đúng 2 cấu hình thắng:
 *   cycle: H=126 ε=3% edges[-40,0,40] w={nu:0.25, macro:0.75}
 *   swing: H=21  ε=1.5% edges[-40,0,40] w={macro:0.75, mom:0.25}
 * 1. Cụm độc lập (gap > 21 phiên) mỗi era + tháng bắt đầu.
 * 2. Độ chính xác cấp cụm (tỉ lệ ngày gần-đỉnh trong cụm ≥ 50% ⇒ cụm đúng).
 * 3. Placebo liền khối cùng cấu trúc run (200 draws/era).
 *
 * Chạy: npx tsx scripts/top-hunter-deep-study.ts
 */
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";
import { rsi } from "../src/lib/indicators";
import { seededRandom } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3;
const clamp2 = (n: number) => Math.max(-2, Math.min(2, n));

function labelNearTop(closes: number[], i: number, H: number, epsPct: number): boolean | null {
  if (i + H >= closes.length) return null;
  const ceil = closes[i] * (1 + epsPct / 100);
  let maxFwd = -Infinity;
  for (let j = i + 1; j <= i + H; j++) if (closes[j] > maxFwd) maxFwd = closes[j];
  return maxFwd <= ceil;
}

function sma(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  let s = 0;
  for (let i = xs.length - n; i < xs.length; i++) s += xs[i];
  return s / n;
}
function dxyScore(closes: number[]): number | null {
  if (closes.length < 51) return null;
  const last = closes[closes.length - 1];
  const ma50 = sma(closes, 50)!;
  const prev21 = closes[closes.length - 22];
  const chg = ((last - prev21) / prev21) * 100;
  const above = last > ma50;
  if (above && chg > 1) return -2;
  if (above) return -1;
  if (!above && chg < -1) return 2;
  return 1;
}
function fedScore(rates: number[]): number | null {
  if (rates.length < 4) return null;
  const d = rates[rates.length - 1] - rates[rates.length - 4];
  if (d <= -0.25) return 2;
  if (d < 0) return 1;
  if (d === 0) return 0;
  if (d < 0.25) return -1;
  return -2;
}
function yieldScore(closes: number[]): number | null {
  if (closes.length < 64) return null;
  const d = closes[closes.length - 1] - closes[closes.length - 64];
  if (d <= -0.4) return 2;
  if (d <= -0.1) return 1;
  if (d < 0.1) return 0;
  if (d < 0.4) return -1;
  return -2;
}

interface F { nu: number | null; macro: number | null; mom: number | null; }

function feats(closes: number[], dxyC: number[], yldC: number[] | null, fedR: number[]): F {
  const out: F = { nu: null, macro: null, mom: null };
  const n = closes.length;
  if (n >= 252) {
    let peak = -Infinity;
    for (let i = n - 252; i < n; i++) if (closes[i] > peak) peak = closes[i];
    const dd = ((peak - closes[n - 1]) / peak) * 100;
    out.nu = dd <= 0.5 ? 2 : dd <= 2 ? 1 : dd <= 5 ? 0 : dd <= 12 ? -1 : -2;
  }
  const subs = [dxyScore(dxyC), yldC ? yieldScore(yldC) : null, fedScore(fedR)].filter((s): s is number => s !== null);
  if (subs.length) out.macro = clamp2(-subs.reduce((a, b) => a + b, 0) / subs.length);
  if (n >= 22) {
    const r = ((closes[n - 1] - closes[n - 22]) / closes[n - 22]) * 100;
    out.mom = r >= 8 ? 2 : r >= 4 ? 1 : r > -2 ? 0 : r > -6 ? -1 : -2;
  }
  return out;
}

function score(f: F, w: Record<string, number>): number {
  let sum = 0, tw = 0;
  for (const [k, v] of Object.entries(f)) {
    if (v === null) continue;
    const wk = w[k] ?? 0;
    sum += (v as number) * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (sum / tw) * 50;
}

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
  const [xau, dxy, fed, yield10y] = await Promise.all([
    fetchXau(),
    fetchDxy().catch(() => null),
    fetchFedFunds().catch(() => null),
    fetchYield10y().catch(() => null),
  ]);
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  const idxs: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) idxs.push(i);
  const featsByI = new Map<number, F>();
  for (const i of idxs) {
    const di = dates[i];
    featsByI.set(
      i,
      feats(
        closes.slice(0, i + 1),
        dxy ? dxy.bars.filter((b) => b.date <= di).map((b) => b.close) : [],
        yield10y ? yield10y.bars.filter((b) => b.date <= di).map((b) => b.close) : null,
        fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : []
      )
    );
  }

  const CONFIGS: { label: string; H: number; eps: number; thr: number; w: Record<string, number> }[] = [
    { label: "cycle H126 ε3% w{nu:0.25,macro:0.75} bin≥40", H: 126, eps: 3, thr: 40, w: { nu: 0.25, macro: 0.75 } },
    { label: "swing H21 ε1.5% w{macro:0.75,mom:0.25} bin≥40", H: 21, eps: 1.5, thr: 40, w: { macro: 0.75, mom: 0.25 } },
  ];

  for (const cfg of CONFIGS) {
    console.log(`\n############ ${cfg.label} ############`);
    const rows = idxs
      .map((i) => ({ i, date: dates[i], y: labelNearTop(closes, i, cfg.H, cfg.eps) }))
      .filter((r) => r.y !== null) as { i: number; date: string; y: boolean }[];
    for (const [era, inEra] of [
      ["train", (d: string) => d < SPLIT],
      ["test", (d: string) => d >= SPLIT],
    ] as const) {
      const eraRows = rows.filter((r) => inEra(r.date));
      const base = eraRows.filter((r) => r.y).length / eraRows.length;
      const sig = eraRows.filter((r) => score(featsByI.get(r.i)!, cfg.w) >= cfg.thr);
      if (!sig.length) { console.log(`  ${era}: 0 tín hiệu`); continue; }
      const eps = episodesOf(sig.map((r) => r.i));
      const rowByI = new Map(eraRows.map((r) => [r.i, r]));
      const epStats = eps.map((e) => {
        const ys = e.map((i) => rowByI.get(i)!.y);
        const rate = ys.filter(Boolean).length / ys.length;
        return { m: rowByI.get(e[0])!.date.slice(0, 7), n: e.length, rate, right: rate >= 0.5 };
      });
      const dayRate = sig.filter((r) => r.y).length / sig.length;
      const epRight = epStats.filter((e) => e.right).length;

      const runLens = eps.map((e) => e.length);
      const rand = seededRandom(20260710 + cfg.H);
      const plaDay: number[] = [];
      const plaEp: number[] = [];
      for (let d = 0; d < 200; d++) {
        let hit = 0, tot = 0, right = 0;
        for (const L of runLens) {
          const start = Math.floor(rand() * Math.max(1, eraRows.length - L));
          const run = eraRows.slice(start, start + L);
          const h = run.filter((r) => r.y).length;
          hit += h;
          tot += run.length;
          if (h / run.length >= 0.5) right++;
        }
        plaDay.push(hit / tot);
        plaEp.push(right / runLens.length);
      }
      const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
      console.log(
        `  ${era}: ${sig.length} ngày / ${eps.length} cụm | base ${(base * 100).toFixed(0)}% | ngày gần-đỉnh ${(dayRate * 100).toFixed(0)}% (placebo-khối p95 ${(p95(plaDay) * 100).toFixed(0)}%) | ` +
          `cụm đúng ${epRight}/${eps.length} (placebo-khối p95 ${(p95(plaEp) * 100).toFixed(0)}%)`
      );
      console.log(`    cụm: ${epStats.map((e) => `${e.m}(n=${e.n},${(e.rate * 100).toFixed(0)}%${e.right ? "✓" : "✗"})`).join(" ")}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
