"use client";
import { useState } from "react";
import { ACCUM_CONFIG, type AccumulationAnalysis, type AccumulationHealth } from "@/lib/types";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default function AccumulationCard({
  accumulation,
  health,
}: {
  accumulation: AccumulationAnalysis;
  health: AccumulationHealth;
}) {
  const a = accumulation;
  const ev = ACCUM_CONFIG.evidence;
  const [showInfo, setShowInfo] = useState(false);

  const ppNum = a.pricePct2y === null ? 0 : Math.round(a.pricePct2y * 100);
  const ppLabel = pct(a.pricePct2y);
  const brakeHi = Math.round(ACCUM_CONFIG.expHi * 100); // 75

  // Câu hành động + giải thích — chỉ 2 trạng thái: gom đều (×1) / gom ít lại (×0.25)
  const braking = a.mult < 1;
  const tone: "buy" | "sell" = braking ? "sell" : "buy";
  const action = braking
    ? "Tháng này: GOM ÍT LẠI (mỗi đợt ≈¼)"
    : "Tháng này: GOM ĐỀU NHƯ THƯỜNG";
  const why = braking
    ? `Giá đang ở vùng đắt nhất 2 năm (${ppLabel}) — dễ mua hớ, nên gom ít lại và để dành tiền cho lúc rẻ hơn.`
    : `Giá đang ở ${ppLabel} so với giá vàng 2 năm qua — chưa tới vùng đắt (${brakeHi}%) cần ghìm mua.`;

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

      {health.status === "degraded" && (
        <div className="banner warn">
          ⚠ Lớp này đang mất hiệu quả trên ~2 năm gần nhất (biên lợi gần đây {health.recentImprPct}% ≤ 0,
          kiểm tra tự động mỗi cron) — cân nhắc bỏ qua gợi ý dưới đây.
        </div>
      )}

      {showInfo && (
        <div className="banner info accum-info">
          <p>
            <b>Để làm gì?</b>
            <br />
            Bạn mua đều mỗi tháng. Card nhắc: tháng nào vàng <b>đắt bất thường</b> thì gom ít lại, để
            dành cho lúc rẻ hơn. Không bảo mua/bán — chỉ chỉnh nhiều/ít.
          </p>
          <p>
            <b>Con số {ppLabel} là gì?</b>
            <br />
            So giá hôm nay với giá vàng <b>2 năm qua</b>: càng gần 100 càng đắt. <b>Vượt {brakeHi} là
            vùng đắt</b> → gom ít lại.
          </p>
          <p>
            <b>Vì sao đôi khi ngược &quot;Săn điểm mua&quot;?</b>
            <br />
            Săn điểm mua nhìn <b>1–3 tháng</b>; lớp này nhìn <b>giá vốn 2–3 năm</b>. Ở đỉnh sóng tăng,
            chúng có thể nói ngược nhau — đó là bình thường.
          </p>
          <p className="muted small">
            Đừng kỳ vọng quá: lợi ích thật chỉ <b>~2% rẻ hơn</b>, đôi khi không bù nổi chênh lệch mua–
            bán ở tiệm vàng. Lan can chống mua hớ, không phải cách làm giàu. (Kiểm chứng: +
            {ev.trainImprPct}% / +{ev.testImprPct}% giai đoạn 2009–2018 / 2019–2026.)
          </p>
        </div>
      )}

      {a.provisional ? (
        <div className="muted small">Chưa đủ 2 năm dữ liệu để chấm — chưa kích hoạt gợi ý.</div>
      ) : (
        <>
          <div className={`bottom-gauge-pct ${tone}`}>{action}</div>
          <p className="accum-why">{why}</p>

          <div className="accum-bar-wrap">
            <div className="bottom-gauge-bar">
              <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${ppNum}%` }} />
            </div>
            <span className="accum-brake-tick" style={{ left: `${brakeHi}%` }} aria-hidden />
          </div>
          <div className="gauge-scale">
            <span>rẻ</span>
            <span>đắt</span>
          </div>
          <p className="muted small">
            Thanh trên = vị trí giá hôm nay trong dải 2 năm; vạch vàng ({brakeHi}) là mốc bắt đầu ghìm
            mua. Bấm ⓘ ở góc để xem giải thích.
          </p>
        </>
      )}
    </section>
  );
}
