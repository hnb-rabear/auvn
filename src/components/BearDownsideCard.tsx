"use client";
import { useEffect, useMemo, useState } from "react";
import type { BearDownsideAnalysis, BearAsOfBand, BearHorizonStat, Timeline } from "@/lib/types";
import { ddAsOfPct, actualWorstDipPct, monthAnchors, monthPosOf, pUpTenths, coverageStats } from "@/lib/bear-downside-view";
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
  const px = (pct: number) => price * (1 + pct / 100);
  const t = pUpTenths(band.pUp); // bậc 1/10 — chi tiết hơn là giả-chính-xác (ít cửa sổ độc lập)
  const matured = actualDip != null && actualTerm != null;
  return (
    <tr>
      <td>{label}</td>
      {/* Đáy điển hình: 1 số (giá to, % nhỏ) */}
      <td>
        {usdK(px(band.median))} <span className="down small">({signedInt(band.median)})</span>
      </td>
      {/* Kết cục: DẢI p25→p75 (giá to, % nhỏ) — lộ độ tản, chống trung-vị-như-dự-đoán */}
      <td>
        {usdK(px(band.endP25))}<span className="muted"> → </span>{usdK(px(band.endP75))}
        <div className="small muted">{signedInt(band.endP25)}…{signedInt(band.endP75)}</div>
      </td>
      {/* Thực tế */}
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
      {/* Khả năng: hai chiều ↑/↓, bậc thô 1/10 (chống neo một chiều + giả-chính-xác) */}
      <td>
        <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
      </td>
    </tr>
  );
}

/** Hàng UI cũ cho fallback (timeline.json cũ không có bearAsOf) — chỉ ngày mới nhất nên không có thực tế. */
function LegacyRow({ s, price }: { s: BearHorizonStat; price: number }) {
  const label = HLABEL[String(s.horizonDays)] ?? String(s.horizonDays);
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
    if (asOfIdx != null) setIdx(Math.min(asOfIdx, points.length - 1));
    else setIdx(Math.max(0, points.length - 1));
  }, [asOfIdx, points.length]);

  const prices = useMemo(() => points.map((q) => q.price), [points]);
  const anchors = useMemo(() => monthAnchors(points.map((q) => q.date)), [points]);
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

      <div className="bt-table-wrap">
        <table className="bt-table">
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
