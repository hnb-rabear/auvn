"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CRITERION_LABELS,
  ZONE_LABELS,
  zoneOf,
  type CriterionKey,
  type Preset,
  type Timeline,
  type Zone,
} from "@/lib/types";
import { deriveGuidance } from "@/lib/guidance";
import { highConfidenceBuy3m, HIGH_CONF_3M_EVIDENCE } from "@/lib/fusion";
import { bottomPctClass } from "@/lib/bottom";
import ActionGuidance from "./ActionGuidance";
import { applyBrushDrag, centerWindow, zoomTo } from "@/lib/brush";
import {
  composites,
  idxsAtOrAbove,
  idxsAtOrBelow,
  indexOnOrAfter,
  indexOnOrBefore,
  bottomStartIdxs,
} from "@/lib/timeline";

const fmtNum = (v: number | null, d = 1) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d });

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

function zoneClass(zone: Zone): string {
  if (zone === "buy" || zone === "strong-buy") return "buy";
  if (zone === "sell" || zone === "strong-sell") return "sell";
  return "neutral";
}

const HORIZON_LABELS: Record<"21" | "63" | "126", string> = {
  "21": "1 tháng",
  "63": "3 tháng",
  "126": "6 tháng",
};

/**
 * Đúng/sai của quyết định: mua đúng khi giá tăng, bán đúng khi giá giảm.
 * Tín hiệu bán chỉ chấm ở 1 tháng — kỳ hạn dài nó NGƯỢC là chính
 * (trung vị sau bán: 6 tháng +9,5%), chấm ✓/✗ chỉ gây hiểu lầm.
 */
function verdictFor(zone: Zone, ret: number | null, h: "21" | "63" | "126"): "right" | "wrong" | "n/a" | null {
  if (ret === null || zone === "neutral") return null;
  const buyish = zone === "buy" || zone === "strong-buy";
  if (!buyish && h !== "21") return "n/a";
  return (buyish ? ret > 0 : ret < 0) ? "right" : "wrong";
}

// timeline lấy mẫu mỗi phiên giao dịch -> ~21 phiên/tháng
const POINTS_PER_MONTH = 21;
/** cửa sổ nhỏ nhất của brush/zoom (~2 tuần) */
const MIN_SPAN = 14;
/** ngưỡng px phân biệt chạm (chọn ngày) vs kéo (pan) */
const TAP_PX = 6;
export default function TimeMachine({
  timeline,
  weights,
  preset,
  fusionDegraded,
}: {
  timeline: Timeline;
  weights: Record<CriterionKey, number>;
  preset: Preset | null;
  /** monitor báo tầng độ-tin-cao đang thoái hóa ⇒ ẩn tag "đã kiểm chứng" mọi nơi */
  fusionDegraded: boolean;
}) {
  const points = timeline.points;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));
  /** nút preset đang active: số tháng | null = "Tất cả" | "custom" = đã kéo brush */
  const [zoomMonths, setZoomMonths] = useState<number | null | "custom">(null);
  const [viewStart, setViewStart] = useState(0);
  const [viewSpan, setViewSpan] = useState(points.length);
  /** hiện vùng bán (tham khảo) trên dòng thời gian */
  const [showSell, setShowSell] = useState(false);
  /** lớp khám phá: highlight ngày có composite >= ngưỡng người dùng tự chọn.
   * null = chưa kéo, bám theo ngưỡng chuẩn của chế độ đang chọn. */
  const [showExp, setShowExp] = useState(false);
  const [expThr, setExpThr] = useState<number | null>(null);
  const [showBottomStart, setShowBottomStart] = useState(false);
  const [showGear, setShowGear] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // trạng thái cử chỉ 1 ngón (pan/tap) — px màn hình
  const drag = useRef<{
    pointerId: number;
    originX: number;
    anchorStart: number;
    moved: boolean;
  } | null>(null);
  // trạng thái pinch 2 ngón
  const pinch = useRef<{
    startDist: number;
    anchorSpan: number;
    centerIdx: number;
  } | null>(null);
  const pts = useRef<Map<number, number>>(new Map()); // pointerId -> clientX
  const p = points[idx];

  const span = Math.min(points.length, Math.max(Math.min(MIN_SPAN, points.length), viewSpan));
  const start = Math.max(0, Math.min(viewStart, points.length - span));
  const end = start + span;
  const startRef = useRef(start);
  startRef.current = start;

  const xToIdx = useCallback(
    (clientX: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return idx;
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return start + Math.round(frac * (span - 1));
    },
    [idx, start, span]
  );

  const buyThr = preset?.buyThreshold ?? 40;
  const effThr = expThr ?? buyThr;
  // composite từng ngày tính một lần; các lớp marker chỉ còn là phép lọc rẻ
  const comps = useMemo(() => composites(points, weights), [points, weights]);
  const signalIdxs = useMemo(() => idxsAtOrAbove(comps, buyThr), [comps, buyThr]);
  const sellIdxs = useMemo(() => idxsAtOrBelow(comps, -40), [comps]);
  const expIdxs = useMemo(
    () => (showExp ? idxsAtOrAbove(comps, effThr) : []),
    [showExp, comps, effThr]
  );
  const bottomStarts = useMemo(
    () => (showBottomStart ? bottomStartIdxs(points) : []),
    [showBottomStart, points]
  );
  const dates = useMemo(() => points.map((q) => q.date), [points]);
  const prevSignal = [...signalIdxs].reverse().find((i) => i < idx);
  const nextSignal = signalIdxs.find((i) => i > idx);

  const centerOn = useCallback(
    (i: number, s: number = span) => {
      const sp = Math.min(points.length, Math.max(MIN_SPAN, s));
      setViewStart(centerWindow(i, sp, points.length));
    },
    [span, points.length]
  );

  const goTo = (i: number) => {
    setIdx(i);
    if (i < start || i >= end) centerOn(i);
  };

  const applyZoom = (m: number | null) => {
    setZoomMonths(m);
    const s =
      m === null
        ? points.length
        : Math.min(points.length, Math.max(MIN_SPAN, m * POINTS_PER_MONTH));
    setViewSpan(s);
    if (m === null) setViewStart(0);
    else centerOn(idx, s);
  };

  /** Đặt cửa sổ theo khoảng index [fromIdx, toIdx] (kẹp biên, tối thiểu MIN_SPAN). */
  const applyDateRange = (fromIdx: number, toIdx: number) => {
    const lo = Math.max(0, Math.min(fromIdx, points.length - 1));
    const hi = Math.max(lo, Math.min(toIdx, points.length - 1));
    setViewStart(lo);
    setViewSpan(Math.max(MIN_SPAN, hi - lo + 1));
    setZoomMonths("custom");
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pts.current.set(e.pointerId, e.clientX);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (pts.current.size >= 2) {
      // chỉ khởi tạo pinch khi vừa chạm ngón thứ 2; ngón thứ 3+ bỏ qua, không đụng drag
      if (pts.current.size === 2) {
        const xs = [...pts.current.values()];
        const dist = Math.abs(xs[0] - xs[1]) || 1;
        const centerX = (xs[0] + xs[1]) / 2;
        pinch.current = { startDist: dist, anchorSpan: span, centerIdx: xToIdx(centerX) };
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
      setViewStart(next.start);
      setViewSpan(next.span);
      setZoomMonths("custom");
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
    setViewStart(next.start);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = drag.current?.pointerId === e.pointerId && drag.current?.moved === false;
    if (wasTap) setIdx(xToIdx(e.clientX));
    pts.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    if (pts.current.size < 2) {
      pinch.current = null;
      // còn đúng 1 ngón sau khi nhả khỏi pinch ⇒ tiếp tục cho phép pan bằng ngón đó
      if (pts.current.size === 1) {
        const [pid, clientX] = [...pts.current.entries()][0];
        drag.current = { pointerId: pid, originX: clientX, anchorStart: startRef.current, moved: false };
      }
    }
  };

  const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    pts.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    if (pts.current.size < 2) pinch.current = null;
  };

  const composite = p ? comps[idx] : 0;
  const rawZone = zoneOf(composite, buyThr);
  const isBuy = rawZone === "buy" || rawZone === "strong-buy";
  // Tầng "MUA độ tin cao" 3m của NGÀY ĐANG XEM: dùng cycleBin past-only (KHÔNG dùng
  // prob — prob là base-rate look-ahead). Cùng điều kiện với verdict live; ẩn khi degraded.
  const highConfDay =
    highConfidenceBuy3m(preset?.id ?? null, isBuy, p.cycleBin ?? -1, p.cycleBin !== undefined) &&
    !fusionDegraded;
  const isSell = rawZone === "sell" || rawZone === "strong-sell";
  // preset chỉ kiểm chứng phía mua — vùng bán chỉ hiện khi người dùng bật toggle tham khảo
  const zone: Zone = isBuy ? rawZone : isSell && showSell ? rawZone : "neutral";
  const presetH = preset ? (String(preset.horizonDays) as "21" | "63" | "126") : null;

  // Gợi ý hành động lịch sử: world-only (premium tắt) + xác suất đáy as-of-ngày
  // (walk-forward) — cùng ngưỡng live (prob≥60 & verified) nhưng chỉ tầng cycle
  // (live gộp max(cycle,swing)); past-only để "quá khứ = hiện tại".
  const histGuidance = useMemo(() => {
    const prob = p?.cycleProb ?? null;
    const n = p?.cycleN ?? 0;
    const verified = prob !== null && n >= 10;
    const high = verified && prob >= 60;
    const ciStr = p?.cycleCi ? ` (CI ${p.cycleCi[0]}–${p.cycleCi[1]}%)` : "";
    return deriveGuidance({
      zone: rawZone,
      composite,
      bottom: {
        high,
        verified,
        label: verified ? `Săn đáy: xác suất gần đáy ${Math.round(prob)}%${ciStr}.` : "Săn đáy: chưa đủ dữ liệu kiểm chứng.",
      },
      premiumPct: null, // world-only ở lịch sử
      premiumP80: null, // ⇒ cổng premium tắt
    });
  }, [rawZone, composite, p]);

  const spark = useMemo(() => {
    const win = points.slice(start, end);
    if (win.length < 2) return null;
    const W = 700;
    const H = 120;
    const prices = win.map((q) => q.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const x = (i: number) => ((i - start) / (win.length - 1)) * W;
    const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 8) - 4;
    const path = win
      .map((q, j) => `${j === 0 ? "M" : "L"}${x(start + j).toFixed(1)},${y(q.price).toFixed(1)}`)
      .join("");
    const toMarkers = (idxs: number[]) =>
      idxs
        .filter((i) => i >= start && i < end)
        .map((i) => ({ cx: x(i), cy: y(points[i].price) }));
    const markers = toMarkers(signalIdxs);
    const sellMarkers = showSell ? toMarkers(sellIdxs) : [];
    const expMarkers = toMarkers(expIdxs); // đã rỗng sẵn khi tắt lớp thử
    const startMarkers = toMarkers(bottomStarts);
    const inWindow = idx >= start && idx < end;
    return {
      W,
      H,
      path,
      cx: inWindow ? x(idx) : null,
      cy: inWindow ? y(p.price) : null,
      markers,
      sellMarkers,
      expMarkers,
      startMarkers,
      fromDate: win[0].date,
      toDate: win[win.length - 1].date,
    };
  }, [points, idx, p, signalIdxs, sellIdxs, expIdxs, showSell, start, end, bottomStarts]);

  // wheel zoom — listener gốc non-passive để preventDefault chặn cuộn trang
  // (React onWheel là passive ⇒ preventDefault vô hiệu). Ref cập nhật để không
  // gắn/gỡ listener mỗi lần span/start đổi.
  const wheelState = useRef({ span, total: points.length });
  wheelState.current = { span, total: points.length };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const { span: sp, total } = wheelState.current;
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const centerIdx = startRef.current + Math.round(frac * (sp - 1));
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const next = zoomTo(sp, factor, centerIdx, total, MIN_SPAN);
      setViewStart(next.start);
      setViewSpan(next.span);
      setZoomMonths("custom");
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [points.length]);

  if (!p) return null;

  // marker vẽ bằng HTML overlay (luôn tròn) thay vì <circle> trong SVG —
  // SVG dùng preserveAspectRatio="none" nên <circle> bị kéo méo thành elip.
  // chấm nhỏ lại khi zoom rộng để đỡ rối.
  const denseDots = span > 24 * POINTS_PER_MONTH;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Xét lại lịch sử — máy thời gian</h2>
        <div className="card-score">
          <span className="muted small">
            chấm theo: {preset ? `preset ${preset.label}` : "toàn cảnh (tiêu chí thế giới)"}
          </span>
        </div>
      </div>
      <p className="muted small">
        Kéo để trượt thời gian · chạm để chọn ngày · chụm 2 ngón (hoặc lăn chuột) để zoom. {timeline.note}
      </p>

      <div className="tm-zoom">
        {(
          [
            [1, "1 tháng", "1T"],
            [3, "3 tháng", "3T"],
            [6, "6 tháng"],
            [12, "1 năm"],
            [24, "2 năm"],
            [60, "5 năm"],
            [null, "Tất cả"],
          ] as [number | null, string, string?][]
        ).map(([m, label, short]) => (
          <button
            key={label}
            className={`iconbtn small-btn ${zoomMonths === m ? "active" : ""}`}
            onClick={() => applyZoom(m)}
          >
            {short ? (
              <>
                <span className="tm-zoom-full">{label}</span>
                <span className="tm-zoom-short">{short}</span>
              </>
            ) : (
              label
            )}
          </button>
        ))}
        <button
          className="iconbtn small-btn"
          onClick={() => setShowGear((v) => !v)}
          aria-label="Tùy chọn"
          title="Tùy chọn: vùng bán, ngưỡng thử, khoảng ngày"
        >⚙</button>
      </div>

      {showGear && (
        <div className="tm-gear">
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showSell} onChange={(e) => setShowSell(e.target.checked)} />
            Hiện vùng bán (chỉ tham khảo 1 tháng)
          </label>
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showExp} onChange={(e) => setShowExp(e.target.checked)} />
            Ngưỡng thử nghiệm
          </label>
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showBottomStart} onChange={(e) => setShowBottomStart(e.target.checked)} />
            Đánh dấu khởi đầu vùng đáy
          </label>
          {spark && (
            <span className="tm-daterange muted small">
              <input
                type="date"
                value={points[start].date}
                min={dates[0]}
                max={points[end - 1].date}
                onChange={(e) => e.target.value && applyDateRange(indexOnOrAfter(dates, e.target.value), end - 1)}
              />
              <span aria-hidden>→</span>
              <input
                type="date"
                value={points[end - 1].date}
                min={points[start].date}
                max={dates[dates.length - 1]}
                onChange={(e) => e.target.value && applyDateRange(start, indexOnOrBefore(dates, e.target.value))}
              />
            </span>
          )}
          <span className="muted small">
            {signalIdxs.length} ngày tín hiệu mua
            {showSell ? ` · ${sellIdxs.length} ngày vùng bán` : ""} / {points.length} ngày — chế độ này
          </span>
        </div>
      )}

      {showExp && (
        <label className="slider-row tm-exp">
          <span>
            Ngưỡng thử +{effThr} — <b>{expIdxs.length}</b> ngày đạt / {points.length} ngày
            <span className="muted small">
              {" "}
              · chỉ để khám phá — % kiểm chứng chỉ áp dụng cho ngưỡng chuẩn (+{buyThr})
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={effThr}
            onChange={(e) => setExpThr(Number(e.target.value))}
          />
        </label>
      )}

      {showBottomStart && (
        <div className="tm-exp muted small">
          ◆ Ngày oversold + vĩ mô lần đầu bật — điểm dò đáy sớm (walk-forward). Mạnh hơn trong xu hướng tăng; KHÔNG khẳng định là đáy.
        </div>
      )}

      {spark && (
        <div className="tm-chartwrap">
          <svg
            ref={svgRef}
            className="tm-chart"
            viewBox={`0 0 ${spark.W} ${spark.H}`}
            preserveAspectRatio="none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            aria-label="Biểu đồ giá XAU/USD — kéo để trượt, chạm để chọn ngày, chụm 2 ngón để zoom"
          >
          <path d={spark.path} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
          {spark.cx !== null && (
            <line x1={spark.cx} y1="0" x2={spark.cx} y2={spark.H} stroke="#ece5d8" strokeWidth="1" opacity="0.5" />
          )}
          </svg>
          {/* marker overlay HTML — tròn tuyệt đối, không méo theo SVG stretch.
              left/top theo % của viewBox (preserveAspectRatio="none" ⇒ map tuyến tính). */}
          <div className={`tm-markers ${denseDots ? "dense" : ""}`} aria-hidden>
            {spark.expMarkers.map((m, i) => (
              <span key={`x${i}`} className="tm-mk exp"
                style={{ left: `${(m.cx / spark.W) * 100}%`, top: `${(m.cy / spark.H) * 100}%` }} />
            ))}
            {spark.sellMarkers.map((m, i) => (
              <span key={`s${i}`} className="tm-mk sell"
                style={{ left: `${(m.cx / spark.W) * 100}%`, top: `${(m.cy / spark.H) * 100}%` }} />
            ))}
            {spark.markers.map((m, i) => (
              <span key={i} className="tm-mk buy"
                style={{ left: `${(m.cx / spark.W) * 100}%`, top: `${(m.cy / spark.H) * 100}%` }} />
            ))}
            {spark.startMarkers.map((m, i) => (
              <span key={`st${i}`} className="tm-mk start"
                style={{ left: `${(m.cx / spark.W) * 100}%`, top: `${(m.cy / spark.H) * 100}%` }} />
            ))}
            {spark.cx !== null && (
              <span className="tm-mk cursor"
                style={{ left: `${(spark.cx / spark.W) * 100}%`, top: `${(spark.cy! / spark.H) * 100}%` }} />
            )}
          </div>
          {/* dải ngày 2 góc: biết đang xem khung thời gian nào khi vuốt */}
          <span className="tm-edge from" aria-hidden>{fmtDate(points[start].date)}</span>
          <span className="tm-edge to" aria-hidden>{fmtDate(points[end - 1].date)}</span>
          <button
            className="tm-fab left"
            disabled={prevSignal === undefined}
            onClick={() => prevSignal !== undefined && goTo(prevSignal)}
            aria-label="Tín hiệu mua trước"
          >◀</button>
          <button
            className="tm-fab right"
            disabled={nextSignal === undefined}
            onClick={() => nextSignal !== undefined && goTo(nextSignal)}
            aria-label="Tín hiệu mua sau"
          >▶</button>
        </div>
      )}

      <div className="tm-dateband">
        <span className="d">
          {fmtDate(p.date)}{idx === points.length - 1 ? " (mới nhất)" : ""} · XAU ${fmtNum(p.price, 0)}
        </span>
        <span className={`tm-zone ${zoneClass(zone)}`}>
          {zone === "sell" || zone === "strong-sell"
            ? `${ZONE_LABELS[zone]} (tham khảo)`
            : preset && !isBuy
              ? "CHƯA CÓ TÍN HIỆU MUA"
              : ZONE_LABELS[zone]}
          <span className="muted small"> ({composite > 0 ? "+" : ""}{fmtNum(composite)})</span>
          {highConfDay && <b> · đã kiểm chứng</b>}
        </span>
      </div>

      {highConfDay && (
        <div className="muted small">
          ✓ MUA độ tin cao (3 tháng): composite báo MUA VÀ giá ở vùng đáy (RSI quá bán + vĩ mô đảo
          chiều). Lịch sử đúng {HIGH_CONF_3M_EVIDENCE.trainFav}% (2009–2018) /{" "}
          {HIGH_CONF_3M_EVIDENCE.testFav}% (2019–2026); lưới thưa {HIGH_CONF_3M_EVIDENCE.sparseFav}%
          (CI {HIGH_CONF_3M_EVIDENCE.sparseCi[0]}–{HIGH_CONF_3M_EVIDENCE.sparseCi[1]}). Con số 100%
          là lạc quan do tín hiệu bắn chùm — bằng chứng vững là giai đoạn 2009–2018.
        </div>
      )}

      {showBottomStart && bottomStarts.includes(idx) && (
        <div className="muted small">
          ◆ Điểm BẮT ĐẦU vùng đáy — oversold + vĩ mô vừa bật (dò đáy sớm, không phải đáy chắc)
        </div>
      )}

      <div className="tm-bottom">
        {(
          [
            ["Đáy chu kỳ", "≈6 tháng", p.cycleProb ?? null, p.cycleCi ?? null, p.cycleN ?? 0],
            ["Đáy sóng", "≈1 tháng", p.swingProb ?? null, p.swingCi ?? null, p.swingN ?? 0],
          ] as [string, string, number | null, [number, number] | null, number][]
        ).map(([title, sub, prob, ci, n]) => {
          const ok = prob !== null && n >= 10;
          return (
            <div key={title} className="tm-bottom-item">
              <span className="muted small">{title} <span className="muted small">{sub}</span></span>
              {ok ? (
                <span className={`bottom-gauge-pct ${bottomPctClass(prob)}`}>
                  {Math.round(prob)}%
                  {ci ? <span className="muted small"> (CI {ci[0]}–{ci[1]}%)</span> : null}
                </span>
              ) : (
                <span className="muted small">Chưa đủ dữ liệu kiểm chứng</span>
              )}
            </div>
          );
        })}
      </div>

      <ActionGuidance guidance={histGuidance} />

      <div className="tm-results">
        {(["21", "63", "126"] as const).map((h) => {
          const ret = p.returns[h];
          const v = verdictFor(zone, ret, h);
          const isPresetHorizon = presetH === h;
          return (
            <span key={h} className={`r ${isPresetHorizon ? "hl" : ""}`}>
              Sau {HORIZON_LABELS[h]}{isPresetHorizon ? " (preset)" : ""}:{" "}
              <b className={ret === null ? "muted" : ret >= 0 ? "buy" : "sell"}>
                {ret === null ? "chưa có" : `${ret >= 0 ? "+" : ""}${fmtNum(ret)}%`}
              </b>
              {v === "right" && <span className="tm-verdict buy"> ✓</span>}
              {v === "wrong" && <span className="tm-verdict sell"> ✗</span>}
            </span>
          );
        })}
      </div>

      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Chi tiết điểm số</span>
            <span className="acc-sum-meta">4 nhóm tiêu chí · ghi chú lịch sử</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          <div className="tm-scores">
            {(Object.keys(p.scores) as CriterionKey[]).map((k) => (
              <span key={k} className="tm-score">
                {CRITERION_LABELS[k].split(" (")[0]}:{" "}
                <b className={p.scores[k]! > 0 ? "buy" : p.scores[k]! < 0 ? "sell" : "neutral"}>
                  {p.scores[k]! > 0 ? "+" : ""}{fmtNum(p.scores[k]!, 2)}
                </b>
              </span>
            ))}
          </div>
          <p className="muted small">
            Ở chế độ lịch sử: chỉ tín hiệu thế giới (điểm mua + nhóm điểm đáy past-only);
            chênh lệch VN không tham gia backtest. Tín hiệu cho hôm nay xem ở
            <b> Gợi ý hành động</b> đầu trang.
          </p>
        </div>
      </details>
    </section>
  );
}
