"use client";
import { BOTTOM_CONFIG, type BottomAnalysis, type BottomTierResult } from "@/lib/types";

function Gauge({ title, sub, tier, provisional }: { title: string; sub: string; tier: BottomTierResult; provisional: boolean }) {
  const lowSample = tier.n < 10;
  const unverified = provisional || lowSample;
  const pct = Math.round(tier.prob);
  const ci = tier.ci ? ` (CI ${tier.ci[0]}–${tier.ci[1]}%)` : "";
  const cls = pct >= 60 ? "buy" : pct >= 35 ? "neutral" : "sell";
  return (
    <div className="bottom-gauge">
      <div className="bottom-gauge-title">{title} <span className="muted small">{sub}</span></div>
      {unverified ? (
        <div className="muted small">Chưa đủ dữ liệu kiểm chứng{lowSample && !provisional ? ` (chỉ ${tier.n} quan sát cùng nhóm)` : ""}.</div>
      ) : (
        <>
          <div className={`bottom-gauge-pct ${cls}`}>{pct}%<span className="muted small">{ci}</span></div>
          <div className="bottom-gauge-bar"><div className={`bottom-gauge-fill ${cls}`} style={{ width: `${pct}%` }} /></div>
          <ul className="bottom-gauge-drivers">
            {tier.drivers.filter((d) => d.available).slice(0, 3).map((d) => (
              <li key={d.id}>{d.explanation}</li>
            ))}
          </ul>
          <div className="muted small">n={tier.n} quan sát lịch sử cùng nhóm điểm đáy</div>
        </>
      )}
    </div>
  );
}

export default function BottomGauges({ bottom }: { bottom: BottomAnalysis }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Săn đáy — xác suất giá không rẻ hơn đáng kể</h2>
      </div>
      <p className="muted small">
        Ước lượng từ base-rate lịch sử XAU/USD theo nhóm điểm số đáy. Công cụ tham khảo, KHÔNG phải dự báo chắc chắn — quá khứ không bảo đảm tương lai.
      </p>
      <div className="bottom-gauges">
        <Gauge title="Đáy chu kỳ" sub="≈6 tháng" tier={bottom.cycle} provisional={!!BOTTOM_CONFIG.cycle.provisional} />
        <Gauge title="Đáy sóng" sub="≈1 tháng" tier={bottom.swing} provisional={!!BOTTOM_CONFIG.swing.provisional} />
      </div>
    </section>
  );
}
