/** Đối chiếu PRESETS[].evidence với tính lại bằng presetComposite trên timeline hiện tại
 *  (kỷ luật backtest: số hiển thị không được trôi khỏi dữ liệu). Chạy sau collect. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRESETS, presetComposite, type Timeline } from "../src/lib/types";
import { SPLIT_DATE, stats, type H } from "./study-lib";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
for (const p of PRESETS) {
  const h = String(p.horizonDays) as H;
  const pts = tl.points.filter((q) => q.returns[h] !== null);
  const hit = (seg: typeof pts) =>
    seg.filter((q) => presetComposite(q.scores, p) >= p.buyThreshold).map((q) => q.returns[h] as number);
  const tr = stats(hit(pts.filter((q) => q.date < SPLIT_DATE)));
  const te = stats(hit(pts.filter((q) => q.date >= SPLIT_DATE)));
  const trB = stats(pts.filter((q) => q.date < SPLIT_DATE).map((q) => q.returns[h] as number));
  const teB = stats(pts.filter((q) => q.date >= SPLIT_DATE).map((q) => q.returns[h] as number));
  const f = (x: number) => +(x * 100).toFixed(1);
  const got = {
    trainFav: f(tr.fav), trainN: tr.n, trainBaseline: f(trB.fav),
    testFav: f(te.fav), testN: te.n, testBaseline: f(teB.fav),
    medianTestReturnPct: +te.med.toFixed(1),
  };
  const diff = Object.entries(got).filter(([k, v]) => (p.evidence as Record<string, number>)[k] !== v);
  console.log(`${p.id}: ${diff.length ? "LỆCH " + JSON.stringify(Object.fromEntries(diff.map(([k, v]) => [k, `${(p.evidence as Record<string, number>)[k]}→${v}`]))) : "khớp"} | ${JSON.stringify(got)}`);
}
