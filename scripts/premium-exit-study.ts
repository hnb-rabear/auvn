/**
 * Chênh lệch VN cao có phải tín hiệu bán tốt cho VÀNG VN không?
 * Dùng lịch sử SJC thật (487 ngày backfill): chia các ngày theo percentile premium
 * (trailing 180 ngày), đo lợi suất GIÁ SJC sau 21/42/63 ngày dương lịch.
 * Nếu premium cao -> lợi suất SJC sau đó thấp hơn rõ, tín hiệu có giá trị.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VnGoldEntry } from "../src/lib/types";
import { median } from "../src/lib/indicators";

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

function trailingPercentile(i: number, window = 180): number | null {
  const from = Math.max(0, i - window);
  if (i - from < 60) return null;
  const w = days.slice(from, i).map((e) => e.premiumPct!);
  const cur = days[i].premiumPct!;
  return (w.filter((v) => v < cur).length / w.length) * 100;
}

function main() {
  console.log(`tổng ${days.length} ngày SJC (${days[0]?.date} .. ${days[days.length - 1]?.date})`);
  for (const h of [21, 42, 63]) {
    const buckets: Record<string, number[]> = { "cao (>=p80)": [], "giữa": [], "thấp (<=p20)": [] };
    for (let i = 0; i < days.length; i++) {
      const pr = trailingPercentile(i);
      const r = forwardReturn(i, h);
      if (pr === null || r === null) continue;
      if (pr >= 80) buckets["cao (>=p80)"].push(r);
      else if (pr <= 20) buckets["thấp (<=p20)"].push(r);
      else buckets["giữa"].push(r);
    }
    console.log(`\n--- Lợi suất GIÁ SJC sau ${h} ngày ---`);
    for (const [k, rets] of Object.entries(buckets)) {
      if (!rets.length) continue;
      const up = (rets.filter((r) => r > 0).length / rets.length) * 100;
      console.log(
        `premium ${k.padEnd(12)}: n=${String(rets.length).padStart(3)} | %tăng=${up.toFixed(0)}% | trung vị=${median(rets)!.toFixed(1)}%`
      );
    }
  }
}
main();
