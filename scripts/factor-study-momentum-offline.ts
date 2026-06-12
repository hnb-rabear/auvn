/**
 * Phiên bản offline của factor-study-momentum.ts.
 * Dùng timeline.json đã tính sẵn để thêm điểm momentum12m vào từng TimelinePoint
 * (tính từ point.price và date), rồi so sánh gridSearch3 vs gridSearch4.
 *
 * Không cần fetch mạng — dùng được trong sandbox.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPLIT_DATE, MIN_SIGNALS, stats } from "./study-lib";
import type { TimelinePoint } from "../src/lib/types";

const timelineData: { points: TimelinePoint[] } = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const pts = timelineData.points;

// Tính động lượng 12 tháng cho mỗi điểm từ point.price và date.
// Tìm điểm timeline gần nhất <= (date - 252 ngày lịch).
function addMomentum(points: TimelinePoint[]): void {
  for (let i = 0; i < points.length; i++) {
    const target = new Date(points[i].date).getTime() - 252 * 86400000;
    let best = -1;
    for (let j = 0; j < i; j++) {
      if (new Date(points[j].date).getTime() <= target) best = j;
      else break;
    }
    if (best < 0) continue;
    const diff = new Date(points[i].date).getTime() - new Date(points[best].date).getTime();
    // Chỉ dùng điểm trong khoảng 250–280 ngày (tránh khoảng cách quá xa)
    const diffDays = diff / 86400000;
    if (diffDays < 240 || diffDays > 280) continue;

    const mom = (points[i].price / points[best].price - 1) * 100;
    let ms = 0;
    if (mom > 20) ms = 2;
    else if (mom > 5) ms = 1;
    else if (mom > -10) ms = 0;
    else if (mom > -25) ms = -1;
    else ms = -2;
    (points[i].scores as Record<string, number>)["momentum"] = ms;
  }
}

type H = "21" | "63" | "126";

function composite4(p: TimelinePoint, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores as Record<string, number>)) {
    const wk = w[k] ?? 0;
    s += score * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

function gridSearch(points: TimelinePoint[], h: H, includeMomentum: boolean) {
  const valid = points.filter((p) => p.returns[h] !== null);
  const train = valid.filter((p) => p.date < SPLIT_DATE);
  const test = valid.filter((p) => p.date >= SPLIT_DATE);
  const baseTrain = stats(train.map((p) => p.returns[h] as number)).fav;
  const baseTest = stats(test.map((p) => p.returns[h] as number)).fav;

  type Cand = {
    w: Record<string, number>;
    thr: number;
    tr: ReturnType<typeof stats>;
    te: ReturnType<typeof stats>;
    minExcess: number;
  };
  const candidates: Cand[] = [];

  const maxW = 10;
  for (let wt = 0; wt <= maxW; wt++) {
    for (let ws = 0; ws <= maxW - wt; ws++) {
      if (includeMomentum) {
        for (let wmom = 0; wmom <= maxW - wt - ws; wmom++) {
          const wm = maxW - wt - ws - wmom;
          const w = { technical: wt / 10, stats: ws / 10, macro: wm / 10, momentum: wmom / 10 };
          run(w);
        }
      } else {
        const wm = maxW - wt - ws;
        const w = { technical: wt / 10, stats: ws / 10, macro: wm / 10 };
        run(w);
      }
    }
  }

  function run(w: Record<string, number>) {
    for (const thr of [30, 40, 50, 60]) {
      const tr = stats(
        train.filter((p) => composite4(p, w) >= thr).map((p) => p.returns[h] as number)
      );
      const te = stats(
        test.filter((p) => composite4(p, w) >= thr).map((p) => p.returns[h] as number)
      );
      if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) return;
      const exTr = tr.fav - baseTrain;
      const exTe = te.fav - baseTest;
      if (exTr <= 0 || exTe <= 0) return;
      candidates.push({ w, thr, tr, te, minExcess: Math.min(exTr, exTe) });
    }
  }

  candidates.sort((a, b) => b.minExcess - a.minExcess);
  return { baseTrain, baseTest, candidates };
}

function fmtW(w: Record<string, number>) {
  return ["technical", "stats", "macro", "momentum"]
    .filter((k) => w[k] !== undefined)
    .map((k) => `${k.substring(0, 3)}:${w[k]}`)
    .join(" ");
}

function fmtCand(c: ReturnType<typeof gridSearch>["candidates"][0]) {
  return (
    `w=${fmtW(c.w)} thr=${c.thr} | ` +
    `train ${(c.tr.fav * 100).toFixed(1)}% (n=${c.tr.n}) | ` +
    `test ${(c.te.fav * 100).toFixed(1)}% (n=${c.te.n} med=${c.te.med.toFixed(1)}%) | ` +
    `min-excess +${(c.minExcess * 100).toFixed(1)}pt`
  );
}

// Deep copy để variant momentum không ảnh hưởng variant base
const ptsBase = pts.map((p) => ({ ...p, scores: { ...p.scores } }));
const ptsMom = pts.map((p) => ({ ...p, scores: { ...p.scores } }));
addMomentum(ptsMom);

const momCoverage = ptsMom.filter((p) => (p.scores as Record<string, number>)["momentum"] !== undefined).length;
console.log(
  `timeline: ${pts.length} điểm | có momentum: ${momCoverage} điểm ` +
    `(${((momCoverage / pts.length) * 100).toFixed(0)}%)`
);

// Phân phối momentum score
const dist: Record<number, number> = {};
for (const p of ptsMom) {
  const ms = (p.scores as Record<string, number>)["momentum"];
  if (ms !== undefined) dist[ms] = (dist[ms] ?? 0) + 1;
}
console.log("phân phối momentum:", Object.entries(dist).sort(([a], [b]) => +a - +b).map(([k, v]) => `${k}:${v}`).join(" "));

const results: Record<string, Record<H, number>> = {
  "base (3 tiêu chí)": {},
  "+momentum (4 tiêu chí)": {},
};

for (const [name, points, incMom] of [
  ["base (3 tiêu chí)", ptsBase, false],
  ["+momentum (4 tiêu chí)", ptsMom, true],
] as [string, TimelinePoint[], boolean][]) {
  console.log(`\n################ ${name} ################`);
  for (const h of ["21", "63", "126"] as H[]) {
    const label = { "21": "1 tháng ", "63": "3 tháng ", "126": "6 tháng " }[h];
    const { baseTrain, baseTest, candidates } = gridSearch(points, h, incMom);
    if (candidates.length === 0) {
      console.log(`${label}: KHÔNG cấu hình nào đạt chuẩn`);
      results[name][h] = 0;
      continue;
    }
    results[name][h] = candidates[0].minExcess;
    console.log(
      `${label} (baseline ${(baseTrain * 100).toFixed(1)}/${(baseTest * 100).toFixed(1)}%) BEST: ${fmtCand(candidates[0])}`
    );
  }
}

console.log("\n################ SO SÁNH MIN-EXCESS ################");
const base3 = results["base (3 tiêu chí)"];
const mom4 = results["+momentum (4 tiêu chí)"];
console.log(
  `${"Biến thể".padEnd(30)} ${"1 tháng".padStart(10)} ${"3 tháng".padStart(10)} ${"6 tháng".padStart(10)}`
);
for (const [name, r] of Object.entries(results)) {
  console.log(
    `${name.padEnd(30)} ${(r["21"] * 100).toFixed(1).padStart(10)}pt ${(r["63"] * 100).toFixed(1).padStart(9)}pt ${(r["126"] * 100).toFixed(1).padStart(9)}pt`
  );
}
const d21 = (mom4["21"] - base3["21"]) * 100;
const d63 = (mom4["63"] - base3["63"]) * 100;
const d126 = (mom4["126"] - base3["126"]) * 100;
console.log(
  `\nΔ +momentum vs base: ${d21 >= 0 ? "+" : ""}${d21.toFixed(1)}pt  ${d63 >= 0 ? "+" : ""}${d63.toFixed(1)}pt  ${d126 >= 0 ? "+" : ""}${d126.toFixed(1)}pt`
);
const improved = [d21, d63, d126].filter((d) => d > 0).length;
console.log(
  improved >= 2
    ? "→ KẾT LUẬN: momentum12m CẢI THIỆN ở đa số kỳ hạn — nên thêm vào engine."
    : improved === 1
      ? "→ KẾT LUẬN: momentum12m chỉ cải thiện 1 kỳ hạn — hiệu quả giới hạn."
      : "→ KẾT LUẬN: momentum12m KHÔNG cải thiện — bỏ qua."
);
