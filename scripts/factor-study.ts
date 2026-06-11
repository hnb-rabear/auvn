/**
 * Ablation study: tín hiệu mới nào (lợi suất 10y, VIX, GPR) thật sự cải thiện
 * độ chính xác tín hiệu mua? Chạy backtest 5 biến thể (base / +yield / +vix /
 * +gpr / all), grid search từng biến thể với cùng bộ lọc 2 giai đoạn, so sánh
 * cấu hình tốt nhất theo min-excess. Tín hiệu chỉ được giữ nếu biến thể chứa nó
 * cho min-excess cao hơn base ở đa số kỳ hạn.
 */
import {
  fetchXau,
  fetchDxy,
  fetchFedFunds,
  fetchYield10y,
  fetchVix,
  fetchGpr,
} from "./fetch";
import { runBacktest, type BacktestExtras } from "./backtest";
import { gridSearch, fmtCand, type H } from "./study-lib";

async function main() {
  const [xau, dxy, fed, yield10y, vix, gpr] = await Promise.all([
    fetchXau(),
    fetchDxy(),
    fetchFedFunds(),
    fetchYield10y(),
    fetchVix(),
    fetchGpr(),
  ]);
  console.log(
    `nguồn: xau=${xau.bars.length} dxy=${dxy?.bars.length} fed=${fed?.length} ` +
      `yield=${yield10y ? `${yield10y.bars.length}(real=${yield10y.real})` : "NULL"} ` +
      `vix=${vix?.bars.length ?? "NULL"} gpr=${gpr?.bars.length ?? "NULL"}`
  );

  const variants: [string, BacktestExtras][] = [
    ["base", {}],
    ["+yield", { yield10y }],
    ["+vix", { vix: vix?.bars }],
    ["+gpr", { gpr: gpr?.bars }],
    ["yield+vix", { yield10y, vix: vix?.bars }],
    ["all", { yield10y, vix: vix?.bars, gpr: gpr?.bars }],
  ];

  for (const [name, extras] of variants) {
    console.log(`\n################ BIẾN THỂ: ${name} ################`);
    const { timeline } = runBacktest(xau.bars, dxy?.bars ?? null, fed, undefined, extras);
    for (const h of ["21", "63", "126"] as H[]) {
      const { baseTrain, baseTest, candidates } = gridSearch(timeline.points, h);
      const label = { "21": "1 tháng ", "63": "3 tháng ", "126": "6 tháng " }[h];
      if (candidates.length === 0) {
        console.log(`${label}: KHÔNG cấu hình nào đạt chuẩn`);
        continue;
      }
      console.log(
        `${label} (baseline ${(baseTrain * 100).toFixed(1)}/${(baseTest * 100).toFixed(1)}%) BEST: ${fmtCand(candidates[0])}`
      );
    }
  }
}
main();
