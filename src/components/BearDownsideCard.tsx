import type { BearDownsideAnalysis, BearHorizonStat } from "@/lib/types";

const HLABEL: Record<number, string> = { 21: "1 tháng", 63: "3 tháng", 126: "6 tháng", 252: "12 tháng" };
const HSHORT: Record<number, string> = { 21: "1T", 63: "3T", 126: "6T", 252: "12T" };
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("vi-VN")}`;

/** Một hàng kỳ hạn: quy % mức-rơi-thêm lên giá USD hiện tại. */
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
      <td>{at(s.p10)} <span className="muted">({signed(s.p10)})</span></td>
      <td>{fmt1(s.pBottomBehind)}%</td>
    </tr>
  );
}

export default function BearDownsideCard({ bd }: { bd: BearDownsideAnalysis }) {
  const ciLine = bd.shown
    .filter((s) => s.n >= 30 && s.pCi)
    .map((s) => `${HSHORT[s.horizonDays] ?? s.horizonDays} ${fmt1(s.pCi![0])}–${fmt1(s.pCi![1])}%`)
    .join(" · ");
  return (
    <section className="card">
      <div className="card-head">
        <h2>Nếu giá còn rơi (rủi ro bear)</h2>
        <span className="muted">
          {bd.currentPrice > 0 && <>{usd(bd.currentPrice)} · </>}−{fmt1(bd.currentDdPct)}% dưới đỉnh
        </span>
      </div>
      <p className="sig-expl">{bd.note}</p>
      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead>
            <tr>
              <th>Kỳ hạn</th>
              <th>Đáy điển hình</th>
              <th>Đáy xấu (10%)</th>
              <th>Đã qua đáy?</th>
            </tr>
          </thead>
          <tbody>
            {bd.shown.map((s) => <Row key={s.horizonDays} s={s} price={bd.currentPrice} />)}
          </tbody>
        </table>
      </div>
      {ciLine && (
        <p className="muted small">CI 95% cột “đã qua đáy”: {ciLine}.</p>
      )}
      <p className="muted small">
        Phân phối XAU/USD ({bd.shownSource === "bucket" ? "các lần cùng độ sâu drawdown" : "mọi thời điểm"}),
        đáy tệ nhất trong kỳ. Tham khảo rủi ro, không dự đoán.
      </p>
    </section>
  );
}
