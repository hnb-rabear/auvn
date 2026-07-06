/**
 * GOM RẢI v2 — tuyển chọn trigger cờ "Gom rải" (spec 2026-07-06-gomrai-v2-design.md).
 * Cờ hiện tại (level cycleProb≥60) đo được: 430 ngày bật / 48 đợt, riêng 2026 54 ngày,
 * nhưng chỉ 35/194 đáy xác nhận có cờ trong ±7 phiên (18%) — vừa dày vừa bỏ đáy.
 *
 * Grid: trigger CẠNH LÊN {bin cycle/swing/union · prob cycle/swing/max ≥ thr · lai}
 *       × TTL {0,2,3,5,8,10} × cooldown {0,10,21,42}.
 * Cổng: (G1) win6T per-đợt > baseline ở CẢ train(<2019)/test(≥2019)
 *       (G2) ≥ p90 placebo đồng-n (500 seed, random ngày đủ điều kiện cùng năm)
 *       (G3) coverage đáy gộp ≥35% · ngày active/năm ≤25 · bắn ≥60% số năm.
 * Xếp hạng min-excess (lợi thế win6T tệ nhất trong 2 giai đoạn).
 * Chính sách giữ nguyên: loại ngày headwind (composite ≤ −40); pha acute ⇒ probUw.
 * Offline data commit · walk-forward (prob/bin as-of có sẵn trong timeline) · seed cố định.
 * Chạy: npx tsx scripts/gomrai-study.ts
 */
import { readFileSync } from "node:fs";
import { bearPhases } from "../src/lib/bear-dca";
import type { BearPhase } from "../src/lib/types";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3; // lưới thưa cho baseline (chống pseudo-replication)
const MINN = 10;
const NEAR = 7; // ±7 phiên quanh đáy xác nhận
const SEEDS = 500;

type Pt = {
  date: string; price: number; composite: number;
  cycleBin?: number; swingBin?: number;
  cycleProb?: number | null; cycleProbUw?: number | null; cycleN?: number;
  swingProb?: number | null; swingProbUw?: number | null; swingN?: number;
  returns: Record<string, number | null>;
};
const tl = JSON.parse(readFileSync("public/data/timeline.json", "utf8"));
const bot = JSON.parse(readFileSync("public/data/bottom.json", "utf8"));
const P: Pt[] = tl.points;
const N = P.length;
const dates = P.map((p) => p.date);
const phases: BearPhase[] = bearPhases(P.map((p) => p.price));
const dateIdx = new Map(dates.map((d, i) => [d, i]));

// ngày đủ điều kiện: sau warmup + không headwind (chính sách precedence của guidance)
const eligible = (i: number) => i >= WARMUP && P[i].composite > -40;

// prob hiệu dụng theo tầng, cổng acute (cùng công thức gomRaiIdxsBy hiện tại)
function effProb(i: number, tier: "cycle" | "swing"): number | null {
  const p = P[i];
  const rec = tier === "cycle" ? p.cycleProb ?? null : p.swingProb ?? null;
  const uw = tier === "cycle" ? p.cycleProbUw ?? null : p.swingProbUw ?? null;
  const n = tier === "cycle" ? p.cycleN ?? 0 : p.swingN ?? 0;
  if (n < MINN) return null;
  return phases[i] === "acute" ? uw ?? rec : rec;
}

// ---- nguồn điều kiện (mỗi nguồn tự có cạnh lên riêng; trigger = BẤT KỲ nguồn nào có cạnh)
type Src = (i: number) => boolean;
const binSrc = (tier: "cycle" | "swing"): Src => (i) =>
  i >= 0 && (tier === "cycle" ? P[i].cycleBin : P[i].swingBin) === 3;
const probSrc = (tier: "cycle" | "swing" | "max", thr: number): Src => (i) => {
  if (i < 0) return false;
  const v =
    tier === "max"
      ? Math.max(effProb(i, "cycle") ?? -1, effProb(i, "swing") ?? -1)
      : effProb(i, tier) ?? -1;
  return v >= thr;
};

interface Cand { name: string; srcs: Src[]; }
const THRS = [55, 60, 65, 70, 75];
const CANDS: Cand[] = [
  { name: "bin-cycle", srcs: [binSrc("cycle")] },
  { name: "bin-swing", srcs: [binSrc("swing")] },
  { name: "bin-union", srcs: [binSrc("cycle"), binSrc("swing")] },
  ...(["cycle", "swing", "max"] as const).flatMap((t) =>
    THRS.map((thr) => ({ name: `prob-${t}-${thr}`, srcs: [probSrc(t, thr)] }))
  ),
  ...THRS.map((thr) => ({
    name: `hybrid-${thr}`,
    srcs: [binSrc("cycle"), binSrc("swing"), probSrc("max", thr)],
  })),
];
const TTLS = [0, 2, 3, 5, 8, 10];
const COOLS = [0, 10, 21, 42];

// ---- trigger + active window cho 1 cấu hình
function runConfig(c: Cand, ttl: number, cool: number) {
  const triggers: number[] = [];
  let last = -1e9;
  for (let i = WARMUP; i < N; i++) {
    if (!eligible(i)) continue;
    if (i - last <= cool) continue;
    if (c.srcs.some((s) => s(i) && !s(i - 1))) { triggers.push(i); last = i; }
  }
  const inWin = new Uint8Array(N);
  for (const t of triggers) for (let j = t; j <= Math.min(N - 1, t + ttl); j++) inWin[j] = 1;
  const active: number[] = [];
  for (let i = 0; i < N; i++) if (inWin[i] && eligible(i)) active.push(i);
  return { triggers, active };
}

// ---- metric helpers
const inEra = (d: string, era: "train" | "test") => (era === "train" ? d < SPLIT : d >= SPLIT);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const winRate = (a: number[]) => (a.length ? a.filter((r) => r > 0).length / a.length : NaN);

// đáy xác nhận sau warmup, map về index
const bottoms = (bot.confirmedBottoms as { date: string; tier: string }[])
  .map((b) => ({ ...b, i: dateIdx.get(b.date) ?? -1 }))
  .filter((b) => b.i >= WARMUP);

function coverage(active: number[], tier?: string) {
  const set = new Set(active);
  const bs = tier ? bottoms.filter((b) => b.tier === tier) : bottoms;
  let hit = 0;
  for (const b of bs) {
    for (let d = -NEAR; d <= NEAR; d++) if (set.has(b.i + d)) { hit++; break; }
  }
  return bs.length ? (100 * hit) / bs.length : NaN;
}
function precision(active: number[]) {
  if (!active.length) return NaN;
  const bidx = bottoms.map((b) => b.i);
  let near = 0;
  for (const i of active) if (bidx.some((j) => Math.abs(j - i) <= NEAR)) near++;
  return (100 * near) / active.length;
}

// baseline: lưới thưa STEP=3, ngày đủ điều kiện, có returns 126
const baseRets: Record<"train" | "test", number[]> = { train: [], test: [] };
for (let i = WARMUP; i < N; i += STEP) {
  if (!eligible(i)) continue;
  const r = P[i].returns["126"];
  if (r == null) continue;
  baseRets[inEra(dates[i], "train") ? "train" : "test"].push(r);
}

// PRNG seed cố định (mulberry32) cho placebo
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// pool ngày đủ điều kiện có returns126 theo năm (cho placebo đồng-n)
const poolByYear = new Map<string, number[]>();
for (let i = WARMUP; i < N; i++) {
  if (!eligible(i) || P[i].returns["126"] == null) continue;
  const y = dates[i].slice(0, 4);
  (poolByYear.get(y) ?? poolByYear.set(y, []).get(y)!).push(i);
}
/** p90 win6T của placebo: giữ nguyên số trigger/năm, ngày random trong pool cùng năm. */
function placeboP90(trigsWithRet: number[], era: "train" | "test"): number {
  const perYear = new Map<string, number>();
  for (const i of trigsWithRet) {
    if (!inEra(dates[i], era)) continue;
    const y = dates[i].slice(0, 4);
    perYear.set(y, (perYear.get(y) ?? 0) + 1);
  }
  if (![...perYear.values()].some((c) => c > 0)) return NaN;
  const wins: number[] = [];
  for (let s = 0; s < SEEDS; s++) {
    const rnd = mulberry32(1000 + s);
    const rets: number[] = [];
    for (const [y, cnt] of perYear) {
      const pool = poolByYear.get(y) ?? [];
      for (let k = 0; k < cnt && pool.length; k++) {
        rets.push(P[pool[Math.floor(rnd() * pool.length)]].returns["126"]!);
      }
    }
    if (rets.length) wins.push(winRate(rets));
  }
  wins.sort((a, b) => a - b);
  return wins.length ? 100 * wins[Math.floor(0.9 * wins.length)] : NaN;
}

interface Row {
  key: string; cand: string; ttl: number; cool: number;
  trigN: number; activeN: number; years: number; yearsFired: number;
  covAll: number; covCycle: number; covSwing: number; prec: number;
  win: Record<"train" | "test", number>; med: Record<"train" | "test", number>;
  n: Record<"train" | "test", number>; minExcess: number; actPerYear: number;
  trigsWithRet: number[];
}
const spanYears = Number(dates[N - 1].slice(0, 4)) - Number(dates[WARMUP].slice(0, 4)) + 1;
const rows: Row[] = [];
for (const c of CANDS) for (const ttl of TTLS) for (const cool of COOLS) {
  const { triggers, active } = runConfig(c, ttl, cool);
  if (!triggers.length) continue;
  const trigsWithRet = triggers.filter((i) => P[i].returns["126"] != null);
  const win = { train: NaN, test: NaN } as Row["win"];
  const med = { train: NaN, test: NaN } as Row["med"];
  const n = { train: 0, test: 0 } as Row["n"];
  for (const era of ["train", "test"] as const) {
    const rets = trigsWithRet.filter((i) => inEra(dates[i], era)).map((i) => P[i].returns["126"]!);
    win[era] = 100 * winRate(rets); med[era] = median(rets); n[era] = rets.length;
  }
  const minExcess = Math.min(
    win.train - 100 * winRate(baseRets.train),
    win.test - 100 * winRate(baseRets.test)
  );
  rows.push({
    key: `${c.name}/ttl${ttl}/cd${cool}`, cand: c.name, ttl, cool,
    trigN: triggers.length, activeN: active.length,
    years: spanYears, yearsFired: new Set(triggers.map((i) => dates[i].slice(0, 4))).size,
    covAll: coverage(active), covCycle: coverage(active, "cycle"), covSwing: coverage(active, "swing"),
    prec: precision(active), win, med, n, minExcess,
    actPerYear: active.length / spanYears, trigsWithRet,
  });
}

// ---- reference: cờ HIỆN TẠI (level cycleProb≥60, không cạnh/TTL/cooldown)
{
  const active: number[] = [];
  for (let i = WARMUP; i < N; i++) {
    if (!eligible(i)) continue;
    const v = effProb(i, "cycle");
    if (v !== null && v >= 60) active.push(i);
  }
  console.log("=== HIỆN TRẠNG (reference, không vào ranking) ===");
  console.log(`level cycleProb≥60: active=${active.length} ngày · coverage gộp=${coverage(active).toFixed(0)}% · precision=${precision(active).toFixed(0)}%`);
}

// bản KHÔNG warmup + KHÔNG cổng acute — đúng phép đo mở study (docs/bottom.md
// "Cờ Gom rải — LOẠI"): raw cycleProb≥60, loại headwind, đủ n≥10. Chỉ in.
{
  const activeNW: number[] = [];
  for (let i = 0; i < N; i++) {
    const p = P[i];
    if (p.composite <= -40) continue;
    const v = (p.cycleN ?? 0) >= 10 ? p.cycleProb ?? null : null;
    if (v !== null && v >= 60) activeNW.push(i);
  }
  let runs = 0;
  for (let k = 0; k < activeNW.length; k++) if (k === 0 || activeNW[k] !== activeNW[k - 1] + 1) runs++;
  const d2026 = activeNW.filter((i) => dates[i].startsWith("2026")).length;
  const allB = (bot.confirmedBottoms as { date: string }[])
    .map((b) => dateIdx.get(b.date) ?? -1)
    .filter((i) => i >= 0);
  const set = new Set(activeNW);
  let hit = 0;
  for (const bi of allB) for (let d = -NEAR; d <= NEAR; d++) { if (set.has(bi + d)) { hit++; break; } }
  let near = 0;
  for (const i of activeNW) if (allB.some((j) => Math.abs(j - i) <= NEAR)) near++;
  console.log(
    `level cycleProb≥60 KHÔNG warmup/acute (phép đo mở study): active=${activeNW.length} ngày · ${runs} đợt · 2026: ${d2026} ngày · ` +
    `coverage ${hit}/${allB.length}=${((100 * hit) / allB.length).toFixed(0)}% · precision=${((100 * near) / activeNW.length).toFixed(0)}%`
  );
}

// ---- cổng + ranking
const bTrain = 100 * winRate(baseRets.train), bTest = 100 * winRate(baseRets.test);
console.log(`\nBaseline win6T: train=${bTrain.toFixed(0)}% (n=${baseRets.train.length}) · test=${bTest.toFixed(0)}% (n=${baseRets.test.length})`);

const g13 = rows.filter(
  (r) =>
    r.win.train > bTrain && r.win.test > bTest && // G1
    r.covAll >= 35 && r.actPerYear <= 25 && r.yearsFired / r.years >= 0.6 && // G3
    r.n.train >= 5 && r.n.test >= 5 // đủ đợt tối thiểu để so sánh có nghĩa
);
g13.sort((a, b) => b.minExcess - a.minExcess);
console.log(`\nQua G1+G3: ${g13.length}/${rows.length} cấu hình. Chạy placebo (G2) cho top 40…`);

const passed: (Row & { p90: Record<"train" | "test", number> })[] = [];
for (const r of g13.slice(0, 40)) {
  const p90 = {
    train: placeboP90(r.trigsWithRet, "train"),
    test: placeboP90(r.trigsWithRet, "test"),
  };
  const ok = r.win.train >= p90.train && r.win.test >= p90.test;
  // in từng ứng viên qua G1+G3 kèm kết quả placebo — để near-miss tái lập được từ stdout
  console.log(
    `  G1+G3: ${r.key.padEnd(24)} ${String(r.trigN).padStart(3)}đợt(${r.n.train}/${r.n.test}) · ${r.actPerYear.toFixed(1)}/năm · ` +
    `cov ${r.covAll.toFixed(0)}% · win ${r.win.train.toFixed(1)}/${r.win.test.toFixed(1)} · p90 ${p90.train.toFixed(1)}/${p90.test.toFixed(1)} → G2${ok ? "✓" : "✗"}`
  );
  if (ok) passed.push({ ...r, p90 });
}

// ---- DIAGNOSTIC (chỉ in, không đổi cổng/verdict): vì sao đậu/rớt — cho checkpoint đọc tay
{
  console.log(`\n### DIAGNOSTIC — đếm theo từng cổng (${rows.length} cấu hình có trigger) ###`);
  const g1 = rows.filter((r) => r.win.train > bTrain && r.win.test > bTest);
  const gCov = rows.filter((r) => r.covAll >= 35);
  const gAct = rows.filter((r) => r.actPerYear <= 25);
  const gYrs = rows.filter((r) => r.yearsFired / r.years >= 0.6);
  const gN = rows.filter((r) => r.n.train >= 5 && r.n.test >= 5);
  console.log(`  G1 (win>base cả 2 era): ${g1.length} · coverage≥35: ${gCov.length} · active/năm≤25: ${gAct.length} · năm bắn≥60%: ${gYrs.length} · n≥5/5: ${gN.length}`);
  const fl = (r: Row) =>
    `${r.win.train > bTrain && r.win.test > bTest ? "G1✓" : "G1✗"} ` +
    `${r.covAll >= 35 ? "cov✓" : `cov✗${r.covAll.toFixed(0)}`} ` +
    `${r.actPerYear <= 25 ? "act✓" : `act✗${r.actPerYear.toFixed(0)}`} ` +
    `${r.yearsFired / r.years >= 0.6 ? "yr✓" : `yr✗${r.yearsFired}/${r.years}`} ` +
    `${r.n.train >= 5 && r.n.test >= 5 ? "n✓" : `n✗${r.n.train}/${r.n.test}`}`;
  console.log(`\n  Top 15 theo min-excess (BẤT KỂ cổng) — kèm cờ đậu/rớt từng cổng + placebo p90:`);
  const byExcess = [...rows].sort((a, b) => b.minExcess - a.minExcess).slice(0, 15);
  for (const r of byExcess) {
    const p90 = { train: placeboP90(r.trigsWithRet, "train"), test: placeboP90(r.trigsWithRet, "test") };
    const g2 = r.win.train >= p90.train && r.win.test >= p90.test ? "G2✓" : "G2✗";
    console.log(
      `  ${r.key.padEnd(24)} ${String(r.trigN).padStart(3)}đợt(${r.n.train}/${r.n.test}) · ${r.actPerYear.toFixed(1).padStart(5)}/năm · ` +
      `cov ${r.covAll.toFixed(0)}%(${r.covCycle.toFixed(0)}/${r.covSwing.toFixed(0)}) · prec ${r.prec.toFixed(0)}% · ` +
      `win ${r.win.train.toFixed(1)}/${r.win.test.toFixed(1)} · med ${r.med.train.toFixed(1)}/${r.med.test.toFixed(1)} · ` +
      `p90 ${p90.train.toFixed(1)}/${p90.test.toFixed(1)} ${g2} · ${fl(r)}`
    );
  }
  console.log(`  Top 10 theo COVERAGE (bất kể cổng) — phủ đáy tối đa được bao nhiêu:`);
  const byCov = [...rows].sort((a, b) => b.covAll - a.covAll).slice(0, 10);
  for (const r of byCov) {
    console.log(
      `  ${r.key.padEnd(24)} cov ${r.covAll.toFixed(0)}%(cyc ${r.covCycle.toFixed(0)}/sw ${r.covSwing.toFixed(0)}) · ` +
      `${r.actPerYear.toFixed(1)}/năm · prec ${r.prec.toFixed(0)}% · win ${r.win.train.toFixed(0)}/${r.win.test.toFixed(0)} · ${fl(r)}`
    );
  }
}

console.log(`\n=== QUA CẢ 4 CỔNG: ${passed.length} cấu hình (xếp min-excess) ===`);
console.log(`key · đợt(n tr/te) · active/năm · năm bắn · cov gộp(cyc/sw) · prec · win6T tr/te (base ${bTrain.toFixed(0)}/${bTest.toFixed(0)}) · med tr/te · p90 placebo tr/te`);
for (const r of passed.slice(0, 15)) {
  console.log(
    `${r.key.padEnd(24)} ${String(r.trigN).padStart(3)}(${r.n.train}/${r.n.test}) · ${r.actPerYear.toFixed(1).padStart(5)}/năm · ${r.yearsFired}/${r.years} · ` +
    `${r.covAll.toFixed(0)}%(${r.covCycle.toFixed(0)}/${r.covSwing.toFixed(0)}) · prec ${r.prec.toFixed(0)}% · ` +
    `win ${r.win.train.toFixed(0)}/${r.win.test.toFixed(0)} · med ${r.med.train.toFixed(1)}/${r.med.test.toFixed(1)} · p90 ${r.p90.train.toFixed(0)}/${r.p90.test.toFixed(0)}`
  );
}
if (passed.length) {
  const w = passed[0];
  const [cand] = [CANDS.find((c) => c.name === w.cand)!];
  console.log(`\nWINNER ${w.key} — JSON cho GOMRAI_CONFIG:`);
  console.log(JSON.stringify({
    binCycleEdge: cand.name.includes("bin-cycle") || cand.name.includes("union") || cand.name.startsWith("hybrid"),
    binSwingEdge: cand.name.includes("bin-swing") || cand.name.includes("union") || cand.name.startsWith("hybrid"),
    probTier: cand.name.startsWith("prob-") ? cand.name.split("-")[1] : cand.name.startsWith("hybrid") ? "max" : null,
    probThreshold: cand.name.startsWith("prob-") || cand.name.startsWith("hybrid") ? Number(cand.name.split("-").pop()) : null,
    ttlSessions: w.ttl, cooldownSessions: w.cool,
    evidence: {
      episodes: w.trigN, win6TTrain: +w.win.train.toFixed(1), win6TTest: +w.win.test.toFixed(1),
      baselineTrain: +bTrain.toFixed(1), baselineTest: +bTest.toFixed(1),
      coveragePct: +w.covAll.toFixed(0), precisionPct: +w.prec.toFixed(0),
      activeDaysPerYear: +w.actPerYear.toFixed(1),
      placeboP90Train: +w.p90.train.toFixed(1), placeboP90Test: +w.p90.test.toFixed(1),
    },
  }, null, 2));
  console.log("\nPHÁN QUYẾT: GO");

  // ---- (temporary, kept for reproduction) winner trigger dates 2024-01-01..2026-06-30
  const { triggers: winTriggers } = runConfig(cand, w.ttl, w.cool);
  const snapDates = winTriggers.map((i) => dates[i]).filter((d) => d >= "2024-01-01" && d <= "2026-06-30");
  console.log(`\nWinner trigger dates 2024-01-01..2026-06-30 (n=${snapDates.length}):`);
  console.log(JSON.stringify(snapDates, null, 2));
} else {
  console.log("\nPHÁN QUYẾT: NO-GO — không cấu hình nào qua cả 4 cổng ⇒ xóa cờ khỏi UI (spec).");
}
