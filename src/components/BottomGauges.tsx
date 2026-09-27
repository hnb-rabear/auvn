"use client";
import { useState } from "react";
import { BOTTOM_CONFIG, type BottomAnalysis, type BottomTierResult, type BottomCalibrationBucket } from "@/lib/types";
import {
  BOTTOM_TIER_LABEL,
  bottomTierOf,
  TIER_CLASS,
  tierEvidenceText,
  type TierEvidence,
} from "@/lib/bottom-tier";

/**
 * Hiển thị BẬC, không %: `prob` bị hiệu chuẩn ngược ở vùng cao (walk-forward: máy nói
 * 60–80% thì đúng 26%), nhưng THỨ HẠNG bin giữ vững cả hai giai đoạn. Xem
 * src/lib/bottom-tier.ts + docs/superpowers/specs/2026-09-25-bottom-tier-display-design.md.
 */
function Gauge({ title, sub, which, tier, evidence, provisional, crashMode }: { title: string; sub: string; which: "cycle" | "swing"; tier: BottomTierResult; evidence?: TierEvidence; provisional: boolean; crashMode: boolean }) {
  const lowSample = tier.n < 10;
  const unverified = provisional || lowSample;
  const level = bottomTierOf(tier.bin, crashMode);
  const demoted = crashMode && bottomTierOf(tier.bin, false) === "high";
  const ev = evidence?.[which][level];
  return (
    <div className="bottom-gauge">
      <div className="bottom-gauge-title">{title} <span className="muted small">{sub}</span></div>
      {unverified ? (
        <div className="muted small">Chưa đủ dữ liệu kiểm chứng{lowSample && !provisional ? ` (chỉ ${tier.n} quan sát cùng nhóm)` : ""}.</div>
      ) : (
        <>
          <div className={`bottom-gauge-pct ${TIER_CLASS[level]}`}>{BOTTOM_TIER_LABEL[level]}</div>
          {ev && <div className="muted small">Khả năng gần đáy: {tierEvidenceText(ev)}.</div>}
          {demoted && (
            <div className="muted small">
              ⚠ Điểm đáy đang ở nhóm cao nhất, nhưng giá đang <b>sụp nhanh</b> — lịch sử cho thấy
              nhóm cao trong chế độ này chỉ ngang mức bình thường, nên hạ một bậc (xem ⓘ).
            </div>
          )}
          <ul className="bottom-gauge-drivers">
            {tier.drivers.filter((d) => d.available).slice(0, 3).map((d) => (
              <li key={d.id}>{d.explanation}</li>
            ))}
          </ul>
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
  return rows
    .map((b) => `máy nói ${b.lo}–${b.hi}% → thực ${Math.round(b.real)}% (${b.n} ngày)`)
    .join(" · ");
}

export default function BottomGauges({ bottom, crashMode = false }: { bottom: BottomAnalysis; crashMode?: boolean }) {
  const [showInfo, setShowInfo] = useState(false);
  const calibCycle = calibLine(bottom.calibration?.cycle);
  const calibSwing = calibLine(bottom.calibration?.swing);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Săn đáy — giá có đang gần đáy không</h2>
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
          Cho biết giá có đang ở vùng <b>gần đáy hơn bình thường</b> không — lớp <b>ngữ cảnh</b>,
          không phải cò súng mua và <b>không phải lời khẳng định đáy</b>. "Gần đáy" = trong 6
          tháng (chu kỳ) / 1 tháng (sóng) tới, giá không rẻ hơn hôm nay quá 3% / 2%.
          <br />
          <b>Vì sao không còn số %:</b> kiểm toán walk-forward cho thấy con số % bị lệch ngược ở
          vùng cao — máy nói "60–80%" thì thực tế chỉ đúng khoảng một phần tư — vì nó chịu ảnh
          hưởng mạnh của chế độ thị trường (gấu 2011–2013 gần như luôn sai, tăng giá 2023–2025
          gần như luôn đúng). Cái vẫn đúng ở CẢ HAI giai đoạn là <b>thứ hạng</b>: nhóm cao đúng
          nhiều hơn mức bình thường, nhóm thấp đúng ít hơn. Nên ô này hiện bậc và để bạn tự so
          với mức bình thường (nền) của từng giai đoạn — khoảng cách tới nền thay đổi theo thời
          kỳ, chỉ thứ hạng là bền.
          <br />
          Khi giá <b>đang sụp nhanh</b> (sụt ≥8% so với đỉnh 42 phiên, hoặc ≥15% so với đỉnh mọi
          thời đại), nhóm cao đo được chỉ ngang mức bình thường — nên ô tự hạ một bậc.
          {(calibCycle || calibSwing) && (
            <>
              <br />
              <b>Kiểm toán số % cũ</b> (để đối chiếu vì sao đã bỏ; số ngày chồng lấn cửa sổ
              tương lai nên không phải số lần độc lập):
              {calibCycle && <> Chu kỳ: {calibCycle}.</>}
              {calibSwing && <> Sóng: {calibSwing}.</>}
            </>
          )}
        </div>
      )}
      <p className="muted small">
        Xếp nhóm theo điểm số đáy (RSI quá bán + vĩ mô đảo chiều) trên lịch sử XAU/USD — đáy
        giá thế giới, không phải đáy SJC. Công cụ tham khảo, KHÔNG phải dự báo — quá khứ không
        bảo đảm tương lai.
      </p>
      <div className="bottom-gauges">
        <Gauge title="Đáy chu kỳ" sub="≈6 tháng" which="cycle" tier={bottom.cycle} evidence={bottom.tierEvidence} provisional={!!BOTTOM_CONFIG.cycle.provisional} crashMode={crashMode} />
        <Gauge title="Đáy sóng" sub="≈1 tháng" which="swing" tier={bottom.swing} evidence={bottom.tierEvidence} provisional={!!BOTTOM_CONFIG.swing.provisional} crashMode={crashMode} />
      </div>
    </section>
  );
}
