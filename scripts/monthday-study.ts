/**
 * MONTH-DAY — "điểm mua tốt nhất trong tháng" cho DCA tháng: ngày CỐ ĐỊNH nào trong
 * tháng cho giá rẻ nhất so với biên độ tháng đó? Đáy tháng hay rơi vào ngày nào?
 *
 * KHÁC các study đã LOẠI: dca-timing-study/dca-zone-v2 test rule ĐỘNG (chờ tín hiệu
 * relpos/RSI/drawdown... trong cửa sổ trượt); đây là câu hỏi seasonality TĨNH — mua
 * phiên thứ k của THÁNG DƯƠNG LỊCH (nhịp DCA thật của người mua), chưa từng đo trong
 * repo. Không cần tín hiệu gì, chỉ cần lịch.
 *
 * Đo: mỗi tháng dương lịch đủ ≥15 phiên (bỏ tháng đầu/cuối có thể cụt), rangePos của
 * giá mua tại phiên thứ k so với min/max THÁNG ĐÓ (0=đáy tháng, 1=đỉnh tháng).
 *  A. mean rangePos theo k (k=1..21) — ngày cố định nào rẻ nhất; delta so mua-phiên-1
 *     ghép cặp theo tháng + CI95 block-bootstrap, train(<2019)/test(≥2019).
 *  B. phân phối "đáy tháng rơi vào phiên thứ mấy" (histogram bucket 5 phiên) — nếu
 *     lệch hẳn về đầu/cuối tháng thì có mẫu hình đáy tháng; nếu ~đều thì không.
 *  C. day-of-week: mean rangePos theo thứ (T2..T6).
 *  D. chia 4 đợt/tháng (phiên 1,6,11,16) vs mua 1 lần phiên 1 — giảm phương sai cơ học.
 *
 * Placebo: phiên ngẫu nhiên seeded mỗi tháng, kỳ vọng ~0.5.
 * Cổng cho "ngày k tốt hơn phiên 1": Δ(k vs 1) < 0 CẢ train/test và CI95 loại trừ 0
 * ở CẢ HAI. Không qua ⇒ khuyến nghị = mua phiên đầu tháng (sớm nhất có thể).
 *
 * Chạy: npx tsx scripts/monthday-study.ts (fetch XAU, ~15-20 năm)
 */
import { fetchXau } from "./fetch";
import { pairedBlockBootstrapCi, seededRandom } from "../src/lib/indicators";

const SPLIT = "2019-01-01";

interface MonthData {
  ym: string;
  dates: string[];
  prices: number[];
  lo: number;
  hi: number;
  argminIdx: number; // phiên (0-based) chạm min tháng, lần đầu
}

function rangePos(p: number, lo: number, hi: number): number {
  return hi > lo ? (p - lo) / (hi - lo) : 0.5;
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

async function main() {
  const xau = await fetchXau();
  const bars = xau.bars;

  // gom theo tháng dương lịch
  const byMonth = new Map<string, { dates: string[]; prices: number[] }>();
  for (const b of bars) {
    const ym = b.date.slice(0, 7);
    let m = byMonth.get(ym);
    if (!m) { m = { dates: [], prices: [] }; byMonth.set(ym, m); }
    m.dates.push(b.date);
    m.prices.push(b.close);
  }
  const yms = [...byMonth.keys()].sort();
  // bỏ tháng đầu + tháng cuối (có thể cụt), đòi ≥15 phiên
  const months: MonthData[] = [];
  for (const ym of yms.slice(1, -1)) {
    const m = byMonth.get(ym)!;
    if (m.prices.length < 15) continue;
    const lo = Math.min(...m.prices), hi = Math.max(...m.prices);
    months.push({ ym, dates: m.dates, prices: m.prices, lo, hi, argminIdx: m.prices.indexOf(lo) });
  }
  const tr = months.filter((m) => m.ym + "-01" < SPLIT);
  const te = months.filter((m) => m.ym + "-01" >= SPLIT);
  console.log(`Month-Day — ${months.length} tháng đủ phiên (train ${tr.length}/test ${te.length}), split ${SPLIT}.`);

  // placebo tham chiếu + phiên-1 vs placebo (ghép cặp theo tháng, CI95)
  const rand = seededRandom(20260706);
  const plaOf = new Map<string, number>();
  for (const m of months) plaOf.set(m.ym, rangePos(m.prices[Math.floor(rand() * m.prices.length)], m.lo, m.hi));
  console.log(`Placebo (phiên ngẫu nhiên/tháng): meanPos=${mean([...plaOf.values()]).toFixed(3)} (kỳ vọng ~0.5).`);
  for (const [label, arr] of [["train", tr], ["test", te]] as const) {
    const d = arr.map((m) => rangePos(m.prices[0], m.lo, m.hi) - plaOf.get(m.ym)!);
    const ci = pairedBlockBootstrapCi(d, 2);
    console.log(`Phiên-1 vs placebo (${label}): Δ=${mean(d) >= 0 ? "+" : ""}${mean(d).toFixed(3)} CI[${ci ? ci.map((x) => x.toFixed(3)).join(",") : "—"}]${ci && ci[1] < 0 ? " ✓ rẻ hơn có ý nghĩa" : ""}`);
  }
  console.log("");

  // ---- A. mean rangePos theo phiên-thứ-k, delta vs phiên 1 ----
  const K = 21;
  const posAt = (m: MonthData, k: number) => rangePos(m.prices[Math.min(k - 1, m.prices.length - 1)], m.lo, m.hi);
  console.log(`### A. Mua phiên thứ k của tháng — mean rangePos (0=đáy tháng, 1=đỉnh) ###`);
  console.log(`k  · train  · test   · Δvs-phiên-1 tr/te · CI95(Δ) train · CI95(Δ) test`);
  interface RowA { k: number; trM: number; teM: number; dTr: number; dTe: number; ciTr: [number, number] | null; ciTe: [number, number] | null; pass: boolean; }
  const rowsA: RowA[] = [];
  for (let k = 1; k <= K; k++) {
    const trPos = tr.map((m) => posAt(m, k));
    const tePos = te.map((m) => posAt(m, k));
    const dTrArr = tr.map((m) => posAt(m, k) - posAt(m, 1));
    const dTeArr = te.map((m) => posAt(m, k) - posAt(m, 1));
    const ciTr = k === 1 ? null : pairedBlockBootstrapCi(dTrArr, 2);
    const ciTe = k === 1 ? null : pairedBlockBootstrapCi(dTeArr, 2);
    const pass = k !== 1 && mean(dTrArr) < 0 && mean(dTeArr) < 0 &&
      !!ciTr && ciTr[1] < 0 && !!ciTe && ciTe[1] < 0;
    rowsA.push({ k, trM: mean(trPos), teM: mean(tePos), dTr: mean(dTrArr), dTe: mean(dTeArr), ciTr, ciTe, pass });
    const f = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);
    console.log(
      `${String(k).padStart(2)} · ${mean(trPos).toFixed(3)} · ${mean(tePos).toFixed(3)} · ` +
      (k === 1 ? "(chuẩn so sánh)" :
        `${f(mean(dTrArr))}/${f(mean(dTeArr))} · [${ciTr![0].toFixed(3)},${ciTr![1].toFixed(3)}] · [${ciTe![0].toFixed(3)},${ciTe![1].toFixed(3)}]` +
        (pass ? "  ✓ QUA CỔNG" : ""))
    );
  }
  const winners = rowsA.filter((r) => r.pass);

  // ---- B. đáy tháng rơi vào phiên thứ mấy ----
  console.log(`\n### B. Đáy tháng rơi vào phiên thứ mấy (bucket 5 phiên, % số tháng) ###`);
  const buckets = ["1-5", "6-10", "11-15", "16-20", "21+"];
  const bucketOf = (idx: number) => Math.min(Math.floor(idx / 5), 4);
  for (const [label, arr] of [["train", tr], ["test", te]] as const) {
    const cnt = [0, 0, 0, 0, 0];
    for (const m of arr) cnt[bucketOf(m.argminIdx)]++;
    const pct = cnt.map((c) => ((c / arr.length) * 100).toFixed(1) + "%");
    console.log(`${label}: ${buckets.map((b, i) => `${b}:${pct[i]}`).join(" · ")} (đều ≈ ${buckets.map((_, i) => i < 4 ? "23%" : "8%").join("/")} theo số phiên/bucket)`);
  }

  // ---- C. day-of-week ----
  console.log(`\n### C. Mean rangePos theo thứ trong tuần ###`);
  const dowName = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  for (const [label, arr] of [["train", tr], ["test", te]] as const) {
    const acc = new Map<number, number[]>();
    for (const m of arr) {
      for (let i = 0; i < m.prices.length; i++) {
        const dow = new Date(m.dates[i] + "T00:00:00Z").getUTCDay();
        if (!acc.has(dow)) acc.set(dow, []);
        acc.get(dow)!.push(rangePos(m.prices[i], m.lo, m.hi));
      }
    }
    const parts = [...acc.entries()].sort((a, b) => a[0] - b[0])
      .map(([d, v]) => `${dowName[d]}:${mean(v).toFixed(3)}(n=${v.length})`);
    console.log(`${label}: ${parts.join(" · ")}`);
  }

  // ---- D. chia 4 đợt vs mua 1 lần phiên 1 ----
  console.log(`\n### D. Chia 4 đợt (phiên 1,6,11,16) vs mua 1 lần phiên 1 — rangePos của GIÁ VỐN trung bình ###`);
  for (const [label, arr] of [["train", tr], ["test", te]] as const) {
    const d4 = arr.map((m) => {
      const idxs = [0, 5, 10, 15].map((i) => Math.min(i, m.prices.length - 1));
      const avg = mean(idxs.map((i) => m.prices[i]));
      return rangePos(avg, m.lo, m.hi);
    });
    const d1 = arr.map((m) => posAt(m, 1));
    const delta = d4.map((v, i) => v - d1[i]);
    const ci = pairedBlockBootstrapCi(delta, 2);
    console.log(
      `${label}: 4-đợt meanPos=${mean(d4).toFixed(3)} · 1-lần meanPos=${mean(d1).toFixed(3)} · ` +
      `Δ=${mean(delta) >= 0 ? "+" : ""}${mean(delta).toFixed(3)} CI[${ci ? ci.map((x) => x.toFixed(3)).join(",") : "—"}]`
    );
  }

  // ---- phán quyết ----
  console.log(`\n=== PHÁN QUYẾT ===`);
  if (winners.length) {
    const w = winners.sort((a, b) => Math.max(a.dTr, a.dTe) - Math.max(b.dTr, b.dTe))[0];
    console.log(`✓ Phiên thứ ${w.k} RẺ HƠN phiên 1 bền vững cả 2 giai đoạn (CI loại trừ 0): Δ train ${w.dTr.toFixed(3)} / test ${w.dTe.toFixed(3)}.`);
    console.log(`PHÁN QUYẾT: GO — điểm mua tốt nhất trong tháng = phiên thứ ${w.k}.`);
  } else {
    const bestTr = rowsA.reduce((a, b) => (b.trM < a.trM ? b : a));
    const bestTe = rowsA.reduce((a, b) => (b.teM < a.teM ? b : a));
    console.log(`✗ KHÔNG phiên cố định nào rẻ hơn phiên 1 bền vững (CI loại trừ 0 cả train+test).`);
    console.log(`  Phiên rẻ nhất train: k=${bestTr.k} (${bestTr.trM.toFixed(3)}) · test: k=${bestTe.k} (${bestTe.teM.toFixed(3)}) — không trùng/không bền = nhiễu.`);
    console.log(`PHÁN QUYẾT: NO-GO cho canh ngày — mua phiên ĐẦU tháng (sớm nhất) là tốt nhất có bằng chứng.`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
