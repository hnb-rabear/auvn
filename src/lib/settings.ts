import type { CriterionKey, Preset, Zone } from "./types";
import { DEFAULT_WEIGHTS } from "./types";
import { ringBrand, type RingBrand } from "./ring-gold";

export const SETTINGS_KEY = "au-settings-v2";

export interface Settings {
  weights: Record<CriterionKey, number>;
  presetId: string | null;
  ringBrand: RingBrand;
}

export const DEFAULT_SETTINGS: Settings = {
  weights: DEFAULT_WEIGHTS,
  presetId: null,
  ringBrand: "btmc",
};

export function parseSettings(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const s = JSON.parse(raw);
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      if (
        typeof s?.weights?.[k] !== "number" ||
        !Number.isFinite(s.weights[k]) ||
        s.weights[k] < 0
      ) {
        return DEFAULT_SETTINGS;
      }
    }
    return {
      weights: s.weights,
      presetId: typeof s.presetId === "string" ? s.presetId : null,
      ringBrand: ringBrand(s?.ringBrand),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Nhãn mode hiển thị trên FAB: preset > tùy chỉnh > toàn cảnh. */
export function fabLabel(preset: Preset | null, customized: boolean): string {
  if (preset) return preset.label;
  if (customized) return "Tùy chỉnh";
  return "Toàn cảnh";
}

/** Gộp 5 zone về 3 lớp màu (buy/sell/neutral). */
export function zoneClass(zone: Zone): string {
  if (zone === "buy" || zone === "strong-buy") return "buy";
  if (zone === "sell" || zone === "strong-sell") return "sell";
  return "neutral";
}
