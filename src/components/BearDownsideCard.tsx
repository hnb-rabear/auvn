import type { BearDownsideAnalysis, BearHorizonStat } from "@/lib/types";

const HLABEL: Record<number, string> = { 21: "1 tháng", 63: "3 tháng", 126: "6 tháng", 252: "12 tháng" };
const HSHORT: Record<number, string> = { 21: "1T", 63: "3T", 126: "6T", 252: "12T" };
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("vi-VN")}`;

/** Một hàng kỳ hạn — hai chiều: đáy điển hình giữa kỳ (rủi ro) vs kết cục tại mốc (cơ hội). */
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
  return (
    <tr>
      <td>{label}</td>
      <td>{at(s.median)} <span className="muted">({signed(s.median)})</span></td>
      <td>{at(s.endMedian)} <span className="muted">({signed(s.endMedian)})</span></td>
      <td>{fmt1(s.pUp)}%</td>
    </tr>
  );
}

export default function BearDownsideCard({ bd }: { bd: BearDownsideAnalysis }) {
  const rows = bd.shown.filter((s) => s.n >= 30);
  const tail = rows.map((s) => `${HSHORT[s.horizonDays] ?? s.horizonDays} ${signed(s.p10)}`).join(" · ");
  return (
    <section className="card">
      <div className="card-head">
        <h2>Triển vọng 1/3/6 tháng tới</h2>
        <span className="muted">
          {bd.currentPrice > 0 && <>{usd(bd.currentPrice)} · </>}−{fmt1(bd.currentDdPct)}% dưới đỉnh
        </span>
      </div>
      <p className="sig-expl">
        Nếu mua/giữ vàng hôm nay — lịch sử các tầm nhìn tới thường <b>dúi sâu nhất</b> tới đâu (rủi ro)
        và <b>kết cục</b> ra sao (cơ hội). Tham khảo, không phải dự đoán.
      </p>
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
      <p className="muted small">
        Trái = nhịp dúi sâu nhất *giữa* kỳ (rủi ro chịu đựng); phải = giá *kết* tại mốc + % lần giá cao hơn hôm nay (cơ hội).
        {tail && <> Kịch bản xấu (10% lần) đáy sâu tới: {tail}.</>}
      </p>
      <p className="muted small">
        ⚠ &quot;Kết cục&quot; &amp; &quot;cơ hội tăng&quot; dựa trên mẫu XAU/USD ~20 năm <b>chủ yếu bull</b> → cao hơn thực tế ở chế độ khác;
        phụ thuộc chế độ thị trường, KHÔNG phải xác suất chắc nịch. Độ sâu drawdown hiện tại không làm các con số đổi (phân phối chung).
      </p>
    </section>
  );
}
