/**
 * Walk-forward selection study — đo phần "selection bias" mà docs/presets.md Giới hạn #2
 * tự thú nhưng CHƯA AI ĐO.
 *
 * Vấn đề: PRESETS v4/v4.1 được chọn bằng grid 6D chạy trên TOÀN BỘ lịch sử, và luật chọn
 * ghi thẳng trong types.ts là "ưu tiên cấu hình bắn được 2023" — tức có nhìn kết quả test
 * lúc chọn. Mọi con số % trong repo vì thế là ước lượng LẠC QUAN, chưa biết lạc quan bao nhiêu.
 *
 * Cách đo: mô phỏng đúng việc mình sẽ làm nếu chỉ có dữ liệu tới năm Y — chọn cấu hình tốt
 * nhất trên dữ liệu ≤ Y (nhãn đã đáo hạn), rồi chấm nó trên năm Y+1 mà nó CHƯA TỪNG thấy.
 * Lăn Y qua từng năm, gộp lại. So 3 mốc:
 *   (a) walk-forward  — chọn past-only, chấm năm kế tiếp
 *   (b) PRESETS ship  — cấu hình đang phát hành, chấm trên cùng các năm đó
 *   (c) placebo       — cấu hình NGẪU NHIÊN trong lưới, cùng các năm, cùng số lần chọn
 *
 * ĐỌC KẾT QUẢ CHO ĐÚNG (giới hạn đã biết trước khi chạy): số fold năm không phải số mẫu độc
 * lập — cụm tín hiệu độc lập toàn lịch sử chỉ 10–15/giai đoạn (xem CLAUDE.md "Independent-
 * cluster counts"), nhiều fold sẽ có 0 tín hiệu. Vì vậy đầu ra chính của script này KHÔNG
 * phải một con số % kèm CI, mà là:
 *   1. excess walk-forward gộp có > 0 không, và so với placebo thế nào;
 *   2. TÍNH ỔN ĐỊNH của việc tuyển chọn — mỗi fold chọn ra cấu hình gì, có hội tụ không.
 * Nếu cấu hình thắng nhảy lung tung qua các fold thì bản thân quy trình tuyển chọn là nhiễu,
 * bất kể con số cuối đẹp hay xấu.
 *
 * Offline: chỉ đọc public/data/timeline.json (đã có sẵn sub-score dxy/fed/yield10y).
 * Chạy: npx tsx scripts/preset-walkforward-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRESETS, presetComposite, type Timeline, type TimelinePoint } from "../src/lib/types";
import { countClusters, seededRandom, type H } from "./study-lib";

const MIN_SIGNALS_TRAIN = 25; // như lúc tuyển chọn gốc
const STEP_W = 2; // bước lưới trọng số 0.2 (lưới gốc 0.1 = 3003 cấu hình × 12 fold quá chậm)

type Pt = TimelinePoint & { scores: Record<string, number> };

/** Lưới 6D: technical/stats/momentum/dxy/fed/yield10y, tổng = 1. */
function weightSets(): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  const N = 10;
  for (let wt = 0; wt <= N; wt += STEP_W)
    for (let ws = 0; ws <= N - wt; ws += STEP_W)
      for (let wm = 0; wm <= N - wt - ws; wm += STEP_W)
        for (let wd = 0; wd <= N - wt - ws - wm; wd += STEP_W)
          for (let wf = 0; wf <= N - wt - ws - wm - wd; wf += STEP_W) {
            const wy = N - wt - ws - wm - wd - wf;
            if (wy % STEP_W !== 0) continue;
            out.push({
              technical: wt / N, stats: ws / N, momentum: wm / N,
              dxy: wd / N, fed: wf / N, yield10y: wy / N,
            });
          }
  return out;
}

/** Chấm composite bằng ĐÚNG hàm của engine (presetComposite) để chart ≡ card ≡ study. */
function scoreOf(p: Pt, w: Record<string, number>): number {
  return presetComposite(p.scores, {
    weights: { technical: w.technical, premium: 0, macro: 0, stats: w.stats, momentum: w.momentum },
    macroSub: { dxy: w.dxy, fed: w.fed, yield10y: w.yield10y },
  });
}

interface Hit { fav: number; n: number }
function evalOn(pts: Pt[], h: H, w: Record<string, number>, thr: number): Hit {
  let fav = 0, n = 0;
  for (const p of pts) {
    if (p.returns[h] === null) continue;
    if (scoreOf(p, w) >= thr) {
      n++;
      if ((p.returns[h] as number) > 0) fav++;
    }
  }
  return { fav: n ? fav / n : 0, n };
}
const baselineOf = (pts: Pt[], h: H): Hit => {
  let fav = 0, n = 0;
  for (const p of pts) {
    if (p.returns[h] === null) continue;
    n++;
    if ((p.returns[h] as number) > 0) fav++;
  }
  return { fav: n ? fav / n : 0, n };
};

const KEY = { technical: "KT", stats: "TK", momentum: "MOM", dxy: "DXY", fed: "FED", yield10y: "YLD" } as const;
const fmtW = (w: Record<string, number>) =>
  Object.entries(w).filter(([, v]) => v > 0).map(([k, v]) => `${KEY[k as keyof typeof KEY]}:${v}`).join(" ");

function main() {
  const tl: Timeline = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8"));
  const pts = tl.points as Pt[];
  const grid = weightSets();
  const THRS = [30, 40, 50, 60];
  console.log(`timeline ${pts.length} điểm | lưới ${grid.length} trọng số × ${THRS.length} ngưỡng = ${grid.length * THRS.length} cấu hình/fold\n`);

  const years = [...new Set(pts.map((p) => p.date.slice(0, 4)))].sort();
  const rand = seededRandom(20260914);

  for (const preset of PRESETS) {
    const h = String(preset.horizonDays) as H;
    const hd = preset.horizonDays;
    console.log(`\n=== ${preset.id} (H=${hd} phiên) ===`);

    // gộp kết quả out-of-sample qua mọi fold
    const wfHits: { fav: boolean; idx: number }[] = [];
    const shipHits: { fav: boolean; idx: number }[] = [];
    const plaHits: { fav: boolean; idx: number }[] = [];
    let baseFav = 0, baseN = 0;
    const picks: string[] = [];

    for (let k = 0; k < years.length; k++) {
      const y = years[k];
      // TRAIN: mọi ngày trước năm y VÀ nhãn đã đáo hạn trước đầu năm y (purge chống rò).
      const cut = `${y}-01-01`;
      const train = pts.filter((p, i) => p.date < cut && i + hd < pts.length && pts[i + hd].date < cut);
      const fold = pts.filter((p) => p.date.slice(0, 4) === y && p.returns[h] !== null);
      if (train.length < 250 || fold.length === 0) continue;

      const trBase = baselineOf(train, h).fav;
      let best: { w: Record<string, number>; thr: number; ex: number } | null = null;
      for (const w of grid) {
        for (const thr of THRS) {
          const r = evalOn(train, h, w, thr);
          if (r.n < MIN_SIGNALS_TRAIN) continue;
          const ex = r.fav - trBase;
          if (!best || ex > best.ex) best = { w, thr, ex };
        }
      }
      if (!best) continue;
      picks.push(`${y}: ${fmtW(best.w)} thr=${best.thr} (train +${(best.ex * 100).toFixed(1)}pt)`);

      // placebo: một cấu hình NGẪU NHIÊN trong cùng lưới, chọn mù
      const pw = grid[Math.floor(rand() * grid.length)];
      const pthr = THRS[Math.floor(rand() * THRS.length)];

      for (const p of fold) {
        const i = pts.indexOf(p);
        const fav = (p.returns[h] as number) > 0;
        baseN++; if (fav) baseFav++;
        if (scoreOf(p, best.w) >= best.thr) wfHits.push({ fav, idx: i });
        if (presetComposite(p.scores, preset) >= preset.buyThreshold) shipHits.push({ fav, idx: i });
        if (scoreOf(p, pw) >= pthr) plaHits.push({ fav, idx: i });
      }
    }

    const base = baseN ? baseFav / baseN : 0;
    const show = (label: string, hits: { fav: boolean; idx: number }[]) => {
      if (!hits.length) return console.log(`  ${label.padEnd(14)} — không tín hiệu nào`);
      const fav = hits.filter((x) => x.fav).length / hits.length;
      const cl = countClusters(hits.map((x) => x.idx), hd);
      console.log(
        `  ${label.padEnd(14)} ${(fav * 100).toFixed(1)}% (n=${hits.length} ngày, ${cl} đợt độc lập) | ` +
          `excess ${fav - base >= 0 ? "+" : ""}${((fav - base) * 100).toFixed(1)}pt`
      );
    };
    console.log(`  baseline       ${(base * 100).toFixed(1)}% (n=${baseN})`);
    show("walk-forward", wfHits);
    show("PRESETS ship", shipHits);
    show("placebo", plaHits);

    console.log(`  — cấu hình thắng mỗi fold (ổn định hay nhiễu?):`);
    for (const s of picks) console.log(`      ${s}`);
  }
}

main();
