"use client";
import { useState } from "react";
import type { BearDcaAnalysis, BearDcaHealth } from "@/lib/types";

const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

export default function BearDcaCard({
  bearDca: a,
  health,
}: {
  bearDca: BearDcaAnalysis;
  health: BearDcaHealth;
}) {
  const [showInfo, setShowInfo] = useState(false);

  // --- Câu hành động theo mult ---
  const actionLabel: Record<string, string> = {
    "1.5": "Tháng này: GOM NHIỀU HƠN (mỗi đợt ≈1.5×)",
    "1":   "Tháng này: GOM ĐỀU NHƯ THƯỜNG",
    "0.75":"Tháng này: GOM ÍT LẠI (mỗi đợt ≈¾)",
    "0.5": "Tháng này: GOM RẤT ÍT (mỗi đợt ≈½)",
  };
  const action = actionLabel[String(a.mult)] ?? "Tháng này: xem gợi ý bên dưới";
  const tone = a.mult >= 1 ? "buy" : a.mult >= 0.75 ? "neutral" : "sell";

  const BEAR_NOTE = (
    <p className="muted small" style={{ marginTop: "0.75rem", borderTop: "1px solid var(--c-line)", paddingTop: "0.5rem" }}>
      ⓘ Chỉ áp dụng khi thị trường ở vùng Bear (giá cách đỉnh ≥15%).
    </p>
  );

  return (
    <section className="card">
      <div className="card-head">
        <h2>Mức mua tháng này</h2>
        <button
          className="iconbtn small-btn"
          aria-label="Giải thích card này"
          aria-expanded={showInfo}
          onClick={() => setShowInfo((v) => !v)}
        >
          {showInfo ? "✕" : "ⓘ"}
        </button>
      </div>

      {/* Popup ⓘ */}
      {showInfo && (
        <div className="banner info accum-info">
          <p><b>Để làm gì?</b><br />Gợi ý mua bao nhiêu mỗi nhịp DCA (~21 ngày) trong bear market. Không bảo mua/bán.</p>
          <p><b>Chế độ Bình thường:</b><br />Dùng vị trí giá so dải 2 năm (rẻ → gom nhiều, đắt → gom ít).</p>
          <p><b>Chế độ Sụp cấp tính</b> (giá rơi &gt;3%/tháng từ đỉnh):<br />Dùng độ sâu từ đỉnh. Vì khi vừa sụp, &quot;đắt/rẻ 2 năm&quot; chưa phản ánh kịp.</p>
          <p><b>Timing:</b> Nếu Săn đáy bắn trong nhịp → ưu tiên mua ngày đó. Nếu không → mua ngay đầu nhịp, không chờ.</p>
          <p className="muted small">Kiểm chứng bear 2013–2019: cấp tính +1.75%, bình thường +1.50% giá vốn rẻ hơn vs gom đều.</p>
        </div>
      )}

      {/* Bull: chỉ hiện cảnh báo */}
      {!a.isBear ? (
        <>
          <div className="banner warn">
            ⚠ Card này chỉ dùng trong vùng Bear. Thị trường hiện không ở vùng Bear
            (giá cách đỉnh {fmtPct(a.ddFromAth)}).
          </div>
          {BEAR_NOTE}
        </>
      ) : (
        <>
          {/* Degraded warning */}
          {health.status === "degraded" && (
            <div className="banner warn">
              ⚠ Lớp này đang mất hiệu quả trên ~2 năm gần nhất ({health.recentImprPct}% ≤ 0) — cân nhắc bỏ qua.
            </div>
          )}

          {/* Chế độ badge */}
          <p className="muted small">
            Chế độ: <b>{a.isAcute ? "Sụp cấp tính" : "Bình thường"}</b>
            {" · "}cách đỉnh {fmtPct(a.ddFromAth)}
            {a.isAcute && ` · tốc độ −${fmtPct(a.ddChange)}/tháng`}
          </p>

          {/* Headline + giải thích */}
          <div className={`bottom-gauge-pct ${tone}`}>{action}</div>
          <p className="accum-why">{a.note}</p>

          {/* Gauge */}
          {a.isAcute ? (
            /* Cấp tính: gauge dd ATH (0=đỉnh, 1=sâu nhất) */
            <>
              <div className="accum-bar-wrap">
                <div className="bottom-gauge-bar">
                  <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${Math.min(a.ddFromAth * 100 * 2, 100)}%` }} />
                </div>
                {/* vạch mốc 25% và 40% dd */}
                <span className="accum-brake-tick" style={{ left: "50%" }} aria-hidden title="dd=25%" />
                <span className="accum-brake-tick" style={{ left: "80%" }} aria-hidden title="dd=40%" />
              </div>
              <div className="gauge-scale"><span>đỉnh</span><span>sâu (−50%)</span></div>
              <p className="muted small">Thanh = độ sâu từ đỉnh. Vạch: 25% (gom đều), 40% (gom nhiều).</p>
            </>
          ) : (
            /* Bình thường: gauge pct2y */
            <>
              <div className="accum-bar-wrap">
                <div className="bottom-gauge-bar">
                  <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${a.pricePct2y !== null ? Math.round(a.pricePct2y * 100) : 50}%` }} />
                </div>
                <span className="accum-brake-tick" style={{ left: "75%" }} aria-hidden />
              </div>
              <div className="gauge-scale"><span>rẻ</span><span>đắt</span></div>
              <p className="muted small">Thanh = vị trí giá trong dải 2 năm. Vạch vàng (75%) là mốc bắt đầu giảm khối lượng.</p>
            </>
          )}

          {/* BH hint */}
          {a.bhFiredThisCycle && (
            <p className="muted small">🎯 Săn đáy bắn trong nhịp này — nếu chưa mua, ưu tiên mua ngay.</p>
          )}

          {BEAR_NOTE}
        </>
      )}
    </section>
  );
}
