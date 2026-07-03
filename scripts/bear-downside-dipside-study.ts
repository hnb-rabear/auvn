/**
 * Study: cột ĐÁY (worst-dip) của Bear Downside nên dùng trọng số nào?
 *
 * Câu hỏi (review 2026-07-03): recency-weighting áp cả cột rủi ro — sau 2 năm bull,
 * đáy điển hình/p10 co lại đúng lúc rủi ro đảo chế độ cao nhất. Đề xuất A2: cột đáy
 * dùng unweighted hoặc min(weighted, unweighted) làm "đối trọng bảo thủ".
 *
 * Kiểm bằng walk-forward trên timeline.json (giá XAU daily 2009+): tại mỗi ngày X
 * (lưới thưa STEP=3, đủ enoughSamples), tính dải as-of y hệt engine rồi so với đáy
 * THỰC TẾ sau X. Ba biến thể: W = recency-504 (đang chạy), U = unweighted, M = min(W,U).
 * Thước đo, tách train(<2019)/test(≥2019):
 *   - exceed% = % lần đáy thực SÂU hơn p10 (mục tiêu ~10% — thấp hơn nhiều là quá bảo thủ)
 *   - MAE & bias của median dip vs đáy thực
 *
 * Chạy: npx tsx scripts/bear-downside-dipside-study.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { computeHorizonStat, furtherDrawdownPct, enoughSamples, HORIZONS, STEP } from "../src/lib/bear-downside";
import { BEAR_DOWNSIDE_CONFIG } from "../src/lib/types";

const t = JSON.parse(readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8"));
const closes: number[] = t.points.map((p: { price: number }) => p.price);
const dates: string[] = t.points.map((p: { date: string }) => p.date);
const n = closes.length;
const hl = BEAR_DOWNSIDE_CONFIG.recencyHalflife ?? 0;
const SPLIT = "2019-01-01";

interface Acc { exceedW: number; exceedU: number; exceedM: number; maeW: number; maeU: number; biasW: number; biasU: number; n: number }
const mk = (): Acc => ({ exceedW: 0, exceedU: 0, exceedM: 0, maeW: 0, maeU: 0, biasW: 0, biasU: 0, n: 0 });

for (const H of HORIZONS) {
  const acc: Record<"train" | "test", Acc> = { train: mk(), test: mk() };
  for (let X = 0; X < n; X += STEP) {
    const actual = furtherDrawdownPct(closes, X, H);
    if (actual === null) continue;
    const dips: number[] = [];
    const ages: number[] = [];
    for (let j = 0; j <= X; j += STEP) {
      if (j + H > X) continue;
      const fd = furtherDrawdownPct(closes, j, H);
      if (fd === null) continue;
      dips.push(fd);
      ages.push(X - j);
    }
    if (!enoughSamples(dips.length, H)) continue;
    const sW = computeHorizonStat(dips, H, [], true, { ages, halflife: hl });
    const sU = computeHorizonStat(dips, H, [], true);
    const a = acc[dates[X] < SPLIT ? "train" : "test"];
    a.n++;
    if (actual < sW.p10) a.exceedW++;
    if (actual < sU.p10) a.exceedU++;
    if (actual < Math.min(sW.p10, sU.p10)) a.exceedM++;
    a.maeW += Math.abs(sW.median - actual);
    a.maeU += Math.abs(sU.median - actual);
    a.biasW += sW.median - actual;
    a.biasU += sU.median - actual;
  }
  console.log(`\n== H=${H} ==`);
  for (const era of ["train", "test"] as const) {
    const a = acc[era];
    if (a.n === 0) { console.log(`${era}: n=0`); continue; }
    const p = (x: number) => ((x / a.n) * 100).toFixed(1);
    const m = (x: number) => (x / a.n).toFixed(2);
    console.log(
      `${era} (n=${a.n}): exceed% [muc tieu ~10] W=${p(a.exceedW)} U=${p(a.exceedU)} min=${p(a.exceedM)} | ` +
      `MAE median: W=${m(a.maeW)} U=${m(a.maeU)} | bias(median-actual): W=${m(a.biasW)} U=${m(a.biasU)}`
    );
  }
}
console.log(
  "\nDoc ket qua: neu exceed% cua W ~10% o ca train/test thi cot day hien tai da khop; " +
  "U/min keo exceed% xuong sau duoi 10% = qua bao thu (day dien hinh sau hon thuc te he thong)."
);
