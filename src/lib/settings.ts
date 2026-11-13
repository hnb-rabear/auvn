import type { CriterionKey, Preset, Zone } from "./types";
import { DEFAULT_WEIGHTS } from "./types";
import { ringBrand, type RingBrand } from "./ring-gold";

export const SETTINGS_KEY = "au-settings-v2";

export interface Settings {
  weights: Record<CriterionKey, number>;
  presetId: string | null;
  ringBrand: RingBrand;
  /** Lượng mua "bình thường" mỗi tháng (chỉ) — Bear DCA nhân hệ số lên số này. */
  dcaBaseChi: number;
}

export const DEFAULT_SETTINGS: Settings = {
  weights: DEFAULT_WEIGHTS,
  presetId: null,
  ringBrand: "btmc",
  dcaBaseChi: 1,
};

/** Số chỉ hợp lệ (0.1..100), ngoài khoảng / không phải số ⇒ mặc định. */
export function dcaBaseChi(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0.1 && v <= 100 ? v : DEFAULT_SETTINGS.dcaBaseChi;
}

/** Số chỉ tháng này = mức thường × hệ số, làm tròn 0.05 chỉ (bội số nhỏ nhất tiệm hay bán). */
export function dcaChiThisMonth(base: number, mult: number): number {
  return Math.round(base * mult * 20) / 20;
}

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
      dcaBaseChi: dcaBaseChi(s?.dcaBaseChi),
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
