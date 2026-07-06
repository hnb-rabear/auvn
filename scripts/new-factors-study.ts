/**
 * Backtest 3 nguồn dữ liệu CHƯA từng thử: kỳ vọng lạm phát hòa vốn 10 năm
 * (FRED T10YIE), cung tiền M2 (FRED WM2NS, tuần), dầu WTI (Yahoo CL=F).
 * Mỗi tín hiệu ĐỨNG MỘT MÌNH, chấm điểm -2..+2 theo cùng khuôn "MA50 + đổi
 * %1-tháng" như macroCriterion (DXY), một giả thuyết hướng duy nhất mỗi biến
 * (không dò dấu để tránh p-hacking):
 *   - Breakeven tăng & vượt MA50 -> kỳ vọng lạm phát lên -> tốt cho vàng (+).
 *   - M2 tăng & vượt MA50 -> cung tiền nới lỏng -> tốt cho vàng (+).
 *   - WTI tăng & vượt MA50 -> áp lực lạm phát/risk -> tốt cho vàng (+).
 * Cùng bộ lọc 2 giai đoạn train(<2019)/test(>=2019) như single-factor-study.
 */
import { fetchXau, fetchBreakeven, fetchM2, fetchWti } from "./fetch";
import { sma } from "../src/lib/indicators";
import { stats, SPLIT_DATE, MIN_SIGNALS } from "./study-lib";

const WARMUP = 756;
const STEP = 3;
const HORIZONS = [21, 63, 126];

function trendScore(closes: number[], bullishWhenRising: boolean): number | null {
  if (closes.length < 51) return null;
  const last = closes[closes.length - 1];
  const ma50 = sma(closes, 50);
  if (ma50 == null) return null;
  const prev21 = closes[closes.length - 22];
  const chg = ((last - prev21) / prev21) * 100;
  const above = last > ma50;
  const raw = above && chg > 1 ? -2 : above ? -1 : !above && chg < -1 ? 2 : 1;
  return bullishWhenRising ? -raw : raw;
}

async function main() {
  const [xau, breakeven, m2, wti] = await Promise.all([
    fetchXau(),
    fetchBreakeven(),
    fetchM2(),
    fetchWti(),
  ]);
  if (!breakeven) throw new Error("thiếu T10YIE");
  if (!m2) throw new Error("thiếu WM2NS");
  if (!wti) throw new Error("thiếu CL=F");
  console.log(`nguồn: breakeven n=${breakeven.bars.length}, m2 n=${m2.bars.length}, wti n=${wti.bars.length}`);

  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  const variants: [string, (bePtr: number, m2Ptr: number, wtiPtr: number) => number | null][] = [
    ["Breakeven 10y (T10YIE)", (bePtr) => trendScore(breakeven.bars.slice(0, bePtr).map((b) => b.close), true)],
    ["Cung tiền M2 (WM2NS)  ", (_bp, m2Ptr) => trendScore(m2.bars.slice(0, m2Ptr).map((b) => b.close), true)],
    ["Dầu WTI (CL=F)        ", (_bp, _mp, wtiPtr) => trendScore(wti.bars.slice(0, wtiPtr).map((b) => b.close), true)],
  ];

  type Day = { date: string; score: number | null; rets: (number | null)[] };
  const table = new Map<string, Day[]>();
  let bePtr = 0;
  let m2Ptr = 0;
  let wtiPtr = 0;
  for (let i = WARMUP; i < closes.length; i += STEP) {
    const date = dates[i];
    while (bePtr < breakeven.bars.length && breakeven.bars[bePtr].date <= date) bePtr++;
    while (m2Ptr < m2.bars.length && m2.bars[m2Ptr].date <= date) m2Ptr++;
    while (wtiPtr < wti.bars.length && wti.bars[wtiPtr].date <= date) wtiPtr++;
    const rets = HORIZONS.map((h) => (i + h < closes.length ? (closes[i + h] / closes[i] - 1) * 100 : null));
    for (const [name, fn] of variants) {
      const arr = table.get(name) ?? [];
      arr.push({ date, score: fn(bePtr, m2Ptr, wtiPtr), rets });
      table.set(name, arr);
    }
  }

  for (const [hi, h] of HORIZONS.entries()) {
    console.log(`\n===== KỲ HẠN ${h} phiên =====`);
    const any = table.get(variants[0][0])!;
    const all = any.filter((d) => d.rets[hi] !== null);
    const baseTr = stats(all.filter((d) => d.date < SPLIT_DATE).map((d) => d.rets[hi]!)).fav;
    const baseTe = stats(all.filter((d) => d.date >= SPLIT_DATE).map((d) => d.rets[hi]!)).fav;
    console.log(`baseline train=${(baseTr * 100).toFixed(1)}% test=${(baseTe * 100).toFixed(1)}%`);
    for (const [name] of variants) {
      const days = table.get(name)!.filter((d) => d.score !== null && d.rets[hi] !== null);
      let best = "";
      let bestMin = -Infinity;
      for (const thr of [25, 40, 50, 75]) {
        const tr = stats(days.filter((d) => d.date < SPLIT_DATE && d.score! * 50 >= thr).map((d) => d.rets[hi]!));
        const te = stats(days.filter((d) => d.date >= SPLIT_DATE && d.score! * 50 >= thr).map((d) => d.rets[hi]!));
        if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
        const minEx = Math.min(tr.fav - baseTr, te.fav - baseTe);
        if (minEx > bestMin) {
          bestMin = minEx;
          best = `thr=${thr} train ${(tr.fav * 100).toFixed(1)}% (n=${tr.n}) test ${(te.fav * 100).toFixed(1)}% (n=${te.n}) min-excess ${minEx >= 0 ? "+" : ""}${(minEx * 100).toFixed(1)}pt`;
        }
      }
      console.log(`${name}: ${best || "không đạt chuẩn mẫu/baseline"}`);
    }
  }
}
main();
