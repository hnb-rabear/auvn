"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BearDownsideAnalysis, BearAsOfBand, BearHorizonStat, Timeline } from "@/lib/types";
import { ddAsOfPct, actualWorstDipPct, pUpTenths, coverageStats } from "@/lib/bear-downside-view";
import { enoughSamples } from "@/lib/bear-downside";

const HSHORT: Record<string, string> = { "21": "1T", "63": "3T", "126": "6T" };
const HS = ["21", "63", "126"] as const;
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("vi-VN")}`;
/** Làm tròn ~$100 → "~$4,3k" (chống ảo giác giả-chính-xác). */
const usdK = (n: number) => `~$${(Math.round(n / 100) / 10).toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}k`;
const signedInt = (n: number) => `${n >= 0 ? "+" : ""}${Math.round(n)}%`;
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

/**
 * Một hàng kỳ hạn — đáy điển hình (đỏ, rủi ro) · kết cục điển hình (xanh/đỏ) ·
 * THỰC TẾ (đáy + kết cục thực tế khi xem ngày quá khứ đã đáo hạn) · khả năng (bậc 1/10).
 */
function Row({ H, band, price, actualDip, actualTerm }: {
  H: (typeof HS)[number];
  band: BearAsOfBand | null;
  price: number;
  actualDip: number | null;
  actualTerm: number | null;
}) {
  const label = HSHORT[H];
  if (!band) {
    return (
      <tr>
        <td>{label}</td>
        <td className="muted" colSpan={4}>chưa đủ dữ liệu</td>
      </tr>
    );
  }
  const px = (pct: number) => price * (1 + pct / 100);
  const t = pUpTenths(band.pUp); // bậc 1/10 — chi tiết hơn là giả-chính-xác (ít cửa sổ độc lập)
  const matured = actualDip != null && actualTerm != null;
  return (
    <tr>
      <td>{label}</td>
      <td>
        {usdK(px(band.median))} <span className="down small">({signedInt(band.median)})</span>
      </td>
      <td>
        {usdK(px(band.endP25))}<span className="muted"> → </span>{usdK(px(band.endP75))}
        <div className="small muted">{signedInt(band.endP25)}…{signedInt(band.endP75)}</div>
      </td>
      <td>
        {matured ? (
          <>
            <div>đáy {usdK(px(actualDip!))} <span className="down small">({signedInt(actualDip!)})</span></div>
            <div>kết {usdK(px(actualTerm!))} <span className={`small ${actualTerm! >= 0 ? "up" : "down"}`}>({signedInt(actualTerm!)})</span></div>
          </>
        ) : (
          <span className="muted">chưa đáo hạn</span>
        )}
      </td>
      <td>
        <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
      </td>
    </tr>
  );
}

/** Hàng UI cho fallback (timeline.json cũ không có bearAsOf) — chỉ ngày mới nhất nên không có thực tế. */
function LegacyRow({ s, price }: { s: BearHorizonStat; price: number }) {
  const label = HSHORT[String(s.horizonDays)] ?? String(s.horizonDays);
  if (!enoughSamples(s.n, s.horizonDays)) {
    return (<tr><td>{label}</td><td className="muted" colSpan={4}>chưa đủ dữ liệu (n={s.n})</td></tr>);
  }
  const at = (pv: number) => usd(price * (1 + pv / 100));
  const t = pUpTenths(s.pUp);
  return (
    <tr>
      <td>{label}</td>
      <td>{at(s.median)} <span className="down">({signed(s.median)})</span></td>
      <td>{at(s.endMedian)} <span className={s.endMedian >= 0 ? "up" : "down"}>({signed(s.endMedian)})</span></td>
      <td className="muted">chưa đáo hạn</td>
      <td>
        <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
      </td>
    </tr>
  );
}

export default function BearDownsideCard({
  bd,
  timeline,
  asOfIdx,
}: {
  bd: BearDownsideAnalysis;
  timeline: Timeline;
  /** đồng bộ với ngày as-of chọn ở PriceChart (task 4) — null/undefined = giữ nguyên slider nội bộ (mới nhất) */
  asOfIdx?: number | null;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const points = timeline.points;
  const hasAsOf = points.length > 0 && points[points.length - 1].bearAsOf !== undefined;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));
  useEffect(() => {
    const target = asOfIdx != null ? Math.min(asOfIdx, points.length - 1) : Math.max(0, points.length - 1);
    setIdx(target);
    scrollToIdx(target);
  }, [asOfIdx, points.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const prices = useMemo(() => points.map((q) => q.price), [points]);
  // khung thời gian: cửa sổ mật độ px/phiên CỐ ĐỊNH (không nén toàn lịch sử) — cuộn ngang
  // (overflow-x: auto, native) để xem vùng khác, tap để chọn ngày trong vùng đang thấy.
  // KHÔNG zoom (xem spec v3).
  const WINDOW_SESSIONS = { "6T": 126, "1N": 252, "3N": 756 } as const;
  const VIEWPORT_PX = 360;
  const SH = 64;
  const [winKey, setWinKey] = useState<keyof typeof WINDOW_SESSIONS>("6T");
  const pxPerSession = VIEWPORT_PX / WINDOW_SESSIONS[winKey];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollToIdx = (target: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollTo({ left: Math.min(max, Math.max(0, target * pxPerSession - VIEWPORT_PX / 2)), behavior: "smooth" });
  };
  useEffect(() => { scrollToIdx(X); }, [winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalW = prices.length > 1 ? prices.length * pxPerSession : 0;
  const spark = useMemo(() => {
    if (prices.length < 2) return null;
    let min = Infinity, max = -Infinity;
    for (const v of prices) { if (v < min) min = v; if (v > max) max = v; }
    const span = max - min || 1;
    const yAt = (v: number) => SH - 4 - ((v - min) / span) * (SH - 8);
    let d = "";
    for (let i = 0; i < prices.length; i++) d += `${d ? "L" : "M"}${(i * pxPerSession).toFixed(1)} ${yAt(prices[i]).toFixed(1)}`;
    return { d };
  }, [prices, pxPerSession]);
  const pickAt = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.round((clientX - r.left) / pxPerSession);
    setIdx(Math.min(points.length - 1, Math.max(0, i)));
  };
  const X = Math.min(idx, points.length - 1);
  const p = points[X];

  // fallback: timeline.json cũ không có bearAsOf -> giữ nguyên UI cũ (dải hiện tại, không thanh thời gian)
  if (!hasAsOf || !p) {
    const tailOld = bd.shown.filter((s) => enoughSamples(s.n, s.horizonDays)).map((s) => `${HSHORT[String(s.horizonDays)] ?? s.horizonDays} ${signed(s.p10)}`).join(" · ");
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
            <p className="muted">Phân phối theo trọng số hồi quy (ưu tiên ~2 năm gần) để bám chế độ hiện tại — tham khảo rủi ro, không phải dự đoán.</p>
          </div>
        )}
        <div className="bdo-table-wrap">
          <table className="bdo-table">
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
  // calibration đo được của dải trên toàn lịch sử đã đáo hạn (walk-forward)
  const coverage = useMemo(
    () => HS.map((H) => ({ H, c: coverageStats(points, H) })).filter((x) => x.c !== null),
    [points]
  );
  const tail = HS.filter((H) => p.bearAsOf?.[H])
    .map((H) => `${HSHORT[H]} ${signed(p.bearAsOf![H]!.p10)}`).join(" · ");

  return (
    <section className="card">
      <div className="card-head">
        <h2>Triển vọng 1/3/6 tháng tới</h2>
        <button className="iconbtn small-btn" aria-label="Giải thích ô này" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          {showInfo ? "✕" : "ⓘ"}
        </button>
      </div>

      {/* khung thời gian: 3 nút cửa sổ · cuộn ngang gốc trình duyệt xem vùng khác · tap chọn ngày */}
      {spark && (
        <>
          <div className="bdo-winbtns">
            {(Object.keys(WINDOW_SESSIONS) as (keyof typeof WINDOW_SESSIONS)[]).map((k) => (
              <button
                key={k}
                className={`iconbtn small-btn${winKey === k ? " active" : ""}`}
                onClick={() => setWinKey(k)}
                aria-pressed={winKey === k}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="bdo-sparkwrap" ref={wrapRef}>
            <svg
              ref={svgRef}
              className="bdo-spark"
              width={totalW}
              height={SH}
              onClick={(e) => pickAt(e.clientX)}
              aria-label="Biểu đồ giá — cuộn ngang xem lịch sử, chạm để chọn ngày"
            >
              <path d={spark.d} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
              <line x1={X * pxPerSession} y1="0" x2={X * pxPerSession} y2={SH} stroke="#ece5d8" strokeWidth="1" opacity="0.6" />
            </svg>
          </div>
        </>
      )}
      <div className="bdo-dateband muted small">
        <span>
          {fmtDate(p.date)}{isLatest ? " (mới nhất)" : ""} · {usd(p.price)} · −{fmt1(ddPct)}% dưới đỉnh
        </span>
        <input
          type="date"
          value={p.date}
          min={points[0].date}
          max={points[points.length - 1].date}
          aria-label="Chọn ngày chính xác"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            let lo = 0, hi = points.length - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].date < v) lo = m + 1; else hi = m; }
            setIdx(lo);
            scrollToIdx(lo);
          }}
        />
      </div>

      {showInfo && (
        <div className="banner info">
          <p>Số liệu là phân phối lịch sử walk-forward tính CHỈ từ dữ liệu tới ngày đang xem. Mỗi cột:</p>
          <ul className="info-defs">
            <li><b className="down">Đáy điển hình</b> — nhịp dúi sâu nhất <i>giữa</i> kỳ (rủi ro phải chịu), giá làm tròn.</li>
            <li><b className="up">Kết cục điển hình</b> — <i>khoảng</i> giá kết rơi vào 50% số lần (p25–p75), KHÔNG phải một mức.</li>
            <li><b>Thực tế</b> — đáy sâu nhất & giá kết THỰC TẾ đã xảy ra (khi xem ngày quá khứ đã đủ tương lai).</li>
            <li><b>Khả năng</b> — số lần giá kết cao hơn (↑) / thấp hơn (↓) hôm nay, làm tròn bậc 1/10: số cửa sổ lịch sử độc lập ít nên chi tiết hơn là độ chính xác ảo.</li>
          </ul>
          {tail && <p>Hiếm gặp (~1/10 lần tệ nhất), giá có lúc dúi sâu tới: {tail}.</p>}
          {coverage.length > 0 && (
            <p>
              <b>Độ khớp đo được</b> (đối chiếu dải với thực tế trên toàn lịch sử đã đáo hạn):
              kết cục thực rơi vào dải điển hình — {coverage.map(({ H, c }) => `${HSHORT[H]} ${c!.endIn50}%`).join(" · ")} (kỳ vọng ~50%);
              đáy thực thủng mức hiếm gặp — {coverage.map(({ H, c }) => `${HSHORT[H]} ${c!.dipBeyond10}%`).join(" · ")} (kỳ vọng ~10%).
            </p>
          )}
          <p className="muted">Phân phối tính theo trọng số hồi quy (ưu tiên ~2 năm gần) để bám chế độ thị trường hiện tại — nên cột kết cục nghiêng theo xu hướng gần đây; cột đáy là đối trọng rủi ro. Tái hiện lịch sử để đối chiếu, KHÔNG phải dự đoán.</p>
        </div>
      )}

      <div className="bdo-table-wrap">
        <table className="bdo-table">
          <thead>
            <tr><th>Kỳ hạn</th><th>Đáy điển hình</th><th>Kết cục điển hình</th><th>Thực tế</th><th>Khả năng</th></tr>
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
      <p className="muted small" style={{ marginTop: "0.4rem" }}>
        ⚠ Khoảng &amp; tần suất theo lịch sử, nghiêng ~2 năm gần (đang bull) · khoảng rộng = bất định cao · <b>KHÔNG phải dự đoán</b>
      </p>
    </section>
  );
}
