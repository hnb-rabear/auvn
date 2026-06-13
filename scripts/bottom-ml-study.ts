/**
 * Cổng kiểm chứng ML cho tầng đáy. Chạy: npx tsx scripts/bottom-ml-study.ts
 * Logistic regression thuần TS trên cùng feature với engine; walk-forward train
 * 2009-2018 / test 2019-2026; so Brier score với bản rule-based (BOTTOM_CONFIG).
 * KẾT LUẬN của script (in ra) quyết định có nhận ML hay không — mặc định giữ rule-based.
 */
import { labelNearBottom, bottomFeatures, bottomScore, binOf } from "../src/lib/bottom";
import { BOTTOM_CONFIG } from "../src/lib/types";
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3;
const FEATURES = ["dd", "spd", "rsi", "macd", "macro", "mom"] as const;

function trainLogistic(X: number[][], y: number[], epochs = 400, lr = 0.05): number[] {
  const d = X[0].length;
  const w = new Array(d + 1).fill(0); // w[0] = bias
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(d + 1).fill(0);
    for (let n = 0; n < X.length; n++) {
      let z = w[0];
      for (let j = 0; j < d; j++) z += w[j + 1] * X[n][j];
      const p = 1 / (1 + Math.exp(-z));
      const err = p - y[n];
      grad[0] += err;
      for (let j = 0; j < d; j++) grad[j + 1] += err * X[n][j];
    }
    for (let j = 0; j <= d; j++) w[j] -= (lr * grad[j]) / X.length;
  }
  return w;
}

const predict = (w: number[], x: number[]) => {
  let z = w[0];
  for (let j = 0; j < x.length; j++) z += w[j + 1] * x[j];
  return 1 / (1 + Math.exp(-z));
};
const brier = (ps: number[], ys: number[]) => ps.reduce((a, p, i) => a + (p - ys[i]) ** 2, 0) / ps.length;

async function main() {
  const [xau, dxy, fed, yield10y] = await Promise.all([
    fetchXau(), fetchDxy().catch(() => null), fetchFedFunds().catch(() => null), fetchYield10y().catch(() => null),
  ]);
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  for (const tier of ["cycle", "swing"] as const) {
    const cfg = BOTTOM_CONFIG[tier];
    const rows: { date: string; feats: number[]; score: number; y: number }[] = [];
    for (let i = WARMUP; i < closes.length; i += STEP) {
      const y = labelNearBottom(closes, i, cfg.horizonDays, cfg.epsPct);
      if (y === null) continue;
      const di = dates[i];
      const drv = bottomFeatures({
        closes: closes.slice(0, i + 1),
        dxyCloses: dxy ? dxy.bars.filter((b) => b.date <= di).map((b) => b.close) : [],
        yieldCloses: yield10y ? yield10y.bars.filter((b) => b.date <= di).map((b) => b.close) : null,
        fedRates: fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [],
      });
      const feats = FEATURES.map((id) => drv.find((d) => d.id === id)?.score ?? 0);
      rows.push({ date: di, feats, score: bottomScore(drv, cfg.weights), y: y ? 1 : 0 });
    }
    const tr = rows.filter((r) => r.date < SPLIT);
    const te = rows.filter((r) => r.date >= SPLIT);
    const w = trainLogistic(tr.map((r) => r.feats), tr.map((r) => r.y));

    const binFav = new Map<number, { f: number; n: number }>();
    for (const r of tr) {
      const b = binOf(r.score, cfg.binEdges);
      const c = binFav.get(b) ?? { f: 0, n: 0 };
      c.f += r.y; c.n++; binFav.set(b, c);
    }
    const ruleP = te.map((r) => { const c = binFav.get(binOf(r.score, cfg.binEdges)); return c && c.n ? c.f / c.n : 0.5; });
    const mlP = te.map((r) => predict(w, r.feats));
    const ys = te.map((r) => r.y);

    const brRule = brier(ruleP, ys);
    const brMl = brier(mlP, ys);
    console.log(`\n=== ${tier.toUpperCase()} (test n=${te.length}) ===`);
    console.log(`Brier rule-based = ${brRule.toFixed(4)} | ML logistic = ${brMl.toFixed(4)}`);
    console.log(`Hệ số ML: bias=${w[0].toFixed(2)} ` + FEATURES.map((f, j) => `${f}=${w[j + 1].toFixed(2)}`).join(" "));
    console.log(brMl < brRule - 0.005
      ? ">>> ML thắng rõ ngoài mẫu — CÂN NHẮC nhận (xem hệ số có hợp lý kinh tế không)."
      : ">>> ML KHÔNG thắng rõ — GIỮ rule-based (đơn giản, giải thích được).");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
