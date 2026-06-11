"use client";

import { useMemo } from "react";
import type { Analysis } from "@/lib/types";

const fmtNum = (v: number, d = 1) =>
  v.toLocaleString("vi-VN", { maximumFractionDigits: d });

/** Biểu đồ chênh lệch SJC so với giá thế giới quy đổi, kèm vạch percentile lịch sử. */
export default function PremiumChart({ analysis }: { analysis: Analysis }) {
  const series = analysis.premiumSeries ?? [];
  const pcts = analysis.premiumPercentiles;

  const chart = useMemo(() => {
    if (series.length < 30) return null;
    const W = 700;
    const H = 160;
    const PAD = 4;
    const vals = series.map((s) => s.value);
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals);
    const x = (i: number) => (i / (series.length - 1)) * W;
    const y = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);
    const path = series
      .map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.value).toFixed(1)}`)
      .join("");
    const last = series[series.length - 1];
    return { W, H, path, y, lastX: x(series.length - 1), lastY: y(last.value), min, max };
  }, [series]);

  if (!chart || series.length < 30) return null;
  const last = series[series.length - 1];

  // percentile của chênh hiện tại so với toàn bộ lịch sử tự thu thập
  const pctNow =
    (series.filter((s) => s.value < last.value).length / Math.max(1, series.length - 1)) * 100;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Chênh lệch VN — thế giới theo thời gian</h2>
        <div className="card-score">
          <span className="muted">
            hiện tại <b>{fmtNum(last.value)}%</b> · {series.length} ngày dữ liệu
          </span>
        </div>
      </div>
      <svg
        className="spark premium-spark"
        viewBox={`0 0 ${chart.W} ${chart.H}`}
        preserveAspectRatio="none"
        aria-label="Biểu đồ chênh lệch SJC so với giá thế giới"
      >
        {pcts &&
          (
            [
              [pcts.p80, "p80", "#e05c5c"],
              [pcts.p50, "p50", "#9a8f7d"],
              [pcts.p20, "p20", "#4cc97a"],
            ] as const
          ).map(([v, label, color]) => (
            <g key={label}>
              <line
                x1="0"
                y1={chart.y(v)}
                x2={chart.W}
                y2={chart.y(v)}
                stroke={color}
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.6"
              />
              <text x={chart.W - 4} y={chart.y(v) - 3} textAnchor="end" fontSize="11" fill={color}>
                {label} {fmtNum(v)}%
              </text>
            </g>
          ))}
        <path d={chart.path} fill="none" stroke="#e6b84c" strokeWidth="1.6" />
        <circle cx={chart.lastX} cy={chart.lastY} r="4" fill="#ece5d8" />
      </svg>
      {pctNow >= 80 && (
        <div className="banner warn">
          🔴 <b>VÙNG BÁN VN theo chênh lệch</b> — chênh đang ở percentile {fmtNum(pctNow, 0)},
          cao bất thường. Đây là tín hiệu bán đáng tin nhất cho vàng VN: người mua đang trả
          đắt cho miếng vàng của bạn so với giá thế giới. Kiểm chứng {series.length} ngày:
          mua khi chênh ≥ p80, SJC sau 2 tháng chỉ tăng trung vị +1,5% (57% số lần) — so
          với +10,4% (90%) khi chênh ≤ p20.
        </div>
      )}
      {pctNow <= 20 && (
        <div className="banner info">
          🟢 Chênh đang ở percentile {fmtNum(pctNow, 0)} — vùng rẻ lịch sử. Kiểm chứng{" "}
          {series.length} ngày: mua SJC lúc chênh ≤ p20, sau 2 tháng giá tăng 90% số lần,
          trung vị +10,4% (so với +1,5% khi chênh ≥ p80). Thời điểm mua vàng VN ít thiệt
          nhất.
        </div>
      )}
      <p className="muted small">
        Đường vàng = SJC đắt hơn giá thế giới quy đổi bao nhiêu %. Dưới vạch xanh (p20) =
        vùng chênh rẻ lịch sử — mua vàng VN ít thiệt; trên vạch đỏ (p80) = chênh đắt bất
        thường — đây mới là tín hiệu bán đáng tham khảo cho vàng VN (tự kiểm chứng:{" "}
        <code>npx tsx scripts/premium-exit-study.ts</code>). Giai đoạn {series[0].date} →{" "}
        {last.date}.
      </p>
    </section>
  );
}
