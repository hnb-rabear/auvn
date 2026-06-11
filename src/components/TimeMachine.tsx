"use client";

import { useMemo, useState } from "react";
import {
  CRITERION_LABELS,
  ZONE_LABELS,
  type CriterionKey,
  type Timeline,
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

/** Đúng/sai của quyết định: mua đúng khi giá tăng, bán đúng khi giá giảm. */
function verdictFor(zone: Zone, ret: number | null): "right" | "wrong" | null {
  if (ret === null || zone === "neutral") return null;
  const buyish = zone === "buy" || zone === "strong-buy";
  return (buyish ? ret > 0 : ret < 0) ? "right" : "wrong";
}

export default function TimeMachine({ timeline }: { timeline: Timeline }) {
  const points = timeline.points;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));
  const p = points[idx];

  const spark = useMemo(() => {
    if (points.length < 2) return null;
    const W = 700;
    const H = 120;
    const prices = points.map((q) => q.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const x = (i: number) => (i / (points.length - 1)) * W;
    const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 8) - 4;
    const path = points.map((q, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(q.price).toFixed(1)}`).join("");
    return { W, H, path, cx: x(idx), cy: y(p.price) };
  }, [points, idx, p]);

  if (!p) return null;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Xét lại lịch sử — máy thời gian</h2>
      </div>
      <p className="muted small">
        Kéo về một ngày trong quá khứ: engine chấm điểm chỉ bằng dữ liệu có đến ngày đó,
        rồi đối chiếu giá thực tế sau 1/3/6 tháng xem quyết định đúng hay sai.{" "}
        {timeline.note}
      </p>

      {spark && (
        <svg
          className="spark"
          viewBox={`0 0 ${spark.W} ${spark.H}`}
          preserveAspectRatio="none"
          aria-label="Biểu đồ giá XAU/USD"
        >
          <path d={spark.path} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
          <line x1={spark.cx} y1="0" x2={spark.cx} y2={spark.H} stroke="#ece5d8" strokeWidth="1" opacity="0.5" />
          <circle cx={spark.cx} cy={spark.cy} r="4" fill="#ece5d8" />
        </svg>
      )}

      <input
        className="tm-slider"
        type="range"
        min={0}
        max={points.length - 1}
        value={idx}
        onChange={(e) => setIdx(Number(e.target.value))}
        aria-label="Chọn thời điểm lịch sử"
      />

      <div className="tm-detail">
        <div className="tm-row">
          <div>
            <div className="muted small">Ngày giả lập</div>
            <b>{fmtDate(p.date)}</b> · XAU ${fmtNum(p.price, 0)}
          </div>
          <div className={`tm-zone ${zoneClass(p.zone)}`}>
            {ZONE_LABELS[p.zone]}
            <span className="muted small">
              {" "}
              ({p.composite > 0 ? "+" : ""}
              {fmtNum(p.composite)})
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
            const v = verdictFor(p.zone, ret);
            return (
              <div key={h} className="tm-outcome">
                <span className="muted small">Sau {HORIZON_LABELS[h]}</span>
                <b className={ret === null ? "muted" : ret >= 0 ? "buy" : "sell"}>
                  {ret === null ? "chưa có" : `${ret >= 0 ? "+" : ""}${fmtNum(ret)}%`}
                </b>
                {v && (
                  <span className={`tm-verdict ${v === "right" ? "buy" : "sell"}`}>
                    {v === "right" ? "✓ quyết định đúng" : "✗ quyết định sai"}
                  </span>
                )}
                {p.zone === "neutral" && ret !== null && (
                  <span className="muted small">trung lập — không khuyến nghị</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
