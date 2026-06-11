"use client";

import { useEffect, useMemo, useState } from "react";
import {
  compositeScore,
  zoneOf,
  ZONE_LABELS,
  DEFAULT_WEIGHTS,
  type Analysis,
  type Backtest,
  type CriterionKey,
  type CriterionResult,
  type Zone,
} from "@/lib/types";

const WEIGHTS_KEY = "au-weights-v1";

const fmtMoney = (v: number | null) =>
  v === null ? "—" : (v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " tr";
const fmtNum = (v: number | null, d = 1) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d });

function zoneClass(zone: Zone): string {
  if (zone === "buy" || zone === "strong-buy") return "buy";
  if (zone === "sell" || zone === "strong-sell") return "sell";
  return "neutral";
}

function scoreChip(score: number) {
  const cls = score > 0 ? "chip buy" : score < 0 ? "chip sell" : "chip neutral";
  const txt = score > 0 ? `+${fmtNum(score)}` : fmtNum(score);
  return <span className={cls}>{txt}</span>;
}

function loadWeights(): Record<CriterionKey, number> {
  if (typeof window === "undefined") return DEFAULT_WEIGHTS;
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY);
    if (!raw) return DEFAULT_WEIGHTS;
    const w = JSON.parse(raw);
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      if (typeof w[k] !== "number" || w[k] < 0) return DEFAULT_WEIGHTS;
    }
    return w;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export default function Dashboard({
  analysis,
  backtest,
}: {
  analysis: Analysis;
  backtest: Backtest;
}) {
  const [weights, setWeights] = useState<Record<CriterionKey, number>>(DEFAULT_WEIGHTS);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setWeights(loadWeights());
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }, []);

  const customized = useMemo(
    () => JSON.stringify(weights) !== JSON.stringify(DEFAULT_WEIGHTS),
    [weights]
  );
  const composite = useMemo(
    () => compositeScore(analysis.criteria, weights),
    [analysis, weights]
  );
  const zone = zoneOf(composite);

  const currentBuckets = backtest.buckets.filter(
    (b) => b.zone === zone && b.count > 0
  );
  const bt63 = currentBuckets.find((b) => b.horizonDays === 63);

  const setWeight = (k: CriterionKey, v: number) => {
    const w = { ...weights, [k]: v };
    setWeights(w);
    try {
      localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w));
    } catch {}
  };

  const freshness = new Date(analysis.generatedAt).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  return (
    <main className="wrap">
      <header className="top">
        <h1>
          Vùng<span className="gold">Vàng</span>
        </h1>
        <button className="iconbtn" onClick={() => setShowSettings(!showSettings)}>
          ⚙ Trọng số
        </button>
      </header>

      {analysis.stale && (
        <div className="banner warn">
          ⚠ Dữ liệu giá vàng VN cũ {analysis.staleDays} ngày — nguồn giá đang gián đoạn.
        </div>
      )}
      {analysis.warnings.map((w, i) => (
        <div key={i} className="banner info">
          {w}
        </div>
      ))}

      <section className={`verdict ${zoneClass(zone)}`}>
        <div className="verdict-label">{ZONE_LABELS[zone]}</div>
        <div className="gauge">
          <div className="gauge-track">
            <div className="gauge-zero" />
            <div
              className="gauge-needle"
              style={{ left: `${((composite + 100) / 200) * 100}%` }}
            />
          </div>
          <div className="gauge-scale">
            <span>−100 bán</span>
            <span>0</span>
            <span>mua +100</span>
          </div>
        </div>
        <div className="verdict-score">
          Điểm tổng hợp: <b>{composite > 0 ? `+${fmtNum(composite)}` : fmtNum(composite)}</b>
          {customized && <span className="customized"> (trọng số tùy chỉnh)</span>}
        </div>
        {bt63 && bt63.pctFavorable !== null ? (
          <div className="verdict-bt">
            Kiểm chứng lịch sử: tín hiệu &quot;{ZONE_LABELS[zone]}&quot; xuất hiện{" "}
            <b>{bt63.count}</b> lần, <b>{fmtNum(bt63.pctFavorable)}%</b> diễn biến thuận chiều
            sau 3 tháng (trung vị {bt63.medianReturnPct! >= 0 ? "+" : ""}
            {fmtNum(bt63.medianReturnPct)}%).
          </div>
        ) : (
          <div className="verdict-bt muted">
            Vùng trung lập — không có khuyến nghị hành động. Chờ tín hiệu rõ hơn.
          </div>
        )}
        <div className="freshness">Cập nhật: {freshness} (giờ VN)</div>
      </section>

      <section className="prices">
        <div className="price-item">
          <span>SJC mua / bán</span>
          <b>
            {fmtMoney(analysis.prices.sjcBuy)} / {fmtMoney(analysis.prices.sjcSell)}
          </b>
        </div>
        <div className="price-item">
          <span>Nhẫn mua / bán</span>
          <b>
            {fmtMoney(analysis.prices.ringBuy)} / {fmtMoney(analysis.prices.ringSell)}
          </b>
        </div>
        <div className="price-item">
          <span>Thế giới quy đổi</span>
          <b>{fmtMoney(analysis.prices.worldVndPerLuong)}/lượng</b>
        </div>
        <div className="price-item">
          <span>Chênh VN−TG</span>
          <b>
            {fmtNum(analysis.prices.premiumPct)}% ({fmtMoney(analysis.prices.premiumVnd)})
          </b>
        </div>
        <div className="price-item">
          <span>XAU/USD</span>
          <b>${fmtNum(analysis.prices.xauUsd, 0)}</b>
        </div>
        <div className="price-item">
          <span>USD/VND</span>
          <b>{fmtNum(analysis.prices.usdVnd, 0)}</b>
        </div>
      </section>

      {showSettings && (
        <section className="card settings">
          <h2>Trọng số tiêu chí</h2>
          <p className="muted">
            Điểm tổng hợp tính lại ngay theo trọng số bạn chọn. Lưu trên máy bạn. Lưu ý: %
            kiểm chứng lịch sử tính theo trọng số mặc định.
          </p>
          {analysis.criteria.map((c) => (
            <label key={c.key} className="slider-row">
              <span>
                {c.label} — {Math.round(weights[c.key] * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={50}
                value={Math.round(weights[c.key] * 100)}
                onChange={(e) => setWeight(c.key, Number(e.target.value) / 100)}
              />
            </label>
          ))}
          <button
            className="iconbtn"
            onClick={() => {
              setWeights(DEFAULT_WEIGHTS);
              try {
                localStorage.removeItem(WEIGHTS_KEY);
              } catch {}
            }}
          >
            Khôi phục mặc định
          </button>
        </section>
      )}

      {analysis.criteria.map((c: CriterionResult) => (
        <section key={c.key} className="card">
          <div className="card-head">
            <h2>{c.label}</h2>
            <div className="card-score">
              {scoreChip(Math.round(c.score * 10) / 10)}
              <span className="muted"> trọng số {Math.round(weights[c.key] * 100)}%</span>
            </div>
          </div>
          {c.provisional && (
            <div className="banner info small">
              Đang dùng ngưỡng tham chiếu — dữ liệu chênh lệch tự thu thập mới{" "}
              {analysis.vnHistoryDays} ngày, cần ≥ 90 ngày để so theo lịch sử thật.
            </div>
          )}
          <ul className="signals">
            {c.signals.map((s) => (
              <li key={s.id} className={s.available ? "" : "muted"}>
                {scoreChip(s.score)}
                <div>
                  <div className="sig-label">{s.label}</div>
                  <div className="sig-expl">{s.explanation}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="card">
        <div className="card-head">
          <h2>Kiểm chứng lịch sử (backtest)</h2>
        </div>
        <p className="muted small">
          {backtest.note} Giai đoạn {backtest.fromDate} → {backtest.toDate},{" "}
          {backtest.observations.toLocaleString("vi-VN")} quan sát.
        </p>
        <div className="bt-table-wrap">
          <table className="bt-table">
            <thead>
              <tr>
                <th>Tín hiệu</th>
                <th>Kỳ hạn</th>
                <th>Số lần</th>
                <th>% thuận chiều</th>
                <th>Trung vị</th>
              </tr>
            </thead>
            <tbody>
              {backtest.buckets
                .filter((b) => b.count > 0)
                .map((b) => (
                  <tr
                    key={`${b.zone}-${b.horizonDays}`}
                    className={b.zone === zone ? "hl" : ""}
                  >
                    <td className={zoneClass(b.zone)}>{ZONE_LABELS[b.zone]}</td>
                    <td>{b.horizonDays === 21 ? "1 tháng" : b.horizonDays === 63 ? "3 tháng" : "6 tháng"}</td>
                    <td>{b.count}</td>
                    <td>{b.pctFavorable === null ? "—" : `${fmtNum(b.pctFavorable)}%`}</td>
                    <td>
                      {b.medianReturnPct === null
                        ? "—"
                        : `${b.medianReturnPct >= 0 ? "+" : ""}${fmtNum(b.medianReturnPct)}%`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="disclaimer">
        Công cụ hỗ trợ quyết định dựa trên thống kê quá khứ — không phải khuyến nghị đầu tư,
        không đảm bảo kết quả tương lai. Quyết định và rủi ro thuộc về bạn.
      </footer>
    </main>
  );
}
