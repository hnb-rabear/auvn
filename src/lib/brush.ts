/** Toán cửa sổ brush (minimap) — thuần, không React. Đơn vị: index điểm timeline. */

export type BrushDragMode = "pan" | "left" | "right";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Áp dụng kéo brush từ vị trí neo (lúc pointerdown) + độ dời deltaIdx.
 * - pan: giữ span, dời start
 * - left: mép phải đứng yên, dời mép trái (kéo ra = giãn, kéo vào = co)
 * - right: mép trái đứng yên, dời mép phải
 */
export function applyBrushDrag(
  mode: BrushDragMode,
  anchorStart: number,
  anchorSpan: number,
  deltaIdx: number,
  total: number,
  minSpan: number
): { start: number; span: number } {
  const min = Math.min(minSpan, total);
  if (mode === "pan") {
    return { start: clamp(anchorStart + deltaIdx, 0, total - anchorSpan), span: anchorSpan };
  }
  if (mode === "left") {
    const end = anchorStart + anchorSpan;
    const start = clamp(anchorStart + deltaIdx, 0, end - min);
    return { start, span: end - start };
  }
  return { start: anchorStart, span: clamp(anchorSpan + deltaIdx, min, total - anchorStart) };
}

/** start của cửa sổ span điểm căn giữa quanh centerIdx, kẹp trong [0, total - span]. */
export function centerWindow(centerIdx: number, span: number, total: number): number {
  return Math.max(0, Math.min(centerIdx - Math.floor(span / 2), total - span));
}
