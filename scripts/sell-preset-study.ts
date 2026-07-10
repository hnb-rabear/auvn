/**
 * Sell-preset study — lần đầu TUYỂN CHỌN cấu hình cho PHÍA BÁN của composite.
 *
 * Bối cảnh: sell side composite mặc định NGƯỢC ở kỳ hạn dài (test 126p: 69% giá
 * TĂNG sau "bán", med +15,2%) nên bị hạ xuống "gió ngược". Nhưng mọi grid search
 * trước đây (presets-study, macro-decomp) đều tuyển cho phía MUA — chưa ai hỏi:
 * có tổ hợp trọng số + ngưỡng nào làm tín hiệu BÁN đúng (giá GIẢM sau H phiên)
 * vượt baseline + placebo ở cả train lẫn test không?
 *
 * Khung: grid 6D (KT/TK/MOM/DXY/FED/YLD) bước 10% × ngưỡng bán −30/−40/−50/−60
 * × H ∈ {21, 63, 126}. Tín hiệu = composite ≤ thr. Objective fav-down =
 * P(lợi suất sau H < 0). Cổng: n ≥ 25 cả hai era, excess > 0 cả hai era
 * (fav-down − base-down), xếp min-excess; ứng viên top so thêm với placebo
 * cùng-n (200 lần bốc ngày ngẫu nhiên mỗi era, phải vượt p95 placebo).
 *
 * Dữ liệu: public/data/timeline.json (v4 đã kèm sub-score dxy/fed/yield10y).
 * Chạy: npx tsx scripts/sell-preset-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPLIT_DATE, MIN_SIGNALS, stats } from "./study-lib";
import { seededRandom } from "../src/lib/indicators";
import type { TimelinePoint } from "../src/lib/types";

type H = "21" | "63" | "126";
const HS: H[] = ["21", "63", "126"];

interface Pt {
  date: string;
  scores: Record<string, number>;
  returns: Record<H, number | null>;
}

function composite(p: Pt, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (wk === 0) continue;
    const score = p.scores[k];
    if (score === undefined) continue;
    s += score * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

/** fav-down: tỉ lệ ngày có lợi suất sau H < 0 (bán đúng = giá giảm). */
function statsDown(rets: number[]) {
  if (rets.length === 0) return { n: 0, fav: 0, med: 0 };
  const fav = rets.filter((r) => r < 0).length / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  return { n: rets.length, fav, med: sorted[Math.floor(sorted.length / 2)] };
}

function weightSets6(): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (let wt = 0; wt <= 10; wt++)
    for (let ws = 0; ws <= 10 - wt; ws++)
      for (let wmom = 0; wmom <= 10 - wt - ws; wmom++)
        for (let wd = 0; wd <= 10 - wt - ws - wmom; wd++)
          for (let wf = 0; wf <= 10 - wt - ws - wmom - wd; wf++) {
            const wy = 10 - wt - ws - wmom - wd - wf;
            out.push({
              technical: wt / 10,
              stats: ws / 10,
              momentum: wmom / 10,
              dxy: wd / 10,
              fed: wf / 10,
              yield10y: wy / 10,
            });
          }
  return out;
}

const KEY_LABEL: Record<string, string> = {
  technical: "KT",
  stats: "TK",
  momentum: "MOM",
  dxy: "DXY",
  fed: "FED",
  yield10y: "YLD",
};
const fmtW = (w: Record<string, number>) =>
  Object.entries(w)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${KEY_LABEL[k]}:${v}`)
    .join(" ");

interface Cand {
  w: Record<string, number>;
  thr: number;
  tr: ReturnType<typeof statsDown>;
  te: ReturnType<typeof statsDown>;
  minExcess: number;
}

const fmtCand = (c: Cand, baseTr: number, baseTe: number) =>
  `w=${fmtW(c.w)} thr=${c.thr} | train ${(c.tr.fav * 100).toFixed(1)}% (n=${c.tr.n}, bl ${(baseTr * 100).toFixed(1)}%) | ` +
  `test ${(c.te.fav * 100).toFixed(1)}% (n=${c.te.n} med=${c.te.med.toFixed(1)}%, bl ${(baseTe * 100).toFixed(1)}%) | min-excess +${(c.minExcess * 100).toFixed(1)}pt`;

function main() {
  const tl: { points: TimelinePoint[] } = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
  );
  const points: Pt[] = tl.points.map((p) => ({
    date: p.date,
    scores: p.scores as Record<string, number>,
    returns: p.returns as Record<H, number | null>,
  }));
  const cov = (k: string) => points.filter((p) => p.scores[k] !== undefined).length;
  console.log(
    `timeline ${points.length} điểm (${points[0].date} → ${points[points.length - 1].date}) | ` +
      `phủ sub-score: dxy ${cov("dxy")} fed ${cov("fed")} yield ${cov("yield10y")} mom ${cov("momentum")}`
  );
  if (cov("dxy") < points.length * 0.8)
    console.log("⚠ timeline thiếu sub-score vĩ mô ở nhiều điểm — chạy `npm run collect` trước khi tin kết quả.");

  const ws6 = weightSets6();
  console.log(`grid 6D: ${ws6.length} bộ trọng số × 4 ngưỡng bán × ${HS.length} kỳ hạn\n`);

  for (const h of HS) {
    const valid = points.filter((p) => p.returns[h] !== null);
    const train = valid.filter((p) => p.date < SPLIT_DATE);
    const test = valid.filter((p) => p.date >= SPLIT_DATE);
    const baseTrain = statsDown(train.map((p) => p.returns[h] as number)).fav;
    const baseTest = statsDown(test.map((p) => p.returns[h] as number)).fav;

    const candidates: Cand[] = [];
    for (const w of ws6) {
      for (const thr of [-30, -40, -50, -60]) {
        const tr = statsDown(train.filter((p) => composite(p, w) <= thr).map((p) => p.returns[h] as number));
        const te = statsDown(test.filter((p) => composite(p, w) <= thr).map((p) => p.returns[h] as number));
        if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
        const exTr = tr.fav - baseTrain;
        const exTe = te.fav - baseTest;
        if (exTr <= 0 || exTe <= 0) continue;
        candidates.push({ w, thr, tr, te, minExcess: Math.min(exTr, exTe) });
      }
    }
    candidates.sort((a, b) => b.minExcess - a.minExcess);

    console.log(`================ H${h} (baseline down: train ${(baseTrain * 100).toFixed(1)}% / test ${(baseTest * 100).toFixed(1)}%) ================`);
    if (!candidates.length) {
      console.log("  KHÔNG cấu hình nào qua cổng 2 giai đoạn (excess>0 cả train lẫn test, n≥25).");
      // chẩn đoán: nới cổng — chỉ cần n≥25, xếp theo min-excess bất kể dấu
      let diag: Cand | null = null;
      for (const w of ws6) {
        for (const thr of [-30, -40, -50, -60]) {
          const tr = statsDown(train.filter((p) => composite(p, w) <= thr).map((p) => p.returns[h] as number));
          const te = statsDown(test.filter((p) => composite(p, w) <= thr).map((p) => p.returns[h] as number));
          if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
          const minEx = Math.min(tr.fav - baseTrain, te.fav - baseTest);
          if (!diag || minEx > diag.minExcess) diag = { w, thr, tr, te, minExcess: minEx };
        }
      }
      if (diag) console.log(`  chẩn đoán (tốt nhất bất kể dấu): ${fmtCand(diag, baseTrain, baseTest)}`);
      console.log("");
      continue;
    }

    console.log("  top-5 qua cổng:");
    for (const c of candidates.slice(0, 5)) console.log(`    ${fmtCand(c, baseTrain, baseTest)}`);

    // placebo cùng-n cho top-1: 200 lần bốc ngẫu nhiên n ngày mỗi era
    const top = candidates[0];
    const rand = seededRandom(20260710);
    const draw = (pool: Pt[], n: number) => {
      const rets: number[] = [];
      for (let k = 0; k < n; k++) rets.push(pool[Math.floor(rand() * pool.length)].returns[h] as number);
      return statsDown(rets).fav;
    };
    const plaTr: number[] = [];
    const plaTe: number[] = [];
    for (let d = 0; d < 200; d++) {
      plaTr.push(draw(train, top.tr.n));
      plaTe.push(draw(test, top.te.n));
    }
    const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];
    const beatTr = top.tr.fav > p95(plaTr);
    const beatTe = top.te.fav > p95(plaTe);
    console.log(
      `  placebo cùng-n (200 draws): train p95=${(p95(plaTr) * 100).toFixed(1)}% → ${beatTr ? "THẮNG" : "thua"} | ` +
        `test p95=${(p95(plaTe) * 100).toFixed(1)}% → ${beatTe ? "THẮNG" : "thua"}`
    );

    // tách đôi test
    const halves: [string, string, string][] = [
      ["test-a 2019-2022", "2019-01-01", "2023-01-01"],
      ["test-b 2023-2026", "2023-01-01", "2027-01-01"],
    ];
    const parts = halves.map(([nm, d0, d1]) => {
      const win = valid.filter((p) => p.date >= d0 && p.date < d1);
      const bl = statsDown(win.map((p) => p.returns[h] as number)).fav;
      const sg = statsDown(win.filter((p) => composite(p, top.w) <= top.thr).map((p) => p.returns[h] as number));
      return `${nm}: ${sg.n ? `${(sg.fav * 100).toFixed(0)}% xuống (n=${sg.n}) vs bl ${(bl * 100).toFixed(0)}% → ${sg.fav > bl ? "THẮNG" : "thua"}` : "0 tín hiệu"}`;
    });
    console.log(`  tách đôi test (top-1): ${parts.join(" | ")}`);

    // phân bố năm
    const byYear: Record<string, number> = {};
    for (const p of valid) {
      if (composite(p, top.w) <= top.thr) {
        const y = p.date.slice(0, 4);
        byYear[y] = (byYear[y] ?? 0) + 1;
      }
    }
    console.log(`  năm bắn (top-1): ${Object.entries(byYear).map(([y, n]) => `${y.slice(2)}:${n}`).join(" ")}`);
    console.log("");
  }
}

main();
