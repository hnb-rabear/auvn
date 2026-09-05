import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAuvnSummary } from "../src/lib/summary";
import type {
  AccumulationAnalysis,
  AccumulationHealth,
  Analysis,
  BearDcaAnalysis,
  BearDcaHealth,
  FusionHealthFile,
  PresetHealthFile,
} from "../src/lib/types";
import type { BottomHealth } from "./monitor-bottom";

const DATA_DIR = join(process.cwd(), "public", "data");

function readJson<T>(file: string): T {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) {
    throw new Error(`File not found for summary generation: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function generateSummary(): void {
  const summary = buildAuvnSummary({
    analysis: readJson<Analysis>("analysis.json"),
    accumulation: readJson<AccumulationAnalysis>("accumulation.json"),
    bearDca: readJson<BearDcaAnalysis>("bear-dca.json"),
    presetHealth: readJson<PresetHealthFile>("preset-health.json"),
    bottomHealth: readJson<BottomHealth>("bottom-health.json"),
    accumulationHealth: readJson<AccumulationHealth>("accumulation-health.json"),
    bearDcaHealth: readJson<BearDcaHealth>("bear-dca-health.json"),
    fusionHealth: readJson<FusionHealthFile>("fusion-health.json"),
  });

  writeFileSync(join(DATA_DIR, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(
    `OK: summary.json (v${summary.schemaVersion}) -> consensus=${summary.signals.consensus.label}, dcaMult=${summary.accumulation.effectiveBuyMultiplier}, health=${summary.modelHealth.overall}`
  );
}

if (process.argv[1]?.includes("generate-summary")) {
  generateSummary();
}
