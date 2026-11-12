/**
 * BEAR DOWNSIDE — study "dự báo đáng tin hơn": so nhiều cách dựng dải Triển vọng,
 * walk-forward as-of (mỗi ngày X chỉ dùng dữ liệu ≤ X), chấm bằng quy tắc chấm điểm đúng.
 *
 * Ứng viên (pre-registered, không grid):
 *   M0 card       — recency-504 thực nghiệm (đang ship)
 *   M1 uncond     — không trọng số
 *   M2 rec252     — recency-252
 *   M3 fhs        — Filtered Historical Simulation: lợi suất quá khứ × (σ_now/σ_then), trọng số recency-504
 *   M4 fhsHalf    — như M3 nhưng hệ số (σ_now/σ_then)^0.5 (vol hồi quy về trung bình trong H phiên)
 *   M5 fhsDemean  — như M3 nhưng chỉ co giãn ĐỘ LỆCH quanh trung bình (không phóng drift)
 *   M6 fhsRecal   — M3 + hiệu chỉnh phân vị thích nghi (conformal): ánh xạ mức q qua phân phối PIT
 *                   của các dự báo M3 ĐÃ ĐÁO HẠN trong 1008 phiên gần nhất (trễ H, không look-ahead)
 *   P  placebo    — M3 với chuỗi σ bị xáo theo khối 63 phiên (đúng phân phối σ, sai thời điểm)
 *
 * Thước đo (train <2019 / test ≥2019), lưới origin STEP=3:
 *   CRPS ≈ pinball loss trung bình 19 mức q (0.05..0.95) trên lợi suất tại mốc (%), thấp = tốt
 *   cov50 = % kết cục thực nằm trong [p25,p75] (mục tiêu 50)
 *   dip10 = % đáy thực thủng p10 đáy (mục tiêu 10)
 *   Brier của pUp
 *   ΔCRPS vs M0 + CI95 bootstrap theo CỤM (khối H phiên cố định, không chuỗi hóa)
 * Cổng: ΔCRPS<0 ở CẢ hai era cho ≥2/3 horizon, CI test loại 0, |cov50−50| và |dip10−10| không xấu đi, thắng placebo.
 *
 * Chạy: npx tsx scripts/bear-downside-forecast-study.ts
 */
import { readFileSync } from "node:fs";
import { HORIZONS, STEP } from "../src/lib/bear-downside";
import { seededRandom } from "../src/lib/indicators";
import { ewmaSigma, stormAt, stormRatio, STORM_RATIO, stormEvidence, monitorBearDownside } from "../src/lib/bear-downside-view";
import type { TimelinePoint } from "../src/lib/types";

const SPLIT = "2019-01-01";
const HL = 504;
const MIN_PAST = 504; // origin cần ≥2 năm lịch sử
const QS = Array.from({ length: 19 }, (_, k) => 0.05 + 0.05 * k);
const RECAL_WINDOW = 1008;
const RECAL_MIN = 30;

const raw = readFileSync("public/data/timeline.json", "utf8");
const tl = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
const date: string[] = tl.points.map((p: { date: string }) => p.date);
const c: number[] = tl.points.map((p: { price: number }) => p.price);
const N = c.length;
const last = N - 1;

const sig: number[] = ewmaSigma(c);
// placebo: σ xáo theo khối 63 phiên
const sigPlacebo: number[] = (() => {
  const B = 63, rand = seededRandom(20261112);
  const blocks: number[][] = [];
  for (let i = 0; i < N; i += B) blocks.push(sig.slice(i, i + B));
  for (let k = blocks.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [blocks[k], blocks[j]] = [blocks[j], blocks[k]]; }
  return blocks.flat().slice(0, N);
})();

const logRet = (i: number, H: number) => Math.log(c[i + H] / c[i]);
const dipCache = new Map<number, Float64Array>();
const logDip = (i: number, H: number) => {
  let a = dipCache.get(H);
  if (!a) {
    a = new Float64Array(N).fill(NaN);
    for (let s = 0; s + H <= last; s++) { let mn = Infinity; for (let j = s + 1; j <= s + H; j++) mn = Math.min(mn, c[j]); a[s] = Math.log(mn / c[s]); }
    dipCache.set(H, a);
  }
  return a[i];
};
const pct = (l: number) => (Math.exp(l) - 1) * 100;

function wQuantile(vals: number[], w: number[], q: number, order: number[]): number {
  let tot = 0; for (const x of w) tot += x;
  let cum = 0;
  for (const k of order) { cum += w[k]; if (cum >= q * tot) return vals[k]; }
  return vals[order[order.length - 1]];
}
function wCdf(vals: number[], w: number[], x: number): number {
  let tot = 0, s = 0;
  for (let k = 0; k < vals.length; k++) { tot += w[k]; if (vals[k] <= x) s += w[k]; }
  return tot ? s / tot : 0.5;
}

type Fc = { q: number[]; dip10: number; pUp: number; pit: number };
type MethodName = "M0 card" | "M1 uncond" | "M2 rec252" | "M3 fhs" | "M4 fhsHalf" | "M5 fhsDemean" | "M6 fhsRecal" | "P placebo";
const NAMES: MethodName[] = ["M0 card", "M1 uncond", "M2 rec252", "M3 fhs", "M4 fhsHalf", "M5 fhsDemean", "M6 fhsRecal", "P placebo"];

/** Dự báo của 1 phương pháp tại origin X cho horizon H. levels = mức q muốn lấy (đã hiệu chỉnh nếu M6). */
function build(X: number, H: number, kind: "emp" | "fhs" | "fhsHalf" | "fhsDemean", hl: number, s: number[], levels: number[], realized: number | null): Fc {
  const rv: number[] = [], dv: number[] = [], w: number[] = [];
  for (let j = 0; j + H <= X; j += STEP) {
    let r = logRet(j, H), d = logDip(j, H);
    if (kind !== "emp") {
      const ratio = s[X] / s[j];
      const k = kind === "fhsHalf" ? Math.sqrt(ratio) : ratio;
      r *= k; d *= k;
    }
    rv.push(r); dv.push(d); w.push(hl > 0 ? Math.pow(0.5, (X - j) / hl) : 1);
  }
  if (kind === "fhsDemean") {
    // co giãn độ lệch quanh trung bình có trọng số của lợi suất GỐC (không phóng drift)
    let tot = 0, mu = 0;
    const r0: number[] = [];
    for (let j = 0, k = 0; j + H <= X; j += STEP, k++) { r0.push(logRet(j, H)); mu += w[k] * r0[k]; tot += w[k]; }
    mu /= tot;
    for (let k = 0, j = 0; k < rv.length; k++, j += STEP) rv[k] = mu + (r0[k] - mu) * (s[X] / s[j]);
  }
  const ordR = rv.map((_, k) => k).sort((a, b) => rv[a] - rv[b]);
  const ordD = dv.map((_, k) => k).sort((a, b) => dv[a] - dv[b]);
  return {
    q: levels.map((q) => pct(wQuantile(rv, w, q, ordR))),
    dip10: pct(wQuantile(dv, w, 0.1, ordD)),
    pUp: 1 - wCdf(rv, w, 0),
    pit: realized === null ? NaN : wCdf(rv, w, realized),
  };
}

function pinball(qv: number[], y: number): number {
  let s = 0;
  for (let k = 0; k < QS.length; k++) { const e = y - qv[k]; s += Math.max(QS[k] * e, (QS[k] - 1) * e); }
  return (2 * s) / QS.length;
}

type Row = { X: number; era: "train" | "test"; y: number; dip: number; fc: Record<MethodName, Fc> };
const today: Record<number, Record<MethodName, Fc>> = {};
const rows: Record<number, Row[]> = {};

for (const H of HORIZONS) {
  rows[H] = [];
  const pits: { X: number; pit: number }[] = []; // PIT của M3 cho các origin đã qua (để M6)
  const origins: number[] = [];
  for (let X = MIN_PAST; X <= last; X += STEP) origins.push(X);
  if (origins[origins.length - 1] !== last) origins.push(last);
  for (const X of origins) {
    const matured = X + H <= last;
    const yLog = matured ? logRet(X, H) : null;
    // M6: mức q hiệu chỉnh từ PIT các dự báo M3 đã đáo hạn tới X (origin X' với X'+H ≤ X)
    const usable = pits.filter((p) => p.X + H <= X && p.X >= X - RECAL_WINDOW).map((p) => p.pit).sort((a, b) => a - b);
    const recalLevel = (q: number) => usable.length < RECAL_MIN ? q : Math.min(0.995, Math.max(0.005, usable[Math.floor(q * (usable.length - 1))]));
    const fc = {
      "M0 card": build(X, H, "emp", HL, sig, QS, yLog),
      "M1 uncond": build(X, H, "emp", 0, sig, QS, yLog),
      "M2 rec252": build(X, H, "emp", 252, sig, QS, yLog),
      "M3 fhs": build(X, H, "fhs", HL, sig, QS, yLog),
      "M4 fhsHalf": build(X, H, "fhsHalf", HL, sig, QS, yLog),
      "M5 fhsDemean": build(X, H, "fhsDemean", HL, sig, QS, yLog),
      "M6 fhsRecal": build(X, H, "fhs", HL, sig, QS.map(recalLevel), yLog),
      "P placebo": build(X, H, "fhs", HL, sigPlacebo, QS, yLog),
    } as Record<MethodName, Fc>;
    // M6 chỉ ánh xạ các mức q của kết cục qua PIT; dip10 giữ của M3 (hiệu chỉnh mức 0.1 trên phân phối dip nằm ngoài phạm vi PIT lợi suất)
    fc["M6 fhsRecal"].dip10 = fc["M3 fhs"].dip10;
    if (X === last) today[H] = fc;
    if (matured) {
      pits.push({ X, pit: fc["M3 fhs"].pit });
      rows[H].push({ X, era: date[X] < SPLIT ? "train" : "test", y: pct(yLog!), dip: pct(logDip(X, H)), fc });
    }
  }
}

// ── chấm điểm ─────────────────────────────────────────────────────────────
const i25 = QS.findIndex((q) => Math.abs(q - 0.25) < 1e-9), i75 = QS.findIndex((q) => Math.abs(q - 0.75) < 1e-9);
function score(rs: Row[], m: MethodName) {
  let crps = 0, in50 = 0, beyond = 0, brier = 0;
  for (const r of rs) {
    const f = r.fc[m];
    crps += pinball(f.q, r.y);
    if (r.y >= f.q[i25] && r.y <= f.q[i75]) in50++;
    if (r.dip < f.dip10) beyond++;
    brier += (f.pUp - (r.y > 0 ? 1 : 0)) ** 2;
  }
  const n = rs.length;
  return { crps: crps / n, cov50: (in50 / n) * 100, dip10: (beyond / n) * 100, brier: brier / n, n };
}
/** CI95 của trung bình (crps_m − crps_M0) — bootstrap theo cụm khối H phiên cố định. */
function deltaCi(rs: Row[], m: MethodName, H: number): { d: number; ci: [number, number] | null; clusters: number } {
  const groups = new Map<number, number[]>();
  const base = rs.length ? rs[0].X : 0;
  for (const r of rs) {
    const g = Math.floor((r.X - base) / H);
    const diff = pinball(r.fc[m].q, r.y) - pinball(r.fc["M0 card"].q, r.y);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(diff);
  }
  const G = [...groups.values()];
  const all = G.flat();
  const d = all.reduce((a, b) => a + b, 0) / all.length;
  if (G.length < 3) return { d, ci: null, clusters: G.length };
  const rand = seededRandom(20261112 + H);
  const ests: number[] = [];
  for (let it = 0; it < 2000; it++) {
    let s = 0, n = 0;
    for (let k = 0; k < G.length; k++) { const g = G[Math.floor(rand() * G.length)]; for (const x of g) { s += x; n++; } }
    ests.push(s / n);
  }
  ests.sort((a, b) => a - b);
  return { d, ci: [ests[49], ests[1949]], clusters: G.length };
}

const f2 = (x: number) => x.toFixed(2);
const f1 = (x: number) => x.toFixed(1);
const verdicts: Record<string, string[]> = {};

for (const H of HORIZONS) {
  console.log(`\n══════ H=${H} phiên ══════`);
  for (const era of ["train", "test"] as const) {
    const rs = rows[H].filter((r) => r.era === era);
    const b = score(rs, "M0 card");
    console.log(`\n[${era}] n=${rs.length}`);
    console.log("method        CRPS   ΔCRPS vs M0 [CI95]            clusters  cov50  dip10  Brier");
    for (const m of NAMES) {
      const s = score(rs, m);
      const dc = m === "M0 card" ? null : deltaCi(rs, m, H);
      const dTxt = dc ? `${dc.d >= 0 ? "+" : ""}${f2(dc.d)} ${dc.ci ? `[${f2(dc.ci[0])}, ${f2(dc.ci[1])}]` : "[n/a]"}` : "—";
      console.log(`${m.padEnd(13)} ${f2(s.crps).padStart(6)}  ${dTxt.padEnd(28)} ${String(dc?.clusters ?? "").padStart(8)}  ${f1(s.cov50).padStart(5)}  ${f1(s.dip10).padStart(5)}  ${s.brier.toFixed(4)}`);
      if (m !== "M0 card") {
        (verdicts[`${m}|${H}`] ??= []).push(
          `${era}:${dc!.d < 0 ? "better" : "worse"}${dc!.ci && dc!.ci[1] < 0 ? "*" : ""}` +
          `${Math.abs(s.cov50 - 50) <= Math.abs(b.cov50 - 50) ? "" : " cov50↓"}${Math.abs(s.dip10 - 10) <= Math.abs(b.dip10 - 10) ? "" : " dip10↓"}`
        );
      }
    }
  }
  // disagreement meter: M0 tệ hơn khi M0 và M3 bất đồng?
  const rs = rows[H];
  const gap = rs.map((r) => Math.abs((r.fc["M3 fhs"].q[i75] - r.fc["M3 fhs"].q[i25]) - (r.fc["M0 card"].q[i75] - r.fc["M0 card"].q[i25])));
  const sorted = [...gap].sort((a, b) => a - b);
  const cut = sorted[Math.floor(sorted.length * 2 / 3)];
  const hi = rs.filter((_, k) => gap[k] >= cut), lo = rs.filter((_, k) => gap[k] < cut);
  const sh = score(hi, "M0 card"), sl = score(lo, "M0 card");
  console.log(`\nDisagreement meter (bề rộng dải M3 vs M0, top-1/3 vs còn lại): M0 cov50 ${f1(sh.cov50)} vs ${f1(sl.cov50)}, dip10 ${f1(sh.dip10)} vs ${f1(sl.dip10)}, CRPS ${f2(sh.crps)} vs ${f2(sl.crps)}`);
  console.log(`  M3 trên nhóm bất đồng cao: cov50 ${f1(score(hi, "M3 fhs").cov50)}, dip10 ${f1(score(hi, "M3 fhs").dip10)}, CRPS ${f2(score(hi, "M3 fhs").crps)}`);
  // cùng ngưỡng (cắt theo dữ liệu quá khứ là lý tưởng; ở đây cố định toàn mẫu — mô tả), tách era + đếm cụm
  for (const era of ["train", "test"] as const) {
    const h = hi.filter((r) => r.era === era), l = lo.filter((r) => r.era === era);
    const clusters = new Set(h.map((r) => Math.floor(r.X / H))).size;
    console.log(`  [${era}] M0 dip10 bất đồng cao ${f1(score(h, "M0 card").dip10)}% (n=${h.length}, ${clusters} cụm) vs thấp ${f1(score(l, "M0 card").dip10)}% (n=${l.length})`);
  }
}

// ── Cờ "thị trường đang dữ" (past-only): σ hôm nay ≥ 1.3× trung vị σ 504 phiên trước đó.
// Câu hỏi: khi cờ bật, dải của card (M0) có trượt nhiều hơn không? Placebo = cờ cùng tần suất nhưng xáo khối 63 phiên.
const VOL_RATIO = STORM_RATIO;
const volFlag = (s: number[], X: number) => stormAt(s, X);
console.log(`\n══════ Cờ thị trường dữ: σ ≥ ${VOL_RATIO}× trung vị 2 năm trước (past-only) ══════`);
for (const H of HORIZONS) {
  for (const era of ["train", "test"] as const) {
    const rs = rows[H].filter((r) => r.era === era);
    for (const [label, s] of [["thật", sig], ["placebo", sigPlacebo]] as const) {
      const on = rs.filter((r) => volFlag(s, r.X)), off = rs.filter((r) => !volFlag(s, r.X));
      const cl = new Set(on.map((r) => Math.floor(r.X / H))).size;
      const a = score(on, "M0 card"), b = score(off, "M0 card");
      console.log(`H=${String(H).padEnd(3)} ${era.padEnd(5)} ${label.padEnd(7)} bật ${String(on.length).padStart(3)} ngày/${String(cl).padStart(2)} cụm: thủng đáy p10 ${f1(a.dip10).padStart(5)}% vs tắt ${f1(b.dip10).padStart(5)}%  | trong p25–p75 ${f1(a.cov50)}% vs ${f1(b.cov50)}%`);
    }
  }
}
console.log(`Hôm nay cờ: ${stormAt(sig, last) ? "BẬT" : "tắt"} (σ hôm nay / trung vị 2 năm = ${stormRatio(sig, last)?.toFixed(2)})`);
// Placebo phân phối: 200 lần dịch vòng cờ thật đi một khoảng ngẫu nhiên (giữ đúng tần suất + độ dài đợt).
// Thống kê = chênh % thủng đáy p10 (bật − tắt). Cờ thật phải vượt p95 placebo ở CẢ hai era.
console.log("\nPlacebo dịch vòng ×200 — chênh thủng đáy p10 (bật − tắt), điểm phần trăm:");
for (const H of HORIZONS) {
  for (const era of ["train", "test"] as const) {
    const rs = rows[H].filter((r) => r.era === era);
    const flags = rs.map((r) => volFlag(sig, r.X));
    const gapOf = (f: boolean[]) => {
      const on = rs.filter((_, k) => f[k]), off = rs.filter((_, k) => !f[k]);
      if (!on.length || !off.length) return 0;
      return score(on, "M0 card").dip10 - score(off, "M0 card").dip10;
    };
    const real = gapOf(flags);
    const rand = seededRandom(777 + H + (era === "test" ? 1 : 0));
    const minShift = Math.ceil(H / STEP) + 1;
    const sims: number[] = [];
    for (let it = 0; it < 200; it++) {
      const sh = minShift + Math.floor(rand() * (rs.length - 2 * minShift));
      sims.push(gapOf(flags.map((_, k) => flags[(k + sh) % flags.length])));
    }
    sims.sort((a, b) => a - b);
    const p95 = sims[189], rank = sims.filter((x) => x >= real).length / sims.length;
    console.log(`H=${String(H).padEnd(3)} ${era.padEnd(5)} thật ${f1(real).padStart(5)}  placebo p95 ${f1(p95).padStart(5)}  p≈${rank.toFixed(3)} ${real > p95 ? "VƯỢT" : "không vượt"}`);
  }
}

console.log("\n══════ Cổng (better* = CI loại 0) ══════");
for (const m of NAMES.filter((x) => x !== "M0 card")) {
  const cells = HORIZONS.map((H) => verdicts[`${m}|${H}`]);
  const passH = cells.filter((v) => v.every((e) => e.startsWith(`${e.split(":")[0]}:better`) && !e.includes("↓"))).length;
  const testSig = cells.some((v) => v.some((e) => e.startsWith("test:better*")));
  console.log(`${m.padEnd(13)} ${HORIZONS.map((H, k) => `${H}: ${cells[k].join(" / ")}`).join("  |  ")}  ⇒ ${passH}/3 horizon cả 2 era tốt hơn${testSig ? ", có CI test loại 0" : ""}`);
}

console.log(`\n══════ HÔM NAY ${date[last]} giá $${c[last]} — σ năm hóa ${f1(sig[last] * Math.sqrt(252) * 100)}% ══════`);
for (const H of HORIZONS) {
  console.log(`H=${H}:`);
  for (const m of NAMES) {
    const f = today[H][m];
    const usd = (p: number) => `$${Math.round(c[last] * (1 + p / 100))}`;
    console.log(`  ${m.padEnd(13)} đáy p10 ${f1(f.dip10)}% (${usd(f.dip10)})  kết cục p25..p75 ${f1(f.q[i25])}..${f1(f.q[i75])}% (${usd(f.q[i25])}..${usd(f.q[i75])})  pUp ${(f.pUp * 100).toFixed(0)}%`);
  }
}

// ── Số của card thật (dùng đúng hàm đã ship): bằng chứng cờ bão theo era + chuông báo phát lại hằng tháng ──
{
  const pts = tl.points as TimelinePoint[];
  const sigAll = ewmaSigma(c);
  console.log("\n══════ Cờ bão trên dải THẬT của card (stormEvidence; % đáy thủng p10, bật vs tắt) ══════");
  const inEra = (i: number, era: "train" | "test") => (date[i] < SPLIT) === (era === "train");
  const show = (label: string, ev: ReturnType<typeof stormEvidence>) => {
    for (const k of ["21", "63", "126"] as const) {
      const e = ev[k];
      console.log(`${label.padEnd(6)} H=${k.padEnd(3)} ${e ? `bật ${e.onDip10}% vs tắt ${e.offDip10}% (${e.onClusters} cụm bão)` : "không đủ dữ liệu"}`);
    }
  };
  show("all", stormEvidence(pts, sigAll));
  for (const era of ["train", "test"] as const) {
    // che bearAsOf ngoài era (giữ nguyên chỉ số để khớp σ)
    show(era, stormEvidence(pts.map((p, i) => (inEra(i, era) ? p : { ...p, bearAsOf: undefined })), sigAll));
  }

  console.log("\n══════ Chuông báo trượt: phát lại monitorBearDownside vào phiên đầu mỗi tháng ══════");
  const firsts: number[] = [];
  for (let i = 0; i < N; i++) if (i === 0 || date[i].slice(0, 7) !== date[i - 1].slice(0, 7)) firsts.push(i);
  for (const H of ["21", "63", "126"] as const) {
    const cnt = { ok: 0, degraded: 0, insufficient: 0 };
    const bad: string[] = [];
    for (const k of firsts) {
      const it = monitorBearDownside(pts.slice(0, k + 1)).items.find((x) => x.H === H)!;
      cnt[it.status]++;
      if (it.status === "degraded") bad.push(date[k]);
    }
    console.log(`H=${H.padEnd(3)} ${firsts.length} ảnh chụp: ok ${cnt.ok}, degraded ${cnt.degraded}, insufficient ${cnt.insufficient}${bad.length ? `  degraded: ${bad.join(", ")}` : ""}`);
  }
  for (const it of monitorBearDownside(pts).items) {
    console.log(`Hôm nay ${date[last]} H=${it.H.padEnd(3)} ${it.status}  endIn50 ${it.endIn50}%  dipBeyond10 ${it.dipBeyond10}%  ${it.clusters} cụm`);
  }
}
