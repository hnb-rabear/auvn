"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CRITERION_LABELS,
  ZONE_LABELS,
  zoneOf,
  type CriterionKey,
  type Preset,
  type Timeline,
  type TimelinePoint,
  type Zone,
} from "@/lib/types";

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

/** Composite từ điểm tiêu chí của một ngày timeline, theo trọng số đang chọn. */
function pointComposite(p: TimelinePoint, weights: Record<CriterionKey, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores)) {
    const w = weights[k as CriterionKey] ?? 0;
    s += (score as number) * w;
    tw += w;
  }
  return tw === 0 ? 0 : Math.round((s / tw) * 50 * 10) / 10;
}

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

// timeline lấy mẫu mỗi 3 phiên -> ~7 điểm/tháng
const POINTS_PER_MONTH = 7;

export default function TimeMachine({
  timeline,
  weights,
  preset,
}: {
  timeline: Timeline;
  weights: Record<CriterionKey, number>;
  preset: Preset | null;
}) {
  const points = timeline.points;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));
  /** cửa sổ zoom tính theo tháng; null = toàn bộ lịch sử */
  const [zoomMonths, setZoomMonths] = useState<number | null>(null);
  const [viewStart, setViewStart] = useState(0);
  /** hiện vùng bán (tham khảo) trên dòng thời gian */
  const [showSell, setShowSell] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const p = points[idx];

  const span =
    zoomMonths === null
      ? points.length
      : Math.min(points.length, Math.max(14, zoomMonths * POINTS_PER_MONTH));
  const maxStart = points.length - span;
  const start = zoomMonths === null ? 0 : Math.max(0, Math.min(viewStart, maxStart));
  const end = start + span;

  const buyThr = preset?.buyThreshold ?? 40;
  const signalIdxs = useMemo(
    () =>
      points.reduce<number[]>((acc, q, i) => {
        if (pointComposite(q, weights) >= buyThr) acc.push(i);
        return acc;
      }, []),
    [points, weights, buyThr]
  );
  const sellIdxs = useMemo(
    () =>
      points.reduce<number[]>((acc, q, i) => {
        if (pointComposite(q, weights) <= -40) acc.push(i);
        return acc;
      }, []),
    [points, weights]
  );
  const prevSignal = [...signalIdxs].reverse().find((i) => i < idx);
  const nextSignal = signalIdxs.find((i) => i > idx);

  const centerOn = useCallback(
    (i: number, m: number | null = zoomMonths) => {
      if (m === null) return;
      const s = Math.min(points.length, Math.max(14, m * POINTS_PER_MONTH));
      setViewStart(Math.max(0, Math.min(i - Math.floor(s / 2), points.length - s)));
    },
    [zoomMonths, points.length]
  );

  const goTo = (i: number) => {
    setIdx(i);
    if (i < start || i >= end) centerOn(i);
  };

  const applyZoom = (m: number | null) => {
    setZoomMonths(m);
    centerOn(idx, m);
  };

  const onChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setIdx(start + Math.round(frac * (span - 1)));
  };

  const composite = p ? pointComposite(p, weights) : 0;
  const rawZone = zoneOf(composite, buyThr);
  const isBuy = rawZone === "buy" || rawZone === "strong-buy";
  const isSell = rawZone === "sell" || rawZone === "strong-sell";
  // preset chỉ kiểm chứng phía mua — vùng bán chỉ hiện khi người dùng bật toggle tham khảo
  const zone: Zone = isBuy ? rawZone : isSell && showSell ? rawZone : "neutral";
  const presetH = preset ? (String(preset.horizonDays) as "21" | "63" | "126") : null;

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
    const markers = signalIdxs
      .filter((i) => i >= start && i < end)
      .map((i) => ({ cx: x(i), cy: y(points[i].price) }));
    const sellMarkers = showSell
      ? sellIdxs
          .filter((i) => i >= start && i < end)
          .map((i) => ({ cx: x(i), cy: y(points[i].price) }))
      : [];
    const inWindow = idx >= start && idx < end;
    return {
      W,
      H,
      path,
      cx: inWindow ? x(idx) : null,
      cy: inWindow ? y(p.price) : null,
      markers,
      sellMarkers,
      fromDate: win[0].date,
      toDate: win[win.length - 1].date,
    };
  }, [points, idx, p, signalIdxs, sellIdxs, showSell, start, end]);

  if (!p) return null;

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
        <b>Bấm vào biểu đồ</b> để chọn ngày — engine chấm điểm theo chế độ bạn đang chọn,
        chỉ bằng dữ liệu có đến ngày đó, rồi đối chiếu giá thực tế sau 1/3/6 tháng xem
        quyết định đúng hay sai. {timeline.note}
      </p>

      <div className="tm-zoom">
        {(
          [
            [6, "6 tháng"],
            [12, "1 năm"],
            [24, "2 năm"],
            [60, "5 năm"],
            [null, "Tất cả"],
          ] as [number | null, string][]
        ).map(([m, label]) => (
          <button
            key={label}
            className={`iconbtn small-btn ${zoomMonths === m ? "active" : ""}`}
            onClick={() => applyZoom(m)}
          >
            {label}
          </button>
        ))}
        {spark && (
          <span className="muted small">
            {fmtDate(spark.fromDate)} → {fmtDate(spark.toDate)}
          </span>
        )}
        <label className="tm-toggle muted small" title="Bán chỉ đúng 49% sau 1 tháng; kỳ hạn dài thì NGƯỢC (sau 6 tháng giá tăng trung vị +9,5%). Tín hiệu bán đáng tin hơn cho vàng VN: chênh lệch vượt p80 — xem biểu đồ chênh lệch.">
          <input
            type="checkbox"
            checked={showSell}
            onChange={(e) => setShowSell(e.target.checked)}
          />
          Hiện vùng bán (chỉ tham khảo 1 tháng)
        </label>
      </div>

      {spark && (
        <svg
          ref={svgRef}
          className="spark tm-clickable"
          viewBox={`0 0 ${spark.W} ${spark.H}`}
          preserveAspectRatio="none"
          onClick={onChartClick}
          aria-label="Biểu đồ giá XAU/USD — bấm để chọn ngày"
        >
          <path d={spark.path} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
          {spark.sellMarkers.map((m, i) => (
            <circle key={`s${i}`} cx={m.cx} cy={m.cy} r={zoomMonths === null ? 2 : 3.5} fill="#e05c5c" opacity="0.7" />
          ))}
          {spark.markers.map((m, i) => (
            <circle key={i} cx={m.cx} cy={m.cy} r={zoomMonths === null ? 2 : 3.5} fill="#4cc97a" opacity="0.75" />
          ))}
          {spark.cx !== null && (
            <>
              <line x1={spark.cx} y1="0" x2={spark.cx} y2={spark.H} stroke="#ece5d8" strokeWidth="1" opacity="0.5" />
              <circle cx={spark.cx} cy={spark.cy!} r="4" fill="#ece5d8" />
            </>
          )}
        </svg>
      )}

      {zoomMonths !== null && maxStart > 0 && (
        <input
          className="tm-slider"
          type="range"
          min={0}
          max={maxStart}
          value={start}
          onChange={(e) => setViewStart(Number(e.target.value))}
          aria-label="Cuộn cửa sổ thời gian"
          title="Cuộn trái/phải"
        />
      )}

      <div className="tm-nav">
        <button
          className="iconbtn"
          disabled={prevSignal === undefined}
          onClick={() => prevSignal !== undefined && goTo(prevSignal)}
        >
          ◀ Tín hiệu mua trước
        </button>
        <span className="muted small">
          {signalIdxs.length} ngày tín hiệu mua
          {showSell ? ` · ${sellIdxs.length} ngày vùng bán` : ""} / {points.length} ngày —
          chế độ này
        </span>
        <button
          className="iconbtn"
          disabled={nextSignal === undefined}
          onClick={() => nextSignal !== undefined && goTo(nextSignal)}
        >
          Tín hiệu mua sau ▶
        </button>
      </div>

      <div className="tm-detail">
        <div className="tm-row">
          <div>
            <div className="muted small">Ngày giả lập</div>
            <b>{fmtDate(p.date)}</b> · XAU ${fmtNum(p.price, 0)}
          </div>
          <div className={`tm-zone ${zoneClass(zone)}`}>
            {zone === "sell" || zone === "strong-sell"
              ? `${ZONE_LABELS[zone]} (tham khảo)`
              : preset && !isBuy
                ? "CHƯA CÓ TÍN HIỆU MUA"
                : ZONE_LABELS[zone]}
            <span className="muted small">
              {" "}
              ({composite > 0 ? "+" : ""}
              {fmtNum(composite)})
            </span>
          </div>
        </div>

        <div className="tm-scores">
          {(Object.keys(p.scores) as CriterionKey[]).map((k) => (
            <span key={k} className="tm-score">
              {CRITERION_LABELS[k].split(" (")[0]}:{" "}
              <b className={p.scores[k]! > 0 ? "buy" : p.scores[k]! < 0 ? "sell" : "neutral"}>
                {p.scores[k]! > 0 ? "+" : ""}
                {fmtNum(p.scores[k]!, 2)}
              </b>
            </span>
          ))}
        </div>

        <div className="tm-outcomes">
          {(["21", "63", "126"] as const).map((h) => {
            const ret = p.returns[h];
            const v = verdictFor(zone, ret, h);
            const isPresetHorizon = presetH === h;
            return (
              <div key={h} className={`tm-outcome ${isPresetHorizon ? "hl-horizon" : ""}`}>
                <span className="muted small">
                  Sau {HORIZON_LABELS[h]}
                  {isPresetHorizon ? " — kỳ hạn preset" : ""}
                </span>
                <b className={ret === null ? "muted" : ret >= 0 ? "buy" : "sell"}>
                  {ret === null ? "chưa có" : `${ret >= 0 ? "+" : ""}${fmtNum(ret)}%`}
                </b>
                {v === "n/a" && (
                  <span className="muted small">
                    bán dài hạn: không chấm — lịch sử cho thấy thường ngược
                  </span>
                )}
                {(v === "right" || v === "wrong") && (
                  <span className={`tm-verdict ${v === "right" ? "buy" : "sell"}`}>
                    {v === "right" ? "✓ quyết định đúng" : "✗ quyết định sai"}
                  </span>
                )}
                {zone === "neutral" && ret !== null && (
                  <span className="muted small">
                    {preset ? "không tín hiệu — đứng ngoài" : "trung lập — không khuyến nghị"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
