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
  const hasPrice = a.brakes.some((b) => b.id === "price-top");
  const hasComp = a.brakes.some((b) => b.id === "comp-bear");

  // Câu hành động (theo hệ số) + màu
  let action: string;
  let tone: "buy" | "neutral" | "sell";
  if (a.mult >= 1) {
    action = "Tháng này: GOM ĐỀU NHƯ THƯỜNG";
    tone = "buy";
  } else if (a.mult <= 0.2) {
    action = "Tháng này: GOM RẤT DÈ (mỗi đợt ≈⅕)";
    tone = "sell";
  } else if (a.mult <= 0.25) {
    action = "Tháng này: GOM ÍT LẠI (mỗi đợt ≈¼)";
    tone = "sell";
  } else {
    action = "Tháng này: GOM BỚT LẠI (mỗi đợt ½)";
    tone = "neutral";
  }

  // Câu giải thích (theo phanh nào bật) — luôn dịch số sang lời
  let why: string;
  if (a.mult >= 1) {
    why = `Giá đang ở ${ppLabel} so với giá vàng 2 năm qua — chưa tới vùng đắt (${brakeHi}%) cần ghìm mua.`;
  } else if (hasPrice && hasComp) {
    why = `Vàng vừa đắt (${ppLabel}) vừa gặp xu hướng bất lợi — nên ghìm mạnh.`;
  } else if (hasPrice) {
    why = `Giá đang ở vùng đắt nhất 2 năm (${ppLabel}) — dễ mua hớ, nên gom ít lại và để dành tiền cho lúc rẻ hơn.`;
  } else {
    why = "Xu hướng thị trường đang bất lợi nên tạm gom ít lại.";
  }

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
            <b>Card này để làm gì?</b>
            <br />
            Bạn mua vàng đều đặn mỗi tháng. Card nhắc: tháng nào vàng đang <b>đắt bất thường</b> thì mua
            ít lại, để dành tiền cho lúc rẻ hơn. Nó <b>không</b> bảo bạn mua hay bán — chỉ chỉnh mua
            nhiều hay ít.
          </p>
          <p>
            <b>Con số {ppLabel} là gì?</b>
            <br />
            Là so giá hôm nay với chính giá vàng <b>2 năm qua</b>. {ppLabel} nghĩa là hôm nay vàng đang
            đắt hơn {ppLabel} số ngày trong 2 năm gần đây. Càng gần 100 càng đắt. <b>Vượt {brakeHi} là
            vùng đắt</b> → card khuyên mua ít lại.
          </p>
          <p>
            <b>Có đáng tin không?</b>
            <br />
            Đã thử lại trên <b>17 năm lịch sử giá vàng</b> (chia 2 thời kỳ khác nhau để chắc không phải
            ăn may): cách &quot;đắt thì ghìm mua&quot; cho ra <b>giá vốn trung bình rẻ hơn</b> so với mua
            đều một cách máy móc.
          </p>
          <p>
            <b>Đừng kỳ vọng quá.</b>
            <br />
            Lợi ích thật khá nhỏ — <b>rẻ hơn khoảng 2%</b> ở điều kiện thường (có lúc nhiều hơn khi giá
            tăng mạnh, nhưng đừng trông vào đó). Đôi khi 2% còn không bù nổi chênh lệch mua–bán ở tiệm
            vàng. Đây là <b>lan can chống mua hớ lúc đỉnh</b>, không phải cách làm giàu.
          </p>
          <p>
            <b>Vì sao đôi khi ngược &quot;Săn điểm mua&quot;?</b>
            <br />
            Săn điểm mua nhìn <b>xu hướng 1–3 tháng</b>; lớp này nhìn <b>giá vốn 2–3 năm</b>. Ở đỉnh
            sóng tăng, hai bên có thể nói ngược nhau — bình thường: một bên giục mua theo đà, một bên
            nhắc đừng trả giá đỉnh. Lướt ngắn thì nghe điểm-mua; tích sản dài thì nghe lớp này.
          </p>
          <p className="muted small">
            Chi tiết kỹ thuật: rẻ hơn +{ev.trainImprPct}% (2009–2018) / +{ev.testImprPct}% (2019–2026).
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
