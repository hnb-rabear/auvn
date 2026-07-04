/**
 * BOTTOM HUNTER — study A1 (recency-weight base-rate) + A2 (calibration đo được).
 *
 * Bối cảnh: docs/bottom.md Giới hạn #2 tự thừa nhận base-rate bin phụ thuộc CHẾ ĐỘ
 * thị trường (train 32% vs test 52%). Engine hiện dùng base-rate bin TOÀN CỤC không
 * trọng số ⇒ trong bull, ngày gần đây bị "đầu độc" bởi gấu 2011–15 (undershoot).
 * Lớp Bear Downside đã sửa đúng bệnh này bằng recency-weight `0.5^(age/hl)`
 * (scripts/bear-downside-calibration-study.ts). A1 = thử cùng cơ chế cho Bottom Hunter.
 *
 * KHÔNG thêm feature (đã đào cạn — dd/spd/macd/mom/ryield/gsr đều bị loại). Chỉ đổi
 * cách GỘP base-rate của bin đã có. Dùng bin past-only mà engine đã tính sẵn trong
 * timeline.json (cycleBin/swingBin) + tự tính nhãn near-bottom từ giá ⇒ offline, thật.
 *
 * A1 — so 3 cách gộp (unweighted / recency-252 / recency-504) qua walk-forward as-of:
 *   • Brier   = mean((pred - label)^2)  — độ chính xác xác suất (thấp hơn = tốt hơn)
 *   • bias    = mean(label - pred)      — >0 = dự THẤP hơn thực (undershoot, đúng bệnh)
 *   Cổng: recency KHÔNG được làm Brier tệ đi (band 0.002) ở CẢ HAI giai đoạn, VÀ phải
 *   giảm |bias| ở giai đoạn lệch nhất, VÀ thắng placebo anti-recency (weight ngược tuổi).
 *   (Theo tiền lệ Bear Downside: recency là hiệu chỉnh BIAS/regime, không hứa thắng variance.)
 *
 * A2 — đo độ tin cậy của con số % để SURFACE (như coverageStats của Bear Downside):
 *   • Reliability: xác suất dự (bucket) vs tần suất near-bottom THỰC — có nằm trên đường chéo?
 *   • CI coverage: CI block-bootstrap tại mỗi ngày có phủ base-rate cuối-mẫu của bin không?
 *
 * Chạy: npx tsx scripts/bottom-calibration-study.ts
 */
import { readFileSync } from "node:fs";
import { blockBootstrapCi } from "../src/lib/indicators";
import { BOTTOM_CONFIG } from "../src/lib/types";

const SPLIT = "2019-01-01";
const WARMUP = 756; // khớp engine
const STEP = 3;     // lưới thưa thống kê — khớp engine (chống pseudo-replication)
const MINN = 10;    // ngưỡng "đủ dữ liệu" — khớp engine

type Pt = { date: string; price: number; cycleBin: number; swingBin: number };
const tl = JSON.parse(readFileSync("public/data/timeline.json", "utf8"));
const P: Pt[] = tl.points;
const N = P.length;
const price = P.map((p) => p.price);
const date = P.map((p) => p.date);

/** Nhãn near-bottom past-forward — CHỈ để chấm điểm; khớp labelNearBottom trong engine. */
function labelAt(i: number, H: number, eps: number): boolean | null {
  if (i + H >= N) return null;
  const floor = price[i] * (1 - eps / 100);
  let mn = Infinity;
  for (let j = i + 1; j <= i + H; j++) if (price[j] < mn) mn = price[j];
  return mn >= floor;
}

type Method = { name: string; hl: number | null; anti: boolean };
const METHODS: Method[] = [
  { name: "unweighted", hl: null, anti: false },
  { name: "recency-252", hl: 252, anti: false },
  { name: "recency-504", hl: 504, anti: false },
  { name: "anti-504(placebo)", hl: 504, anti: true },
];

/** Base-rate bin có trọng số theo tuổi. labs=1/0, ages=phiên tính từ ngày dự. */
function predict(labs: number[], ages: number[], m: Method): number {
  if (!labs.length) return 0;
  const maxA = m.anti ? Math.max(...ages) : 0;
  let ws = 0, wl = 0;
  for (let k = 0; k < labs.length; k++) {
    let w: number;
    if (m.hl == null) w = 1;
    else if (!m.anti) w = Math.pow(0.5, ages[k] / m.hl);
    else w = Math.pow(0.5, (maxA - ages[k]) / m.hl); // placebo: ưu tiên NGÀY CŨ
    ws += w; wl += w * labs[k];
  }
  return ws > 0 ? wl / ws : 0;
}

const grid: number[] = [];
for (let i = WARMUP; i < N; i += STEP) grid.push(i);

type Tier = { name: string; H: number; eps: number; edges: number[]; bin: (p: Pt) => number };
const TIERS: Tier[] = [
  { name: "cycle", H: BOTTOM_CONFIG.cycle.horizonDays, eps: BOTTOM_CONFIG.cycle.epsPct, edges: BOTTOM_CONFIG.cycle.binEdges, bin: (p) => p.cycleBin },
  { name: "swing", H: BOTTOM_CONFIG.swing.horizonDays, eps: BOTTOM_CONFIG.swing.epsPct, edges: BOTTOM_CONFIG.swing.binEdges, bin: (p) => p.swingBin },
];

const inEra = {
  train: (d: string) => d < SPLIT,
  test: (d: string) => d >= SPLIT,
} as const;

console.log("=".repeat(100));
console.log("BOTTOM HUNTER — A1 recency base-rate + A2 calibration đo được");
console.log(`timeline ${N} phiên ${date[0]}..${date[N - 1]} · STEP=${STEP} · WARMUP=${WARMUP} · split ${SPLIT}`);
console.log("bias>0 = dự THẤP hơn thực (undershoot) · Brier thấp hơn = tốt hơn");
console.log("=".repeat(100));

// Kết quả tổng để ra phán quyết cuối
const brierBy: Record<string, Record<string, Record<string, number>>> = {}; // tier -> era -> method -> brier
const biasBy: Record<string, Record<string, Record<string, number>>> = {};

for (const T of TIERS) {
  const topBin = T.edges.length; // bin cao nhất
  console.log(`\n${"#".repeat(100)}\n### TẦNG ${T.name.toUpperCase()} — H=${T.H} ε=${T.eps}% edges=[${T.edges.join(",")}] topBin=${topBin}\n${"#".repeat(100)}`);

  // Precompute bin + nhãn cho mọi nút lưới
  const rows = grid.map((i) => ({ i, date: date[i], bin: T.bin(P[i]), y: labelAt(i, T.H, T.eps) }));

  // base-rate CUỐI-MẪU theo bin (dùng cho A2 CI coverage) — chỉ ngày đã đáo hạn nhãn
  const finalByBin = new Map<number, { fav: number; n: number }>();
  for (const r of rows) if (r.y !== null) {
    const c = finalByBin.get(r.bin) ?? { fav: 0, n: 0 };
    c.fav += r.y ? 1 : 0; c.n++; finalByBin.set(r.bin, c);
  }

  brierBy[T.name] = { train: {}, test: {} };
  biasBy[T.name] = { train: {}, test: {} };

  // ---- A1: Brier + bias theo method × era (walk-forward as-of) ----
  for (const m of METHODS) {
    for (const era of ["train", "test"] as const) {
      let sBrier = 0, sBias = 0, n = 0;
      // matured per bin: {labs, ages(idx)} cập nhật dần theo thứ tự lưới
      const matured = new Map<number, { lab: number; i: number }[]>();
      let mk = 0;
      for (const g of rows) {
        while (mk < rows.length && rows[mk].i + T.H <= g.i) {
          const e = rows[mk];
          if (e.y !== null) { const a = matured.get(e.bin) ?? []; a.push({ lab: e.y ? 1 : 0, i: e.i }); matured.set(e.bin, a); }
          mk++;
        }
        if (g.y === null) continue;            // ngày dự phải đã đáo hạn để chấm
        if (!inEra[era](g.date)) continue;
        const arr = matured.get(g.bin) ?? [];
        if (arr.length < MINN) continue;       // "chưa đủ dữ liệu" — như live
        const pred = predict(arr.map((x) => x.lab), arr.map((x) => g.i - x.i), m);
        const lab = g.y ? 1 : 0;
        sBrier += (pred - lab) ** 2;
        sBias += lab - pred;
        n++;
      }
      const brier = n ? sBrier / n : NaN;
      const bias = n ? sBias / n : NaN;
      brierBy[T.name][era][m.name] = brier;
      biasBy[T.name][era][m.name] = bias;
      console.log(`  ${m.name.padEnd(18)} ${era.padEnd(5)}: Brier=${brier.toFixed(4)}  bias=${bias >= 0 ? "+" : ""}${(bias * 100).toFixed(1)}pt  n=${n}`);
    }
  }

  // ---- A2: reliability (unweighted vs recency-504) + CI coverage ----
  const buckets = [0, 20, 40, 60, 80, 100];
  for (const m of [METHODS[0], METHODS[2]]) {
    console.log(`\n  --- A2 Reliability [${m.name}] (dự vs thực; kỳ vọng ≈ đường chéo) ---`);
    for (const era of ["train", "test"] as const) {
      const bins = buckets.slice(0, -1).map(() => ({ predSum: 0, favSum: 0, n: 0 }));
      const matured = new Map<number, { lab: number; i: number }[]>();
      let mk = 0;
      // CI coverage đo cùng lượt (chỉ method unweighted phản ánh CI engine đang xài)
      let covHit = 0, covTot = 0;
      for (const g of rows) {
        while (mk < rows.length && rows[mk].i + T.H <= g.i) {
          const e = rows[mk];
          if (e.y !== null) { const a = matured.get(e.bin) ?? []; a.push({ lab: e.y ? 1 : 0, i: e.i }); matured.set(e.bin, a); }
          mk++;
        }
        if (g.y === null || !inEra[era](g.date)) continue;
        const arr = matured.get(g.bin) ?? [];
        if (arr.length < MINN) continue;
        const pred = predict(arr.map((x) => x.lab), arr.map((x) => g.i - x.i), m);
        const bi = Math.min(bins.length - 1, Math.floor(pred * 100 / 20));
        bins[bi].predSum += pred; bins[bi].favSum += g.y ? 1 : 0; bins[bi].n++;
        // CI coverage: CI của mẫu matured (±1) có phủ base-rate cuối-mẫu của bin?
        if (m.hl == null) {
          const ci = blockBootstrapCi(arr.map((x) => (x.lab ? 1 : -1)), Math.max(1, Math.round(T.H / STEP)));
          const fin = finalByBin.get(g.bin);
          if (ci && fin && fin.n) { const fr = 100 * fin.fav / fin.n; covTot++; if (fr >= ci[0] && fr <= ci[1]) covHit++; }
        }
      }
      const line = bins.map((b, k) => b.n ? `[${buckets[k]}-${buckets[k + 1]}]→${(100 * b.favSum / b.n).toFixed(0)}%(n${b.n})` : `[${buckets[k]}-${buckets[k + 1]}]→·`).join("  ");
      console.log(`    ${era.padEnd(5)}: ${line}`);
      if (m.hl == null && covTot) console.log(`    ${era.padEnd(5)}: CI coverage base-rate cuối-mẫu = ${(100 * covHit / covTot).toFixed(0)}% (kỳ vọng ~95; thấp = CI không phủ do REGIME DRIFT)`);
    }
  }

  // ---- Con số "hôm nay đổi gì" ----
  const last = rows[rows.length - 1];
  const maturedNow = new Map<number, { lab: number; i: number }[]>();
  for (const e of rows) if (e.y !== null && e.i + T.H <= last.i) { const a = maturedNow.get(e.bin) ?? []; a.push({ lab: e.y ? 1 : 0, i: e.i }); maturedNow.set(e.bin, a); }
  const arrNow = maturedNow.get(last.bin) ?? [];
  console.log(`\n  --- HÔM NAY (bin=${last.bin}, n=${arrNow.length}) prob theo từng cách gộp ---`);
  for (const m of METHODS) {
    const p = arrNow.length >= MINN ? predict(arrNow.map((x) => x.lab), arrNow.map((x) => last.i - x.i), m) : NaN;
    console.log(`    ${m.name.padEnd(18)}: ${isNaN(p) ? "chưa đủ" : (p * 100).toFixed(1) + "%"}`);
  }
}

// ================= PHÁN QUYẾT A1 =================
console.log(`\n${"=".repeat(100)}\nPHÁN QUYẾT A1 (recency vs unweighted)\n${"=".repeat(100)}`);
const BRIER_BAND = 0.002;
for (const T of TIERS) {
  console.log(`\n### ${T.name.toUpperCase()}`);
  const uw = { tr: brierBy[T.name].train["unweighted"], te: brierBy[T.name].test["unweighted"] };
  const uwB = { tr: biasBy[T.name].train["unweighted"], te: biasBy[T.name].test["unweighted"] };
  const anti = { tr: Math.abs(biasBy[T.name].train["anti-504(placebo)"]), te: Math.abs(biasBy[T.name].test["anti-504(placebo)"]) };
  for (const cand of ["recency-252", "recency-504"]) {
    const br = { tr: brierBy[T.name].train[cand], te: brierBy[T.name].test[cand] };
    const bi = { tr: biasBy[T.name].train[cand], te: biasBy[T.name].test[cand] };
    const brierOk = br.tr - uw.tr <= BRIER_BAND && br.te - uw.te <= BRIER_BAND;
    // giai đoạn lệch nhất theo |bias| unweighted
    const worstEra = Math.abs(uwB.tr) >= Math.abs(uwB.te) ? "tr" : "te";
    const biasImprove = Math.abs(bi[worstEra]) < Math.abs(uwB[worstEra]);
    const beatsPlacebo = Math.abs(bi[worstEra]) < anti[worstEra];
    const go = brierOk && biasImprove && beatsPlacebo;
    console.log(`  ${cand}: Brier Δtrain=${(br.tr - uw.tr).toFixed(4)} Δtest=${(br.te - uw.te).toFixed(4)} [${brierOk ? "no-harm" : "HARM"}]`);
    console.log(`    |bias| lệch nhất=${worstEra}: unweighted=${(Math.abs(uwB[worstEra]) * 100).toFixed(1)}pt → ${cand}=${(Math.abs(bi[worstEra]) * 100).toFixed(1)}pt [${biasImprove ? "improve" : "worse"}] · placebo=${(anti[worstEra] * 100).toFixed(1)}pt [${beatsPlacebo ? "beats" : "loses"}]`);
    console.log(`    ⇒ ${go ? "✅ GO" : "❌ NO-GO"}`);
  }
}
console.log("\n" + "=".repeat(100));
