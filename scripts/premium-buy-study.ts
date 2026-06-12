/**
 * Tín hiệu MUA thế giới + premium VN thấp có cho lợi suất SJC tốt hơn không?
 *
 * Phương pháp:
 * 1. Tải vn-gold.json (488 ngày) và timeline.json (XAU backtest).
 * 2. Với mỗi ngày VN có dữ liệu, tìm điểm composite thế giới gần nhất (timeline).
 * 3. Nếu composite ≥ ngưỡng mua (preset 1m/3m), chia theo percentile premium
 *    trailing 180 ngày → nhóm thấp/giữa/cao.
 * 4. Đo lợi suất giá SJC sau 21/42/63 ngày.
 *
 * Kết quả: nếu "mua thế giới + premium thấp" > "mua thế giới + premium cao" rõ rệt,
 * thì premium là bộ lọc tín hiệu mua có giá trị thực tế.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VnGoldEntry, TimelinePoint } from "../src/lib/types";
import { median } from "../src/lib/indicators";

const vnGold: VnGoldEntry[] = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "history", "vn-gold.json"), "utf8")
);
const timelineData: { points: TimelinePoint[] } = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);

const days = vnGold.filter((e) => e.sjcSell !== null && e.premiumPct !== null);

function worldComposite(point: TimelinePoint, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(point.scores as Record<string, number>)) {
    const wk = w[k] ?? 0;
    s += score * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

// Tìm điểm timeline gần nhất không vượt quá date (look-ahead safe)
function nearestComposite(
  date: string,
  tl: TimelinePoint[],
  w: Record<string, number>
): number | null {
  let lo = 0;
  let hi = tl.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl[mid].date <= date) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best < 0) return null;
  // Chỉ dùng điểm trong phạm vi ±5 ngày để tránh dùng dữ liệu quá cũ
  const diff = Math.abs(new Date(date).getTime() - new Date(tl[best].date).getTime());
  if (diff > 7 * 86400000) return null;
  return worldComposite(tl[best], w);
}

function trailingPercentile(i: number, window = 180): number | null {
  const from = Math.max(0, i - window);
  if (i - from < 60) return null;
  const w = days.slice(from, i).map((e) => e.premiumPct!);
  const cur = days[i].premiumPct!;
  return (w.filter((v) => v < cur).length / w.length) * 100;
}

function forwardReturn(i: number, calDays: number): number | null {
  const target = new Date(days[i].date).getTime() + calDays * 86400000;
  for (let j = i + 1; j < days.length; j++) {
    if (new Date(days[j].date).getTime() >= target) {
      return ((days[j].sjcSell! - days[i].sjcSell!) / days[i].sjcSell!) * 100;
    }
  }
  return null;
}

interface Preset {
  id: string;
  w: Record<string, number>;
  thr: number;
}

const presets: Preset[] = [
  { id: "1m (macro=0.9 stats=0.1 thr=40)", w: { technical: 0, stats: 0.1, macro: 0.9 }, thr: 40 },
  { id: "3m (technical=0.1 macro=0.9 thr=50)", w: { technical: 0.1, stats: 0, macro: 0.9 }, thr: 50 },
  { id: "tất cả tín hiệu (technical=0.35 macro=0.2 stats=0.2 thr=40)", w: { technical: 0.35, stats: 0.2, macro: 0.2 }, thr: 40 },
];

function printStats(rets: number[], label: string) {
  if (!rets.length) {
    console.log(`  ${label}: n=0`);
    return;
  }
  const up = (rets.filter((r) => r > 0).length / rets.length) * 100;
  const med = median(rets)!;
  console.log(
    `  ${label.padEnd(20)}: n=${String(rets.length).padStart(3)} | %tăng=${up.toFixed(0).padStart(3)}% | trung vị=${(med >= 0 ? "+" : "") + med.toFixed(1)}%`
  );
}

function main() {
  const tl = timelineData.points;
  console.log(
    `dữ liệu: ${days.length} ngày VN (${days[0]?.date}..${days[days.length - 1]?.date}), ` +
      `${tl.length} điểm timeline (${tl[0]?.date}..${tl[tl.length - 1]?.date})`
  );

  for (const preset of presets) {
    console.log(`\n======== Preset: ${preset.id} ========`);

    for (const horizon of [21, 42, 63]) {
      const buckets: Record<string, number[]> = {
        "thấp (≤p20)": [],
        "giữa": [],
        "cao (≥p80)": [],
      };
      let skippedNoTimeline = 0;
      let skippedBelowThr = 0;

      for (let i = 0; i < days.length; i++) {
        const pr = trailingPercentile(i);
        if (pr === null) continue;

        const comp = nearestComposite(days[i].date, tl, preset.w);
        if (comp === null) {
          skippedNoTimeline++;
          continue;
        }
        if (comp < preset.thr) {
          skippedBelowThr++;
          continue;
        }

        const ret = forwardReturn(i, horizon);
        if (ret === null) continue;

        if (pr <= 20) buckets["thấp (≤p20)"].push(ret);
        else if (pr >= 80) buckets["cao (≥p80)"].push(ret);
        else buckets["giữa"].push(ret);
      }

      const total = Object.values(buckets).reduce((a, b) => a + b.length, 0);
      console.log(
        `\n--- Lợi suất SJC sau ${horizon} ngày | buy signals: ${total} (bỏ qua: ${skippedNoTimeline} ko-timeline, ${skippedBelowThr} dưới-ngưỡng) ---`
      );
      for (const [k, rets] of Object.entries(buckets)) printStats(rets, k);

      // Gradient check: thấp tốt hơn cao?
      const lo = buckets["thấp (≤p20)"];
      const hi = buckets["cao (≥p80)"];
      if (lo.length >= 5 && hi.length >= 5) {
        const loMed = median(lo)!;
        const hiMed = median(hi)!;
        const delta = loMed - hiMed;
        console.log(
          `  → gradient thấp vs cao: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp trung vị` +
            (delta > 2 ? " ✓ gradient rõ" : delta > 0 ? " ~ gradient yếu" : " ✗ không có gradient")
        );
      }
    }
  }

  // Tổng kết: tất cả buy signals (không lọc theo preset) vs buy signals khi premium thấp
  console.log("\n======== Tóm tắt: giá trị lọc premium với preset 3m ========");
  const p3 = presets[1];
  for (const horizon of [42]) {
    const all: number[] = [];
    const lowPrem: number[] = [];

    for (let i = 0; i < days.length; i++) {
      const pr = trailingPercentile(i);
      const comp = nearestComposite(days[i].date, tl, p3.w);
      const ret = forwardReturn(i, horizon);
      if (pr === null || comp === null || ret === null) continue;
      if (comp >= p3.thr) {
        all.push(ret);
        if (pr <= 20) lowPrem.push(ret);
      }
    }

    console.log(`\nHorizon ${horizon} ngày:`);
    printStats(all, "Mọi tín hiệu mua");
    printStats(lowPrem, "Mua + premium thấp");
    if (all.length && lowPrem.length) {
      const gain = median(lowPrem)! - median(all)!;
      console.log(
        `  Lợi thêm khi lọc premium: ${gain >= 0 ? "+" : ""}${gain.toFixed(1)}pp trung vị`
      );
    }
  }
}

main();
