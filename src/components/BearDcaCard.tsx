"use client";
import { useState } from "react";
import { qtyForPhase } from "@/lib/bear-dca";
import type { BearDcaAnalysis, BearDcaHealth, BearPhase } from "@/lib/types";

const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

const PHASES: BearPhase[] = ["bull", "acute", "grind", "recovery"];
const PHASE_LABEL: Record<BearPhase, string> = {
  bull: "Tăng",
  acute: "Sụp cấp tính",
  grind: "Rỉ máu",
  recovery: "Hồi phục",
};
const ACTION: Record<string, string> = {
  "1.5": "Tháng này: GOM MẠNH (mỗi đợt ≈1.5×)",
  "1": "Tháng này: GOM ĐỀU NHƯ THƯỜNG",
  "0.75": "Tháng này: GOM ÍT LẠI (mỗi đợt ≈¾)",
  "0.5": "Tháng này: GOM RẤT ÍT (mỗi đợt ≈½)",
};

export default function BearDcaCard({
  bearDca: a,
  health,
}: {
  bearDca: BearDcaAnalysis;
  health: BearDcaHealth;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [override, setOverride] = useState<BearPhase | null>(null);

  const phase = override ?? a.phase;
  const mult = qtyForPhase(phase, a.ddFromAth, a.pricePct2y);
  const action = ACTION[String(mult)] ?? "Tháng này: xem gợi ý bên dưới";
  const tone = mult >= 1 ? "buy" : mult >= 0.75 ? "neutral" : "sell";
  const useDdGauge = phase === "acute" || phase === "recovery";

  const BEAR_NOTE = (
    <p className="muted small" style={{ marginTop: "0.75rem", borderTop: "1px solid var(--c-line)", paddingTop: "0.5rem" }}>
      ⓘ Chỉ áp dụng vùng Bear (giá cách đỉnh ≥15%). Vùng Tăng: gom đều tay.
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

      {showInfo && (
        <div className="banner info accum-info">
          <p><b>Để làm gì?</b><br />Gợi ý mua bao nhiêu mỗi nhịp DCA (~21 ngày) trong bear market. Không bảo mua/bán.</p>
          <p><b>4 pha:</b> Tăng → gom đều; Sụp cấp tính → gom theo độ sâu từ đỉnh; Rỉ máu → gom theo vị trí giá 2 năm; Hồi phục → gom mạnh.</p>
          <p><b>Timing:</b> Mua vào ngày DCA cố định của bạn. Không cần canh ngày trong tháng.</p>
          <p className="muted small">Kiểm chứng bear 2013–2019: cấp tính +3.94% giá vốn, rỉ máu +1.85%/+1.35% (giá vốn/tài sản) vs gom đều.</p>
        </div>
      )}

      {/* Tín hiệu thô + gợi ý pha (luôn hiện để người dùng tự phán đoán) */}
      <p className="muted small">
        Gợi ý: <b>{PHASE_LABEL[a.phase]}</b> · cách đỉnh {fmtPct(a.ddFromAth)} · đáy{" "}
        {a.ddChange >= 0 ? "sâu thêm" : "thu hẹp"} {Math.round(Math.abs(a.ddChange) * 100)} điểm %/tháng
        {a.pricePct2y !== null && ` · giá percentile ${fmtPct(a.pricePct2y)} (2 năm)`}
      </p>

      {/* Hybrid override: chọn pha */}
      <div className="phase-picker" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
        {PHASES.map((p) => (
          <button
            key={p}
            className={`chip ${p === phase ? (p === a.phase ? "buy" : "neutral") : ""}`}
            aria-pressed={p === phase}
            onClick={() => setOverride(p === a.phase ? null : p)}
          >
            {PHASE_LABEL[p]}{p === a.phase ? " (gợi ý)" : ""}
          </button>
        ))}
      </div>

      {/* Degraded warning (chỉ khi đang ở bear theo gợi ý; đã lọc nhiễu: chỉ nhịp bear + ngưỡng −0.5%) */}
      {a.isBear && health.status === "degraded" && (
        <div className="banner warn">
          ⚠ Lớp này kém hơn gom đều trên {health.recentBearCycles} nhịp bear ~2 năm gần
          (giá vốn {health.recentImprPct}%, tài sản {health.recentAssetImprPct}%) — cân nhắc bỏ qua.
        </div>
      )}

      {/* Cảnh báo rủi ro RECOVERY (cố định khi pha đang dùng = recovery) */}
      {phase === "recovery" && (
        <div className="banner warn">
          ⚠ Gom mạnh khi hồi phục là cú cược giá tiếp tục lên. Nếu &quot;hồi giả&quot; rồi sụp tiếp, bạn sẽ lỗ.
          Bằng chứng mỏng (n=11 nhịp) — cân nhắc theo khẩu vị rủi ro.
        </div>
      )}

      {/* Headline + giải thích */}
      <div className={`bottom-gauge-pct ${tone}`}>{action}</div>
      <p className="accum-why">{phase === a.phase ? a.note : `Bạn đang xem pha "${PHASE_LABEL[phase]}" (đè gợi ý).`}</p>

      {/* Gauge */}
      {useDdGauge ? (
        <>
          <div className="accum-bar-wrap">
            <div className="bottom-gauge-bar">
              <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${Math.min(a.ddFromAth * 100 * 2, 100)}%` }} />
            </div>
            <span className="accum-brake-tick" style={{ left: "50%" }} aria-hidden title="dd=25%" />
            <span className="accum-brake-tick" style={{ left: "80%" }} aria-hidden title="dd=40%" />
          </div>
          <div className="gauge-scale"><span>đỉnh</span><span>sâu (−50%)</span></div>
          <p className="muted small">Thanh = độ sâu từ đỉnh. Vạch: 25% (gom đều), 40% (gom nhiều).</p>
        </>
      ) : (
        <>
          <div className="accum-bar-wrap">
            <div className="bottom-gauge-bar">
              <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${a.pricePct2y !== null ? Math.round(a.pricePct2y * 100) : 50}%` }} />
            </div>
            <span className="accum-brake-tick" style={{ left: "75%" }} aria-hidden />
          </div>
          <div className="gauge-scale"><span>rẻ</span><span>đắt</span></div>
          <p className="muted small">Thanh = percentile giá so 2 năm gần. Vạch vàng (75%) là mốc giảm khối lượng.</p>
        </>
      )}

      {BEAR_NOTE}
    </section>
  );
}
