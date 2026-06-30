"use client";
import { useState } from "react";
import type { BearDownsideAnalysis, BearHorizonStat } from "@/lib/types";

const HLABEL: Record<number, string> = { 21: "1 tháng", 63: "3 tháng", 126: "6 tháng" };
const HSHORT: Record<number, string> = { 21: "1T", 63: "3T", 126: "6T" };
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("vi-VN")}`;

/** Một hàng kỳ hạn — đáy (đỏ, rủi ro) · kết cục (xanh/đỏ theo dấu) · cơ hội tăng (thanh). */
function Row({ s, price }: { s: BearHorizonStat; price: number }) {
  const label = HLABEL[s.horizonDays] ?? String(s.horizonDays);
  if (s.n < 30) {
    return (
      <tr>
        <td>{label}</td>
        <td className="muted" colSpan={3}>chưa đủ dữ liệu (n={s.n})</td>
      </tr>
    );
  }
  const at = (pct: number) => usd(price * (1 + pct / 100));
  const pct = Math.max(0, Math.min(100, s.pUp));
  return (
    <tr>
      <td>{label}</td>
      <td>{at(s.median)} <span className="down">({signed(s.median)})</span></td>
      <td>{at(s.endMedian)} <span className={s.endMedian >= 0 ? "up" : "down"}>({signed(s.endMedian)})</span></td>
      <td>
        <span className="minibar"><span className={`minibar-fill${s.pUp >= 50 ? "" : " mid"}`} style={{ width: `${pct}%` }} /></span>
        {fmt1(s.pUp)}%
      </td>
    </tr>
  );
}

export default function BearDownsideCard({ bd }: { bd: BearDownsideAnalysis }) {
  const [showInfo, setShowInfo] = useState(false);
  const rows = bd.shown.filter((s) => s.n >= 30);
  const tail = rows.map((s) => `${HSHORT[s.horizonDays] ?? s.horizonDays} ${signed(s.p10)}`).join(" · ");
  return (
    <section className="card">
      <div className="card-head">
        <h2>Triển vọng 1/3/6 tháng tới</h2>
        <span className="muted">
          {bd.currentPrice > 0 && <>{usd(bd.currentPrice)} · </>}−{fmt1(bd.currentDdPct)}% dưới đỉnh
        </span>
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
          <p>Nếu mua/giữ vàng hôm nay, mỗi cột nghĩa là:</p>
          <ul className="info-defs">
            <li><b className="down">Đáy điển hình</b> — nhịp dúi sâu nhất <i>giữa</i> kỳ (rủi ro phải chịu).</li>
            <li><b className="up">Kết cục điển hình</b> — giá <i>kết</i> tại mốc kỳ hạn.</li>
            <li><b>Cơ hội tăng</b> — % số lần giá cao hơn hôm nay.</li>
          </ul>
          {tail && <p>Hiếm gặp (~1/10 lần tệ nhất), giá có lúc dúi sâu tới: {tail}. Phần lớn các lần khác dúi nông hơn (xem cột “Đáy điển hình”).</p>}
          <p>
            ⚠ <b>Lưu ý:</b> &quot;Kết cục&quot; &amp; &quot;cơ hội tăng&quot; dựa trên mẫu XAU/USD ~20 năm <b>chủ yếu bull</b> nên
            cao hơn thực tế ở chế độ khác — phụ thuộc chế độ thị trường, KHÔNG phải xác suất chắc nịch.
            Độ sâu drawdown hiện tại không làm các con số này đổi.
          </p>
          <p className="muted">Phân phối lịch sử — tham khảo rủi ro, không phải dự đoán.</p>
        </div>
      )}
      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead>
            <tr>
              <th>Kỳ hạn</th>
              <th>Đáy điển hình</th>
              <th>Kết cục điển hình</th>
              <th>Cơ hội tăng</th>
            </tr>
          </thead>
          <tbody>
            {bd.shown.map((s) => <Row key={s.horizonDays} s={s} price={bd.currentPrice} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
