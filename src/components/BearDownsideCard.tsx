"use client";
import { useMemo, useState } from "react";
import type { BearDownsideAnalysis, BearAsOfBand, BearHorizonStat, Timeline } from "@/lib/types";
import { ddAsOfPct, actualWorstDipPct, monthAnchors, monthPosOf } from "@/lib/bear-downside-view";

const HLABEL: Record<string, string> = { "21": "1 tháng", "63": "3 tháng", "126": "6 tháng" };
const HSHORT: Record<string, string> = { "21": "1T", "63": "3T", "126": "6T" };
const HS = ["21", "63", "126"] as const;
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("vi-VN")}`;
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/**
 * Một hàng kỳ hạn — đáy điển hình (đỏ, rủi ro) · kết cục điển hình (xanh/đỏ) ·
 * THỰC TẾ (đáy + kết cục thực tế khi xem ngày quá khứ đã đáo hạn) · cơ hội tăng (thanh).
 */
function Row({ H, band, price, actualDip, actualTerm }: {
  H: (typeof HS)[number];
  band: BearAsOfBand | null;
  price: number;
  actualDip: number | null;
  actualTerm: number | null;
}) {
  const label = HLABEL[H];
  if (!band) {
    return (
      <tr>
        <td>{label}</td>
        <td className="muted" colSpan={4}>chưa đủ dữ liệu</td>
      </tr>
    );
  }
  const at = (pct: number) => usd(price * (1 + pct / 100));
  const pct = Math.max(0, Math.min(100, band.pUp));
  const matured = actualDip != null && actualTerm != null;
  return (
    <tr>
      <td>{label}</td>
      <td>
        {at(band.median)} <span className="down">({signed(band.median)})</span>
      </td>
      <td>
        {at(band.endMedian)} <span className={band.endMedian >= 0 ? "up" : "down"}>({signed(band.endMedian)})</span>
      </td>
      <td>
        {matured ? (
          <>
            <div>đáy {at(actualDip!)} <span className="down">({signed(actualDip!)})</span></div>
            <div>kết {at(actualTerm!)} <span className={actualTerm! >= 0 ? "up" : "down"}>({signed(actualTerm!)})</span></div>
          </>
        ) : (
          <span className="muted">chưa đáo hạn</span>
        )}
      </td>
      <td>
        <span className="minibar"><span className={`minibar-fill${band.pUp >= 50 ? "" : " mid"}`} style={{ width: `${pct}%` }} /></span>
        {fmt1(band.pUp)}%
      </td>
    </tr>
  );
}

/** Hàng UI cũ cho fallback (timeline.json cũ không có bearAsOf) — chỉ ngày mới nhất nên không có thực tế. */
function LegacyRow({ s, price }: { s: BearHorizonStat; price: number }) {
  const label = HLABEL[String(s.horizonDays)] ?? String(s.horizonDays);
  if (s.n < 30) {
    return (<tr><td>{label}</td><td className="muted" colSpan={4}>chưa đủ dữ liệu (n={s.n})</td></tr>);
  }
  const at = (pv: number) => usd(price * (1 + pv / 100));
  const pct = Math.max(0, Math.min(100, s.pUp));
  return (
    <tr>
      <td>{label}</td>
      <td>{at(s.median)} <span className="down">({signed(s.median)})</span></td>
      <td>{at(s.endMedian)} <span className={s.endMedian >= 0 ? "up" : "down"}>({signed(s.endMedian)})</span></td>
      <td className="muted">chưa đáo hạn</td>
      <td>
        <span className="minibar"><span className={`minibar-fill${s.pUp >= 50 ? "" : " mid"}`} style={{ width: `${pct}%` }} /></span>
        {fmt1(s.pUp)}%
      </td>
    </tr>
  );
}

export default function BearDownsideCard({ bd, timeline }: { bd: BearDownsideAnalysis; timeline: Timeline }) {
  const [showInfo, setShowInfo] = useState(false);
  const points = timeline.points;
  const hasAsOf = points.length > 0 && points[points.length - 1].bearAsOf !== undefined;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));

  const prices = useMemo(() => points.map((q) => q.price), [points]);
  const anchors = useMemo(() => monthAnchors(points.map((q) => q.date)), [points]);
  const X = Math.min(idx, points.length - 1);
  const p = points[X];

  // fallback: timeline.json cũ không có bearAsOf -> giữ nguyên UI cũ (dải hiện tại, không thanh thời gian)
  if (!hasAsOf || !p) {
    const tailOld = bd.shown.filter((s) => s.n >= 30).map((s) => `${HSHORT[String(s.horizonDays)] ?? s.horizonDays} ${signed(s.p10)}`).join(" · ");
    return (
      <section className="card">
        <div className="card-head">
          <h2>Triển vọng 1/3/6 tháng tới</h2>
          <span className="muted">{bd.currentPrice > 0 && <>{usd(bd.currentPrice)} · </>}−{fmt1(bd.currentDdPct)}% dưới đỉnh</span>
          <button className="iconbtn small-btn" aria-label="Giải thích ô này" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
            {showInfo ? "✕" : "ⓘ"}
          </button>
        </div>
        {showInfo && (
          <div className="banner info">
            <p>Nếu mua/giữ vàng hôm nay, mỗi cột nghĩa là:</p>
            <ul className="info-defs">
              <li><b className="down">Đáy điển hình</b> — nhịp dúi sâu nhất <i>giữa</i> kỳ (rủi ro phải chịu).</li>
              <li><b className="up">Kết cục điển hình</b> — giá <i>kết</i> tại mốc kỳ hạn.</li>
              <li><b>Thực tế</b> — đáy sâu nhất & giá kết THỰC TẾ đã xảy ra (khi xem ngày quá khứ đã đủ tương lai).</li>
              <li><b>Cơ hội tăng</b> — % số lần giá cao hơn hôm nay.</li>
            </ul>
            {tailOld && <p>Hiếm gặp (~1/10 lần tệ nhất), giá có lúc dúi sâu tới: {tailOld}.</p>}
            <p className="muted">Phân phối lịch sử — tham khảo rủi ro, không phải dự đoán.</p>
          </div>
        )}
        <div className="bt-table-wrap">
          <table className="bt-table">
            <thead>
              <tr><th>Kỳ hạn</th><th>Đáy điển hình</th><th>Kết cục điển hình</th><th>Thực tế</th><th>Cơ hội tăng</th></tr>
            </thead>
            <tbody>
              {bd.shown.map((s) => <LegacyRow key={s.horizonDays} s={s} price={bd.currentPrice} />)}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  const isLatest = X === points.length - 1;
  const ddPct = ddAsOfPct(prices, X);
  const tail = HS.map((H) => p.bearAsOf?.[H]).filter((b): b is BearAsOfBand => !!b)
    .map((b, i) => `${HSHORT[HS[i]]} ${signed(b.p10)}`).join(" · ");

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

      {/* thanh thời gian THEO THÁNG (thưa ~200 nấc) — dễ kéo tới vùng; ◀▶ nhích từng ngày để đắt đúng phiên */}
      <input
        className="tm-range"
        type="range"
        min={0}
        max={Math.max(0, anchors.length - 1)}
        value={monthPosOf(anchors, X)}
        onChange={(e) => setIdx(anchors[Number(e.target.value)] ?? 0)}
        aria-label="Trượt theo tháng về quá khứ"
        style={{ width: "100%", display: "block", margin: "0.4rem 0" }}
      />
      <div className="tm-daterange muted small">
        <button
          className="iconbtn small-btn"
          disabled={X <= 0}
          onClick={() => setIdx(Math.max(0, X - 1))}
          aria-label="Lùi 1 ngày"
        >◀</button>
        <button
          className="iconbtn small-btn"
          disabled={X >= points.length - 1}
          onClick={() => setIdx(Math.min(points.length - 1, X + 1))}
          aria-label="Tới 1 ngày"
        >▶</button>
        <span>kéo = tháng · ◀▶ = ngày · hoặc chọn:</span>
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
          <p>Số liệu là phân phối lịch sử walk-forward tính CHỈ từ dữ liệu tới ngày đang xem. Mỗi cột:</p>
          <ul className="info-defs">
            <li><b className="down">Đáy điển hình</b> — nhịp dúi sâu nhất <i>giữa</i> kỳ (rủi ro phải chịu).</li>
            <li><b className="up">Kết cục điển hình</b> — giá <i>kết</i> tại mốc kỳ hạn.</li>
            <li><b>Thực tế</b> — đáy sâu nhất & giá kết THỰC TẾ đã xảy ra (khi xem ngày quá khứ đã đủ tương lai).</li>
            <li><b>Cơ hội tăng</b> — % số lần giá cao hơn hôm nay.</li>
          </ul>
          {tail && <p>Hiếm gặp (~1/10 lần tệ nhất), giá có lúc dúi sâu tới: {tail}.</p>}
          <p className="muted">Tái hiện lịch sử để đối chiếu — KHÔNG phải dự đoán. Mẫu XAU/USD ~20 năm chủ yếu bull.</p>
        </div>
      )}

      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead>
            <tr><th>Kỳ hạn</th><th>Đáy điển hình</th><th>Kết cục điển hình</th><th>Cơ hội tăng</th></tr>
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
