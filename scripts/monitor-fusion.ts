/**
 * Giám sát thoái hóa tầng "MUA độ tin cao" 3m: mỗi cron tính lại B (composite-buy
 * ∧ cycleBin==3) trên timeline mới nhất, so với composite-gốc ở cả 2 giai đoạn +
 * placebo đồng-n train. status=degraded khi B không còn vượt composite cả 2 giai
 * đoạn HOẶC placebo train ≤ 0. Ghi public/data/fusion-health.json (UI đọc file này).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRESETS,
  type FusionHealth,
  type FusionHealthFile,
  type Timeline,
  type TimelinePoint,
} from "../src/lib/types";
import { composite, stats, blockBootstrapCi, SPLIT_DATE, MIN_SIGNALS, type H } from "./study-lib";
import { HIGH_CONFIDENCE_BIN } from "../src/lib/fusion";

const DATA_DIR = join(process.cwd(), "public", "data");
const STEP = 3;

function favOf(pts: TimelinePoint[], h: H): { n: number; fav: number } {
  const s = stats(pts.map((p) => p.returns[h] as number));
  return { n: s.n, fav: s.fav };
}

function main() {
  const tl: Timeline = JSON.parse(readFileSync(join(DATA_DIR, "timeline.json"), "utf8"));
  const preset = PRESETS.find((p) => p.id === "3m")!;
  const h = String(preset.horizonDays) as H; // "63"
  const pts = tl.points.filter((p) => p.returns[h] !== null && p.cycleBin !== undefined);

  const comp = (p: TimelinePoint) => composite(p, preset.weights) >= preset.buyThreshold;
  const bot = (p: TimelinePoint) => p.cycleBin === HIGH_CONFIDENCE_BIN;

  const train = pts.filter((p) => p.date < SPLIT_DATE);
  const test = pts.filter((p) => p.date >= SPLIT_DATE);

  const bTrain = favOf(train.filter((p) => comp(p) && bot(p)), h);
  const bTest = favOf(test.filter((p) => comp(p) && bot(p)), h);
  const cTrain = favOf(train.filter(comp), h);
  const cTest = favOf(test.filter(comp), h);

  // placebo đồng-n train: composite-buy top-n_B theo điểm giảm dần
  const compTrainSorted = train
    .filter(comp)
    .sort((a, b) => composite(b, preset.weights) - composite(a, preset.weights));
  const topN = compTrainSorted.slice(0, bTrain.n);
  const orthoTrainPt =
    bTrain.n >= MIN_SIGNALS ? Math.round((bTrain.fav - favOf(topN, h).fav) * 1000) / 10 : null;

  const ci = blockBootstrapCi(
    test.filter((p) => comp(p) && bot(p)).map((p) => p.returns[h] as number),
    Math.ceil(preset.horizonDays / STEP)
  );

  const enough = bTrain.n >= MIN_SIGNALS && bTest.n >= MIN_SIGNALS;
  let status: FusionHealth["status"];
  if (!enough) status = "insufficient";
  else if (!(bTrain.fav > cTrain.fav && bTest.fav > cTest.fav) || (orthoTrainPt !== null && orthoTrainPt <= 0))
    status = "degraded";
  else status = "ok";

  const r1 = (x: number) => Math.round(x * 1000) / 10;
  const item: FusionHealth = {
    presetId: "3m",
    bTrainFav: enough ? r1(bTrain.fav) : null,
    bTestFav: enough ? r1(bTest.fav) : null,
    compTrainFav: r1(cTrain.fav),
    compTestFav: r1(cTest.fav),
    bTestN: bTest.n,
    bTestCi95: ci,
    orthoTrainPt,
    status,
  };
  const out: FusionHealthFile = { generatedAt: new Date().toISOString(), item };
  writeFileSync(join(DATA_DIR, "fusion-health.json"), JSON.stringify(out, null, 1));
  console.log(
    `fusion 3m: status=${status} | B ${item.bTrainFav}%/${item.bTestFav}% vs comp ${item.compTrainFav}%/${item.compTestFav}% | ` +
      `ortho train ${orthoTrainPt ?? "—"}pt | CI ${ci ? ci[0] + ".." + ci[1] + "%" : "—"}`
  );
}

main();
