import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAuvnSummary, type AuvnSummary } from "../src/lib/summary";
import type {
  AccumulationAnalysis,
  AccumulationHealth,
  Analysis,
  BearDcaAnalysis,
  BearDcaHealth,
  BottomAnalysis,
  FusionHealthFile,
  PresetHealthFile,
  VnGoldEntry,
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

/** Lịch sử tự tích luỹ — thiếu file thì dùng mặc định, đừng chặn cả summary. */
function readJsonOr<T>(file: string, fallback: T): T {
  return existsSync(join(DATA_DIR, file)) ? readJson<T>(file) : fallback;
}

/**
 * summary.json của lần chạy trước; `null` khi thiếu hoặc hỏng. Chỉ ba field được so
 * (`dataDate`, `signals.presets`, `accumulation.bearDca.phase`) và cả ba đã có từ
 * schema 1.0, nên không cần chặn theo version — `computeChanged` tự phòng thiếu field.
 */
function prevSummary(): AuvnSummary | null {
  try {
    return readJsonOr<AuvnSummary | null>("summary.json", null);
  } catch {
    return null;
  }
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
    bottom: readJson<BottomAnalysis>("bottom.json"),
    vnHistory: readJsonOr<VnGoldEntry[]>("history/vn-gold.json", []),
    // Snapshot lần trước (chính file sắp bị ghi đè) để tính `changed`. Schema khác ⇒ bỏ
    // qua: field cũ không so được, thà báo "mới" còn hơn báo sai là "không đổi".
    prev: prevSummary(),
  });

  writeFileSync(join(DATA_DIR, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(
    `OK: summary.json (v${summary.schemaVersion}) -> consensus=${summary.signals.consensus.label}, dcaMult=${summary.accumulation.effectiveBuyMultiplier}, health=${summary.modelHealth.overall}`
  );
}

if (process.argv[1]?.includes("generate-summary")) {
  generateSummary();
}
