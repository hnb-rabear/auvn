"use client";

import { useMemo, useState } from "react";
import type { TimelinePoint, VnGoldEntry } from "@/lib/types";
import {
  RANGES,
  MIN_SPAN,
  windowFor,
  unitSeries,
  buildGeom,
  type PriceUnit,
} from "@/lib/price-chart";
import { indexOnOrAfter, indexOnOrBefore } from "@/lib/timeline";
import PanZoomChart from "./PanZoomChart";

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });

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
  /** null = suy ra cửa sổ từ months qua windowFor (mặc định); không null = Custom (mọi cử chỉ) */
  const [win, setWin] = useState<{ start: number; span: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [unit, setUnit] = useState<PriceUnit>("oz");

  const def = windowFor(points.length, months);
  const span = win?.span ?? def.span;
  const start = Math.max(0, Math.min(win?.start ?? def.start, points.length - span));
  const end = start + span;
  const dates = useMemo(() => points.map((p) => p.date), [points]);
  const activeLabel = win !== null ? "Tùy chỉnh" : RANGES.find((r) => r.months === months)?.label ?? "Tùy chỉnh";

  /** Áp cửa sổ tuỳ chỉnh theo cặp index [từ, đến], kẹp biên + MIN_SPAN — chuyển sang Custom. */
  const applyCustomRange = (fromIdx: number, toIdx: number) => {
    const lo = Math.max(0, Math.min(fromIdx, points.length - 1));
    const hi = Math.max(lo, Math.min(toIdx, points.length - 1));
    const sp = Math.min(points.length, Math.max(MIN_SPAN, hi - lo + 1));
    setWin({ start: Math.max(0, Math.min(lo, points.length - sp)), span: sp });
  };

  const series = useMemo(() => unitSeries(points, vnRows, unit), [points, vnRows, unit]);
  const geom = useMemo(
    () => buildGeom(points, start, span, series.sjc, 700, 160, { xau: series.xau, unit }),
    [points, start, span, series, unit]
  );
  const firstFxDate = vnRows.find((row) => row.usdVnd !== null)?.date;

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
        <button
          className="iconbtn small-btn pc-toggle"
          onClick={() => setUnit((u) => (u === "oz" ? "chi" : "oz"))}
          aria-pressed={unit === "chi"}
          aria-label={unit === "oz" ? "Đổi biểu đồ sang đơn vị chỉ" : "Đổi biểu đồ sang đơn vị ounce"}
        >
          {unit === "oz" ? "$/oz" : "₫/chỉ"}
        </button>
        <span className="pc-legend muted small">
          <i className="pc-line xau" /> {unit === "oz" ? "XAU/USD" : "XAU (quy đổi ₫/chỉ)"}
          <i className="pc-line sjc" /> {unit === "oz" ? "SJC (quy đổi $)" : "SJC (₫/chỉ)"}
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

      <PanZoomChart
        points={points}
        geom={geom}
        window={{ start, span }}
        onWindowChange={(next) => setWin(next)} // pan/pinch/wheel ⇒ Custom tự động là nhãn đang chọn
        onSelect={onSelect}
        selectedIdx={selectedIdx}
        markers={[
          { key: "b", className: "buy", idxs: buyDots },
          { key: "s", className: "start", idxs: bottomDots },
        ]}
        height={160}
        showAxis
        ariaLabel="Biểu đồ giá — chạm để chọn ngày, kéo để trượt, chụm 2 ngón hoặc lăn chuột để zoom"
      />

      <p className="muted small pc-note">
        ● ngày đồng thuận MUA · ◆ khởi đầu vùng đáy (walk-forward) · chạm chart để xem cả trang
        as-of ngày đó
        {unit === "chi" && geom.xauPath === null && geom.xauTailPath === null && firstFxDate
          ? ` · XAU quy đổi: dữ liệu từ ${fmtDate(firstFxDate)}`
          : ""}
        {unit === "chi" && geom.xauFrom ? ` · XAU quy đổi: từ ${fmtDate(geom.xauFrom)}` : ""}
        {unit === "chi" && geom.xauAsOf
          ? ` · XAU quy đổi: giữ giá ngày ${fmtDate(geom.xauAsOf)} (tỷ giá chưa cập nhật)`
          : ""}
        {geom.sjcPath === null && geom.sjcTailPath === null && vnRows.length > 0 ? ` · SJC: dữ liệu từ ${fmtDate(vnRows[0].date)}` : ""}
        {geom.sjcFrom ? ` · SJC: từ ${fmtDate(geom.sjcFrom)}` : ""}
        {geom.sjcAsOf ? ` · SJC: giữ giá ngày ${fmtDate(geom.sjcAsOf)} (nguồn chưa cập nhật)` : ""}
      </p>
    </section>
  );
}
