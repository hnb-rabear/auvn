"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  BOTTOM_CONFIG,
  CRITERION_LABELS,
  ZONE_LABELS,
  zoneOf,
  type ConfirmedBottom,
  type CriterionKey,
  type Preset,
  type Timeline,
  type Zone,
} from "@/lib/types";
import { deriveGuidance } from "@/lib/guidance";
import ActionGuidance from "./ActionGuidance";
import { centerWindow } from "@/lib/brush";
import {
  composites,
  idxsAtOrAbove,
  idxsAtOrBelow,
  indexOnOrAfter,
  indexOnOrBefore,
} from "@/lib/timeline";
import TimelineBrush from "./TimelineBrush";

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

// timeline lấy mẫu mỗi 3 phiên -> ~7 điểm/tháng
const POINTS_PER_MONTH = 7;
/** cửa sổ nhỏ nhất của brush/zoom (~2 tuần) */
const MIN_SPAN = 14;

export default function TimeMachine({
  timeline,
  weights,
  preset,
  confirmedBottoms = [],
}: {
  timeline: Timeline;
  weights: Record<CriterionKey, number>;
  preset: Preset | null;
  confirmedBottoms?: ConfirmedBottom[];
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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const p = points[idx];

  const span = Math.min(points.length, Math.max(Math.min(MIN_SPAN, points.length), viewSpan));
  const start = Math.max(0, Math.min(viewStart, points.length - span));
  const end = start + span;

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
  const prices = useMemo(() => points.map((q) => q.price), [points]);
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

  const onBrush = useCallback((s: number, sp: number) => {
    setViewStart(s);
    setViewSpan(sp);
    setZoomMonths("custom");
  }, []);

  /** Đặt cửa sổ theo khoảng index [fromIdx, toIdx] (kẹp biên, tối thiểu MIN_SPAN). */
  const applyDateRange = (fromIdx: number, toIdx: number) => {
    const lo = Math.max(0, Math.min(fromIdx, points.length - 1));
    const hi = Math.max(lo, Math.min(toIdx, points.length - 1));
    setViewStart(lo);
    setViewSpan(Math.max(MIN_SPAN, hi - lo + 1));
    setZoomMonths("custom");
  };

  const onChartClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setIdx(start + Math.round(frac * (span - 1)));
  };

  const composite = p ? comps[idx] : 0;
  const rawZone = zoneOf(composite, buyThr);
  const isBuy = rawZone === "buy" || rawZone === "strong-buy";
  const isSell = rawZone === "sell" || rawZone === "strong-sell";
  // preset chỉ kiểm chứng phía mua — vùng bán chỉ hiện khi người dùng bật toggle tham khảo
  const zone: Zone = isBuy ? rawZone : isSell && showSell ? rawZone : "neutral";
  const presetH = preset ? (String(preset.horizonDays) as "21" | "63" | "126") : null;

  // Gợi ý hành động lịch sử: world-only (premium tắt) + bin đáy past-only (KHÔNG dùng prob%).
  // Dùng rawZone (chưa ép neutral khi tắt showSell) để phản ánh đúng cả vùng bán, nhất quán với live.
  const histGuidance = useMemo(() => {
    const topBin = BOTTOM_CONFIG.cycle.binEdges.length; // KHÔNG hardcode 3
    const bin = p?.cycleBin;
    const hasBin = bin !== undefined;
    return deriveGuidance({
      zone: rawZone,
      composite,
      bottom: {
        high: hasBin && bin === topBin,
        verified: hasBin,
        label: `Săn đáy: nhóm điểm đáy ${bin === topBin ? "CAO" : "chưa cao"} (chu kỳ bin ${bin}/${topBin}).`,
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
    const bottomMarkers = confirmedBottoms
      .map((b) => ({ i: indexOnOrAfter(dates, b.date), tier: b.tier }))
      .filter((m) => m.i >= start && m.i < end && m.i < points.length)
      .map((m) => ({ cx: x(m.i), cy: y(points[m.i].price), tier: m.tier }));
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
      bottomMarkers,
      fromDate: win[0].date,
      toDate: win[win.length - 1].date,
    };
  }, [points, idx, p, signalIdxs, sellIdxs, expIdxs, showSell, start, end, confirmedBottoms, dates]);

  if (!p) return null;

  // chấm tín hiệu/bán nhỏ lại khi zoom rộng; vòng ngưỡng thử luôn +1 để bao quanh chấm cùng ngày
  const dotR = span > 24 * POINTS_PER_MONTH ? 2 : 3.5;
  const ringR = dotR + 1;

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
          <span className="tm-daterange muted small" title="Chọn khung thời gian hiển thị">
            <input
              type="date"
              value={points[start].date}
              min={dates[0]}
              max={points[end - 1].date}
              onChange={(e) =>
                e.target.value && applyDateRange(indexOnOrAfter(dates, e.target.value), end - 1)
              }
            />
            <span aria-hidden>→</span>
            <input
              type="date"
              value={points[end - 1].date}
              min={points[start].date}
              max={dates[dates.length - 1]}
              onChange={(e) =>
                e.target.value && applyDateRange(start, indexOnOrBefore(dates, e.target.value))
              }
            />
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
        <label
          className="tm-toggle muted small"
          title="Highlight mọi ngày có điểm ≥ ngưỡng bạn chọn — chỉ để khám phá, không phải tín hiệu kiểm chứng."
        >
          <input
            type="checkbox"
            checked={showExp}
            onChange={(e) => setShowExp(e.target.checked)}
          />
          Ngưỡng thử nghiệm
        </label>
      </div>

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
          {spark.expMarkers.map((m, i) => (
            <circle
              key={`x${i}`}
              cx={m.cx}
              cy={m.cy}
              r={ringR}
              fill="none"
              stroke="#5ca8e0"
              strokeWidth="1.3"
              opacity="0.8"
            />
          ))}
          {spark.sellMarkers.map((m, i) => (
            <circle key={`s${i}`} cx={m.cx} cy={m.cy} r={dotR} fill="#e05c5c" opacity="0.7" />
          ))}
          {spark.markers.map((m, i) => (
            <circle key={i} cx={m.cx} cy={m.cy} r={dotR} fill="#4cc97a" opacity="0.75" />
          ))}
          {spark.bottomMarkers.map((m, i) => (
            <text key={`bm${i}`} x={m.cx} y={m.cy + 13} fontSize={11}
                  fill={m.tier === "cycle" ? "#4cc97a" : "#86efac"} textAnchor="middle">▲</text>
          ))}
          {spark.cx !== null && (
            <>
              <line x1={spark.cx} y1="0" x2={spark.cx} y2={spark.H} stroke="#ece5d8" strokeWidth="1" opacity="0.5" />
              <circle cx={spark.cx} cy={spark.cy!} r="4" fill="#ece5d8" />
            </>
          )}
        </svg>
      )}

      {points.length > MIN_SPAN && (
        <TimelineBrush
          prices={prices}
          start={start}
          span={span}
          minSpan={MIN_SPAN}
          onChange={onBrush}
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
            <div className="muted small">Ngày giả lập{idx === points.length - 1 ? " (mới nhất)" : ""}</div>
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

        <ActionGuidance guidance={histGuidance} />
        <p className="muted small">
          Ở chế độ lịch sử: chỉ tín hiệu thế giới (điểm mua + nhóm điểm đáy past-only);
          chênh lệch VN không tham gia backtest. Tín hiệu cho hôm nay xem ở
          <b> Gợi ý hành động</b> đầu trang.
        </p>

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
                  {ret !== null && (
                    <span className="muted small">
                      {" "}
                      · ${fmtNum(p.price * (1 + ret / 100), 0)}
                    </span>
                  )}
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
