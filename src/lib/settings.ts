import type { Preset, Zone } from "./types";

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
