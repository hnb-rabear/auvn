import type { BearDownsideAnalysis, BearHorizonStat } from "@/lib/types";

const HLABEL: Record<number, string> = { 21: "1 tháng", 63: "3 tháng", 126: "6 tháng", 252: "12 tháng" };
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;

function Row({ s }: { s: BearHorizonStat }) {
  if (s.n < 30) return (
    <li className="muted"><b>{HLABEL[s.horizonDays] ?? s.horizonDays}</b>: chưa đủ dữ liệu (n={s.n})</li>
  );
  return (
    <li>
      <b>{HLABEL[s.horizonDays] ?? s.horizonDays}</b>: đáy tệ nhất về sau — trung vị {signed(s.median)},
      xấu nhất (10%) {signed(s.p10)}, {fmt1(s.pBottomBehind)}% lần đáy đã phía sau
      {s.pCi && <> (CI {fmt1(s.pCi[0])}–{fmt1(s.pCi[1])}%)</>}.
    </li>
  );
}

export default function BearDownsideCard({ bd }: { bd: BearDownsideAnalysis }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Nếu giá còn rơi (rủi ro bear)</h2>
        <span className="muted">−{fmt1(bd.currentDdPct)}% dưới đỉnh</span>
      </div>
      <p className="sig-expl">{bd.note}</p>
      <ul className="signals">
        {bd.shown.map((s) => <Row key={s.horizonDays} s={s} />)}
      </ul>
      <p className="muted small">
        Phân phối lịch sử trên XAU/USD ({bd.shownSource === "bucket" ? "các lần cùng độ sâu drawdown" : "mọi thời điểm"}),
        lưới thưa chống trùng lặp. Tham khảo rủi ro, không phải dự đoán.
      </p>
    </section>
  );
}
