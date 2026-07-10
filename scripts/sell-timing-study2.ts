/**
 * Sell-timing v2 — vòng 2 sau khi zscore(10,2) suýt qua cổng v1 (te.meanPos 0.597
 * vs cổng 0.60). v1 thiếu baseline then chốt: "bán NGÀY CUỐI cửa sổ" (chờ tối đa) —
 * vàng trend tăng nên chờ càng lâu càng cao; nếu luật không thắng nổi chờ-tối-đa
 * thì nó chỉ là proxy của việc chờ, không phải kỹ năng chọn điểm.
 *
 * Thêm: (a) baseline sell-at-end + cổng ΔEnd > 0 cả hai era; (b) họ trailing-stop
 * (bán khi giá rơi y% từ đỉnh chạy kể từ đầu cửa sổ — cách người bán thực tế khóa
 * đỉnh); (c) báo cáo top-10 theo min(tr,te) ΔNow để xem plateau họ luật.
 *
 * Chạy: npx tsx scripts/sell-timing-study2.ts
 */
import { fetchXau } from "./fetch";
import { rangePos } from "../src/lib/dca-window";
import {
  pairedBlockBootstrapCi,
  seededRandom,
  rsi,
  percentileRank,
  bollingerPercentB,
  stochasticK,
} from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const H = 21;
const ANCHOR_STEP = 21;
const WARMUP = 252;

type SellRule =
  | { kind: "relpos"; window: number; pct: number }
  | { kind: "zscore"; window: number; k: number }
  | { kind: "bollinger"; pctB: number }
  | { kind: "stoch"; window: number; k: number }
  | { kind: "rsi"; thr: number }
  | { kind: "runWin"; x: number }
  | { kind: "streakUp"; n: number }
  | { kind: "trailStop"; y: number };

function inSellZone(closes: number[], i: number, rule: SellRule, windowStart: number): boolean {
  const sub = closes.slice(0, i + 1);
  switch (rule.kind) {
    case "relpos": {
      const p = percentileRank(sub, rule.window);
      return p !== null && p >= rule.pct;
    }
    case "zscore": {
      const W = rule.window;
      if (sub.length < W) return false;
      const w = sub.slice(-W);
      const mean = w.reduce((a, b) => a + b, 0) / W;
      const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / W);
      if (sd === 0) return false;
      return (closes[i] - mean) / sd >= rule.k;
    }
    case "bollinger": {
      const b = bollingerPercentB(sub, 20, 2);
      return b !== null && b >= rule.pctB;
    }
    case "stoch": {
      const k = stochasticK(sub, rule.window);
      return k !== null && k >= rule.k;
    }
    case "rsi": {
      const r = rsi(sub, 14);
      return r !== null && r >= rule.thr;
    }
    case "runWin": {
      let hi = -Infinity;
      for (let j = windowStart; j <= i; j++) if (closes[j] > hi) hi = closes[j];
      return closes[i] >= hi * (1 - rule.x / 100);
    }
    case "streakUp": {
      if (i < rule.n) return false;
      for (let j = i - rule.n + 1; j <= i; j++) if (closes[j] <= closes[j - 1]) return false;
      return true;
    }
    case "trailStop": {
      let hi = -Infinity;
      for (let j = windowStart; j <= i; j++) if (closes[j] > hi) hi = closes[j];
      return closes[i] <= hi * (1 - rule.y / 100);
    }
  }
}

function ruleGrid(): SellRule[] {
  const out: SellRule[] = [];
  for (const window of [10, 21, 42, 63]) {
    for (const pct of [65, 70, 75, 80]) out.push({ kind: "relpos", window, pct });
    for (const k of [1, 1.5, 2, 2.5]) out.push({ kind: "zscore", window, k });
    for (const k of [75, 80, 85]) out.push({ kind: "stoch", window, k });
  }
  for (const pctB of [0.8, 0.9, 1.0]) out.push({ kind: "bollinger", pctB });
  for (const thr of [65, 70, 75]) out.push({ kind: "rsi", thr });
  for (const x of [1, 2, 3]) out.push({ kind: "runWin", x });
  for (const n of [2, 3]) out.push({ kind: "streakUp", n });
  for (const y of [1, 1.5, 2, 3]) out.push({ kind: "trailStop", y });
  return out;
}

function evalSellWindow(closes: number[], t: number, rule: SellRule) {
  if (t + H >= closes.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
  let sellIdx = t + H;
  for (let i = t; i <= t + H; i++) {
    if (inSellZone(closes, i, rule, t)) { sellIdx = i; break; }
  }
  return { sellIdx, pos: rangePos(closes[sellIdx], lo, hi) };
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  const anchors: number[] = [];
  for (let t = WARMUP; t + H < closes.length; t += ANCHOR_STEP) anchors.push(t);
  const trA = anchors.filter((t) => dates[t] < SPLIT);
  const teA = anchors.filter((t) => dates[t] >= SPLIT);

  const rand = seededRandom(20260710);
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

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`Sell-timing v2 — ${anchors.length} neo (train ${trA.length}/test ${teA.length}), H=${H}.`);
  for (const [nm, A] of [["train", trA], ["test", teA]] as const)
    console.log(
      `  ${nm}: bán-ngay ${mean(A.map((t) => baseNow.get(t)!)).toFixed(3)} | placebo ${mean(A.map((t) => basePla.get(t)!)).toFixed(3)} | bán-cuối ${mean(A.map((t) => baseEnd.get(t)!)).toFixed(3)}`
    );

  const block = Math.max(4, Math.ceil(H / ANCHOR_STEP) + 3);
  const phaseStats = (A: number[], rule: SellRule) => {
    const dNow: number[] = [], dPla: number[] = [], dEnd: number[] = [], posArr: number[] = [];
    for (const t of A) {
      const e = evalSellWindow(closes, t, rule);
      if (!e) continue;
      dNow.push(e.pos - baseNow.get(t)!);
      dPla.push(e.pos - basePla.get(t)!);
      dEnd.push(e.pos - baseEnd.get(t)!);
      posArr.push(e.pos);
    }
    return {
      n: posArr.length,
      meanPos: mean(posArr),
      meanDNow: mean(dNow),
      meanDPla: mean(dPla),
      meanDEnd: mean(dEnd),
      ciNow: pairedBlockBootstrapCi(dNow, block),
      ciEnd: pairedBlockBootstrapCi(dEnd, block),
      winNow: dNow.filter((x) => x > 0).length / dNow.length,
      winEnd: dEnd.filter((x) => x > 0).length / dEnd.length,
    };
  };

  type Res = { rule: SellRule; tr: ReturnType<typeof phaseStats>; te: ReturnType<typeof phaseStats>; score: number };
  const all: Res[] = [];
  for (const rule of ruleGrid()) {
    const tr = phaseStats(trA, rule);
    const te = phaseStats(teA, rule);
    if (tr.n < 20 || te.n < 20) continue;
    all.push({ rule, tr, te, score: Math.min(tr.meanDNow, te.meanDNow) });
  }
  all.sort((a, b) => b.score - a.score);

  const passers = all.filter(
    ({ tr, te }) =>
      tr.meanDNow > 0 && te.meanDNow > 0 &&
      tr.meanDPla > 0 && te.meanDPla > 0 &&
      tr.meanDEnd > 0 && te.meanDEnd > 0 &&
      tr.ciNow && tr.ciNow[0] > 0 && te.ciNow && te.ciNow[0] > 0
  );

  const fmt = (s: ReturnType<typeof phaseStats>) =>
    `pos ${s.meanPos.toFixed(3)} ΔNow ${s.meanDNow >= 0 ? "+" : ""}${s.meanDNow.toFixed(3)} (CI ${s.ciNow ? s.ciNow.map((x) => x.toFixed(3)).join("..") : "—"}) ` +
    `ΔPla ${s.meanDPla >= 0 ? "+" : ""}${s.meanDPla.toFixed(3)} ΔEnd ${s.meanDEnd >= 0 ? "+" : ""}${s.meanDEnd.toFixed(3)} (CI ${s.ciEnd ? s.ciEnd.map((x) => x.toFixed(3)).join("..") : "—"}, win ${(s.winEnd * 100).toFixed(0)}%)`;

  console.log(`\n=== CỔNG ĐẦY ĐỦ (thắng bán-ngay + placebo + bán-cuối, CI ΔNow tách 0, cả 2 era): ${passers.length} luật ===`);
  for (const p of passers.slice(0, 8)) {
    console.log(`  ${JSON.stringify(p.rule)}`);
    console.log(`    train: ${fmt(p.tr)}`);
    console.log(`    test : ${fmt(p.te)}`);
  }
  console.log(`\n=== TOP-10 theo min(tr,te) ΔNow (bất kể cổng) ===`);
  for (const p of all.slice(0, 10))
    console.log(
      `  ${JSON.stringify(p.rule).padEnd(42)} minΔNow ${p.score >= 0 ? "+" : ""}${p.score.toFixed(3)} | te: pos ${p.te.meanPos.toFixed(3)} ΔEnd ${p.te.meanDEnd >= 0 ? "+" : ""}${p.te.meanDEnd.toFixed(3)}`
    );
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
