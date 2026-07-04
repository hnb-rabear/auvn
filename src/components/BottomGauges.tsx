"use client";
import { useState } from "react";
import { BOTTOM_CONFIG, type BottomAnalysis, type BottomTierResult, type BottomCalibrationBucket } from "@/lib/types";
import { bottomPctClass } from "@/lib/bottom";

function Gauge({ title, sub, tier, provisional, crashMode }: { title: string; sub: string; tier: BottomTierResult; provisional: boolean; crashMode: boolean }) {
  const lowSample = tier.n < 10;
  const unverified = provisional || lowSample;
  // Chính sách hiển thị (docs/bottom.md "Recency-504"): bình thường hiện prob (recency,
  // sửa undershoot bull); khi giá đang sụp cấp tính hiện bản KHÔNG trọng số — recency
  // đo được là lạc quan giả đúng chế độ này (2020 −19đ; khi tự tin ≥55% lúc sập: 0/2 đúng).
  const shown = crashMode ? (tier.probUnweighted ?? tier.prob) : tier.prob;
  const pct = Math.round(shown);
  const ci = !crashMode && tier.ci ? ` (CI ${tier.ci[0]}–${tier.ci[1]}%)` : "";
  const cls = bottomPctClass(pct);
  return (
    <div className="bottom-gauge">
      <div className="bottom-gauge-title">{title} <span className="muted small">{sub}</span></div>
      {unverified ? (
        <div className="muted small">Chưa đủ dữ liệu kiểm chứng{lowSample && !provisional ? ` (chỉ ${tier.n} quan sát cùng nhóm)` : ""}.</div>
      ) : (
        <>
          <div className={`bottom-gauge-pct ${cls}`}>{pct}%<span className="muted small">{ci}</span></div>
          <div className="bottom-gauge-bar"><div className={`bottom-gauge-fill ${cls}`} style={{ width: `${pct}%` }} /></div>
          {crashMode && (
            <div className="muted small">
              ⚠ Giá đang sụp cấp tính — {tier.probUnweighted != null
                ? <>hiện ước lượng thận trọng (toàn lịch sử). Ước lượng nghiêng 2 năm gần: {Math.round(tier.prob)}% — kém tin cậy khi đang sập (xem ⓘ).</>
                : <>giai đoạn này ước lượng đáy kém tin cậy hơn bình thường (xem ⓘ).</>}
            </div>
          )}
          <ul className="bottom-gauge-drivers">
            {tier.drivers.filter((d) => d.available).slice(0, 3).map((d) => (
              <li key={d.id}>{d.explanation}</li>
            ))}
          </ul>
          <div className="muted small">
            n={tier.n} quan sát lịch sử cùng nhóm điểm đáy{!crashMode && tier.ess ? ` (hiệu dụng ≈${tier.ess} do ưu tiên 2 năm gần)` : ""}
          </div>
        </>
      )}
    </div>
  );
}

/** Dòng kiểm toán reliability: chỉ bucket đủ mẫu (n≥20) mới đáng đọc. */
function calibLine(buckets: BottomCalibrationBucket[] | undefined): string | null {
  if (!buckets) return null;
  const rows = buckets.filter((b) => b.n >= 20);
  if (!rows.length) return null;
  return rows.map((b) => `máy nói ${b.lo}–${b.hi}% → thực ${Math.round(b.real)}% (n=${b.n})`).join(" · ");
}

export default function BottomGauges({ bottom, crashMode = false }: { bottom: BottomAnalysis; crashMode?: boolean }) {
  const [showInfo, setShowInfo] = useState(false);
  const calibCycle = calibLine(bottom.calibration?.cycle);
  const calibSwing = calibLine(bottom.calibration?.swing);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Săn đáy — xác suất giá không rẻ hơn đáng kể</h2>
        <button
          className="iconbtn small-btn"
          aria-label="Giải thích ô này"
          aria-expanded={showInfo}
          onClick={() => setShowInfo((v) => !v)}
        >
          {showInfo ? "✕" : "ⓘ"}
        </button>
      </div>
      {showInfo && (
        <div className="banner info">
          Ước lượng giá có đang <b>gần đáy</b> không, để <b>gom rải</b> lúc giá lao dốc. Là xác suất
          tham khảo — <b>không phải lời khẳng định đáy</b>. Con số ưu tiên ~2 năm gần (sửa lệch theo
          chế độ thị trường); khi giá <b>đang sụp cấp tính</b> nó dễ lạc quan giả nên ô này tự chuyển
          về bản thận trọng (toàn lịch sử) kèm cảnh báo. Khoảng tin cậy chỉ phản ánh nhiễu lấy mẫu,
          KHÔNG bao được thay đổi chế độ thị trường.
          {(calibCycle || calibSwing) && (
            <>
              <br />
              <b>Kiểm toán walk-forward</b> (máy từng nói X% thì thực tế bao nhiêu?):
              {calibCycle && <> Chu kỳ: {calibCycle}.</>}
              {calibSwing && <> Sóng: {calibSwing}.</>}
            </>
          )}
        </div>
      )}
      <p className="muted small">
        Ước lượng từ base-rate lịch sử XAU/USD theo nhóm điểm số đáy. Công cụ tham khảo, KHÔNG phải dự báo chắc chắn — quá khứ không bảo đảm tương lai.
      </p>
      <div className="bottom-gauges">
        <Gauge title="Đáy chu kỳ" sub="≈6 tháng" tier={bottom.cycle} provisional={!!BOTTOM_CONFIG.cycle.provisional} crashMode={crashMode} />
        <Gauge title="Đáy sóng" sub="≈1 tháng" tier={bottom.swing} provisional={!!BOTTOM_CONFIG.swing.provisional} crashMode={crashMode} />
      </div>
    </section>
  );
}
