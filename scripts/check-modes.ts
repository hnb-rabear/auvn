/** In composite của 4 chế độ từ analysis.json + một ngày timeline — kiểm tra UI phải khác nhau thế nào. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compositeScore,
  presetComposite,
  zoneOf,
  DEFAULT_WEIGHTS,
  PRESETS,
  type Analysis,
  type Timeline,
} from "../src/lib/types";
import { buyCount, consensusLabel, presetSignals } from "../src/lib/consensus";

const DATA = join(process.cwd(), "public", "data");
const analysis: Analysis = JSON.parse(readFileSync(join(DATA, "analysis.json"), "utf8"));
const tl: Timeline = JSON.parse(readFileSync(join(DATA, "timeline.json"), "utf8"));

console.log("=== VERDICT HÔM NAY (analysis.json) ===");
const sigs = presetSignals(analysis.criteria);
console.log(
  `Toàn cảnh : ${consensusLabel(buyCount(sigs))} · radar=${compositeScore(analysis.criteria, DEFAULT_WEIGHTS)} (zone radar=${zoneOf(compositeScore(analysis.criteria, DEFAULT_WEIGHTS))} — chỉ ngữ cảnh/gió ngược)`
);
// v4: preset chấm bằng presetComposite (sub-signal vĩ mô trọng số riêng) qua presetSignals.
for (const { preset: p, composite: c } of sigs) {
  console.log(`${p.label.padEnd(18)}: composite=${c} zone=${zoneOf(c, p.buyThreshold)} (ngưỡng +${p.buyThreshold})`);
}

const pt = tl.points.find((q) => q.date.startsWith("2023-01")) ?? tl.points[800];
console.log(`\n=== MÁY THỜI GIAN tại ${pt.date} (scores=${JSON.stringify(pt.scores)}) ===`);
function ptRadar(): number {
  let s = 0;
  let tw = 0;
  for (const [k, v] of Object.entries(pt.scores)) {
    const w = (DEFAULT_WEIGHTS as Record<string, number>)[k] ?? 0;
    s += (v as number) * w;
    tw += w;
  }
  return tw === 0 ? 0 : Math.round((s / tw) * 500) / 10;
}
console.log(`Toàn cảnh : ${ptRadar()}`);
for (const p of PRESETS)
  console.log(`${p.label.padEnd(18)}: ${presetComposite(pt.scores, p)} (ngưỡng +${p.buyThreshold})`);
