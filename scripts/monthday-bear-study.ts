/**
 * MONTH-DAY × BEAR — kiểm chứng phản biện: "trong thị trường bear, mua đầu tháng
 * chắc chắn đắt". Đúng theo ĐỊNH NGHĨA cho tháng-giảm (biết SAU khi hết tháng —
 * look-ahead, không hành động được). Câu hỏi đo được: cờ bear QUAN SÁT ĐƯỢC TẠI
 * ĐẦU THÁNG (past-only) có báo trước rằng trì hoãn mua trong tháng sẽ rẻ hơn không?
 *
 * Cờ regime tại phiên cuối cùng TRƯỚC tháng t (không dùng dữ liệu trong tháng t):
 *  - bearMa   : close < MA200
 *  - prevNeg  : return tháng trước < 0
 *  - dd10     : close ≤ 90% đỉnh mọi-thời-đại tính tới đó
 * Đối chứng look-ahead (để định lượng trần lý thuyết, KHÔNG hành động được):
 *  - downMonth: tháng t đóng cửa thấp hơn mở cửa (biết sau).
 *
 * Với mỗi cờ: meanPos (rangePos so min/max tháng) tại phiên k ∈ {1,5,10,15,21} trong
 * các tháng cờ=true, delta ghép cặp vs phiên 1 + CI95 block-bootstrap, train(<2019)/
 * test(≥2019). Nếu cờ bear thật sự đảo lời khuyên "mua phiên 1" thì delta phải ÂM
 * (mua muộn rẻ hơn) với CI loại trừ 0 ở CẢ hai giai đoạn.
 *
 * Chạy: npx tsx scripts/monthday-bear-study.ts (fetch XAU)
 */
import { fetchXau } from "./fetch";
import { pairedBlockBootstrapCi } from "../src/lib/indicators";

const SPLIT = "2019-01-01";

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const rangePos = (p: number, lo: number, hi: number) => (hi > lo ? (p - lo) / (hi - lo) : 0.5);

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  // MA200 + đỉnh mọi-thời-đại (past-only tại i: dùng closes[0..i])
  const ma200: (number | null)[] = closes.map((_, i) => {
    if (i < 199) return null;
    let s = 0;
    for (let j = i - 199; j <= i; j++) s += closes[j];
    return s / 200;
  });
  const ath: number[] = [];
  let hi = -Infinity;
  for (const c of closes) { if (c > hi) hi = c; ath.push(hi); }

  // gom tháng: chỉ số phiên đầu/cuối mỗi tháng
  interface M { ym: string; from: number; to: number; }
  const months: M[] = [];
  for (let i = 0; i < dates.length; i++) {
    const ym = dates[i].slice(0, 7);
    if (!months.length || months[months.length - 1].ym !== ym) months.push({ ym, from: i, to: i });
    else months[months.length - 1].to = i;
  }
  // bỏ tháng đầu/cuối (cụt), đòi ≥15 phiên và có MA200 tại đầu tháng
  const usable = months.slice(1, -1).filter((m) => m.to - m.from + 1 >= 15 && m.from > 0 && ma200[m.from - 1] !== null);

  interface Flagged { m: M; pos: (k: number) => number; }
  const wrap = (m: M): Flagged => {
    const prices = closes.slice(m.from, m.to + 1);
    const lo = Math.min(...prices), hiP = Math.max(...prices);
    return { m, pos: (k) => rangePos(prices[Math.min(k - 1, prices.length - 1)], lo, hiP) };
  };

  const prevMonthNeg = (m: M): boolean => {
    const idx = months.findIndex((x) => x.ym === m.ym);
    if (idx <= 0) return false;
    const p = months[idx - 1];
    return closes[p.to] < closes[p.from];
  };

  const flags: { name: string; lookAhead: boolean; test: (m: M) => boolean }[] = [
    { name: "bearMa (close<MA200 tại đầu tháng)", lookAhead: false, test: (m) => closes[m.from - 1] < ma200[m.from - 1]! },
    { name: "prevNeg (tháng trước giảm)", lookAhead: false, test: prevMonthNeg },
    { name: "dd10 (drawdown ≥10% từ ATH tại đầu tháng)", lookAhead: false, test: (m) => closes[m.from - 1] <= ath[m.from - 1] * 0.9 },
    { name: "downMonth (LOOK-AHEAD — tháng này giảm, chỉ để tham chiếu trần)", lookAhead: true, test: (m) => closes[m.to] < closes[m.from] },
  ];

  const KS = [5, 10, 15, 21];
  console.log(`Month-Day × Bear — ${usable.length} tháng dùng được, split ${SPLIT}.\n`);

  for (const f of flags) {
    const sel = usable.filter(f.test).map(wrap);
    const tr = sel.filter((x) => x.m.ym + "-01" < SPLIT);
    const te = sel.filter((x) => x.m.ym + "-01" >= SPLIT);
    console.log(`### ${f.name} — n train=${tr.length} / test=${te.length} ###`);
    for (const [label, arr] of [["train", tr], ["test", te]] as const) {
      if (arr.length < 10) { console.log(`  ${label}: n=${arr.length} < 10 — quá mỏng, bỏ qua.`); continue; }
      const p1 = arr.map((x) => x.pos(1));
      const parts: string[] = [`k=1: ${mean(p1).toFixed(3)}`];
      for (const k of KS) {
        const d = arr.map((x) => x.pos(k) - x.pos(1));
        const ci = pairedBlockBootstrapCi(d, 2);
        const sig = ci && (ci[1] < 0 ? " ✓RẺ HƠN" : ci[0] > 0 ? " ✗đắt hơn" : "");
        parts.push(`k=${k}: Δ${mean(d) >= 0 ? "+" : ""}${mean(d).toFixed(3)}[${ci ? ci.map((x) => x.toFixed(2)).join(",") : "—"}]${sig}`);
      }
      console.log(`  ${label}: ${parts.join(" · ")}`);
    }
    console.log("");
  }

  console.log(`Đọc kết quả: cờ bear past-only đảo được lời khuyên "mua phiên 1" CHỈ KHI có Δ âm + CI loại trừ 0 ở CẢ train và test. downMonth là trần look-ahead (đắt theo định nghĩa) — không dùng để hành động.`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
