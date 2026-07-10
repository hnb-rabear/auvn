/**
 * Sell-timing study — đảo chiều framework DCA Zone v2: đứng ngày bất kỳ MUỐN BÁN
 * trong ~30 ngày tới, luật quá-mua nào đưa điểm bán lên GẦN ĐỈNH cửa sổ 30-ngày-tới
 * hơn "bán ngay" + placebo, lặp lại ở cả train(<2019) lẫn test(≥2019)?
 *
 * Khác biệt then chốt với buy-timing (NO-GO vì buy-now đã ~0.41): vàng trend TĂNG
 * nên sell-now kỳ vọng ~0.55-0.6 → về lý thuyết phía bán có headroom để canh.
 * Câu hỏi là luật past-only có bắt được phần headroom đó không.
 *
 * Luật (đảo chiều inZoneV2): relpos cao / zscore ≥ +k / %B cao / %K cao / RSI cao /
 * runWin (giá trong x% của ĐỈNH cửa sổ từ đầu neo) / streak n phiên tăng liên tiếp.
 * Cổng: meanΔ>0 (gần đỉnh hơn) vs bán-ngay VÀ vs placebo, CI(now) tách khỏi 0,
 * CẢ HAI giai đoạn, meanPos ≥ 0.60.
 *
 * Chạy: npx tsx scripts/sell-timing-study.ts (fetch XAU như các study khác)
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
  | { kind: "streakUp"; n: number };

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
  }
}

function ruleGrid(): SellRule[] {
  const out: SellRule[] = [];
  for (const window of [10, 21, 42, 63]) {
    for (const pct of [65, 70, 75, 80]) out.push({ kind: "relpos", window, pct });
    for (const k of [1, 1.5, 2]) out.push({ kind: "zscore", window, k });
    for (const k of [75, 80, 85]) out.push({ kind: "stoch", window, k });
  }
  for (const pctB of [0.8, 0.9, 1.0]) out.push({ kind: "bollinger", pctB });
  for (const thr of [65, 70, 75]) out.push({ kind: "rsi", thr });
  for (const x of [1, 2, 3]) out.push({ kind: "runWin", x });
  for (const n of [2, 3]) out.push({ kind: "streakUp", n });
  return out;
}

/** Bán tại phiên đầu tiên khớp luật trong [t, t+H], không khớp thì buộc bán cuối cửa sổ. */
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
  const basePlacebo = new Map<number, number>();
  for (const t of anchors) {
    let lo = Infinity, hi = -Infinity;
    for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
    baseNow.set(t, rangePos(closes[t], lo, hi));
    const r = t + Math.floor(rand() * (H + 1));
    basePlacebo.set(t, rangePos(closes[r], lo, hi));
  }

  const block = Math.max(4, Math.ceil(H / ANCHOR_STEP) + 3);
  const phaseStats = (A: number[], rule: SellRule) => {
    const dNow: number[] = [], dPla: number[] = [], posArr: number[] = [];
    for (const t of A) {
      const e = evalSellWindow(closes, t, rule);
      if (!e) continue;
      dNow.push(e.pos - baseNow.get(t)!);
      dPla.push(e.pos - basePlacebo.get(t)!);
      posArr.push(e.pos);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      n: posArr.length,
      meanPos: mean(posArr),
      meanDNow: mean(dNow),
      meanDPla: mean(dPla),
      ciNow: pairedBlockBootstrapCi(dNow, block),
      winNow: dNow.filter((x) => x > 0).length / dNow.length,
    };
  };

  // tham chiếu: bán-ngay & placebo trung bình theo era
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`Sell-timing — ${anchors.length} neo (train ${trA.length}/test ${teA.length}), H=${H}, neo mỗi ${ANCHOR_STEP} phiên.`);
  console.log(
    `Tham chiếu bán-ngay meanPos: train ${mean(trA.map((t) => baseNow.get(t)!)).toFixed(3)} | test ${mean(teA.map((t) => baseNow.get(t)!)).toFixed(3)} ` +
      `(placebo: train ${mean(trA.map((t) => basePlacebo.get(t)!)).toFixed(3)} | test ${mean(teA.map((t) => basePlacebo.get(t)!)).toFixed(3)})`
  );

  let best: any = null;
  let diag: any = null;
  const passers: any[] = [];
  for (const rule of ruleGrid()) {
    const tr = phaseStats(trA, rule);
    const te = phaseStats(teA, rule);
    if (tr.n < 20 || te.n < 20) continue;
    if (!diag || te.meanDNow > diag.te.meanDNow) diag = { rule, tr, te };
    const pass =
      tr.meanDNow > 0 && te.meanDNow > 0 && tr.meanDPla > 0 && te.meanDPla > 0 &&
      tr.ciNow && tr.ciNow[0] > 0 && te.ciNow && te.ciNow[0] > 0 &&
      te.meanPos >= 0.6;
    const score = Math.min(tr.meanDNow, te.meanDNow);
    if (pass) {
      passers.push({ rule, tr, te, score });
      if (!best || score > best.score) best = { rule, tr, te, score };
    }
  }

  const fmt = (s: any) =>
    `meanPos ${s.meanPos.toFixed(3)} Δnow +${s.meanDNow.toFixed(3)} (CI ${s.ciNow ? s.ciNow.map((x: number) => x.toFixed(3)).join("..") : "—"}) ` +
    `Δpla ${s.meanDPla >= 0 ? "+" : ""}${s.meanDPla.toFixed(3)} win ${(s.winNow * 100).toFixed(0)}% n=${s.n}`;
  if (best) {
    console.log(`\n✓ ${passers.length} luật QUA CỔNG. Tốt nhất: ${JSON.stringify(best.rule)}`);
    console.log(`  train: ${fmt(best.tr)}`);
    console.log(`  test : ${fmt(best.te)}`);
    passers.sort((a, b) => b.score - a.score);
    console.log(`  top-5 qua cổng:`);
    for (const p of passers.slice(0, 5))
      console.log(`    ${JSON.stringify(p.rule)} | tr Δ+${p.tr.meanDNow.toFixed(3)} te Δ+${p.te.meanDNow.toFixed(3)} te meanPos ${p.te.meanPos.toFixed(3)}`);
  } else {
    console.log(`\n✗ KHÔNG luật nào vượt bán-ngay + placebo (CI tách khỏi 0) ở cả hai giai đoạn với meanPos ≥ 0.6.`);
    if (diag) {
      console.log(`  --- CHẨN ĐOÁN: ứng viên te.meanDNow cao nhất (KHÔNG đạt cổng) ---`);
      console.log(`  ${JSON.stringify(diag.rule)}`);
      console.log(`  train: ${fmt(diag.tr)}`);
      console.log(`  test : ${fmt(diag.te)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
