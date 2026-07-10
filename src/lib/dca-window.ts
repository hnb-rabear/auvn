// src/lib/dca-window.ts
/** Đánh giá luật canh vào DCA trên cửa sổ trượt 30-ngày-tới. Thuần, past-only cho quyết định. */
import { rsi, percentileRank, bollingerPercentB, stochasticK, volatility30 } from "./indicators";

export type ZoneRuleV2 =
  | { kind: "relpos"; window: number; pct: number }
  | { kind: "zscore"; window: number; k: number }
  | { kind: "bollinger"; pctB: number }
  | { kind: "stoch"; window: number; k: number }
  | { kind: "rsi"; thr: number }
  | { kind: "drawWin"; x: number }
  | { kind: "pullback"; n: number }
  | { kind: "volsqueeze"; window: number; pct: number };

// vol30 tại mọi phiên, tính 1 lần/chuỗi closes (past-only) — dùng cho "volsqueeze".
const volSeriesCache = new WeakMap<number[], (number | null)[]>();
function volSeries(closes: number[]): (number | null)[] {
  let s = volSeriesCache.get(closes);
  if (!s) {
    s = closes.map((_, i) => (i >= 30 ? volatility30(closes.slice(0, i + 1)) : null));
    volSeriesCache.set(closes, s);
  }
  return s;
}

export function rangePos(price: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return (price - lo) / (hi - lo);
}

/** Quyết định mua tại i — chỉ dùng closes[0..i] (past-only). windowStart cho drawWin. */
export function inZoneV2(closes: number[], i: number, rule: ZoneRuleV2, windowStart: number): boolean {
  const sub = closes.slice(0, i + 1);
  switch (rule.kind) {
    case "relpos": {
      const p = percentileRank(sub, rule.window);
      return p !== null && p <= rule.pct;
    }
    case "zscore": {
      const W = rule.window;
      if (sub.length < W) return false;
      const w = sub.slice(-W);
      const mean = w.reduce((a, b) => a + b, 0) / W;
      const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / W);
      if (sd === 0) return false;
      return (closes[i] - mean) / sd <= -rule.k;
    }
    case "bollinger": {
      const b = bollingerPercentB(sub, 20, 2);
      return b !== null && b <= rule.pctB;
    }
    case "stoch": {
      const k = stochasticK(sub, rule.window);
      return k !== null && k <= rule.k;
    }
    case "rsi": {
      const r = rsi(sub, 14);
      return r !== null && r <= rule.thr;
    }
    case "drawWin": {
      let hi = -Infinity;
      for (let j = windowStart; j <= i; j++) if (closes[j] > hi) hi = closes[j];
      return closes[i] <= hi * (1 - rule.x / 100);
    }
    case "pullback": {
      if (i < rule.n) return false;
      for (let j = i - rule.n + 1; j <= i; j++) if (closes[j] >= closes[j - 1]) return false;
      return true; // n phiên giảm liên tiếp
    }
    case "volsqueeze": {
      const W = rule.window;
      if (i < W + 30) return false;
      const vs = volSeries(closes);
      const cur = vs[i];
      if (cur === null) return false;
      let below = 0, count = 0;
      for (let j = i - W; j < i; j++) {
        const v = vs[j];
        if (v === null) continue;
        count++;
        if (v <= cur) below++;
      }
      if (count < W * 0.5) return false;
      return (below / count) * 100 <= rule.pct;
    }
  }
}

export interface WindowEval { buyIdx: number; lo: number; hi: number; pos: number; }

export function evalWindow(
  closes: number[], t: number, H: number, rule: ZoneRuleV2, minVol = 0
): WindowEval | null {
  if (t + H >= closes.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
  let buyIdx = t + H; // mặc định buộc mua cuối
  for (let i = t; i <= t + H; i++) {
    const volOk = minVol <= 0 || ((volatility30(closes.slice(0, i + 1)) ?? 0) >= minVol);
    if (volOk && inZoneV2(closes, i, rule, t)) { buyIdx = i; break; }
  }
  return { buyIdx, lo, hi, pos: rangePos(closes[buyIdx], lo, hi) };
}
