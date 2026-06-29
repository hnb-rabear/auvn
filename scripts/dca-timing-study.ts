/**
 * Tuyển luật "vùng giá đẹp" cho DCA Co-pilot Module A.
 * Chạy: npx tsx scripts/dca-timing-study.ts (cần `npm run collect` trước để có cache fetch).
 * Tiêu chí nhận: giá vốn THẤP HƠN baseline B0 (mua ngày 1) VÀ thắng placebo (mua ngày ngẫu
 * nhiên) ở CẢ HAI giai đoạn train(<2019)/test(≥2019); xếp theo min-improvement.
 */
import { fetchXau } from "./fetch";
import {
  groupByMonth, simulateDca, improvementPct,
  pickFirst, pickMid, pickSeededRandom, buildRulePicker, monthsBetterFraction,
} from "../src/lib/dca-sim";
import { blockBootstrapCi } from "../src/lib/indicators";
import type { ZoneRule } from "../src/lib/types";

const SPLIT = "2019-01-01";

function ruleGrid(): ZoneRule[] {
  const out: ZoneRule[] = [];
  for (const window of [21, 42, 63]) {
    for (const pct of [20, 25, 30, 35]) out.push({ kind: "relpos", window, pct });
    for (const pct of [25, 30, 35]) out.push({ kind: "signal", window, pct });
  }
  for (const x of [2, 3, 4, 5]) out.push({ kind: "monthdd", x });
  return out;
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const allMonths = groupByMonth(dates);
  const monthStart = new Map(allMonths.map((m) => [m[0], m[0]]));

  const split = (ms: number[][]) => ({
    tr: ms.filter((m) => dates[m[0]] < SPLIT),
    te: ms.filter((m) => dates[m[0]] >= SPLIT),
  });
  const { tr, te } = split(allMonths);

  const baseTr = simulateDca(closes, tr, pickFirst);
  const baseTe = simulateDca(closes, te, pickFirst);
  const plac = pickSeededRandom(20260629);
  const placTr = improvementPct(simulateDca(closes, tr, plac), baseTr);
  const placTe = improvementPct(simulateDca(closes, te, plac), baseTe);
  console.log(`Baseline B0 giá vốn: train ${baseTr.costBasis.toFixed(2)} / test ${baseTe.costBasis.toFixed(2)}`);
  console.log(`B1 (giữa tháng): train +${improvementPct(simulateDca(closes, tr, pickMid), baseTr).toFixed(2)}% / test +${improvementPct(simulateDca(closes, te, pickMid), baseTe).toFixed(2)}%`);
  console.log(`Placebo (ngẫu nhiên): train ${placTr.toFixed(2)}% / test ${placTe.toFixed(2)}%`);

  let best: any = null;
  for (const rule of ruleGrid()) {
    const pick = buildRulePicker(rule, monthStart);
    const impTr = improvementPct(simulateDca(closes, tr, pick), baseTr);
    const impTe = improvementPct(simulateDca(closes, te, pick), baseTe);
    // gate: vượt B0 (>0) và thắng placebo ở CẢ HAI giai đoạn
    const passes = impTr > 0 && impTe > 0 && impTr > placTr && impTe > placTe;
    const minImp = Math.min(impTr, impTe);
    if (passes && (!best || minImp > best.minImp)) {
      const { favArr, pct } = monthsBetterFraction(closes, te, pick, pickFirst);
      best = { rule, impTr, impTe, minImp, monthsBetterPct: pct, ci: blockBootstrapCi(favArr, 3) };
    }
  }

  if (best) {
    console.log(`\n✓ LUẬT THẮNG: ${JSON.stringify(best.rule)}`);
    console.log(`  giá vốn rẻ hơn B0: train +${best.impTr.toFixed(2)}% / test +${best.impTe.toFixed(2)}% (min ${best.minImp.toFixed(2)}%)`);
    console.log(`  % tháng mua ≤ B0 (test): ${best.monthsBetterPct.toFixed(1)}% (CI ${best.ci ? best.ci.join("–") : "n/a"})`);
  } else {
    console.log("\n✗ KHÔNG luật nào vượt B0 + placebo ở cả hai giai đoạn — canh thời điểm trong tháng không có edge bền vững. Báo NO-GO ở doc/UI.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
