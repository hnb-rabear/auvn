/**
 * Ablation: tín hiệu động lượng 12 tháng (trend-following) có cải thiện độ chính xác
 * tín hiệu mua không? So sánh:
 *   base+yield  — cấu hình hiện tại tốt nhất (theo factor-study.ts v2)
 *   +momentum   — thêm động lượng XAU 12 tháng như tiêu chí thứ 4
 *
 * Grid search 4 chiều: technical / stats / macro / momentum (tổng = 1, bước 10%).
 * Kết quả tốt hơn base+yield ở đa số kỳ hạn → giữ lại tín hiệu.
 */
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";
import { runBacktest } from "./backtest";
import { SPLIT_DATE, MIN_SIGNALS, stats } from "./study-lib";
import type { TimelinePoint } from "../src/lib/types";

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

function gridSearch4(points: TimelinePoint[], h: H) {
  const pts = points.filter((p) => p.returns[h] !== null);
  const train = pts.filter((p) => p.date < SPLIT_DATE);
  const test = pts.filter((p) => p.date >= SPLIT_DATE);
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

  for (let wt = 0; wt <= 10; wt++) {
    for (let ws = 0; ws <= 10 - wt; ws++) {
      for (let wmom = 0; wmom <= 10 - wt - ws; wmom++) {
        const wm = 10 - wt - ws - wmom;
        const w = { technical: wt / 10, stats: ws / 10, macro: wm / 10, momentum: wmom / 10 };
        for (const thr of [30, 40, 50, 60]) {
          const tr = stats(
            train.filter((p) => composite4(p, w) >= thr).map((p) => p.returns[h] as number)
          );
          const te = stats(
            test.filter((p) => composite4(p, w) >= thr).map((p) => p.returns[h] as number)
          );
          if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
          const exTr = tr.fav - baseTrain;
          const exTe = te.fav - baseTest;
          if (exTr <= 0 || exTe <= 0) continue;
          candidates.push({ w, thr, tr, te, minExcess: Math.min(exTr, exTe) });
        }
      }
    }
  }
  candidates.sort((a, b) => b.minExcess - a.minExcess);
  return { baseTrain, baseTest, candidates };
}

function fmtW(w: Record<string, number>) {
  const keys = ["technical", "stats", "macro", "momentum"];
  return keys.map((k) => `${k.substring(0, 3)}:${w[k] ?? 0}`).join(" ");
}

async function main() {
  const [xau, dxy, fed, yield10y] = await Promise.all([
    fetchXau(),
    fetchDxy(),
    fetchFedFunds(),
    fetchYield10y(),
  ]);
  console.log(
    `dữ liệu: xau=${xau.bars.length} dxy=${dxy?.bars.length} fed=${fed?.length} yield=${yield10y?.bars.length ?? "NULL"}`
  );

  const variants: [string, boolean][] = [
    ["base+yield (hiện tại)", false],
    ["base+yield+momentum12m", true],
  ];

  const results: Record<string, Record<H, number>> = {};

  for (const [name, useMom] of variants) {
    console.log(`\n################ ${name} ################`);
    const { timeline } = runBacktest(xau.bars, dxy?.bars ?? null, fed, undefined, {
      yield10y,
      momentum12m: useMom,
    });

    results[name] = {} as Record<H, number>;

    for (const h of ["21", "63", "126"] as H[]) {
      const label = { "21": "1 tháng ", "63": "3 tháng ", "126": "6 tháng " }[h];
      const { baseTrain, baseTest, candidates } = gridSearch4(timeline.points, h);

      if (candidates.length === 0) {
        console.log(`${label}: KHÔNG cấu hình nào đạt chuẩn`);
        results[name][h] = 0;
        continue;
      }
      const best = candidates[0];
      results[name][h] = best.minExcess;
      console.log(
        `${label} (baseline ${(baseTrain * 100).toFixed(1)}/${(baseTest * 100).toFixed(1)}%) ` +
          `BEST: w=${fmtW(best.w)} thr=${best.thr} | ` +
          `train ${(best.tr.fav * 100).toFixed(1)}% (n=${best.tr.n}) | ` +
          `test ${(best.te.fav * 100).toFixed(1)}% (n=${best.te.n} med=${best.te.med.toFixed(1)}%) | ` +
          `min-excess +${(best.minExcess * 100).toFixed(1)}pt`
      );
    }
  }

  console.log("\n################ SO SÁNH MIN-EXCESS ################");
  console.log(
    `${"Biến thể".padEnd(35)} ${"1 tháng".padStart(10)} ${"3 tháng".padStart(10)} ${"6 tháng".padStart(10)}`
  );
  for (const [name, r] of Object.entries(results)) {
    console.log(
      `${name.padEnd(35)} ${(r["21"] * 100).toFixed(1).padStart(10)}pt ${(r["63"] * 100).toFixed(1).padStart(9)}pt ${(r["126"] * 100).toFixed(1).padStart(9)}pt`
    );
  }
  const base = results["base+yield (hiện tại)"];
  const mom = results["base+yield+momentum12m"];
  if (base && mom) {
    const delta21 = (mom["21"] - base["21"]) * 100;
    const delta63 = (mom["63"] - base["63"]) * 100;
    const delta126 = (mom["126"] - base["126"]) * 100;
    console.log(
      `\nΔ momentum vs base:  ${delta21 >= 0 ? "+" : ""}${delta21.toFixed(1)}pt  ${delta63 >= 0 ? "+" : ""}${delta63.toFixed(1)}pt  ${delta126 >= 0 ? "+" : ""}${delta126.toFixed(1)}pt`
    );
    const improved = [delta21, delta63, delta126].filter((d) => d > 0).length;
    console.log(
      improved >= 2
        ? "→ KẾT LUẬN: momentum12m CẢI THIỆN ở đa số kỳ hạn — nên giữ lại."
        : "→ KẾT LUẬN: momentum12m KHÔNG cải thiện rõ — bỏ qua hoặc test thêm."
    );
  }
}

main();
