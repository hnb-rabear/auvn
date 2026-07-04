/**
 * BOTTOM HUNTER — study SÂU cho A1 recency-504 (chạy SAU bottom-calibration-study.ts GO).
 * Trả lời 4 câu hỏi phải chốt TRƯỚC khi tích hợp vào engine:
 *
 *  D1. 504 là CAO NGUYÊN hay ĐỈNH NHỌN? Sweep halflife 126→1008 + CI paired
 *      block-bootstrap cho ΔBrier (uw − 504): gain là thật hay variance?
 *      (Tiền lệ Bear Downside: MAE gain không significant — phải khai thật.)
 *  D2. Stress CHUYỂN CHẾ ĐỘ: bias theo từng năm lịch. Footgun lý thuyết: ngay sau
 *      khi bull gãy (2011→2013) recency dồn trọng số vào regime cũ ⇒ lạc quan giả
 *      đúng lúc nguy hiểm. Nếu recency-504 tệ hơn unweighted rõ rệt ở năm gãy ⇒ cân nhắc lại.
 *  D3. CI + ESS trung thực dưới weighting: CI phải tính CÙNG scheme trọng số
 *      (bài học reliability patch của Bear Downside — pUp từng nằm NGOÀI CI unweighted
 *      của chính nó). Đo coverage của CI (uw vs weighted) so với rate THỰC HIỆN của
 *      cùng-bin trong 504 phiên kế (đúng đại lượng recency ước lượng) + ESS hôm nay.
 *  D4. Tầng QUYẾT ĐỊNH: ngưỡng "Gom rải" cycleProb≥60 từng bị LOẠI trên Time Machine
 *      (docs/bottom.md: base-rate toàn cục bị gấu 2011–15 đầu độc, tắt từ 2014) —
 *      đúng bệnh A1 chữa. Re-run so sánh: cờ ≥60 theo recency-504 có phủ đủ năm +
 *      win 6T tốt không? (Re-run hợp lệ của bottom-approach-compare theo luật docs.)
 *
 * Offline trên public/data/timeline.json (bin past-only engine đã tính + returns thực).
 * Walk-forward as-of, lưới thưa STEP=3, seed cố định ⇒ tái lập 100%.
 *
 * Chạy: npx tsx scripts/bottom-recency-deep-study.ts
 */
import { readFileSync } from "node:fs";
import { blockBootstrapCi } from "../src/lib/indicators";
import { BOTTOM_CONFIG } from "../src/lib/types";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3;
const MINN = 10;

type Pt = { date: string; price: number; cycleBin: number; swingBin: number; returns: Record<string, number | null> };
const tl = JSON.parse(readFileSync("public/data/timeline.json", "utf8"));
const P: Pt[] = tl.points;
const N = P.length;
const price = P.map((p) => p.price);
const date = P.map((p) => p.date);

function labelAt(i: number, H: number, eps: number): boolean | null {
  if (i + H >= N) return null;
  const floor = price[i] * (1 - eps / 100);
  let mn = Infinity;
  for (let j = i + 1; j <= i + H; j++) if (price[j] < mn) mn = price[j];
  return mn >= floor;
}

const mulberry = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

/** CI 95% block-bootstrap cho MEAN của mảng số (paired diff). */
function bootMeanCi(arr: number[], blk: number, iters = 2000, seed = 777): [number, number] | null {
  const n = arr.length; if (n < 10) return null;
  const b = Math.max(1, Math.min(blk, n)); const nB = Math.ceil(n / b);
  const rng = mulberry(seed); const ms: number[] = [];
  for (let it = 0; it < iters; it++) {
    let sum = 0, c = 0;
    for (let k = 0; k < nB; k++) { const st = Math.floor(rng() * n); for (let j = 0; j < b && c < n; j++) { sum += arr[(st + j) % n]; c++; } }
    ms.push(sum / c);
  }
  ms.sort((a, c) => a - c);
  return [ms[Math.floor(0.025 * iters)], ms[Math.floor(0.975 * iters)]];
}

/** CI 95% block-bootstrap CÓ TRỌNG SỐ cho tỉ lệ thuận (labs 0/1, ws cùng thứ tự thời gian). */
function weightedBootCi(labs: number[], ws: number[], blk: number, iters = 1000, seed = 4242): [number, number] | null {
  const n = labs.length; if (n < 10) return null;
  const b = Math.max(1, Math.min(blk, n)); const nB = Math.ceil(n / b);
  const rng = mulberry(seed); const outs: number[] = [];
  for (let it = 0; it < iters; it++) {
    let sw = 0, swl = 0, c = 0;
    for (let k = 0; k < nB; k++) {
      const st = Math.floor(rng() * n);
      for (let j = 0; j < b && c < n; j++) { const idx = (st + j) % n; sw += ws[idx]; swl += ws[idx] * labs[idx]; c++; }
    }
    if (sw > 0) outs.push(swl / sw);
  }
  outs.sort((a, c) => a - c);
  return [Math.round(outs[Math.floor(0.025 * outs.length)] * 1000) / 10, Math.round(outs[Math.floor(0.975 * outs.length)] * 1000) / 10];
}

const grid: number[] = [];
for (let i = WARMUP; i < N; i += STEP) grid.push(i);

type Tier = { name: string; H: number; eps: number; edges: number[]; bin: (p: Pt) => number };
const TIERS: Tier[] = [
  { name: "cycle", H: BOTTOM_CONFIG.cycle.horizonDays, eps: BOTTOM_CONFIG.cycle.epsPct, edges: BOTTOM_CONFIG.cycle.binEdges, bin: (p) => p.cycleBin },
  { name: "swing", H: BOTTOM_CONFIG.swing.horizonDays, eps: BOTTOM_CONFIG.swing.epsPct, edges: BOTTOM_CONFIG.swing.binEdges, bin: (p) => p.swingBin },
];

interface Node { i: number; date: string; bin: number; y: boolean | null; arr: { lab: number; i: number }[]; len: number; }
/** Dựng nút lưới + snapshot matured-per-bin (mảng append-only ⇒ lưu ref + len). */
function buildNodes(T: Tier): Node[] {
  const rows = grid.map((i) => ({ i, date: date[i], bin: T.bin(P[i]), y: labelAt(i, T.H, T.eps) }));
  const matured = new Map<number, { lab: number; i: number }[]>();
  let mk = 0;
  const out: Node[] = [];
  for (const g of rows) {
    while (mk < rows.length && rows[mk].i + T.H <= g.i) {
      const e = rows[mk];
      if (e.y !== null) { const a = matured.get(e.bin) ?? []; a.push({ lab: e.y ? 1 : 0, i: e.i }); matured.set(e.bin, a); }
      mk++;
    }
    const arr = matured.get(g.bin) ?? [];
    out.push({ ...g, arr, len: arr.length });
  }
  return out;
}

function predAt(nd: Node, hl: number | null): number | null {
  if (nd.len < MINN) return null;
  let sw = 0, swl = 0;
  for (let k = 0; k < nd.len; k++) {
    const e = nd.arr[k];
    const w = hl == null ? 1 : Math.pow(0.5, (nd.i - e.i) / hl);
    sw += w; swl += w * e.lab;
  }
  return sw > 0 ? swl / sw : null;
}

const eras = { train: (d: string) => d < SPLIT, test: (d: string) => d >= SPLIT } as const;
const HLS: (number | null)[] = [null, 126, 252, 378, 504, 756, 1008];
const hlName = (hl: number | null) => (hl == null ? "unweighted" : `hl-${hl}`);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

console.log("=".repeat(100));
console.log("BOTTOM HUNTER — DEEP STUDY recency-504 (D1 plateau+significance · D2 per-year · D3 CI/ESS · D4 decision)");
console.log(`timeline ${N} phiên ${date[0]}..${date[N - 1]} · STEP=${STEP} · split ${SPLIT}`);
console.log("=".repeat(100));

const nodesByTier = new Map<string, Node[]>();
for (const T of TIERS) nodesByTier.set(T.name, buildNodes(T));

// ============ D1: sweep halflife + significance ΔBrier ============
for (const T of TIERS) {
  const nodes = nodesByTier.get(T.name)!;
  const blk = Math.max(1, Math.round(T.H / STEP));
  console.log(`\n### D1 [${T.name}] — Brier theo halflife (cao nguyên?) ###`);
  const brier: Record<string, Record<string, number>> = {};
  for (const hl of HLS) {
    const nm = hlName(hl); brier[nm] = {};
    for (const era of ["train", "test"] as const) {
      let s = 0, n = 0;
      for (const nd of nodes) {
        if (nd.y === null || !eras[era](nd.date)) continue;
        const p = predAt(nd, hl); if (p === null) continue;
        s += (p - (nd.y ? 1 : 0)) ** 2; n++;
      }
      brier[nm][era] = n ? s / n : NaN;
    }
    console.log(`  ${nm.padEnd(11)}: train=${brier[nm].train.toFixed(4)}  test=${brier[nm].test.toFixed(4)}`);
  }
  // cao nguyên: 378/504/756 sát nhau?
  const nb = (e: "train" | "test") => [brier["hl-378"][e], brier["hl-504"][e], brier["hl-756"][e]];
  const spread = (e: "train" | "test") => Math.max(...nb(e)) - Math.min(...nb(e));
  console.log(`  → spread 378–756: train=${spread("train").toFixed(4)} test=${spread("test").toFixed(4)} ${spread("train") < 0.003 && spread("test") < 0.003 ? "✅ CAO NGUYÊN (504 không phải đỉnh nhọn)" : "⚠️ dốc thoải — xem thêm dòng dưới"}`);
  // Quan trọng hơn "nhọn/cao nguyên": HƯỚNG có robust không — mọi hl có cùng phía vs unweighted?
  const hls = HLS.filter((h): h is number => h != null);
  const beatTest = hls.filter((h) => brier[hlName(h)].test <= brier["unweighted"].test + 1e-9).length;
  const beatTrain = hls.filter((h) => brier[hlName(h)].train <= brier["unweighted"].train + 1e-9).length;
  console.log(`  → số hl (trong ${hls.length}) ≤ unweighted: train=${beatTrain} test=${beatTest} ${beatTest === hls.length ? "✅ HƯỚNG recency robust ở test (mọi hl đều thắng)" : "⚠️ hướng nhạy theo hl"}`);
  // significance: paired diff sqErr(uw) − sqErr(504), block bootstrap
  for (const era of ["train", "test"] as const) {
    const diffs: number[] = [];
    for (const nd of nodes) {
      if (nd.y === null || !eras[era](nd.date)) continue;
      const pu = predAt(nd, null), pw = predAt(nd, 504);
      if (pu === null || pw === null) continue;
      const lab = nd.y ? 1 : 0;
      diffs.push((pu - lab) ** 2 - (pw - lab) ** 2); // >0 = 504 tốt hơn
    }
    const ci = bootMeanCi(diffs, blk, 2000, 913 + T.H);
    const m = diffs.reduce((s, x) => s + x, 0) / diffs.length;
    const sig = ci && ci[0] > 0 ? "✅ SIGNIFICANT (CI>0)" : ci && ci[1] < 0 ? "❌ TỆ HƠN significant" : "≈ variance-dominated (không significant)";
    console.log(`  ΔBrier(uw−504) ${era}: mean=${m.toFixed(4)} CI=[${ci?.[0].toFixed(4)},${ci?.[1].toFixed(4)}] → ${sig}`);
  }
}

// ============ D2: bias theo năm (soi năm chuyển chế độ) ============
for (const T of TIERS) {
  const nodes = nodesByTier.get(T.name)!;
  console.log(`\n### D2 [${T.name}] — bias theo năm (bias>0 = dự THẤP hơn thực; ⚠ chú ý 2012–2015 gãy bull, 2020, 2022) ###`);
  const byYear = new Map<string, { du: number[]; dw: number[] }>();
  for (const nd of nodes) {
    if (nd.y === null) continue;
    const pu = predAt(nd, null), pw = predAt(nd, 504);
    if (pu === null || pw === null) continue;
    const yr = nd.date.slice(0, 4);
    const c = byYear.get(yr) ?? { du: [], dw: [] };
    const lab = nd.y ? 1 : 0;
    c.du.push(lab - pu); c.dw.push(lab - pw);
    byYear.set(yr, c);
  }
  const yrs = [...byYear.keys()].sort();
  let worseYears = 0;
  for (const yr of yrs) {
    const c = byYear.get(yr)!;
    if (c.du.length < 20) continue;
    const bu = c.du.reduce((s, x) => s + x, 0) / c.du.length;
    const bw = c.dw.reduce((s, x) => s + x, 0) / c.dw.length;
    const worse = Math.abs(bw) > Math.abs(bu) + 0.05; // tệ hơn >5pt
    if (worse) worseYears++;
    console.log(`  ${yr}: uw=${(bu * 100).toFixed(1).padStart(6)}pt  504=${(bw * 100).toFixed(1).padStart(6)}pt  n=${c.du.length}${worse ? "  ⚠ 504 TỆ HƠN >5pt" : ""}`);
  }
  console.log(`  → số năm 504 tệ hơn >5pt: ${worseYears} ${worseYears <= 2 ? "✅ chấp nhận được" : "⚠️ xem lại footgun chuyển chế độ"}`);
}

// ============ D3: CI coverage dưới weighting + ESS ============
for (const T of TIERS) {
  const nodes = nodesByTier.get(T.name)!;
  const blk = Math.max(1, Math.round(T.H / STEP));
  console.log(`\n### D3 [${T.name}] — CI trung thực dưới weighting ###`);
  // target: rate thực hiện của cùng-bin trong 504 phiên KẾ TIẾP (đại lượng recency ước lượng)
  // node stride 2 cho nhẹ bootstrap; kết luận không đổi theo stride (deterministic seed).
  for (const era of ["train", "test"] as const) {
    let covU = 0, covW = 0, tot = 0, estInOwn = 0;
    for (let k = 0; k < nodes.length; k += 2) {
      const nd = nodes[k];
      if (!eras[era](nd.date) || nd.len < MINN) continue;
      // forward same-bin realized rate trong (i, i+504]
      let fav = 0, n = 0;
      for (const e of nodesByTier.get(T.name)!) {
        if (e.bin !== nd.bin || e.y === null) continue;
        if (e.i > nd.i && e.i <= nd.i + 504) { fav += e.y ? 1 : 0; n++; }
      }
      if (n < 10) continue;
      const target = (100 * fav) / n;
      const labs = nd.arr.slice(0, nd.len).map((x) => x.lab);
      const pm = nd.arr.slice(0, nd.len).map((x) => (x.lab ? 1 : -1));
      const ws = nd.arr.slice(0, nd.len).map((x) => Math.pow(0.5, (nd.i - x.i) / 504));
      const ciU = blockBootstrapCi(pm, blk, 1000);
      const ciW = weightedBootCi(labs, ws, blk, 1000, 4242 + T.H);
      if (!ciU || !ciW) continue;
      tot++;
      if (target >= ciU[0] && target <= ciU[1]) covU++;
      if (target >= ciW[0] && target <= ciW[1]) covW++;
      const est = 100 * predAt(nd, 504)!;
      if (est >= ciW[0] && est <= ciW[1]) estInOwn++;
    }
    if (!tot) { console.log(`  ${era}: (n=0)`); continue; }
    console.log(`  ${era}: coverage của rate-504-phiên-tới — CI unweighted=${((100 * covU) / tot).toFixed(0)}% · CI weighted-504=${((100 * covW) / tot).toFixed(0)}% (kỳ vọng ~95) · estimate∈own-CI=${((100 * estInOwn) / tot).toFixed(0)}% (phải ~100) · n=${tot}`);
  }
  // ESS hôm nay
  const last = nodes[nodes.length - 1];
  const ws = last.arr.slice(0, last.len).map((x) => Math.pow(0.5, (last.i - x.i) / 504));
  const ess = ws.length ? (ws.reduce((s, x) => s + x, 0) ** 2) / ws.reduce((s, x) => s + x * x, 0) : 0;
  console.log(`  HÔM NAY bin=${last.bin}: n=${last.len} → ESS(504)=${ess.toFixed(0)} ${ess < 30 ? "⚠️ mỏng — cần coarsen hiển thị như pUpTenths" : "(đủ dày để hiện %)"}`);
}

// ============ D4: cờ quyết định "Gom rải" prob≥60 ============
{
  const cy = nodesByTier.get("cycle")!;
  const sw = nodesByTier.get("swing")!;
  console.log(`\n### D4 — cờ "Gom rải" (max(cycle,swing) prob ≥ 60, đúng ngưỡng live) — forward return 126 phiên THỰC từ timeline ###`);
  console.log(`  (bối cảnh docs: cờ ≥60 theo base-rate toàn cục từng bị LOẠI — phủ 4 năm 2010–13, win 54%, tắt từ 2014)`);
  type Flag = { name: string; on: (k: number) => boolean };
  const pred2 = (nd: Node, hl: number | null) => predAt(nd, hl);
  const FLAGS: Flag[] = [
    { name: "nền (mọi ngày)", on: () => true },
    { name: "uw prob≥60", on: (k) => Math.max(pred2(cy[k], null) ?? 0, pred2(sw[k], null) ?? 0) >= 0.6 },
    { name: "504 prob≥60", on: (k) => Math.max(pred2(cy[k], 504) ?? 0, pred2(sw[k], 504) ?? 0) >= 0.6 },
    { name: "cycleBin==3 (marker hiện tại)", on: (k) => cy[k].bin === 3 },
  ];
  for (const era of ["train", "test", "toàn bộ"] as const) {
    console.log(`  --- ${era} ---`);
    for (const f of FLAGS) {
      const rets: number[] = []; const years = new Set<string>(); const idxs: number[] = [];
      for (let k = 0; k < cy.length; k++) {
        const nd = cy[k];
        if (era !== "toàn bộ" && !eras[era](nd.date)) continue;
        const ret = P[nd.i].returns["126"];
        if (ret == null) continue;
        if (!f.on(k)) continue;
        rets.push(ret); years.add(nd.date.slice(0, 4)); idxs.push(nd.i);
      }
      if (!rets.length) { console.log(`    ${f.name.padEnd(30)}: KHÔNG BAO GIỜ BẬT`); continue; }
      const win = rets.filter((r) => r > 0).length / rets.length;
      const ci = blockBootstrapCi(rets, Math.max(1, Math.round(126 / STEP)), 1000);
      // Cờ bắn CHÙM: đếm số ĐỢT độc lập (khoảng cách >63 phiên = đợt mới) — n ngày
      // lưới thổi phồng độ chắc; số đợt mới là mẫu hiệu dụng thật.
      let episodes = 1;
      for (let k = 1; k < idxs.length; k++) if (idxs[k] - idxs[k - 1] > 63) episodes++;
      console.log(`    ${f.name.padEnd(30)}: n=${String(rets.length).padStart(4)} (${String(episodes).padStart(2)} đợt) · phủ ${String(years.size).padStart(2)} năm · win6T=${(100 * win).toFixed(0)}%${ci ? ` CI[${ci[0].toFixed(0)},${ci[1].toFixed(0)}]` : ""} · median=${median(rets) >= 0 ? "+" : ""}${median(rets).toFixed(1)}%`);
    }
  }
  console.log(`  Lưu ý đọc: cờ dày đặc trong bull sẽ có win cao "miễn phí" — so với NỀN cùng era, không so tuyệt đối.`);
}
console.log("\n" + "=".repeat(100));
