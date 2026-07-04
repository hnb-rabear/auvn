/**
 * BOTTOM HUNTER — study E1/E2/E3 (chạy SAU bottom-recency-deep-study.ts).
 * Deep study đã tìm 1 điểm yếu (D2 footgun: recency-504 lạc quan giả sau cú sập
 * nhanh — 2020 cycle −19pt, swing 2026 −37pt ĐANG diễn ra) + 1 cơ hội (D4 cờ ≥60).
 * Đào tiếp:
 *
 *  E1. Chẩn đoán HÔM NAY: footgun có đang bật? Đo cường độ "sập nhanh" (drawdown từ
 *      đỉnh 42 phiên) hôm nay + vài mốc lịch sử, để biết số swing 2026 đáng ngờ tới đâu.
 *  E2. Grid ngưỡng cờ "Gom rải" 50/55/60/65/70 × {uw, 504}: 60 là điểm nhọn hay mượt?
 *      So win6T + số ĐỢT độc lập + median, LUÔN so với NỀN cùng era (không so tuyệt đối).
 *  E3. REGIME GUARD sửa footgun: khi giá đang sập nhanh (drawdown 42 phiên sâu), kéo
 *      prediction về phía unweighted (bi quan hơn = an toàn khi gọi đáy).
 *        guarded = (1−g)·recency504 + g·unweighted,  g = min(1, recentDD% / KNEE)
 *      Test: guard có GỠ overshoot 2020/2026 KHÔNG mà KHÔNG giết cải thiện năm bull?
 *      Cổng: |bias| năm-sập giảm rõ, |bias| test tổng không tệ đi, Brier không hại.
 *      Nếu guard không cứu được ⇒ khai thật recency có footgun cố hữu, xử lý ở UI.
 *
 * Offline timeline.json · walk-forward as-of · STEP=3 · seed cố định.
 * Chạy: npx tsx scripts/bottom-recency-guard-study.ts
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

/** Drawdown hôm nay (i) so đỉnh W phiên gần nhất, %≥0. Cao = đang/vừa sập. Past-only. */
function recentDD(i: number, W = 42): number {
  let pk = -Infinity;
  for (let j = Math.max(0, i - W); j <= i; j++) if (price[j] > pk) pk = price[j];
  return pk > 0 ? Math.max(0, (1 - price[i] / pk) * 100) : 0;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const grid: number[] = [];
for (let i = WARMUP; i < N; i += STEP) grid.push(i);

type Tier = { name: string; H: number; eps: number; bin: (p: Pt) => number };
const TIERS: Tier[] = [
  { name: "cycle", H: BOTTOM_CONFIG.cycle.horizonDays, eps: BOTTOM_CONFIG.cycle.epsPct, bin: (p) => p.cycleBin },
  { name: "swing", H: BOTTOM_CONFIG.swing.horizonDays, eps: BOTTOM_CONFIG.swing.epsPct, bin: (p) => p.swingBin },
];

interface Node { i: number; date: string; bin: number; y: boolean | null; arr: { lab: number; i: number }[]; len: number; }
function buildNodes(T: Tier): Node[] {
  const rows = grid.map((i) => ({ i, date: date[i], bin: T.bin(P[i]), y: labelAt(i, T.H, T.eps) }));
  const matured = new Map<number, { lab: number; i: number }[]>();
  let mk = 0; const out: Node[] = [];
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
function pred(nd: Node, hl: number | null): number | null {
  if (nd.len < MINN) return null;
  let sw = 0, swl = 0;
  for (let k = 0; k < nd.len; k++) { const e = nd.arr[k]; const w = hl == null ? 1 : Math.pow(0.5, (nd.i - e.i) / hl); sw += w; swl += w * e.lab; }
  return sw > 0 ? swl / sw : null;
}
/** guarded: blend 504→unweighted theo cường độ sập g. KNEE% = ngưỡng full-fallback. */
function predGuard(nd: Node, knee: number): number | null {
  const p504 = pred(nd, 504), puw = pred(nd, null);
  if (p504 === null || puw === null) return null;
  const g = Math.min(1, recentDD(nd.i) / knee);
  return (1 - g) * p504 + g * puw;
}

const eras = { train: (d: string) => d < SPLIT, test: (d: string) => d >= SPLIT } as const;
const nodesByTier = new Map(TIERS.map((T) => [T.name, buildNodes(T)]));

console.log("=".repeat(100));
console.log("BOTTOM HUNTER — GUARD STUDY (E1 chẩn đoán hôm nay · E2 grid ngưỡng cờ · E3 regime guard sửa footgun)");
console.log("=".repeat(100));

// ============ E1: chẩn đoán cường độ sập hôm nay + mốc lịch sử ============
console.log(`\n### E1 — cường độ "sập nhanh" (drawdown 42 phiên, %). Cao ⇒ recency dễ lạc quan giả ###`);
const marks = [N - 1];
// thêm mốc lịch sử: đỉnh drawdown quanh 2020-03 và 2013-04
for (const d of ["2020-03-18", "2013-04-15", "2022-09-26"]) { const k = date.findIndex((x) => x >= d); if (k >= 0) marks.push(k); }
for (const i of marks) console.log(`  ${date[i]}: price=${price[i].toFixed(0)} · drawdown42=${recentDD(i).toFixed(1)}% · drawdown63=${recentDD(i, 63).toFixed(1)}%`);
{
  const last = N - 1;
  for (const T of TIERS) {
    const nodes = nodesByTier.get(T.name)!; const nd = nodes[nodes.length - 1];
    const p5 = pred(nd, 504), pu = pred(nd, null), pg = predGuard(nd, 15);
    console.log(`  [${T.name}] hôm nay bin=${nd.bin}: uw=${pu != null ? (pu * 100).toFixed(1) : "—"}% · 504=${p5 != null ? (p5 * 100).toFixed(1) : "—"}% · guard(knee15)=${pg != null ? (pg * 100).toFixed(1) : "—"}% (g=${(Math.min(1, recentDD(last) / 15)).toFixed(2)})`);
  }
  console.log(`  → ⚠ drawdown42 hôm nay ~11% (ngang covid 2020-03 11.8%) ⇒ footgun ĐANG BẬT: recency-504 cycle 61% nằm đúng chế độ D2 cảnh báo overshoot. guard(knee15) kéo về ~42% (≈unweighted). Đây là quyết định hiển thị QUAN TRỌNG cho HÔM NAY.`);
}

// ============ E2: grid ngưỡng cờ "Gom rải" ============
console.log(`\n### E2 — grid ngưỡng cờ "Gom rải" (max(cycle,swing) prob ≥ THR) · win6T & số đợt · so NỀN cùng era ###`);
{
  const cy = nodesByTier.get("cycle")!, sw = nodesByTier.get("swing")!;
  const THRS = [0.5, 0.55, 0.6, 0.65, 0.7];
  for (const era of ["test", "toàn bộ"] as const) {
    // nền cùng era
    const baseRets: number[] = [];
    for (let k = 0; k < cy.length; k++) { const nd = cy[k]; if (era !== "toàn bộ" && !eras[era](nd.date)) continue; const r = P[nd.i].returns["126"]; if (r != null) baseRets.push(r); }
    const baseWin = baseRets.filter((r) => r > 0).length / baseRets.length;
    console.log(`  --- ${era} --- (NỀN: win6T=${(100 * baseWin).toFixed(0)}% median=${median(baseRets).toFixed(1)}% n=${baseRets.length})`);
    for (const method of [{ n: "uw", hl: null as number | null }, { n: "504", hl: 504 as number | null }]) {
      for (const thr of THRS) {
        const rets: number[] = []; const idxs: number[] = []; const yrs = new Set<string>();
        for (let k = 0; k < cy.length; k++) {
          const nd = cy[k]; if (era !== "toàn bộ" && !eras[era](nd.date)) continue;
          const r = P[nd.i].returns["126"]; if (r == null) continue;
          const pc = pred(cy[k], method.hl) ?? 0, ps = pred(sw[k], method.hl) ?? 0;
          if (Math.max(pc, ps) >= thr) { rets.push(r); idxs.push(nd.i); yrs.add(nd.date.slice(0, 4)); }
        }
        if (!rets.length) { console.log(`    ${method.n} ≥${(thr * 100).toFixed(0)}: (không bật)`); continue; }
        let ep = 1; for (let k = 1; k < idxs.length; k++) if (idxs[k] - idxs[k - 1] > 63) ep++;
        const win = rets.filter((r) => r > 0).length / rets.length;
        const lift = 100 * (win - baseWin);
        console.log(`    ${method.n} ≥${(thr * 100).toFixed(0)}: n=${String(rets.length).padStart(4)} (${String(ep).padStart(2)} đợt) · ${String(yrs.size).padStart(2)}năm · win6T=${(100 * win).toFixed(0)}% (lift ${lift >= 0 ? "+" : ""}${lift.toFixed(0)}pt) · median=${median(rets) >= 0 ? "+" : ""}${median(rets).toFixed(1)}%`);
      }
    }
  }
  console.log(`  Đọc: cờ tốt = lift dương ổn định qua nhiều ngưỡng + phủ ≥5 năm + ≥5 đợt (không phải 1 chùm).`);
}

// ============ E3: regime guard sửa footgun ============
console.log(`\n### E3 — REGIME GUARD (blend 504→uw khi sập nhanh) sửa footgun D2? ###`);
for (const T of TIERS) {
  const nodes = nodesByTier.get(T.name)!;
  const blk = Math.max(1, Math.round(T.H / STEP));
  const KNEES = [10, 15, 20];
  console.log(`\n  ### [${T.name}] ###`);
  // Brier + bias tổng theo era
  const methods: { n: string; f: (nd: Node) => number | null }[] = [
    { n: "unweighted", f: (nd) => pred(nd, null) },
    { n: "recency-504", f: (nd) => pred(nd, 504) },
    ...KNEES.map((k) => ({ n: `guard-knee${k}`, f: (nd: Node) => predGuard(nd, k) })),
  ];
  for (const m of methods) {
    const parts: string[] = [];
    for (const era of ["train", "test"] as const) {
      let sB = 0, sBias = 0, n = 0;
      for (const nd of nodes) { if (nd.y === null || !eras[era](nd.date)) continue; const p = m.f(nd); if (p === null) continue; const lab = nd.y ? 1 : 0; sB += (p - lab) ** 2; sBias += lab - p; n++; }
      parts.push(`${era} Brier=${(sB / n).toFixed(4)} bias=${(100 * sBias / n) >= 0 ? "+" : ""}${(100 * sBias / n).toFixed(1)}pt`);
    }
    console.log(`    ${m.n.padEnd(14)}: ${parts.join("  |  ")}`);
  }
  // Bias các NĂM SẬP (đã lộ ở D2: cycle 2020; swing 2020, 2026)
  const crashYears = T.name === "cycle" ? ["2020"] : ["2020", "2026"];
  console.log(`    -- bias năm sập ${crashYears.join(",")} (mục tiêu: guard kéo về 0 so recency-504) --`);
  for (const yr of crashYears) {
    const line: string[] = [];
    for (const m of [methods[0], methods[1], ...KNEES.map((k, i) => methods[2 + i])]) {
      const ds: number[] = [];
      for (const nd of nodes) { if (nd.y === null || nd.date.slice(0, 4) !== yr) continue; const p = m.f(nd); if (p === null) continue; ds.push((nd.y ? 1 : 0) - p); }
      if (ds.length) line.push(`${m.n}=${(100 * ds.reduce((s, x) => s + x, 0) / ds.length).toFixed(1)}pt`);
    }
    console.log(`      ${yr}: ${line.join("  ")}`);
  }
}
console.log(`\n  Phán quyết E3: guard hữu ích CHỈ KHI kéo bias năm-sập về 0 rõ rệt mà không làm hại Brier/bias test tổng.`);

// ============ E4: tỷ lệ "TỰ TIN SAI" theo chế độ drawdown ============
// Con số sinh tử của công cụ săn đáy: khi nó bảo "gần đáy" (prob cao) mà giá RƠI TIẾP.
// Chia theo drawdown42: CALM (<8%) vs ELEVATED (≥8%, tức đang/vừa sập — chế độ nguy hiểm).
console.log(`\n### E4 — tỷ lệ "tự tin sai": trong ngày pred≥55%, thực near-bottom bao nhiêu %? (cao=đáng tin) ###`);
for (const T of TIERS) {
  const nodes = nodesByTier.get(T.name)!;
  console.log(`  ### [${T.name}] — near-bottom rate KHI pred≥55%, theo chế độ drawdown & era ###`);
  const methods: { n: string; f: (nd: Node) => number | null }[] = [
    { n: "unweighted", f: (nd) => pred(nd, null) },
    { n: "recency-504", f: (nd) => pred(nd, 504) },
    { n: "guard-knee15", f: (nd) => predGuard(nd, 15) },
  ];
  for (const m of methods) {
    const cell: Record<string, { fav: number; n: number }> = {};
    for (const nd of nodes) {
      if (nd.y === null) continue;
      const p = m.f(nd); if (p === null || p < 0.55) continue; // chỉ ngày "tự tin"
      const regime = recentDD(nd.i) >= 8 ? "ELEVATED" : "calm";
      const era = eras.test(nd.date) ? "test" : "train";
      const key = `${era}/${regime}`;
      const c = cell[key] ?? { fav: 0, n: 0 }; c.fav += nd.y ? 1 : 0; c.n++; cell[key] = c;
    }
    const fmt = (k: string) => { const c = cell[k]; return c && c.n ? `${(100 * c.fav / c.n).toFixed(0)}%(n${c.n})` : "—"; };
    console.log(`    ${m.n.padEnd(13)}: train/calm=${fmt("train/calm").padEnd(9)} train/ELEV=${fmt("train/ELEVATED").padEnd(9)} test/calm=${fmt("test/calm").padEnd(9)} test/ELEV=${fmt("test/ELEVATED")}`);
  }
  console.log(`    → cột ELEVATED = chế độ nguy hiểm (đang sập). Rate thấp ở đây = "tự tin sai" nhiều.`);
}
console.log("\n" + "=".repeat(100));
