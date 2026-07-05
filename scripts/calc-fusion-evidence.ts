/** Tính 8 số HIGH_CONF_3M_EVIDENCE ĐÚNG theo cách fusion.evidence.test.ts khóa
 *  (CI block-bootstrap trên chuỗi ±1, placebo sort presetComposite). Chạy sau khi
 *  timeline tái sinh; dán kết quả vào src/lib/fusion.ts. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRESETS, presetComposite, type Timeline, type TimelinePoint } from "../src/lib/types";
import { HIGH_CONFIDENCE_BIN } from "../src/lib/fusion";
import { blockBootstrapCi } from "../src/lib/indicators";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const preset = PRESETS.find((p) => p.id === "3m")!;
const buy = (p: TimelinePoint) => presetComposite(p.scores, preset) >= preset.buyThreshold;
const pts = tl.points.filter((p) => p.returns["63"] !== null && p.cycleBin !== undefined);
const B = (seg: TimelinePoint[]) => seg.filter((p) => buy(p) && p.cycleBin === HIGH_CONFIDENCE_BIN);
const favPct = (seg: TimelinePoint[]) => {
  const r = seg.map((p) => p.returns["63"] as number);
  return (r.filter((x) => x > 0).length / r.length) * 100;
};

const tr = B(pts.filter((p) => p.date < "2019-01-01"));
const te = B(pts.filter((p) => p.date >= "2019-01-01"));
const all = B(pts);
const fav = all.map((p) => ((p.returns["63"] as number) > 0 ? 1 : -1));
const ci = blockBootstrapCi(fav, Math.round(63 / 3));
const train = pts.filter((p) => p.date < "2019-01-01");
const topN = train
  .filter(buy)
  .sort((a, b) => presetComposite(b.scores, preset) - presetComposite(a.scores, preset))
  .slice(0, tr.length);

console.log(
  JSON.stringify(
    {
      trainFav: +favPct(tr).toFixed(1),
      trainN: tr.length,
      testFav: +favPct(te).toFixed(1),
      testN: te.length,
      fullFav: +favPct(all).toFixed(1),
      fullN: all.length,
      fullCi: ci,
      orthogonalTrainPt: +(favPct(tr) - favPct(topN)).toFixed(1),
    },
    null,
    1
  )
);
