"use client";
import { useMemo, useState } from "react";
import type { BearDownsideAnalysis, BearAsOfBand, Timeline } from "@/lib/types";
import { ddAsOfPct, actualWorstDipPct, verdict } from "@/lib/bear-downside-view";

const HLABEL: Record<string, string> = { "21": "1 tháng", "63": "3 tháng", "126": "6 tháng" };
const HS = ["21", "63", "126"] as const;
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("vi-VN")}`;
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function Mark({ v }: { v: "right" | "wrong" | null }) {
  if (v === "right") return <span className="tm-verdict buy"> ✓</span>;
  if (v === "wrong") return <span className="tm-verdict sell"> ✗</span>;
  return null;
}

/** Một hàng kỳ hạn: card-lúc-đó (as-of) | thực tế | ✓/✗ hai mặt. */
function Row({ H, band, price, actualDip, actualTerm }: {
  H: (typeof HS)[number];
  band: BearAsOfBand | null;
  price: number;
  actualDip: number | null;
  actualTerm: number | null;
}) {
  const label = HLABEL[H];
  if (!band) {
    return (<tr><td>{label}</td><td className="muted" colSpan={3}>chưa đủ dữ liệu</td></tr>);
  }
  const at = (pct: number) => usd(price * (1 + pct / 100));
  const notMatured = actualDip === null;
  return (
    <tr>
      <td>{label}</td>
      <td>
        {at(band.median)} <span className="down">({signed(band.median)})</span>
        <span className="muted small"> · kết {signed(band.endMedian)} · lên {fmt1(band.pUp)}%</span>
      </td>
      <td>
        {notMatured ? <span className="muted">chưa đáo hạn</span> : (
          <>
            <span className="down">{signed(actualDip!)}</span>
            {actualTerm !== null && <> · <span className={actualTerm >= 0 ? "up" : "down"}>{signed(actualTerm)}</span></>}
          </>
        )}
      </td>
      <td>
        <Mark v={verdict(actualDip, band.p10)} />
        <Mark v={verdict(actualTerm, band.endMedian)} />
      </td>
    </tr>
  );
}

export default function BearDownsideCard({ bd, timeline }: { bd: BearDownsideAnalysis; timeline: Timeline }) {
  const [showInfo, setShowInfo] = useState(false);
  const points = timeline.points;
  const hasAsOf = points.length > 0 && points[points.length - 1].bearAsOf !== undefined;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));

  const prices = useMemo(() => points.map((p) => p.price), [points]);
  const X = Math.min(idx, points.length - 1);
  const p = points[X];

  // fallback: timeline.json cũ không có bearAsOf -> giữ hành vi cũ (dải hiện tại, không slider)
  if (!hasAsOf || !p) {
    return (
      <section className="card">
        <div className="card-head">
          <h2>Triển vọng 1/3/6 tháng tới</h2>
          <span className="muted">{bd.currentPrice > 0 && <>{usd(bd.currentPrice)} · </>}−{fmt1(bd.currentDdPct)}% dưới đỉnh</span>
        </div>
        <div className="bt-table-wrap">
          <table className="bt-table">
            <thead><tr><th>Kỳ hạn</th><th>Đáy điển hình</th><th>Kết cục</th><th>Cơ hội tăng</th></tr></thead>
            <tbody>
              {bd.shown.map((s) => (
                <tr key={s.horizonDays}>
                  <td>{HLABEL[String(s.horizonDays)]}</td>
                  {s.n < 30 ? <td className="muted" colSpan={3}>chưa đủ dữ liệu (n={s.n})</td> : (
                    <>
                      <td>{usd(bd.currentPrice * (1 + s.median / 100))} <span className="down">({signed(s.median)})</span></td>
                      <td><span className={s.endMedian >= 0 ? "up" : "down"}>{signed(s.endMedian)}</span></td>
                      <td>{fmt1(s.pUp)}%</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  const isLatest = X === points.length - 1;
  const ddPct = ddAsOfPct(prices, X);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Triển vọng 1/3/6 tháng tới</h2>
        <span className="muted">
          {fmtDate(p.date)}{isLatest ? " (mới nhất)" : ""} · {usd(p.price)} · −{fmt1(ddPct)}% dưới đỉnh
        </span>
        <button className="iconbtn small-btn" aria-label="Giải thích ô này" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          {showInfo ? "✕" : "ⓘ"}
        </button>
      </div>

      <div className="tm-daterange muted small">
        <input
          type="range"
          min={0}
          max={points.length - 1}
          value={X}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-label="Trượt về ngày quá khứ"
          style={{ flex: 1 }}
        />
        <input
          type="date"
          value={p.date}
          min={points[0].date}
          max={points[points.length - 1].date}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            let lo = 0, hi = points.length - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].date < v) lo = m + 1; else hi = m; }
            setIdx(lo);
          }}
        />
      </div>

      {showInfo && (
        <div className="banner info">
          <p><b>Card lúc đó nói</b> = phân phối lịch sử walk-forward tính CHỈ từ dữ liệu tới ngày đang xem. <b>Thực tế</b> = đáy tệ nhất & kết cục thật đã xảy ra sau đó (biết được vì là ngày quá khứ).</p>
          <ul className="info-defs">
            <li><b className="down">Đáy điển hình</b> — nhịp dúi sâu nhất giữa kỳ (rủi ro).</li>
            <li>✓/✗ trái = đáy thực có thủng đuôi 1/10 (p10) không; ✓/✗ phải = kết cục thực có ≥ kết cục điển hình không.</li>
          </ul>
          <p className="muted">Tái hiện lịch sử để đối chiếu — KHÔNG phải dự đoán. Mẫu XAU/USD ~20 năm chủ yếu bull.</p>
        </div>
      )}

      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead>
            <tr><th>Kỳ hạn</th><th>Card lúc đó nói</th><th>Thực tế</th><th></th></tr>
          </thead>
          <tbody>
            {HS.map((H) => (
              <Row
                key={H}
                H={H}
                band={p.bearAsOf?.[H] ?? null}
                price={p.price}
                actualDip={actualWorstDipPct(prices, X, Number(H))}
                actualTerm={p.returns[H]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
