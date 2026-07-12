"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BearDownsideAnalysis, BearAsOfBand, BearHorizonStat, Timeline } from "@/lib/types";
import { ddAsOfPct, actualWorstDipPct, pUpTenths, coverageStats } from "@/lib/bear-downside-view";
import { enoughSamples } from "@/lib/bear-downside";

const HLABEL: Record<string, string> = { "21": "1 tháng", "63": "3 tháng", "126": "6 tháng" };
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
 * Một khối kỳ hạn — lưới 2 cột: Đáy điển hình · Kết cục (dải p25→p75) ·
 * Khả năng (bậc 1/10) · Thực tế (CHỈ render khi đã đáo hạn — xem ngày quá khứ).
 */
function Block({ H, band, price, actualDip, actualTerm }: {
  H: (typeof HS)[number];
  band: BearAsOfBand | null;
  price: number;
  actualDip: number | null;
  actualTerm: number | null;
}) {
  const label = HLABEL[H];
  if (!band) {
    return (
      <div className="bdo-block empty">
        <span className="bdo-h">{label}</span>
        <span>chưa đủ dữ liệu</span>
      </div>
    );
  }
  const px = (pct: number) => price * (1 + pct / 100);
  const t = pUpTenths(band.pUp); // bậc 1/10 — chi tiết hơn là giả-chính-xác (ít cửa sổ độc lập)
  const matured = actualDip != null && actualTerm != null;
  return (
    <div className="bdo-block">
      <div className="bdo-h">{label}</div>
      <div className="bdo-grid">
        <div className="bdo-cell">
          <div className="bdo-label">Đáy điển hình</div>
          <div>{usdK(px(band.median))} <span className="down small">({signedInt(band.median)})</span></div>
        </div>
        <div className="bdo-cell">
          <div className="bdo-label">Kết cục điển hình</div>
          <div>
            {usdK(px(band.endP25))}<span className="muted"> → </span>{usdK(px(band.endP75))}
            <div className="small muted">{signedInt(band.endP25)}…{signedInt(band.endP75)}</div>
          </div>
        </div>
        <div className="bdo-cell">
          <div className="bdo-label">Khả năng</div>
          <div>
            <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
          </div>
        </div>
        {matured && (
          <div className="bdo-cell">
            <div className="bdo-label">Thực tế</div>
            <div>đáy {usdK(px(actualDip!))} <span className="down small">({signedInt(actualDip!)})</span></div>
            <div>kết {usdK(px(actualTerm!))} <span className={`small ${actualTerm! >= 0 ? "up" : "down"}`}>({signedInt(actualTerm!)})</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Khối kỳ hạn cho fallback (timeline.json cũ không có bearAsOf) — chỉ ngày mới nhất, không có Thực tế. */
function LegacyBlock({ s, price }: { s: BearHorizonStat; price: number }) {
  const label = HLABEL[String(s.horizonDays)] ?? String(s.horizonDays);
  if (!enoughSamples(s.n, s.horizonDays)) {
    return (
      <div className="bdo-block empty">
        <span className="bdo-h">{label}</span>
        <span>chưa đủ dữ liệu (n={s.n})</span>
      </div>
    );
  }
  const at = (pv: number) => usd(price * (1 + pv / 100));
  const t = pUpTenths(s.pUp);
  return (
    <div className="bdo-block">
      <div className="bdo-h">{label}</div>
      <div className="bdo-grid">
        <div className="bdo-cell">
          <div className="bdo-label">Đáy điển hình</div>
          <div>{at(s.median)} <span className="down small">({signed(s.median)})</span></div>
        </div>
        <div className="bdo-cell">
          <div className="bdo-label">Kết cục điển hình</div>
          <div>{at(s.endMedian)} <span className={`small ${s.endMedian >= 0 ? "up" : "down"}`}>({signed(s.endMedian)})</span></div>
        </div>
        <div className="bdo-cell">
          <div className="bdo-label">Khả năng</div>
          <div>
            <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
          </div>
        </div>
      </div>
    </div>
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
    if (asOfIdx != null) setIdx(Math.min(asOfIdx, points.length - 1));
    else setIdx(Math.max(0, points.length - 1));
  }, [asOfIdx, points.length]);

  const prices = useMemo(() => points.map((q) => q.price), [points]);
  // sparkline chọn ngày — chọn THÔ có chủ đích (~4.3k phiên trên ~350px ≈ 12 ngày/px);
  // ◀▶ nhích từng phiên, date picker nhảy chính xác. KHÔNG zoom/pan (xem spec).
  const SW = 640, SH = 64;
  const spark = useMemo(() => {
    if (prices.length < 2) return null;
    let min = Infinity, max = -Infinity;
    for (const v of prices) { if (v < min) min = v; if (v > max) max = v; }
    const span = max - min || 1;
    const xAt = (i: number) => (i / (prices.length - 1)) * SW;
    const yAt = (v: number) => SH - 4 - ((v - min) / span) * (SH - 8);
    const step = Math.max(1, Math.floor(prices.length / SW)); // ~1 điểm/px là đủ mượt
    let d = "";
    for (let i = 0; i < prices.length; i += step) d += `${d ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(prices[i]).toFixed(1)}`;
    d += `L${SW} ${yAt(prices[prices.length - 1]).toFixed(1)}`;
    return { d, xAt };
  }, [prices]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const pickAt = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setIdx(Math.round(frac * (points.length - 1)));
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
        <div className="bdo-blocks">
          {bd.shown.map((s) => <LegacyBlock key={s.horizonDays} s={s} price={bd.currentPrice} />)}
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

      {/* sparkline chọn ngày: chạm/kéo = thô · ◀▶ = từng phiên · 📅 = chính xác */}
      {spark && (
        <div className="bdo-sparkwrap">
          <svg
            ref={svgRef}
            className="bdo-spark"
            viewBox={`0 0 ${SW} ${SH}`}
            preserveAspectRatio="none"
            onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pickAt(e.clientX); }}
            onPointerMove={(e) => { if (dragging.current) pickAt(e.clientX); }}
            onPointerUp={() => { dragging.current = false; }}
            onPointerCancel={() => { dragging.current = false; }}
            aria-label="Biểu đồ giá — chạm/kéo để chọn ngày xem lại"
          >
            <path d={spark.d} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
            <line x1={spark.xAt(X)} y1="0" x2={spark.xAt(X)} y2={SH} stroke="#ece5d8" strokeWidth="1" opacity="0.6" />
          </svg>
          <button className="bdo-fab left" disabled={X <= 0} onClick={() => setIdx(Math.max(0, X - 1))} aria-label="Lùi 1 phiên">◀</button>
          <button className="bdo-fab right" disabled={X >= points.length - 1} onClick={() => setIdx(Math.min(points.length - 1, X + 1))} aria-label="Tới 1 phiên">▶</button>
        </div>
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

      <div className="bdo-blocks">
        {HS.map((H) => (
          <Block
            key={H}
            H={H}
            band={p.bearAsOf?.[H] ?? null}
            price={p.price}
            actualDip={actualWorstDipPct(prices, X, Number(H))}
            actualTerm={p.returns[H]}
          />
        ))}
      </div>
      <p className="muted small" style={{ marginTop: "0.4rem" }}>
        ⚠ Khoảng &amp; tần suất theo lịch sử, nghiêng ~2 năm gần (đang bull) · khoảng rộng = bất định cao · <b>KHÔNG phải dự đoán</b>
      </p>
    </section>
  );
}
