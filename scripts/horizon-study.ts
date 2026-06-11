/** Khảo sát một lần: hiệu quả tín hiệu ở kỳ hạn 1/3/6/12 tháng. Không ghi file. */
import { fetchXau, fetchDxy, fetchFedFunds } from "./fetch";
import { runBacktest } from "./backtest";

async function main() {
  const [xau, dxy, fed] = await Promise.all([fetchXau(), fetchDxy(), fetchFedFunds()]);
  const { backtest } = runBacktest(xau.bars, dxy?.bars ?? null, fed, [21, 63, 126, 252]);
  const label = (h: number) =>
    ({ 21: "1 tháng", 63: "3 tháng", 126: "6 tháng", 252: "12 tháng" })[h];
  for (const b of backtest.buckets) {
    if (b.count === 0) continue;
    console.log(
      `${b.zone.padEnd(11)} ${label(b.horizonDays)?.padEnd(9)} n=${String(b.count).padStart(4)}  thuận chiều=${b.pctFavorable ?? "—"}%  trung vị=${b.medianReturnPct}%`
    );
  }
}
main();
