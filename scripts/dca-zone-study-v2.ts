/**
 * DCA Zone v2 — đứng ngày bất kỳ, luật nào đưa điểm vào gần đáy cửa sổ 30-ngày-tới
 * (H=21 phiên) hơn "mua ngay" + placebo, lặp lại train(<2019)/test(≥2019)?
 * Chạy: npx tsx scripts/dca-zone-study-v2.ts  (fetch XAU như các study khác)
 * Cổng: meanΔ<0 vs mua-ngay VÀ vs placebo, CI lệch khỏi 0, CẢ train lẫn test, size đáng kể.
 */
import { fetchXau } from "./fetch";
import { evalWindow, rangePos, type ZoneRuleV2 } from "../src/lib/dca-window";
import { pairedBlockBootstrapCi, volatility30, seededRandom } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const H = 21;           // ≈30 ngày dương lịch
const ANCHOR_STEP = 21; // neo thưa chống pseudo-replication
const WARMUP = 252;     // đủ dữ liệu cho chỉ báo

function ruleGrid(): ZoneRuleV2[] {
  const out: ZoneRuleV2[] = [];
  for (const window of [10, 21, 42, 63]) {
    for (const pct of [20, 25, 30, 35]) out.push({ kind: "relpos", window, pct });
    for (const k of [1, 1.5, 2]) out.push({ kind: "zscore", window, k });
    for (const k of [15, 20, 25]) out.push({ kind: "stoch", window, k });
  }
  for (const pctB of [0, 0.1, 0.2]) out.push({ kind: "bollinger", pctB });
  for (const thr of [25, 30, 35]) out.push({ kind: "rsi", thr });
  for (const x of [2, 3, 4]) out.push({ kind: "drawWin", x });
  for (const n of [2, 3]) out.push({ kind: "pullback", n });
  return out;
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  // neo thưa, đủ warmup và đủ cửa sổ tương lai
  const anchors: number[] = [];
  for (let t = WARMUP; t + H < closes.length; t += ANCHOR_STEP) anchors.push(t);
  const trA = anchors.filter((t) => dates[t] < SPLIT);
  const teA = anchors.filter((t) => dates[t] >= SPLIT);

  // mức biến động trung vị để thử điều kiện-biến-động (chỉ canh khi vol ≥ ngưỡng)
  const vols = anchors.map((t) => volatility30(closes.slice(0, t + 1)) ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
  const medVol = vols.length ? vols[Math.floor(vols.length / 2)] : 0;

  const rand = seededRandom(20260630);
  // rangePos cho mỗi neo: mua-ngay, placebo (ngày ngẫu nhiên trong cửa sổ)
  const baseNow = new Map<number, number>();
  const basePlacebo = new Map<number, number>();
  for (const t of anchors) {
    let lo = Infinity, hi = -Infinity;
    for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
    baseNow.set(t, rangePos(closes[t], lo, hi));
    const r = t + Math.floor(rand() * (H + 1));
    basePlacebo.set(t, rangePos(closes[r], lo, hi));
  }

  const block = Math.max(4, Math.ceil(H / ANCHOR_STEP) + 3); // phủ chồng lấn neo
  const phaseStats = (A: number[], rule: ZoneRuleV2, minVol: number) => {
    const dNow: number[] = [], dPla: number[] = [], posArr: number[] = [];
    for (const t of A) {
      const e = evalWindow(closes, t, H, rule, minVol);
      if (!e) continue;
      dNow.push(e.pos - baseNow.get(t)!);
      dPla.push(e.pos - basePlacebo.get(t)!);
      posArr.push(e.pos);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      n: posArr.length,
      meanPos: mean(posArr),
      meanDNow: mean(dNow),
      meanDPla: mean(dPla),
      ciNow: pairedBlockBootstrapCi(dNow, block),
      winNow: dNow.filter((x) => x < 0).length / dNow.length,
    };
  };

  console.log(`DCA Zone v2 — ${anchors.length} neo (train ${trA.length}/test ${teA.length}), H=${H}, neo mỗi ${ANCHOR_STEP} phiên.`);
  console.log(`Tham chiếu: mua-ngay & placebo rangePos kỳ vọng ~0.5. medVol=${medVol.toFixed(1)}.`);

  let best: any = null;
  let diag: any = null; // chẩn đoán: ứng viên có te.meanDNow thấp nhất (dù không qua cổng)
  for (const rule of ruleGrid()) {
    for (const minVol of [0, medVol]) {
      const tr = phaseStats(trA, rule, minVol);
      const te = phaseStats(teA, rule, minVol);
      if (tr.n < 20 || te.n < 20) continue;
      if (!diag || te.meanDNow < diag.te.meanDNow) diag = { rule, minVol, tr, te };
      // cổng: meanΔ<0 (gần đáy hơn) vs CẢ mua-ngay lẫn placebo, CI(now) lệch khỏi 0, cả hai giai đoạn; size meanPos ≤ 0.40
      const pass =
        tr.meanDNow < 0 && te.meanDNow < 0 && tr.meanDPla < 0 && te.meanDPla < 0 &&
        tr.ciNow && tr.ciNow[1] < 0 && te.ciNow && te.ciNow[1] < 0 &&
        te.meanPos <= 0.40;
      const score = Math.max(tr.meanDNow, te.meanDNow); // kém nhất vẫn âm
      if (pass && (!best || score < best.score)) best = { rule, minVol, tr, te, score };
    }
  }

  const fmt = (s: any) => `meanPos ${s.meanPos.toFixed(3)} Δnow ${s.meanDNow.toFixed(3)} (CI ${s.ciNow ? s.ciNow.join("..") : "—"}) Δpla ${s.meanDPla.toFixed(3)} win ${(s.winNow*100).toFixed(0)}% n=${s.n}`;
  if (best) {
    console.log(`\n✓ LUẬT THẮNG: ${JSON.stringify(best.rule)} minVol=${best.minVol.toFixed(1)}`);
    console.log(`  train: ${fmt(best.tr)}`);
    console.log(`  test : ${fmt(best.te)}`);
  } else {
    console.log(`\n✗ KHÔNG luật nào vượt mua-ngay + placebo (CI lệch khỏi 0) ở cả hai giai đoạn với size đáng kể.`);
    if (diag) {
      console.log(`  --- CHẨN ĐOÁN: ứng viên 'gần đạt' nhất (te.meanDNow thấp nhất, KHÔNG đạt cổng) ---`);
      console.log(`  ${JSON.stringify(diag.rule)} minVol=${diag.minVol.toFixed(1)}`);
      console.log(`  train: ${fmt(diag.tr)}`);
      console.log(`  test : ${fmt(diag.te)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
