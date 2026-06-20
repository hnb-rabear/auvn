"use client";
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
  const ppNum = a.pricePct2y === null ? 0 : Math.round(a.pricePct2y * 100);
  const verdict =
    a.mult >= 1
      ? `Vùng thường (${pct(a.pricePct2y)}) — mua đều ×1`
      : `${a.pricePct2y !== null && a.pricePct2y > ACCUM_CONFIG.expHi ? "Đỉnh vùng 2 năm" : "Bất lợi"} (${pct(
          a.pricePct2y
        )}) — ghìm mua ×${a.mult}`;
  const cls = a.mult >= 1 ? "buy" : a.mult <= 0.25 ? "sell" : "neutral";

  return (
    <section className="card">
      <div className="card-head">
        <h2>Vùng tích lũy — phanh DCA chống mua đỉnh</h2>
      </div>
      <p className="muted small">
        DCA đều, nhưng ghìm khối lượng (không bao giờ về 0) khi vàng đắt bất thường so với dải 2 năm
        hoặc composite bi quan. Lan can chống FOMO mua đỉnh — KHÔNG phải máy đẻ vàng.
      </p>

      {health.status === "degraded" && (
        <div className="banner warn">
          ⚠ Lớp Vùng tích lũy đang mất hiệu quả trên ~2 năm gần nhất (cải thiện {health.recentImprPct}%,
          kiểm tra tự động mỗi cron) — cân nhắc bỏ qua gợi ý phanh.
        </div>
      )}

      {a.provisional ? (
        <div className="muted small">Chưa đủ 2 năm dữ liệu để chấm — chưa kích hoạt phanh.</div>
      ) : (
        <>
          <div className={`bottom-gauge-pct ${cls}`}>{verdict}</div>
          <div className="bottom-gauge-bar">
            <div className="bottom-gauge-fill neutral" style={{ width: `${ppNum}%` }} />
          </div>
          <div className="gauge-scale">
            <span>0 rẻ</span>
            <span>phanh ở {pct(ACCUM_CONFIG.expHi)}</span>
            <span>đắt 100</span>
          </div>
          {a.brakes.length > 0 && (
            <ul className="signals">
              {a.brakes.map((b) => (
                <li key={b.id}>
                  <div>
                    <div className="sig-label">{b.label}</div>
                    <div className="sig-expl">{b.explanation}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="verdict-bt muted">
            Kiểm chứng: phanh này hạ giá vốn trung bình +{ev.trainImprPct}% (2009–2018, CI{" "}
            {ev.trainCi[0]}–{ev.trainCi[1]}%) / +{ev.testImprPct}% (2019–2026, CI {ev.testCi[0]}–
            {ev.testCi[1]}%). Lưu ý: số 2019–2026 bị sóng tăng tô hồng; biên lợi chế độ thường ~2% có
            thể trong tầm spread mua-bán vật chất.
          </div>
        </>
      )}
    </section>
  );
}
