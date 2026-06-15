"use client";
import type { ReactNode } from "react";
import type { Guidance } from "@/lib/guidance";

const LEVEL_TAG: Record<Guidance["level"], string> = {
  strong: "GOM",
  buy: "GOM",
  dca: "GOM RẢI",
  wait: "QUAN SÁT",
  "premium-wait": "CHỜ CHÊNH HẠ",
  reduce: "BỚT MUA",
};

export default function ActionGuidance({
  guidance,
  meta,
  note,
}: {
  guidance: Guidance;
  /** dòng cô đọng "zone · điểm · gần đáy" hiển thị dưới phần lý do */
  meta?: ReactNode;
  /** cảnh báo an toàn (vùng bán / preset chưa có tín hiệu) — không được giấu */
  note?: ReactNode;
}) {
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
      {note}
      {meta && <div className="guidance-meta">{meta}</div>}
      <p className="muted small">
        Kết hợp điểm mua + săn đáy + chênh lệch VN. Hỗ trợ quyết định, KHÔNG phải khuyến nghị đầu tư.
      </p>
    </section>
  );
}
