/**
 * BOTTOM-WAIT — "không hoàn toàn DCA mà chờ tín hiệu Bottom Hunter trong chu kỳ bear
 * thì sao?" (câu hỏi 2026-07-06, nối tiếp monthday-study/monthday-bear-study).
 *
 * Chiến lược lai: tháng bình thường mua phiên đầu tháng như DCA chuẩn; tháng có CỜ BEAR
 * (quan sát được tại đầu tháng, past-only) thì găm ngân sách chờ tín hiệu Bottom Hunter
 * (prob/bin as-of walk-forward trong timeline.json — không look-ahead), có tín hiệu mua
 * ngay, hết hạn chờ thì mua ép.
 *  - S1 (intra-month): chờ TRONG tháng; không tín hiệu ⇒ mua ép phiên cuối tháng.
 *  - S2 (cross-month, cap 3 tháng): găm tiền QUA nhiều tháng; có tín hiệu ⇒ giải ngân
 *    toàn bộ; quá 3 tháng ⇒ mua ép cuối tháng thứ 3. (Vùng "between-months skip = not
 *    studied" trong CLAUDE.md — đo lần đầu.)
 *
 * Cờ bear (past-only tại phiên đầu tháng):
 *  - phase: bearPhases ∈ {acute, grind} (Bear DCA Advisor, reaction-based)
 *  - dd10 : giá ≤ 90% ATH
 * Tín hiệu Bottom Hunter (as-of, mọi ngày trong kỳ chờ):
 *  - maxProb ≥ thr, thr ∈ {55, 60, 65} (max cycle/swing; pha acute dùng probUw —
 *    đúng chính sách hiển thị); binUnion: cycleBin==3 hoặc swingBin==3.
 *
 * Thước đo: giá vốn realized (Σtiền/Σoz — harmonic mean) toàn giai đoạn vs BASE mua
 * phiên đầu tháng. improvement% = (costBase − costStrat)/costBase × 100 (>0 = rẻ hơn).
 * Train(<2019)/test(≥2019). CI95 block-bootstrap theo tháng (block=6, phủ cap chờ).
 * Placebo: cùng cấu trúc chờ nhưng "tín hiệu" = ngày ngẫu nhiên seeded trong kỳ chờ
 * (200 seed) — tín hiệu thật phải vượt p90 placebo.
 * Cổng: improvement>0 CẢ 2 giai đoạn + CI loại trừ 0 CẢ 2 + > p90 placebo CẢ 2.
 *
 * Chạy: npx tsx scripts/bottom-wait-study.ts (~vài giây, data đã commit, không fetch)
 */
import { readFileSync } from "node:fs";
import { bearPhases } from "../src/lib/bear-dca";
import { seededRandom } from "../src/lib/indicators";
import type { BearPhase } from "../src/lib/types";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const MINN = 10;
const CAP_MONTHS = 3;
const SEEDS = 200;

type Pt = {
  date: string; price: number;
  cycleBin?: number; swingBin?: number;
  cycleProb?: number | null; cycleProbUw?: number | null; cycleN?: number;
  swingProb?: number | null; swingProbUw?: number | null; swingN?: number;
};
const tl = JSON.parse(readFileSync("public/data/timeline.json", "utf8"));
const P: Pt[] = tl.points;
const dates = P.map((p) => p.date);
const price = P.map((p) => p.price);
const phases: BearPhase[] = bearPhases(price);

function effProb(i: number, tier: "cycle" | "swing"): number | null {
  const p = P[i];
  const rec = tier === "cycle" ? p.cycleProb ?? null : p.swingProb ?? null;
  const uw = tier === "cycle" ? p.cycleProbUw ?? null : p.swingProbUw ?? null;
  const n = tier === "cycle" ? p.cycleN ?? 0 : p.swingN ?? 0;
  if (n < MINN) return null;
  return phases[i] === "acute" ? uw ?? rec : rec;
}

// ---- tháng dương lịch (sau warmup, bỏ tháng đầu/cuối cụt)
interface M { ym: string; from: number; to: number; }
const monthsAll: M[] = [];
for (let i = 0; i < dates.length; i++) {
  const ym = dates[i].slice(0, 7);
  if (!monthsAll.length || monthsAll[monthsAll.length - 1].ym !== ym) monthsAll.push({ ym, from: i, to: i });
  else monthsAll[monthsAll.length - 1].to = i;
}
const months = monthsAll.slice(1, -1).filter((m) => m.from >= WARMUP && m.to - m.from + 1 >= 15);

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

// ---- cờ bear + tín hiệu
type Flag = (m: M) => boolean;
const FLAGS: { name: string; f: Flag }[] = [
  { name: "phase", f: (m) => phases[m.from] === "acute" || phases[m.from] === "grind" },
  {
    name: "dd10",
    f: (m) => {
      let ath = -Infinity;
      for (let j = 0; j <= m.from; j++) if (price[j] > ath) ath = price[j];
      return price[m.from] <= ath * 0.9;
    },
  },
];
type Sig = (i: number) => boolean;
const SIGS: { name: string; s: Sig }[] = [
  ...[55, 60, 65].map((thr) => ({
    name: `maxProb≥${thr}`,
    s: (i: number) => Math.max(effProb(i, "cycle") ?? -1, effProb(i, "swing") ?? -1) >= thr,
  })),
  { name: "binUnion", s: (i: number) => P[i].cycleBin === 3 || P[i].swingBin === 3 },
];

// ---- mô phỏng: trả về mảng theo-tháng {spend, oz} (tháng giải ngân nhận oz gộp)
interface MonthCash { spend: number; oz: number; }
type SigOrNull = Sig | null; // null ⇒ không bao giờ có tín hiệu (đo riêng "mua ép" thuần)

function simulate(strategy: "base" | "s1" | "s2", flag: Flag, sig: SigOrNull, pickForced?: (from: number, to: number) => number): MonthCash[] {
  const out: MonthCash[] = months.map(() => ({ spend: 1, oz: 0 }));
  let pending = 0; // số tháng ngân sách đang găm (S2)
  let pendingStart = -1;
  for (let mi = 0; mi < months.length; mi++) {
    const m = months[mi];
    const buyAt = (i: number, units: number) => { out[mi].oz += units / price[i]; };
    if (strategy === "base" || !flag(m)) {
      // hết bear ⇒ xả pending (nếu có) ngay phiên đầu tháng + mua tháng này như thường
      if (pending > 0) { buyAt(m.from, pending); pending = 0; }
      buyAt(m.from, 1);
      continue;
    }
    if (strategy === "s1") {
      let idx = -1;
      for (let i = m.from; i <= m.to; i++) if (sig && sig(i)) { idx = i; break; }
      if (idx < 0) idx = pickForced ? pickForced(m.from, m.to) : m.to;
      buyAt(idx, 1);
      continue;
    }
    // s2: găm qua tháng
    pending += 1;
    if (pendingStart < 0) pendingStart = mi;
    let idx = -1;
    for (let i = m.from; i <= m.to; i++) if (sig && sig(i)) { idx = i; break; }
    const capHit = mi - pendingStart + 1 >= CAP_MONTHS;
    if (idx >= 0) { buyAt(idx, pending); pending = 0; pendingStart = -1; }
    else if (capHit) {
      const f = pickForced ? pickForced(m.from, m.to) : m.to;
      buyAt(f, pending); pending = 0; pendingStart = -1;
    }
  }
  // cuối dữ liệu còn pending ⇒ xả phiên cuối để so sánh công bằng
  if (pending > 0) {
    const last = months[months.length - 1];
    out[months.length - 1].oz += pending / price[last.to];
  }
  return out;
}

function costOf(cash: MonthCash[], idxs: number[]): number {
  let spend = 0, oz = 0;
  for (const i of idxs) { spend += cash[i].spend; oz += cash[i].oz; }
  return spend / oz;
}

function improvement(base: MonthCash[], strat: MonthCash[], idxs: number[]): number {
  const cb = costOf(base, idxs), cs = costOf(strat, idxs);
  return ((cb - cs) / cb) * 100;
}

/** CI95 block-bootstrap theo tháng (block 6) trên improvement. */
function bootCi(base: MonthCash[], strat: MonthCash[], idxs: number[], iters = 2000): [number, number] {
  const rand = seededRandom(42);
  const n = idxs.length;
  const vals: number[] = [];
  for (let it = 0; it < iters; it++) {
    const sample: number[] = [];
    while (sample.length < n) {
      const st = Math.floor(rand() * n);
      for (let k = 0; k < 6 && sample.length < n; k++) sample.push(idxs[(st + k) % n]);
    }
    vals.push(improvement(base, strat, sample));
  }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(0.025 * iters)], vals[Math.floor(0.975 * iters)]];
}

// ---- chạy
const trIdx = months.map((_, i) => i).filter((i) => months[i].ym + "-01" < SPLIT);
const teIdx = months.map((_, i) => i).filter((i) => months[i].ym + "-01" >= SPLIT);
const base = simulate("base", () => false, null);

console.log(`Bottom-Wait — ${months.length} tháng sau warmup (train ${trIdx.length}/test ${teIdx.length}), split ${SPLIT}.`);
for (const fl of FLAGS) {
  const nTr = trIdx.filter((i) => fl.f(months[i])).length;
  const nTe = teIdx.filter((i) => fl.f(months[i])).length;
  console.log(`Cờ ${fl.name}: tháng bear train=${nTr}/${trIdx.length} · test=${nTe}/${teIdx.length}`);
}
console.log("");

interface Row {
  key: string; trImpr: number; teImpr: number; trCi: [number, number]; teCi: [number, number];
  trP90: number; teP90: number; sigMonthsTr: number; sigMonthsTe: number; pass: boolean;
}
const rows: Row[] = [];

for (const strategy of ["s1", "s2"] as const) {
  for (const fl of FLAGS) {
    for (const sg of SIGS) {
      const strat = simulate(strategy, fl.f, sg.s);
      const trImpr = improvement(base, strat, trIdx);
      const teImpr = improvement(base, strat, teIdx);
      const trCi = bootCi(base, strat, trIdx);
      const teCi = bootCi(base, strat, teIdx);
      // placebo: cùng cờ + cùng chiến lược nhưng "tín hiệu" không bao giờ bắn,
      // mua ép tại NGÀY NGẪU NHIÊN seeded trong cửa sổ (không phải phiên cuối).
      const plaTr: number[] = [], plaTe: number[] = [];
      for (let sd = 0; sd < SEEDS; sd++) {
        const rnd = seededRandom(1000 + sd);
        const pick = (from: number, to: number) => from + Math.floor(rnd() * (to - from + 1));
        const pla = simulate(strategy, fl.f, null, pick);
        plaTr.push(improvement(base, pla, trIdx));
        plaTe.push(improvement(base, pla, teIdx));
      }
      plaTr.sort((a, b) => a - b); plaTe.sort((a, b) => a - b);
      const trP90 = plaTr[Math.floor(0.9 * SEEDS)];
      const teP90 = plaTe[Math.floor(0.9 * SEEDS)];
      // đếm tháng-bear có tín hiệu thật (S1: trong tháng; S2: đếm cùng cách, tham khảo)
      const cnt = (idxs: number[]) =>
        idxs.filter((i) => fl.f(months[i]) && (() => { for (let j = months[i].from; j <= months[i].to; j++) if (sg.s(j)) return true; return false; })()).length;
      const pass =
        trImpr > 0 && teImpr > 0 && trCi[0] > 0 && teCi[0] > 0 && trImpr > trP90 && teImpr > teP90;
      rows.push({
        key: `${strategy}/${fl.name}/${sg.name}`, trImpr, teImpr, trCi, teCi, trP90, teP90,
        sigMonthsTr: cnt(trIdx), sigMonthsTe: cnt(teIdx), pass,
      });
    }
  }
}

console.log(`key · impr% tr/te · CI95 tr · CI95 te · p90 placebo tr/te · tháng-bear-có-tín-hiệu tr/te`);
for (const r of rows) {
  console.log(
    `${r.key.padEnd(24)} ${r.trImpr >= 0 ? "+" : ""}${r.trImpr.toFixed(2)}/${r.teImpr >= 0 ? "+" : ""}${r.teImpr.toFixed(2)} · ` +
    `[${r.trCi.map((x) => x.toFixed(2)).join(",")}] · [${r.teCi.map((x) => x.toFixed(2)).join(",")}] · ` +
    `${r.trP90.toFixed(2)}/${r.teP90.toFixed(2)} · ${r.sigMonthsTr}/${r.sigMonthsTe}` +
    (r.pass ? "  ✓ QUA CỔNG" : "")
  );
}

const passed = rows.filter((r) => r.pass);
console.log(`\n=== QUA CỔNG (impr>0 + CI>0 + >p90 placebo, CẢ train/test): ${passed.length}/${rows.length} ===`);
if (passed.length) {
  console.log(`PHÁN QUYẾT: GO — ${passed.map((r) => r.key).join(", ")}`);
} else {
  const near = [...rows].sort((a, b) => Math.max(-b.trImpr, -b.teImpr) - Math.max(-a.trImpr, -a.teImpr))[0];
  console.log(`Gần nhất: ${near.key} (impr ${near.trImpr.toFixed(2)}/${near.teImpr.toFixed(2)}, CI te [${near.teCi.map((x) => x.toFixed(2)).join(",")}])`);
  console.log("PHÁN QUYẾT: NO-GO — chờ Bottom Hunter trong bear không cho giá vốn rẻ hơn DCA đầu-tháng một cách bền vững.");
}
