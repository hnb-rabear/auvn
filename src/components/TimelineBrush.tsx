"use client";

import { useMemo, useRef } from "react";
import { applyBrushDrag, centerWindow, type BrushDragMode } from "@/lib/brush";

const W = 700;
const H = 34;
/** bề rộng vùng bắt handle theo viewBox (~14px khi render 700px) */
const HANDLE_HIT = 14;

/**
 * Minimap brush: vẽ thu nhỏ toàn bộ lịch sử giá; kéo 2 đầu để co giãn
 * cửa sổ thời gian, kéo giữa để pan, bấm ngoài cửa sổ để nhảy tới đó.
 */
export default function TimelineBrush({
  prices,
  start,
  span,
  minSpan,
  onChange,
}: {
  prices: number[];
  start: number;
  span: number;
  minSpan: number;
  onChange: (start: number, span: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{
    mode: BrushDragMode;
    anchorStart: number;
    anchorSpan: number;
    originX: number;
  } | null>(null);
  const total = prices.length;

  const path = useMemo(() => {
    if (prices.length < 2) return "";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const x = (i: number) => (i / (prices.length - 1)) * W;
    const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 6) - 3;
    return prices
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join("");
  }, [prices]);

  if (total < 2) return null;

  // cửa sổ phủ [start, start + span) trên total điểm
  const winX = (start / total) * W;
  const winW = (span / total) * W;
  // thu hẹp vùng bắt handle khi cửa sổ rất hẹp (min zoom) để thân vẫn pan được
  const hit = Math.min(HANDLE_HIT, Math.max(4, winW / 2));

  const beginDrag = (mode: BrushDragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, anchorStart: start, anchorSpan: span, originX: e.clientX };
  };

  /** bấm ngoài cửa sổ: nhảy cửa sổ tới điểm bấm rồi tiếp tục như pan */
  const onJump = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const s = centerWindow(Math.round(frac * total), span, total);
    onChange(s, span);
    drag.current = { mode: "pan", anchorStart: s, anchorSpan: span, originX: e.clientX };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width === 0) return;
    const deltaIdx = Math.round(((e.clientX - d.originX) / rect.width) * total);
    const next = applyBrushDrag(d.mode, d.anchorStart, d.anchorSpan, deltaIdx, total, minSpan);
    onChange(next.start, next.span);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    svgRef.current?.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.key === "ArrowLeft" ? -1 : 1) * Math.max(1, Math.round(span * 0.1));
    const next = e.shiftKey
      ? applyBrushDrag("right", start, span, step, total, minSpan)
      : applyBrushDrag("pan", start, span, step, total, minSpan);
    onChange(next.start, next.span);
  };

  return (
    <svg
      ref={svgRef}
      className="tm-brush"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      tabIndex={0}
      role="slider"
      aria-label="Chọn khung thời gian — kéo 2 đầu để co giãn, kéo giữa để di chuyển"
      aria-valuemin={0}
      aria-valuemax={total - span}
      aria-valuenow={start}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <path d={path} fill="none" stroke="#e6b84c" strokeWidth="1" opacity="0.45" />
      {/* vùng mờ ngoài cửa sổ — bấm để nhảy */}
      <rect className="tm-brush-dim" x="0" y="0" width={winX} height={H} onPointerDown={onJump} />
      <rect
        className="tm-brush-dim"
        x={winX + winW}
        y="0"
        width={Math.max(0, W - winX - winW)}
        height={H}
        onPointerDown={onJump}
      />
      {/* thân cửa sổ — kéo để pan */}
      <rect
        className="tm-brush-win"
        x={winX}
        y="0"
        width={winW}
        height={H}
        onPointerDown={beginDrag("pan")}
      />
      {/* tay nắm trái/phải — kéo để co giãn (grip nhìn thấy + hit area rộng) */}
      <rect className="tm-brush-grip" x={winX - 2} y={H / 2 - 8} width="4" height="16" rx="2" />
      <rect
        className="tm-brush-grip"
        x={winX + winW - 2}
        y={H / 2 - 8}
        width="4"
        height="16"
        rx="2"
      />
      <rect
        className="tm-brush-handle"
        x={winX - hit / 2}
        y="0"
        width={hit}
        height={H}
        onPointerDown={beginDrag("left")}
      />
      <rect
        className="tm-brush-handle"
        x={winX + winW - hit / 2}
        y="0"
        width={hit}
        height={H}
        onPointerDown={beginDrag("right")}
      />
    </svg>
  );
}
