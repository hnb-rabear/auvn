/**
 * PREMIUM ACCUM — tín hiệu MỚI cho "Gom rải": canh premium SJC (chênh lệch vs giá thế giới)
 * thấp, KHÔNG phải canh giá XAU. Chưa từng thử: docs/bear-dca.md + docs/dca-zone-v2.md từng
 * ghi "SJC/ring gold VN chưa đủ mẫu" (<6 tháng). Backfill CafeF (2025-02-08..nay, xem
 * public/data/history/vn-gold.json) nay cho 493 phiên (~17 tháng) — qua ngưỡng ≥6 tháng mà
 * CLAUDE.md đặt ra cho tiêu chí premium.
 *
 * Câu hỏi: premiumPct thấp (percentile/MA trong cửa sổ trailing) có báo trước sjcSell (giá
 * VND thực trả) RẺ HƠN trong cửa sổ H phiên tới không? Đo bằng rangePos (0=đáy cửa sổ giá,
 * 1=đỉnh), neo mỗi H phiên (không chồng lấp, chống pseudo-replication), ghép cặp so mua-ngay
 * + placebo — cùng khung đo đã validate ở scripts/dca-zone-study-v2.ts (nhưng tín hiệu vào
 * là premium VN, không phải TA giá XAU).
 *
 * Cổng (CẢ 4, ở CẢ HAI giai đoạn train/test):
 *  G1. meanDelta < 0 vs mua-ngay (rẻ hơn)
 *  G2. CI95% (block-bootstrap neo, block=2) không chứa 0
 *  G3. delta vs placebo < 0 (vượt mua-ngẫu-nhiên)
 *  G4. meanPos rule ≤ 0.40 (edge thực chất)
 *
 * Split: chỉ có 17 tháng dữ liệu (không đủ nhiều năm) ⇒ split theo mốc lịch calendar cố định
 * "2025-11-08" (~9 tháng train / ~8 tháng test) — KHÔNG theo năm như các study khác. Caveat
 * thành thật: mẫu mỏng, một giai đoạn thị trường, không phải nhiều chu kỳ.
 *
 * Chạy: npx tsx scripts/premium-accum-study.ts (~1s, dùng data đã commit, không cần fetch)
 */
import { readFileSync } from "node:fs";
import { pricePercentile } from "../src/lib/dca-zone";
import { seededRandom } from "../src/lib/indicators";

const SPLIT = "2025-11-08";
const SEEDS = 500;
const HS = [10, 21];

type VnRow = { date: string; sjcSell: number; premiumPct: number; usdVnd: number };
const raw = JSON.parse(readFileSync("public/data/history/vn-gold.json", "utf8")) as VnRow[];
const dates = raw.map((r) => r.date);
const price = raw.map((r) => r.sjcSell);
const prem = raw.map((r) => r.premiumPct);
const usdVnd = raw.map((r) => r.usdVnd);
const N = raw.length;

const inEra = (d: string, era: "train" | "test") => (era === "train" ? d < SPLIT : d >= SPLIT);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

function ma(arr: number[], i: number, W: number): number {
  const from = Math.max(0, i - W + 1);
  let s = 0, c = 0;
  for (let j = from; j <= i; j++) { s += arr[j]; c++; }
  return s / c;
}

/** Neo mỗi H phiên, không chồng lấp. */
function anchors(H: number): number[] {
  const out: number[] = [];
  for (let s = 0; s + H <= N; s += H) out.push(s);
  return out;
}

function rangePos(win: number[], p: number): number {
  const lo = Math.min(...win), hi = Math.max(...win);
  return hi > lo ? (p - lo) / (hi - lo) : 0.5;
}

type Picker = (s: number, H: number) => number;
const pickFirst: Picker = (s) => s;
function pickSeeded(seed: number): Picker {
  const rand = seededRandom(seed);
  return (s, H) => s + Math.floor(rand() * H);
}
type Gate = (i: number) => boolean;
/** Mua ngày ĐẦU trong [s, s+H-1] thỏa cheap-gate; không gặp -> buộc mua cuối cửa sổ. */
function pickRule(gate: Gate): Picker {
  return (s, H) => {
    for (let i = s; i < s + H; i++) if (gate(i)) return i;
    return s + H - 1;
  };
}

function posArr(H: number, anch: number[], pick: Picker): number[] {
  return anch.map((s) => rangePos(price.slice(s, s + H), price[pick(s, H)]));
}

/** Block bootstrap CI95 cho mảng delta (đơn vị neo), block=2 neo để chịu tự tương quan nhẹ. */
function bootstrapCI(deltas: number[], iters = 2000, block = 2): [number, number] {
  const n = deltas.length;
  if (n < 2) return [NaN, NaN];
  const rand = seededRandom(42);
  const means: number[] = [];
  for (let it = 0; it < iters; it++) {
    const sample: number[] = [];
    while (sample.length < n) {
      const start = Math.floor(rand() * n);
      for (let k = 0; k < block && sample.length < n; k++) sample.push(deltas[(start + k) % n]);
    }
    means.push(mean(sample));
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * iters)], means[Math.floor(0.975 * iters)]];
}

interface Cand { name: string; series: "premium" | "usdvnd" | "joint"; W: number; kind: "pctile" | "ma"; p?: number; }
const CANDS: Cand[] = [];
for (const series of ["premium", "usdvnd"] as const) {
  for (const W of [30, 60, 90]) {
    for (const p of [20, 30, 40]) CANDS.push({ name: `${series}-pctile-W${W}-p${p}`, series, W, kind: "pctile", p });
    CANDS.push({ name: `${series}-ma-W${W}`, series, W, kind: "ma" });
  }
}
// cổng KẾT HỢP: premium thấp VÀ usdVnd thấp cùng lúc (hẹp hơn từng cổng riêng, chưa test).
for (const W of [30, 60, 90]) for (const p of [30, 40, 50]) CANDS.push({ name: `joint-pctile-W${W}-p${p}`, series: "joint", W, kind: "pctile", p });
function gateFor(c: Cand): Gate {
  // premiumPct thấp = SJC rẻ hơn giá thế giới -> mua. usdVnd thấp trong cửa sổ trailing =
  // VND đang tương đối MẠNH gần đây (chưa mất giá nhanh) -> mua rẻ hơn quy đổi VND.
  if (c.series === "joint") return (i) => pricePercentile(prem, i, c.W) <= (c.p ?? 30) && pricePercentile(usdVnd, i, c.W) <= (c.p ?? 30);
  const src = c.series === "premium" ? prem : usdVnd;
  if (c.kind === "pctile") return (i) => pricePercentile(src, i, c.W) <= (c.p ?? 30);
  return (i) => src[i] < ma(src, i, c.W);
}

interface EraStat { meanPos: number; deltaBase: number; deltaPlacebo: number; ci: [number, number]; n: number; }
interface Row { key: string; H: number; cand: string; train: EraStat; test: EraStat; worstDelta: number; }

const rows: Row[] = [];
for (const H of HS) {
  const anch = anchors(H);
  const trainAnch = anch.filter((s) => inEra(dates[s], "train"));
  const testAnch = anch.filter((s) => inEra(dates[s], "test"));
  const basePosAll = new Map<number, number>();
  const placeboPick = pickSeeded(7);
  const placeboPosAll = new Map<number, number>();
  for (const s of anch) {
    basePosAll.set(s, rangePos(price.slice(s, s + H), price[pickFirst(s, H)]));
    placeboPosAll.set(s, rangePos(price.slice(s, s + H), price[placeboPick(s, H)]));
  }
  console.log(`\n=== H=${H} phiên · neo train=${trainAnch.length} test=${testAnch.length} ===`);
  for (const era of ["train", "test"] as const) {
    const a = era === "train" ? trainAnch : testAnch;
    const b = a.map((s) => basePosAll.get(s)!);
    const p = a.map((s) => placeboPosAll.get(s)!);
    console.log(`  ${era}: mua-ngay meanPos=${mean(b).toFixed(3)} · placebo meanPos=${mean(p).toFixed(3)} (kỳ vọng ~0.5)`);
  }

  for (const c of CANDS) {
    const gate = gateFor(c);
    const pick = pickRule(gate);
    const eraStat = (a: number[]): EraStat => {
      const rulePos = a.map((s) => rangePos(price.slice(s, s + H), price[pick(s, H)]));
      const b = a.map((s) => basePosAll.get(s)!);
      const p = a.map((s) => placeboPosAll.get(s)!);
      const deltaBaseArr = rulePos.map((v, i) => v - b[i]);
      const deltaPlaceboArr = rulePos.map((v, i) => v - p[i]);
      return {
        meanPos: mean(rulePos),
        deltaBase: mean(deltaBaseArr),
        deltaPlacebo: mean(deltaPlaceboArr),
        ci: bootstrapCI(deltaBaseArr),
        n: a.length,
      };
    };
    const train = eraStat(trainAnch);
    const test = eraStat(testAnch);
    rows.push({
      key: `${c.name}/H${H}`, H, cand: c.name, train, test,
      worstDelta: Math.max(train.deltaBase, test.deltaBase),
    });
  }
}

function passesGate(e: EraStat): boolean {
  const ciExcludesZero = !(e.ci[0] <= 0 && e.ci[1] >= 0);
  return e.deltaBase < 0 && ciExcludesZero && e.deltaPlacebo < 0 && e.meanPos <= 0.4;
}
const passed = rows.filter((r) => passesGate(r.train) && passesGate(r.test));
passed.sort((a, b) => a.worstDelta - b.worstDelta);

rows.sort((a, b) => a.worstDelta - b.worstDelta);
console.log(`\n### Top 10 theo worst-era delta (BẤT KỂ cổng) ###`);
console.log(`key · meanPos tr/te · Δmua-ngay tr/te · CI95(train) · Δplacebo tr/te`);
for (const r of rows.slice(0, 10)) {
  const g = (e: EraStat) => passesGate(e) ? "✓" : "✗";
  console.log(
    `${r.key.padEnd(20)} ${r.train.meanPos.toFixed(3)}/${r.test.meanPos.toFixed(3)} · ` +
    `${r.train.deltaBase.toFixed(3)}/${r.test.deltaBase.toFixed(3)} ${g(r.train)}${g(r.test)} · ` +
    `[${r.train.ci[0].toFixed(3)}, ${r.train.ci[1].toFixed(3)}] · ` +
    `${r.train.deltaPlacebo.toFixed(3)}/${r.test.deltaPlacebo.toFixed(3)}`
  );
}

console.log(`\n=== QUA CẢ 4 CỔNG (train + test): ${passed.length}/${rows.length} cấu hình ===`);
if (passed.length) {
  const w = passed[0];
  console.log(`WINNER: ${w.key}`);
  console.log(`  train: meanPos=${w.train.meanPos.toFixed(3)} Δmua-ngay=${w.train.deltaBase.toFixed(3)} CI=[${w.train.ci[0].toFixed(3)},${w.train.ci[1].toFixed(3)}] Δplacebo=${w.train.deltaPlacebo.toFixed(3)}`);
  console.log(`  test:  meanPos=${w.test.meanPos.toFixed(3)} Δmua-ngay=${w.test.deltaBase.toFixed(3)} CI=[${w.test.ci[0].toFixed(3)},${w.test.ci[1].toFixed(3)}] Δplacebo=${w.test.deltaPlacebo.toFixed(3)}`);
  console.log("\nPHÁN QUYẾT: GO");
} else {
  console.log("PHÁN QUYẾT: NO-GO — không cấu hình premium nào qua cả 4 cổng ở cả train và test.");
}
