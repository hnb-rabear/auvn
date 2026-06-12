"use client";

import { useMemo, useRef } from "react";
import { applyBrushDrag, centerWindow, type BrushDragMode } from "@/lib/brush";

const W = 700;
const H = 34;
/** vùng bắt handle tính theo px màn hình — không co theo viewBox trên màn hẹp */
const HANDLE_PX = 14;

/**
 * Minimap brush: vẽ thu nhỏ toàn bộ lịch sử giá; kéo 2 đầu để co giãn
 * cửa sổ thời gian, kéo giữa để pan, bấm ngoài cửa sổ để nhảy tới đó.
 * Mọi pointerdown đi qua một handler trên svg: mode xác định theo px màn hình
 * nên handle luôn đủ rộng cho ngón tay, kể cả khi cửa sổ rất hẹp.
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
    pointerId: number;
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
  // grip nhìn thấy thu hẹp khi cửa sổ rất hẹp (trang trí — hit thật tính theo px màn hình)
  const grip = Math.min(14, Math.max(4, winW / 2));

  const onPointerDown = (e: React.PointerEvent) => {
    if (drag.current || e.button !== 0 || !e.isPrimary) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    e.preventDefault();
    // preventDefault chặn focus mặc định — tự focus để phím mũi tên dùng được ngay sau khi bấm
    svgRef.current?.focus();
    const xPx = e.clientX - rect.left;
    const leftPx = (winX / W) * rect.width;
    const rightPx = ((winX + winW) / W) * rect.width;
    const dLeft = Math.abs(xPx - leftPx);
    const dRight = Math.abs(xPx - rightPx);
    // trong cửa sổ: vùng resize tối đa 1/3 bề rộng mỗi bên để phần giữa luôn pan được;
    // ngoài cửa sổ: giữ nguyên HANDLE_PX
    const insideReach = Math.min(HANDLE_PX, (rightPx - leftPx) / 3);
    const reachLeft = xPx < leftPx ? HANDLE_PX : insideReach;
    const reachRight = xPx > rightPx ? HANDLE_PX : insideReach;
    let mode: BrushDragMode;
    let anchorStart = start;
    if (dLeft <= reachLeft && dLeft <= dRight) {
      mode = "left";
    } else if (dRight <= reachRight) {
      mode = "right";
    } else if (xPx > leftPx && xPx < rightPx) {
      mode = "pan";
    } else {
      // bấm ngoài cửa sổ: nhảy cửa sổ tới điểm bấm rồi tiếp tục như pan
      mode = "pan";
      const frac = Math.max(0, Math.min(1, xPx / rect.width));
      anchorStart = centerWindow(Math.round(frac * total), span, total);
      onChange(anchorStart, span);
    }
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      mode,
      anchorStart,
      anchorSpan: span,
      originX: e.clientX,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const deltaIdx = Math.round(((e.clientX - d.originX) / rect.width) * total);
    const next = applyBrushDrag(d.mode, d.anchorStart, d.anchorSpan, deltaIdx, total, minSpan);
    onChange(next.start, next.span);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current && e.pointerId !== drag.current.pointerId) return;
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <path d={path} fill="none" stroke="#e6b84c" strokeWidth="1" opacity="0.45" />
      {/* lớp dưới chỉ để hiển thị + cursor — pointerdown xử lý ở svg */}
      <rect className="tm-brush-dim" x="0" y="0" width={winX} height={H} />
      <rect
        className="tm-brush-dim"
        x={winX + winW}
        y="0"
        width={Math.max(0, W - winX - winW)}
        height={H}
      />
      <rect className="tm-brush-win" x={winX} y="0" width={winW} height={H} />
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
        x={winX - grip / 2}
        y="0"
        width={grip}
        height={H}
      />
      <rect
        className="tm-brush-handle"
        x={winX + winW - grip / 2}
        y="0"
        width={grip}
        height={H}
      />
    </svg>
  );
}
