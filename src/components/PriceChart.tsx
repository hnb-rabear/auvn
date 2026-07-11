"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelinePoint, VnGoldEntry } from "@/lib/types";
import { applyBrushDrag, zoomTo } from "@/lib/brush";
import { RANGES, MIN_SPAN, windowFor, sjcUsdMap, buildGeom } from "@/lib/price-chart";
import { indexOnOrAfter, indexOnOrBefore } from "@/lib/timeline";

/** ngưỡng px phân biệt chạm (chọn ngày) vs kéo (pan) — cùng giá trị TimeMachine */
const TAP_PX = 6;

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString("vi-VN")}`;

export default function PriceChart({
  points,
  vnRows,
  selectedIdx,
  onSelect,
  buyDots,
  bottomDots,
}: {
  points: TimelinePoint[];
  vnRows: VnGoldEntry[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  buyDots: number[];
  bottomDots: number[];
}) {
  const [months, setMonths] = useState<number | null>(1);
  /** null = suy ra cửa sổ từ months qua windowFor (mặc định); không null = Custom (pan hoặc chọn ngày) */
  const [win, setWin] = useState<{ start: number; span: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ pointerId: number; originX: number; anchorStart: number; moved: boolean } | null>(null);
  // trạng thái pinch 2 ngón (giống TimeMachine)
  const pinch = useRef<{ startDist: number; anchorSpan: number; centerIdx: number } | null>(null);
  const pts = useRef<Map<number, number>>(new Map()); // pointerId -> clientX

  const def = windowFor(points.length, months);
  const span = win?.span ?? def.span;
  const start = Math.max(0, Math.min(win?.start ?? def.start, points.length - span));
  const end = start + span;
  // cửa sổ mới nhất cho listener wheel gắn 1 lần (tránh closure cũ) —
  // TimeMachine tách startRef + wheelState vì lý do lịch sử; 1 ref là đủ.
  const view = useRef({ start, span, total: points.length });
  view.current = { start, span, total: points.length };
  const dates = useMemo(() => points.map((p) => p.date), [points]);
  const activeLabel = win !== null ? "Tùy chỉnh" : RANGES.find((r) => r.months === months)?.label ?? "Tùy chỉnh";

  /** Áp cửa sổ tuỳ chỉnh theo cặp index [từ, đến], kẹp biên + MIN_SPAN — chuyển sang Custom. */
  const applyCustomRange = (fromIdx: number, toIdx: number) => {
    const lo = Math.max(0, Math.min(fromIdx, points.length - 1));
    const hi = Math.max(lo, Math.min(toIdx, points.length - 1));
    const sp = Math.min(points.length, Math.max(MIN_SPAN, hi - lo + 1));
    setWin({ start: Math.max(0, Math.min(lo, points.length - sp)), span: sp });
  };

  const sjcUsd = useMemo(() => sjcUsdMap(vnRows), [vnRows]);
  const geom = useMemo(() => buildGeom(points, start, span, sjcUsd), [points, start, span, sjcUsd]);

  const xToIdx = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return start + Math.round(frac * (span - 1));
  };

  // 1 ngón: tap = chọn ngày, kéo ngang = pan; 2 ngón: pinch zoom — cùng cơ chế TimeMachine
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
      const next = zoomTo(pinch.current.anchorSpan, factor, pinch.current.centerIdx, points.length, MIN_SPAN);
      setWin({ start: next.start, span: next.span });
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
    const next = applyBrushDrag("pan", d.anchorStart, span, deltaIdx, points.length, MIN_SPAN);
    setWin({ start: next.start, span }); // pan ⇒ Custom tự động là nhãn đang chọn
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = drag.current?.pointerId === e.pointerId && drag.current?.moved === false;
    if (wasTap) {
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
  // (React onWheel là passive ⇒ preventDefault vô hiệu). view ref cập nhật mỗi
  // render để không gắn/gỡ listener mỗi lần span/start đổi.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const { start: st, span: sp, total } = view.current;
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const centerIdx = st + Math.round(frac * (sp - 1));
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const next = zoomTo(sp, factor, centerIdx, total, MIN_SPAN);
      setWin({ start: next.start, span: next.span });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [points.length]);

  const inWin = (i: number) => i >= start && i < end;
  const dotStyle = (i: number) => ({
    left: `${(geom.x(i) / geom.W) * 100}%`,
    top: `${(geom.y(points[i].price) / geom.H) * 100}%`,
  });

  return (
    <section className="card pc">
      <div className="pc-ranges">
        {!expanded ? (
          <>
            <span className="pc-chip">{activeLabel}</span>
            <button
              className="iconbtn small-btn pc-toggle"
              onClick={() => setExpanded(true)}
              aria-label="Mở rộng bộ chọn khoảng thời gian"
              aria-expanded={false}
            >
              ◂
            </button>
          </>
        ) : (
          <>
            {RANGES.map((r) => (
              <button
                key={r.label}
                className={`iconbtn small-btn ${win === null && months === r.months ? "active" : ""}`}
                onClick={() => {
                  setMonths(r.months);
                  setWin(null); // range mới neo về cuối, thoát Custom
                  setExpanded(false);
                }}
              >
                {r.label}
              </button>
            ))}
            <button
              className={`iconbtn small-btn ${win !== null ? "active" : ""}`}
              onClick={() => {
                setWin(win ?? { start, span }); // giữ cửa sổ đang hiển thị làm mốc Custom
                setExpanded(false);
              }}
            >
              Tùy chỉnh
            </button>
            <button
              className="iconbtn small-btn pc-toggle"
              onClick={() => setExpanded(false)}
              aria-label="Thu gọn bộ chọn khoảng thời gian"
              aria-expanded={true}
            >
              ▸
            </button>
          </>
        )}
        <span className="pc-legend muted small">
          <i className="pc-line xau" /> XAU/USD <i className="pc-line sjc" /> SJC (quy đổi $)
        </span>
      </div>
      {win !== null && (
        <div className="pc-dates muted small">
          <input
            type="date"
            value={points[start].date}
            min={points[0].date}
            max={points[end - 1].date}
            onChange={(e) => e.target.value && applyCustomRange(indexOnOrAfter(dates, e.target.value), end - 1)}
          />
          <span aria-hidden>→</span>
          <input
            type="date"
            value={points[end - 1].date}
            min={points[start].date}
            max={points[points.length - 1].date}
            onChange={(e) => e.target.value && applyCustomRange(start, indexOnOrBefore(dates, e.target.value))}
          />
        </div>
      )}

      <div className="pc-chartwrap">
        <svg
          ref={svgRef}
          className="pc-chart"
          viewBox={`0 0 ${geom.W} ${geom.H}`}
          preserveAspectRatio="none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          aria-label="Biểu đồ giá — chạm để chọn ngày, kéo để trượt, chụm 2 ngón hoặc lăn chuột để zoom"
        >
          <path d={geom.xauPath} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.85" />
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
        {/* marker overlay HTML — tròn tuyệt đối (SVG preserveAspectRatio=none kéo méo circle) */}
        <div className="tm-markers" aria-hidden>
          {buyDots.filter(inWin).map((i) => (
            <span key={`b${i}`} className="tm-mk buy" style={dotStyle(i)} />
          ))}
          {bottomDots.filter(inWin).map((i) => (
            <span key={`s${i}`} className="tm-mk start" style={dotStyle(i)} />
          ))}
          {selectedIdx !== null && inWin(selectedIdx) && (
            <span className="tm-mk cursor" style={dotStyle(selectedIdx)} />
          )}
        </div>
        {/* 1 trục $ chung cho cả 2 đường (tuyệt đối, không normalize) — SJC quy đổi cùng đơn vị XAU/USD */}
        <span className="pc-axis right top muted small">{fmtUsd(geom.max)}</span>
        <span className="pc-axis right bottom muted small">{fmtUsd(geom.min)}</span>
        <span className="tm-edge from" aria-hidden>{fmtDate(points[start].date)}</span>
        <span className="tm-edge to" aria-hidden>{fmtDate(points[end - 1].date)}</span>
      </div>

      <p className="muted small pc-note">
        ● ngày đồng thuận MUA · ◆ khởi đầu vùng đáy (walk-forward) · chạm chart để xem cả trang
        as-of ngày đó{geom.sjcPath === null && geom.sjcTailPath === null && vnRows.length > 0 ? ` · SJC: dữ liệu từ ${fmtDate(vnRows[0].date)}` : ""}
        {geom.sjcFrom ? ` · SJC: từ ${fmtDate(geom.sjcFrom)}` : ""}
        {geom.sjcAsOf ? ` · SJC: giữ giá ngày ${fmtDate(geom.sjcAsOf)} (nguồn chưa cập nhật)` : ""}
      </p>
    </section>
  );
}
