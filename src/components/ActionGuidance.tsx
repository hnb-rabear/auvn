"use client";
import type { Guidance } from "@/lib/guidance";

const LEVEL_TAG: Record<Guidance["level"], string> = {
  strong: "GOM",
  buy: "GOM",
  dca: "GOM RẢI",
  wait: "QUAN SÁT",
  "premium-wait": "CHỜ CHÊNH HẠ",
  reduce: "BỚT MUA",
};

export default function ActionGuidance({ guidance }: { guidance: Guidance }) {
  return (
    <section className={`card guidance ${guidance.tone}`}>
      <div className="card-head">
        <h2>Gợi ý hành động</h2>
        <span className={`chip ${guidance.tone}`}>{LEVEL_TAG[guidance.level]}</span>
      </div>
      <div className="guidance-when">{guidance.when}</div>
      <div className="guidance-how">{guidance.how}</div>
      <ul className="guidance-reasons">
        {guidance.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      <p className="muted small">
        Kết hợp điểm mua + săn đáy + chênh lệch VN. Hỗ trợ quyết định, KHÔNG phải khuyến nghị đầu tư.
      </p>
    </section>
  );
}
