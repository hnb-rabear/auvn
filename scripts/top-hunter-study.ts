/**
 * Top Hunter study — đối xứng Bottom Hunter: có tổ hợp feature quá-mua/vĩ-mô nào
 * cho xác suất "GẦN ĐỈNH" (giá không vượt quá +ε% trong H phiên tới) vượt base-rate
 * ở CẢ train(<2019) lẫn test(≥2019) không?
 *
 * Nhãn: labelNearTop = max(closes[i+1..i+H]) ≤ closes[i]·(1+ε/100) — bán hôm nay
 * thì trong H phiên tới không bị hớ quá ε%.
 * Features past-only (−2..+2, dương = nghiêng đỉnh):
 *   nu   — sát đỉnh 252 phiên (dd nhỏ = gần đỉnh)
 *   run  — tốc độ tăng 63 phiên (tăng nóng = dễ đỉnh)
 *   rsi  — RSI(14) quá mua
 *   z    — z-score 63 phiên cao
 *   macro— đảo chiều vĩ mô NGƯỢC vàng (DXY mạnh lên / lợi suất tăng / Fed thắt)
 *   mom  — lợi suất 21 phiên nóng
 * Grid: 126 hồ sơ trọng số (bước 0.25 trên 6 feature) × 3 bộ ranh giới bin ×
 * (cycle H {84,126,168} ε {3,4,5} | swing H {15,21,30} ε {1.5,2,3}).
 * Cổng: top-bin lift > 0 cả hai giai đoạn, n ≥ 25 mỗi giai đoạn; xếp min-excess.
 *
 * Chạy: npx tsx scripts/top-hunter-study.ts
 */
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";
import { rsi, macd } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3;

const clamp2 = (n: number) => Math.max(-2, Math.min(2, n));

function labelNearTop(closes: number[], i: number, H: number, epsPct: number): boolean | null {
  if (i + H >= closes.length) return null;
  const ceil = closes[i] * (1 + epsPct / 100);
  let maxFwd = -Infinity;
  for (let j = i + 1; j <= i + H; j++) if (closes[j] > maxFwd) maxFwd = closes[j];
  return maxFwd <= ceil;
}

// ---- sub-score vĩ mô (sao macro-decomp-study, dấu theo VÀNG: âm = xấu cho vàng) ----
function sma(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  let s = 0;
  for (let i = xs.length - n; i < xs.length; i++) s += xs[i];
  return s / n;
}
function dxyScore(closes: number[]): number | null {
  if (closes.length < 51) return null;
  const last = closes[closes.length - 1];
  const ma50 = sma(closes, 50)!;
  const prev21 = closes[closes.length - 22];
  const chg = ((last - prev21) / prev21) * 100;
  const above = last > ma50;
  if (above && chg > 1) return -2;
  if (above) return -1;
  if (!above && chg < -1) return 2;
  return 1;
}
function fedScore(rates: number[]): number | null {
  if (rates.length < 4) return null;
  const d = rates[rates.length - 1] - rates[rates.length - 4];
  if (d <= -0.25) return 2;
  if (d < 0) return 1;
  if (d === 0) return 0;
  if (d < 0.25) return -1;
  return -2;
}
function yieldScore(closes: number[]): number | null {
  if (closes.length < 64) return null;
  const d = closes[closes.length - 1] - closes[closes.length - 64];
  if (d <= -0.4) return 2;
  if (d <= -0.1) return 1;
  if (d < 0.1) return 0;
  if (d < 0.4) return -1;
  return -2;
}

interface TopFeatures { nu: number | null; run: number | null; rsi: number | null; z: number | null; macro: number | null; mom: number | null; }

function topFeatures(closes: number[], dxyCloses: number[], yldCloses: number[] | null, fedRates: number[]): TopFeatures {
  const out: TopFeatures = { nu: null, run: null, rsi: null, z: null, macro: null, mom: null };
  const n = closes.length;
  // nu: sát đỉnh 252
  if (n >= 252) {
    let peak = -Infinity;
    for (let i = n - 252; i < n; i++) if (closes[i] > peak) peak = closes[i];
    const dd = ((peak - closes[n - 1]) / peak) * 100;
    out.nu = dd <= 0.5 ? 2 : dd <= 2 ? 1 : dd <= 5 ? 0 : dd <= 12 ? -1 : -2;
  }
  // run: % thay đổi 63 phiên
  if (n >= 64) {
    const r = ((closes[n - 1] - closes[n - 64]) / closes[n - 64]) * 100;
    out.run = r >= 15 ? 2 : r >= 7 ? 1 : r > -3 ? 0 : r > -10 ? -1 : -2;
  }
  // rsi quá mua
  const r14 = rsi(closes, 14);
  if (r14 !== null) out.rsi = r14 >= 80 ? 2 : r14 >= 70 ? 1 : r14 >= 55 ? 0 : r14 >= 45 ? -1 : -2;
  // z-score 63
  if (n >= 63) {
    const w = closes.slice(-63);
    const mean = w.reduce((a, b) => a + b, 0) / 63;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / 63);
    if (sd > 0) {
      const z = (closes[n - 1] - mean) / sd;
      out.z = z >= 2 ? 2 : z >= 1 ? 1 : z > -1 ? 0 : z > -2 ? -1 : -2;
    }
  }
  // macro nghiêng đỉnh = ĐẢO DẤU trung bình sub-score theo-vàng
  const subs = [dxyScore(dxyCloses), yldCloses ? yieldScore(yldCloses) : null, fedScore(fedRates)].filter(
    (s): s is number => s !== null
  );
  if (subs.length) out.macro = clamp2(-subs.reduce((a, b) => a + b, 0) / subs.length);
  // mom: lợi suất 21 phiên
  if (n >= 22) {
    const r = ((closes[n - 1] - closes[n - 22]) / closes[n - 22]) * 100;
    out.mom = r >= 8 ? 2 : r >= 4 ? 1 : r > -2 ? 0 : r > -6 ? -1 : -2;
  }
  return out;
}

function topScore(f: TopFeatures, w: Record<string, number>): number {
  let sum = 0;
  let tw = 0;
  for (const [k, v] of Object.entries(f)) {
    if (v === null) continue;
    const wk = w[k] ?? 0;
    sum += v * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (sum / tw) * 50;
}

function binOf(score: number, edges: number[]): number {
  let b = 0;
  for (const e of edges) {
    if (score >= e) b++;
    else break;
  }
  return b;
}

function weightGrid(): Record<string, number>[] {
  const keys = ["nu", "run", "rsi", "z", "macro", "mom"];
  const out: Record<string, number>[] = [];
  const rec = (idx: number, left: number, acc: number[]) => {
    if (idx === keys.length - 1) {
      acc.push(left);
      const w: Record<string, number> = {};
      keys.forEach((k, j) => (w[k] = acc[j] / 4));
      out.push(w);
      acc.pop();
      return;
    }
    for (let u = 0; u <= left; u++) {
      acc.push(u);
      rec(idx + 1, left - u, acc);
      acc.pop();
    }
  };
  rec(0, 4, []);
  return out;
}

async function main() {
  const [xau, dxy, fed, yield10y] = await Promise.all([
    fetchXau(),
    fetchDxy().catch(() => null),
    fetchFedFunds().catch(() => null),
    fetchYield10y().catch(() => null),
  ]);
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  const idxs: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) idxs.push(i);
  const featsByI = new Map<number, TopFeatures>();
  for (const i of idxs) {
    const di = dates[i];
    featsByI.set(
      i,
      topFeatures(
        closes.slice(0, i + 1),
        dxy ? dxy.bars.filter((b) => b.date <= di).map((b) => b.close) : [],
        yield10y ? yield10y.bars.filter((b) => b.date <= di).map((b) => b.close) : null,
        fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : []
      )
    );
  }

  const EDGE_SETS = [
    [-40, 0, 40],
    [-40, 0, 30],
    [-40, 0, 20],
  ];
  const profiles = weightGrid();
  console.log(`Lưới trọng số: ${profiles.length} hồ sơ | bộ ranh giới: ${EDGE_SETS.length} | ${idxs.length} điểm STEP=${STEP}`);

  for (const [tier, Hs, EPSs] of [
    ["cycle", [84, 126, 168], [3, 4, 5]],
    ["swing", [15, 21, 30], [1.5, 2, 3]],
  ] as const) {
    console.log(`\n=== TẦNG ${tier.toUpperCase()} ===`);
    let best: any = null;
    let diag: any = null;
    for (const H of Hs)
      for (const eps of EPSs) {
        const labels = idxs
          .map((i) => ({ i, date: dates[i], y: labelNearTop(closes, i, H, eps) }))
          .filter((r) => r.y !== null) as { i: number; date: string; y: boolean }[];
        const tr = labels.filter((r) => r.date < SPLIT);
        const te = labels.filter((r) => r.date >= SPLIT);
        if (tr.length < 50 || te.length < 50) continue;
        const baseTr = tr.filter((r) => r.y).length / tr.length;
        const baseTe = te.filter((r) => r.y).length / te.length;

        for (const edges of EDGE_SETS) {
          const topBin = edges.length;
          for (const w of profiles) {
            const evalP = (rows: typeof tr, base: number) => {
              const top = rows.filter((r) => binOf(topScore(featsByI.get(r.i)!, w), edges) === topBin);
              if (top.length < 25) return null;
              return { n: top.length, lift: top.filter((r) => r.y).length / top.length - base };
            };
            const pt = evalP(tr, baseTr);
            const pe = evalP(te, baseTe);
            if (pt === null || pe === null) continue;
            const minEx = Math.min(pt.lift, pe.lift);
            const cand = { tier, H, eps, edges, w, lt: pt.lift, le: pe.lift, nt: pt.n, ne: pe.n, minEx, baseTr, baseTe };
            if (!diag || minEx > diag.minEx) diag = cand;
            if (pt.lift > 0 && pe.lift > 0 && (!best || minEx > best.minEx)) best = cand;
          }
        }
      }

    const fmtEdges = (e: number[]) => `[${e.join(",")}]`;
    if (best) {
      console.log(`✓ ĐẠT CỔNG: H=${best.H} eps=${best.eps}% edges=${fmtEdges(best.edges)}`);
      console.log(
        `  lift train +${(best.lt * 100).toFixed(1)}pt (n=${best.nt}) / test +${(best.le * 100).toFixed(1)}pt (n=${best.ne}) | min-excess +${(best.minEx * 100).toFixed(1)}pt`
      );
      console.log(`  baseline train ${(best.baseTr * 100).toFixed(1)}% / test ${(best.baseTe * 100).toFixed(1)}%`);
      console.log(`  weights = ${JSON.stringify(best.w)}`);
    } else {
      console.log("Không có cấu hình nào vượt baseline ở CẢ HAI giai đoạn.");
    }
    if (diag) {
      console.log(`  --- CHẨN ĐOÁN: min-excess cao nhất chỉ với yêu cầu ≥25 mẫu ---`);
      console.log(`  H=${diag.H} eps=${diag.eps}% edges=${fmtEdges(diag.edges)}`);
      console.log(
        `  lift train ${diag.lt >= 0 ? "+" : ""}${(diag.lt * 100).toFixed(1)}pt (n=${diag.nt}) / test ${diag.le >= 0 ? "+" : ""}${(diag.le * 100).toFixed(1)}pt (n=${diag.ne}) | min-excess ${diag.minEx >= 0 ? "+" : ""}${(diag.minEx * 100).toFixed(1)}pt`
      );
      console.log(`  baseline train ${(diag.baseTr * 100).toFixed(1)}% / test ${(diag.baseTe * 100).toFixed(1)}%`);
      console.log(`  weights = ${JSON.stringify(diag.w)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
