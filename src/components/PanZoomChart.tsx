"use client";

/**
 * Biểu đồ thời gian pan/zoom dùng chung (PriceChart · TimeMachine · BearDownsideCard) —
 * spec docs/superpowers/specs/2026-07-12-unified-panzoom-chart-design.md.
 *
 * Controlled component: cha giữ state cửa sổ {start, span} + selectedIdx và tính geom
 * qua buildGeom (cha cần meta sjcFrom/sjcAsOf/min/max cho chrome riêng). Lõi sở hữu
 * MỘT bản duy nhất của: SVG + cử chỉ (tap chọn ngày / kéo pan / pinch 2 ngón / lăn
 * chuột zoom) + marker overlay HTML + nhãn ngày 2 góc + nhãn trục $ (tùy chọn).
 */
import { useEffect, useRef, type ReactNode } from "react";
import type { TimelinePoint } from "@/lib/types";
import { MIN_SPAN, idxAtFrac, fmtPrice, type ChartGeom } from "@/lib/price-chart";
import { applyBrushDrag, zoomTo } from "@/lib/brush";

/** ngưỡng px phân biệt chạm (chọn ngày) vs kéo (pan) */
const TAP_PX = 6;

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

/** 1 lớp chấm marker — className là biến thể .tm-mk.* sẵn có (buy/sell/exp/start…) */
export interface MarkerLayer {
  key: string;
  className: string;
  idxs: number[];
}

export default function PanZoomChart({
  points,
  geom,
  window: win,
  onWindowChange,
  onSelect,
  selectedIdx = null,
  markers = [],
  height,
  denseDots = false,
  showAxis = false,
  ariaLabel,
  children,
}: {
  points: TimelinePoint[];
  /** cha tính qua buildGeom(points, start, span, sjcUsd?, W, H) với H === height */
  geom: ChartGeom;
  window: { start: number; span: number };
  /** pan/pinch/wheel gọi — gesture để cha quyết đổi nhãn nút range hay không */
  onWindowChange(next: { start: number; span: number }, gesture: "pan" | "zoom"): void;
  onSelect?(idx: number): void;
  selectedIdx?: number | null;
  /** thứ tự mảng = thứ tự vẽ (lớp sau đè lớp trước); chấm cursor luôn trên cùng */
  markers?: MarkerLayer[];
  /** px hiển thị — phải trùng H đã đưa vào buildGeom để stroke không bị kéo giãn */
  height: number;
  denseDots?: boolean;
  /** nhãn $ min/max mép phải (PriceChart) */
  showAxis?: boolean;
  ariaLabel: string;
  /** phần tử absolute thêm trong wrapper (FAB ◀▶ của TimeMachine) */
  children?: ReactNode;
}) {
  const { start, span } = win;
  const end = start + span;
  const total = points.length;
  const svgRef = useRef<SVGSVGElement | null>(null);
  // trạng thái cử chỉ 1 ngón (pan/tap) — px màn hình
  const drag = useRef<{ pointerId: number; originX: number; anchorStart: number; moved: boolean } | null>(null);
  // trạng thái pinch 2 ngón
  const pinch = useRef<{ startDist: number; anchorSpan: number; centerIdx: number } | null>(null);
  const pts = useRef<Map<number, number>>(new Map()); // pointerId -> clientX
  // cửa sổ + callback mới nhất cho listener wheel gắn 1 lần (tránh closure cũ)
  const view = useRef({ start, span, total });
  view.current = { start, span, total };
  const onWindowChangeRef = useRef(onWindowChange);
  onWindowChangeRef.current = onWindowChange;

  const xToIdx = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return idxAtFrac(start, span, (clientX - rect.left) / rect.width);
  };

  // 1 ngón: tap = chọn ngày, kéo ngang = pan; 2 ngón: pinch zoom
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pts.current.set(e.pointerId, e.clientX);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (pts.current.size >= 2) {
      // chỉ khởi tạo pinch khi vừa chạm ngón thứ 2; ngón thứ 3+ bỏ qua, không đụng drag
      if (pts.current.size === 2) {
        const xs = [...pts.current.values()];
        const dist = Math.abs(xs[0] - xs[1]) || 1;
        const centerX = (xs[0] + xs[1]) / 2;
        pinch.current = {
          startDist: dist,
          anchorSpan: span,
          // xToIdx trả null khi rect chưa đo được — neo tâm giữa cửa sổ
          centerIdx: xToIdx(centerX) ?? start + Math.floor(span / 2),
        };
      }
      drag.current = null;
      return;
    }
    drag.current = { pointerId: e.pointerId, originX: e.clientX, anchorStart: start, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, e.clientX);

    if (pinch.current && pts.current.size >= 2) {
      const xs = [...pts.current.values()];
      const dist = Math.abs(xs[0] - xs[1]) || 1;
      const factor = pinch.current.startDist / dist;
      const next = zoomTo(pinch.current.anchorSpan, factor, pinch.current.centerIdx, total, MIN_SPAN);
      onWindowChange(next, "zoom");
      return;
    }

    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const dxPx = e.clientX - d.originX;
    if (!d.moved && Math.abs(dxPx) < TAP_PX) return;
    d.moved = true;
    const deltaIdx = -Math.round((dxPx / rect.width) * span);
    const next = applyBrushDrag("pan", d.anchorStart, span, deltaIdx, total, MIN_SPAN);
    onWindowChange({ start: next.start, span }, "pan");
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = drag.current?.pointerId === e.pointerId && drag.current?.moved === false;
    if (wasTap && onSelect) {
      const i = xToIdx(e.clientX);
      if (i !== null) onSelect(i);
    }
    pts.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    if (pts.current.size < 2) {
      pinch.current = null;
      // còn đúng 1 ngón sau khi nhả khỏi pinch ⇒ tiếp tục cho phép pan bằng ngón đó
      if (pts.current.size === 1) {
        const [pid, clientX] = [...pts.current.entries()][0];
        drag.current = { pointerId: pid, originX: clientX, anchorStart: view.current.start, moved: false };
      }
    }
  };

  const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    pts.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    if (pts.current.size < 2) pinch.current = null;
  };

  // wheel zoom — listener gốc non-passive để preventDefault chặn cuộn trang
  // (React onWheel là passive ⇒ preventDefault vô hiệu). view/callback đọc qua ref
  // để không gắn/gỡ listener mỗi lần span/start đổi.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const { start: st, span: sp, total: tt } = view.current;
      const centerIdx = idxAtFrac(st, sp, (e.clientX - rect.left) / rect.width);
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const next = zoomTo(sp, factor, centerIdx, tt, MIN_SPAN);
      onWindowChangeRef.current(next, "zoom");
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  if (total < 2 || span < 2) return null;

  const inWin = (i: number) => i >= start && i < end;
  // marker vẽ bằng HTML overlay (luôn tròn) thay vì <circle> trong SVG —
  // SVG dùng preserveAspectRatio="none" nên <circle> bị kéo méo thành elip.
  const dotStyle = (i: number) => {
    const top = geom.yOf(i);
    return top === null
      ? null
      : {
          left: `${(geom.x(i) / geom.W) * 100}%`,
          top: `${(top / geom.H) * 100}%`,
        };
  };

  return (
    <div className="pzc-wrap">
      <svg
        ref={svgRef}
        className="pzc-chart"
        style={{ height }}
        viewBox={`0 0 ${geom.W} ${geom.H}`}
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        aria-label={ariaLabel}
      >
        {geom.xauPath && <path d={geom.xauPath} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.85" />}
        {geom.sjcPath && (
          <path d={geom.sjcPath} fill="none" stroke="#7fb1e0" strokeWidth="1.2" opacity="0.8" />
        )}
        {geom.sjcTailPath && (
          <path
            d={geom.sjcTailPath}
            fill="none"
            stroke="#7fb1e0"
            strokeWidth="1.2"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}
        {selectedIdx !== null && inWin(selectedIdx) && (
          <line
            x1={geom.x(selectedIdx)}
            y1="0"
            x2={geom.x(selectedIdx)}
            y2={geom.H}
            stroke="#ece5d8"
            strokeWidth="1"
            opacity="0.5"
          />
        )}
      </svg>
      <div className={`tm-markers${denseDots ? " dense" : ""}`} aria-hidden>
        {markers.map((layer) =>
          layer.idxs.filter(inWin).map((i) => {
            const style = dotStyle(i);
            return style ? <span key={`${layer.key}${i}`} className={`tm-mk ${layer.className}`} style={style} /> : null;
          })
        )}
        {selectedIdx !== null && inWin(selectedIdx) && (() => {
          const style = dotStyle(selectedIdx);
          return style ? <span className="tm-mk cursor" style={style} /> : null;
        })()}
      </div>
      {showAxis && geom.hasData && (
        <>
          <span className="pc-axis right top muted small">{fmtPrice(geom.max, geom.unit)}</span>
          <span className="pc-axis right bottom muted small">{fmtPrice(geom.min, geom.unit)}</span>
        </>
      )}
      {/* dải ngày 2 góc: biết đang xem khung thời gian nào khi vuốt */}
      <span className="tm-edge from" aria-hidden>{fmtDate(points[start].date)}</span>
      <span className="tm-edge to" aria-hidden>{fmtDate(points[Math.min(end, total) - 1].date)}</span>
      {children}
    </div>
  );
}
