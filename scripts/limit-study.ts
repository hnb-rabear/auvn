/**
 * LIMIT — họ cơ chế CHƯA TỪNG test cho "điểm mua đẹp trong tháng": LỆNH LIMIT.
 * "Treo lệnh mua ở giá phiên-1 − X%; khớp trong tháng thì CHẮC CHẮN rẻ hơn mua
 * phiên 1; không khớp thì mua ép phiên cuối tháng." Khác mọi rule đã LOẠI:
 * không phải indicator-zone (dca-zone-v2), không phải ngày cố định (monthday),
 * không phải chờ tín hiệu ngoài (bottom-wait) — là cơ chế khớp-lệnh thuần so
 * với MỐC NEO đầu tháng. Câu hỏi: xác suất khớp × mức rẻ khi khớp có bù nổi
 * chi phí mua-ép-cuối-tháng-đắt trong các tháng tăng một mạch không?
 *
 * Biến thể:
 *  - L(x)  : 100% ngân sách treo limit p1×(1−x%); miss ⇒ mua ép phiên cuối.
 *  - H(x)  : 50% mua ngay phiên 1 + 50% treo limit; miss ⇒ nửa đó mua ép cuối.
 * Grid x ∈ {0.5, 1, 1.5, 2, 3, 5}.
 *
 * Thước đo chính: rangePos giá-vốn tháng (0=đáy tháng, 1=đỉnh) so min/max THÁNG,
 * delta ghép cặp vs mua-100%-phiên-1 + CI95 block-bootstrap, train(<2019)/test(≥2019)
 * — cùng khung monthday-study. Phụ: fill-rate (% tháng khớp lệnh), giá vốn dài hạn
 * (Σtiền/Σoz) improvement% vs phiên-1.
 * Cổng: ΔrangePos<0 + CI loại trừ 0 + improvement giá vốn >0, CẢ train và test.
 *
 * Mô phỏng khớp lệnh với daily bar chỉ có close: khớp khi CLOSE ≤ limit (bảo thủ —
 * intraday low chạm limit trước close sẽ khớp giá limit tốt hơn; dùng close làm
 * giá mua là ước lượng THẬN TRỌNG cho phía limit... nhưng cũng có lợi khi close
 * rơi sâu dưới limit. Hai lệch ngược chiều, chấp nhận ở mức daily-bar).
 *
 * Chạy: npx tsx scripts/limit-study.ts (fetch XAU, ~15-20 năm)
 */
import { fetchXau } from "./fetch";
import { pairedBlockBootstrapCi } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const XS = [0.5, 1, 1.5, 2, 3, 5];

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const rangePos = (p: number, lo: number, hi: number) => (hi > lo ? (p - lo) / (hi - lo) : 0.5);

interface M { ym: string; prices: number[]; lo: number; hi: number; }

async function main() {
  const xau = await fetchXau();
  const byMonth = new Map<string, number[]>();
  for (const b of xau.bars) {
    const ym = b.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym)!.push(b.close);
  }
  const yms = [...byMonth.keys()].sort();
  const months: M[] = [];
  for (const ym of yms.slice(1, -1)) {
    const prices = byMonth.get(ym)!;
    if (prices.length < 15) continue;
    months.push({ ym, prices, lo: Math.min(...prices), hi: Math.max(...prices) });
  }
  const tr = months.filter((m) => m.ym + "-01" < SPLIT);
  const te = months.filter((m) => m.ym + "-01" >= SPLIT);
  console.log(`Limit — ${months.length} tháng (train ${tr.length}/test ${te.length}), split ${SPLIT}.\n`);

  // giá mua trung bình (đơn vị: giá) của chiến lược trong 1 tháng
  function buyPriceL(m: M, x: number): { p: number; filled: boolean } {
    const limit = m.prices[0] * (1 - x / 100);
    for (let i = 1; i < m.prices.length; i++) {
      if (m.prices[i] <= limit) return { p: m.prices[i], filled: true };
    }
    return { p: m.prices[m.prices.length - 1], filled: false };
  }
  function buyPriceH(m: M, x: number): { p: number; filled: boolean } {
    const l = buyPriceL(m, x);
    // 50/50 theo TIỀN: giá vốn = 2/(1/p1 + 1/pL) (harmonic mean 2 lần mua cùng tiền)
    const p = 2 / (1 / m.prices[0] + 1 / l.p);
    return { p, filled: l.filled };
  }

  // D(r): anchor TRƯỢT — mua phiên ĐẦU TIÊN có return 1-ngày ≤ −r% (so phiên liền
  // trước, kể cả phiên 2 so phiên 1); miss ⇒ mua ép cuối. Khác L (anchor cố định phiên 1).
  function buyPriceD(m: M, r: number): { p: number; filled: boolean } {
    for (let i = 1; i < m.prices.length; i++) {
      if (m.prices[i] / m.prices[i - 1] - 1 <= -r / 100) return { p: m.prices[i], filled: true };
    }
    return { p: m.prices[m.prices.length - 1], filled: false };
  }

  interface Strat { name: string; buy: (m: M) => { p: number; filled: boolean }; }
  const strats: Strat[] = [
    ...XS.map((x) => ({ name: `L(${x}%)`, buy: (m: M) => buyPriceL(m, x) })),
    ...XS.map((x) => ({ name: `H(${x}%)`, buy: (m: M) => buyPriceH(m, x) })),
    ...[0.5, 1, 1.5, 2].map((r) => ({ name: `D(${r}%)`, buy: (m: M) => buyPriceD(m, r) })),
  ];

  console.log(`strat · fill% tr/te · ΔrangePos vs phiên-1 tr/te · CI95 tr · CI95 te · giá-vốn impr% tr/te · CỔNG`);
  let anyPass = false;
  for (const s of strats) {
    const stat = (arr: M[]) => {
      const d: number[] = [];
      let fills = 0, spend = 0, oz = 0, spendB = 0, ozB = 0;
      for (const m of arr) {
        const b = s.buy(m);
        if (b.filled) fills++;
        d.push(rangePos(b.p, m.lo, m.hi) - rangePos(m.prices[0], m.lo, m.hi));
        spend += 1; oz += 1 / b.p;
        spendB += 1; ozB += 1 / m.prices[0];
      }
      const cost = spend / oz, costB = spendB / ozB;
      return {
        fillPct: (fills / arr.length) * 100,
        dMean: mean(d),
        ci: pairedBlockBootstrapCi(d, 2),
        impr: ((costB - cost) / costB) * 100,
      };
    };
    const a = stat(tr), b = stat(te);
    const pass =
      a.dMean < 0 && b.dMean < 0 &&
      !!a.ci && a.ci[1] < 0 && !!b.ci && b.ci[1] < 0 &&
      a.impr > 0 && b.impr > 0;
    if (pass) anyPass = true;
    const f = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(3);
    console.log(
      `${s.name.padEnd(8)} ${a.fillPct.toFixed(0)}%/${b.fillPct.toFixed(0)}% · ${f(a.dMean)}/${f(b.dMean)} · ` +
      `[${a.ci!.map((v) => v.toFixed(3)).join(",")}] · [${b.ci!.map((v) => v.toFixed(3)).join(",")}] · ` +
      `${f(a.impr)}%/${f(b.impr)}%` + (pass ? "  ✓ QUA CỔNG" : "")
    );
  }

  // phân rã chẩn đoán cho 1 config đại diện: khi khớp rẻ bao nhiêu, khi miss đắt bao nhiêu
  console.log(`\n--- Phân rã L(2%) (đại diện): rangePos điều kiện theo khớp/miss ---`);
  for (const [label, arr] of [["train", tr], ["test", te]] as const) {
    const fill: number[] = [], miss: number[] = [], d1: number[] = [];
    for (const m of arr) {
      const b = buyPriceL(m, 2);
      (b.filled ? fill : miss).push(rangePos(b.p, m.lo, m.hi));
      d1.push(rangePos(m.prices[0], m.lo, m.hi));
    }
    console.log(
      `${label}: khớp n=${fill.length} meanPos=${fill.length ? mean(fill).toFixed(3) : "—"} · ` +
      `miss n=${miss.length} meanPos=${miss.length ? mean(miss).toFixed(3) : "—"} · phiên-1 meanPos=${mean(d1).toFixed(3)}`
    );
  }

  console.log(`\nPHÁN QUYẾT: ${anyPass ? "GO — có config limit vượt phiên-1 bền vững" : "NO-GO — không config limit nào vượt mua phiên-1 ở cả hai giai đoạn"}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
