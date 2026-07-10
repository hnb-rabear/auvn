/**
 * CROSS-ASSET DIVERGENCE — tín hiệu MỚI: canh khi tương quan trượt XAU/USD vs DXY
 * BREAK khỏi mẫu hình thường thấy (thường âm — vàng và đô la nghịch chiều), tức
 * "decoupling": cả hai cùng tăng hoặc cùng giảm. Cơ chế khác hẳn các họ đã LOẠI
 * trong repo (không phải vị trí giá, không phải biến động, không phải premium VN)
 * — đây là tương quan LIÊN THỊ TRƯỜNG. Giả thuyết: giai đoạn decoupling (tương
 * quan lệch dương bất thường) là bất ổn tạm thời, thường đảo ngược — mua trong
 * lúc đó có thể rẻ hơn chờ tương quan âm "bình thường" trở lại. Test trên TOÀN
 * BỘ lịch sử XAU/DXY (~15-20 năm, không bị giới hạn bởi mẫu VN mỏng).
 *
 * Cùng khung đo đã validate ở dca-zone-study-v2.ts/volsqueeze-study.ts: neo mỗi
 * H=21 phiên không chồng lấp, rangePos so mua-ngay + placebo, train(<2019)/
 * test(≥2019), CI95 block-bootstrap ghép cặp.
 *
 * corr30(i) = Pearson correlation của log-return XAU và DXY trong cửa sổ trailing
 * `window` phiên, tính past-only tại mọi i. DXY align theo ngày gần nhất ≤ ngày
 * XAU (lịch giao dịch có thể lệch vài phiên). Gate: corr30(i) >= thr (decoupling
 * khỏi tương quan âm thường thấy).
 *
 * Cổng (CẢ HAI giai đoạn train/test): Δmua-ngay<0, Δplacebo<0, CI95(Δmua-ngay)
 * lệch khỏi 0, meanPos ≤ 0.40 — giống hệt dca-zone-study-v2.ts.
 *
 * Chạy: npx tsx scripts/divergence-study.ts (fetch XAU + DXY, ~15-20 năm dữ liệu)
 */
import { fetchXau, fetchDxy } from "./fetch";
import { rangePos, evalWindow, type ZoneRuleV2 } from "../src/lib/dca-window";
import { pairedBlockBootstrapCi, seededRandom } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const H = 21;
const ANCHOR_STEP = 21;
const WARMUP = 252;

function logReturns(closes: number[]): number[] {
  const out: number[] = [NaN];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 5) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

/** corr30 tại mọi phiên (past-only), window trailing `W` phiên return. */
function corrSeries(retX: number[], retD: number[], W: number): (number | null)[] {
  const out: (number | null)[] = new Array(retX.length).fill(null);
  for (let i = W; i < retX.length; i++) {
    out[i] = pearson(retX.slice(i - W + 1, i + 1), retD.slice(i - W + 1, i + 1));
  }
  return out;
}

async function main() {
  const xau = await fetchXau();
  const dxyRes = await fetchDxy();
  if (!dxyRes) { console.error("Không lấy được DXY — dừng."); process.exitCode = 1; return; }

  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  // align DXY theo ngày gần nhất <= ngày XAU (lịch giao dịch có thể lệch).
  const dxyDates = dxyRes.bars.map((b) => b.date);
  const dxyCloses = dxyRes.bars.map((b) => b.close);
  const dxyAligned: number[] = [];
  let ptr = 0;
  for (const d of dates) {
    while (ptr + 1 < dxyDates.length && dxyDates[ptr + 1] <= d) ptr++;
    dxyAligned.push(dxyDates[ptr] <= d ? dxyCloses[ptr] : NaN);
  }

  const retX = logReturns(closes);
  const retD = logReturns(dxyAligned);

  const anchors: number[] = [];
  for (let t = WARMUP; t + H < closes.length; t += ANCHOR_STEP) anchors.push(t);
  const trA = anchors.filter((t) => dates[t] < SPLIT);
  const teA = anchors.filter((t) => dates[t] >= SPLIT);

  const rand = seededRandom(20260706);
  const baseNow = new Map<number, number>();
  const basePlacebo = new Map<number, number>();
  for (const t of anchors) {
    let lo = Infinity, hi = -Infinity;
    for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
    baseNow.set(t, rangePos(closes[t], lo, hi));
    const r = t + Math.floor(rand() * (H + 1));
    basePlacebo.set(t, rangePos(closes[r], lo, hi));
  }

  interface Cfg { window: number; thr: number; }
  const grid: Cfg[] = [];
  for (const window of [10, 21, 42, 63]) for (const thr of [0.0, 0.1, 0.2, 0.3, 0.4]) grid.push({ window, thr });

  // corr series 1 lần / window, tái dùng cho mọi ngưỡng cùng window.
  const corrCache = new Map<number, (number | null)[]>();
  function corrFor(window: number) {
    let s = corrCache.get(window);
    if (!s) { s = corrSeries(retX, retD, window); corrCache.set(window, s); }
    return s;
  }

  function inZoneDivergence(i: number, window: number, thr: number): boolean {
    const s = corrFor(window);
    const c = s[i];
    return c !== null && c >= thr;
  }

  function evalRule(t: number, window: number, thr: number) {
    if (t + H >= closes.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (let j = t; j <= t + H; j++) { if (closes[j] < lo) lo = closes[j]; if (closes[j] > hi) hi = closes[j]; }
    let buyIdx = t + H;
    for (let i = t; i <= t + H; i++) {
      if (inZoneDivergence(i, window, thr)) { buyIdx = i; break; }
    }
    return { buyIdx, lo, hi, pos: rangePos(closes[buyIdx], lo, hi) };
  }

  const block = Math.max(4, Math.ceil(H / ANCHOR_STEP) + 3);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const phaseStats = (A: number[], cfg: Cfg) => {
    const dNow: number[] = [], dPla: number[] = [], posArr: number[] = [];
    for (const t of A) {
      const e = evalRule(t, cfg.window, cfg.thr);
      if (!e) continue;
      dNow.push(e.pos - baseNow.get(t)!);
      dPla.push(e.pos - basePlacebo.get(t)!);
      posArr.push(e.pos);
    }
    return {
      n: posArr.length,
      meanPos: mean(posArr),
      meanDNow: mean(dNow),
      meanDPla: mean(dPla),
      ciNow: pairedBlockBootstrapCi(dNow, block),
    };
  };

  console.log(`Cross-Asset Divergence (XAU/DXY corr) — ${anchors.length} neo (train ${trA.length}/test ${teA.length}), H=${H}.`);
  console.log(`Tham chiếu: mua-ngay & placebo rangePos kỳ vọng ~0.5.`);
  // sanity: phân phối corr30 điển hình để biết ngưỡng grid có hợp lý không.
  const sampleCorr = corrFor(21).filter((v): v is number => v !== null);
  const sorted = [...sampleCorr].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.floor(p * sorted.length)];
  console.log(`corr30(window=21) phân phối: p10=${q(0.1).toFixed(2)} p50=${q(0.5).toFixed(2)} p90=${q(0.9).toFixed(2)} (kỳ vọng thiên âm).`);

  let best: any = null;
  let diag: any = null;
  const rows: any[] = [];
  for (const cfg of grid) {
    const tr = phaseStats(trA, cfg);
    const te = phaseStats(teA, cfg);
    if (tr.n < 20 || te.n < 20) continue;
    rows.push({ cfg, tr, te });
    if (!diag || te.meanDNow < diag.te.meanDNow) diag = { cfg, tr, te };
    const pass =
      tr.meanDNow < 0 && te.meanDNow < 0 && tr.meanDPla < 0 && te.meanDPla < 0 &&
      tr.ciNow && tr.ciNow[1] < 0 && te.ciNow && te.ciNow[1] < 0 &&
      te.meanPos <= 0.40;
    const score = Math.max(tr.meanDNow, te.meanDNow);
    if (pass && (!best || score < best.score)) best = { cfg, tr, te, score };
  }

  const fmt = (s: any) => `meanPos ${s.meanPos.toFixed(3)} Δnow ${s.meanDNow.toFixed(3)} (CI ${s.ciNow ? s.ciNow.join("..") : "—"}) Δpla ${s.meanDPla.toFixed(3)} n=${s.n}`;

  console.log(`\n${rows.length} cấu hình đủ mẫu (n≥20 cả 2 giai đoạn). QUA CỔNG: ${rows.filter((r) => {
    const p = r.tr.meanDNow < 0 && r.te.meanDNow < 0 && r.tr.meanDPla < 0 && r.te.meanDPla < 0 &&
      r.tr.ciNow && r.tr.ciNow[1] < 0 && r.te.ciNow && r.te.ciNow[1] < 0 && r.te.meanPos <= 0.40;
    return p;
  }).length}`);

  if (best) {
    console.log(`\n✓ CẤU HÌNH THẮNG: ${JSON.stringify(best.cfg)}`);
    console.log(`  train: ${fmt(best.tr)}`);
    console.log(`  test : ${fmt(best.te)}`);
    console.log("\nPHÁN QUYẾT: GO");
  } else {
    console.log(`\n✗ KHÔNG cấu hình divergence nào vượt mua-ngay + placebo (CI lệch khỏi 0) ở cả hai giai đoạn.`);
    if (diag) {
      console.log(`  --- CHẨN ĐOÁN: ứng viên 'gần đạt' nhất (te.meanDNow thấp nhất, KHÔNG đạt cổng) ---`);
      console.log(`  ${JSON.stringify(diag.cfg)}`);
      console.log(`  train: ${fmt(diag.tr)}`);
      console.log(`  test : ${fmt(diag.te)}`);
    }
    console.log("\nPHÁN QUYẾT: NO-GO");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
