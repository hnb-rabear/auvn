// src/lib/dca-zone.ts
/** Luật "vùng giá đẹp" past-only cho DCA Co-pilot. Chấm ngày i chỉ bằng closes[0..i]. */
import { rsi } from "./indicators";
import type { ZoneRule } from "./types";

/** Percentile (0..100) của closes[i] trong cửa sổ `window` phiên KẾT THÚC ở i. */
export function pricePercentile(closes: number[], i: number, window: number): number {
  const from = Math.max(0, i - window + 1);
  const w = closes.slice(from, i + 1);
  if (w.length < 2) return 50;
  const last = closes[i];
  let below = 0;
  for (const v of w) if (v < last) below++;
  return (below / (w.length - 1)) * 100;
}

export function inZone(closes: number[], i: number, rule: ZoneRule, monthStartIdx: number): boolean {
  const W = rule.window ?? 42;
  switch (rule.kind) {
    case "relpos":
      return pricePercentile(closes, i, W) <= (rule.pct ?? 25);
    case "signal": {
      // relpos ∧ RSI quá bán. KHÔNG dùng macd (O(n²)/lần → O(n³) trong study).
      if (pricePercentile(closes, i, W) > (rule.pct ?? 30)) return false;
      const r = rsi(closes.slice(0, i + 1), 14);
      return r !== null && r < 35;
    }
    case "monthdd": {
      let hi = -Infinity;
      for (let j = monthStartIdx; j <= i; j++) if (closes[j] > hi) hi = closes[j];
      return closes[i] <= hi * (1 - (rule.x ?? 3) / 100);
    }
  }
}
