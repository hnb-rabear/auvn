/**
 * Đo tác động của việc sửa look-ahead FEDFUNDS lên evidence của PRESETS, KHÔNG cần
 * chạy lại backtest đầy đủ: tính lại điểm `fed` cho từng điểm timeline theo hai quy
 * ước nhãn (quan sát = cũ, khả dụng = mới), rồi chấm lại presetComposite.
 *
 * Cache trên đĩa đã được migrate sang nhãn khả dụng, nên bản "cũ" dựng lại bằng
 * cách lùi nhãn 1 tháng — đúng nghịch đảo của fetchFedFunds.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRESETS, presetComposite, type Timeline } from "../src/lib/types";
import { SPLIT_DATE, stats, type H } from "./study-lib";

type Row = { date: string; value: number };

/** Nghịch đảo nextMonthStart: "2026-09-01" -> "2026-08-01". */
function prevMonthStart(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
}

/** Bản sao fedScore của criteria.ts / macro-decomp-study.ts (Δ3 tháng). */
function fedScore(rates: number[]): number | null {
  if (rates.length < 4) return null;
  const d = rates[rates.length - 1] - rates[rates.length - 4];
  if (d <= -0.25) return 2;
  if (d < 0) return 1;
  if (d === 0) return 0;
  if (d < 0.25) return -1;
  return -2;
}

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const avail: Row[] = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "history", "fed-funds.json"), "utf8")
);
const observed: Row[] = avail.map((r) => ({ date: prevMonthStart(r.date), value: r.value }));

/** Điểm fed tại mỗi ngày timeline theo một bộ nhãn. */
function fedScoresAt(rows: Row[]): (number | null)[] {
  const out: (number | null)[] = [];
  let i = 0;
  const rates: number[] = [];
  for (const p of tl.points) {
    while (i < rows.length && rows[i].date <= p.date) rates.push(rows[i++].value);
    out.push(fedScore(rates));
  }
  return out;
}

const sOld = fedScoresAt(observed);
const sNew = fedScoresAt(avail);
const changed = sOld.filter((v, i) => v !== sNew[i]).length;
console.log(`timeline ${tl.points.length} điểm — điểm fed đổi: ${changed} (${((changed / tl.points.length) * 100).toFixed(1)}%)`);

const f = (x: number) => +(x * 100).toFixed(1);
console.log("\npreset | giai đoạn | fav cũ → mới | n cũ → mới");
for (const p of PRESETS) {
  const h = String(p.horizonDays) as H;
  // Chấm lại với điểm fed thay thế; các score khác giữ nguyên.
  const scored = tl.points.map((q, i) => ({
    date: q.date,
    ret: q.returns[h],
    old: presetComposite({ ...q.scores, fed: sOld[i] ?? q.scores.fed }, p),
    neu: presetComposite({ ...q.scores, fed: sNew[i] ?? q.scores.fed }, p),
  }));
  const usable = scored.filter((q) => q.ret !== null);
  for (const [label, seg] of [
    ["train", usable.filter((q) => q.date < SPLIT_DATE)],
    ["test ", usable.filter((q) => q.date >= SPLIT_DATE)],
  ] as const) {
    const a = stats(seg.filter((q) => q.old >= p.buyThreshold).map((q) => q.ret as number));
    const b = stats(seg.filter((q) => q.neu >= p.buyThreshold).map((q) => q.ret as number));
    console.log(
      `${p.id.padEnd(3)} | ${label} | ${f(a.fav)} → ${f(b.fav)} | ${a.n} → ${b.n}`
    );
  }
}

/** Số cụm độc lập: hai tín hiệu cách nhau < H phiên thì cùng một cụm. */
function clusters(idxs: number[], H: number): number {
  let c = 0;
  let last = -Infinity;
  for (const i of idxs) {
    if (i - last >= H) c++;
    last = i;
  }
  return c;
}

console.log("\nCụm độc lập (gap >= H phiên), quy ước mới:");
for (const p of PRESETS) {
  const h = String(p.horizonDays) as H;
  const hitIdx: number[] = [];
  tl.points.forEach((q, i) => {
    if (q.returns[h] !== null && presetComposite({ ...q.scores, fed: sNew[i] ?? q.scores.fed }, p) >= p.buyThreshold)
      hitIdx.push(i);
  });
  const trIdx = hitIdx.filter((i) => tl.points[i].date < SPLIT_DATE);
  const teIdx = hitIdx.filter((i) => tl.points[i].date >= SPLIT_DATE);
  console.log(
    `${p.id.padEnd(3)} | ngày ${trIdx.length}/${teIdx.length} | cụm ${clusters(trIdx, p.horizonDays)}/${clusters(teIdx, p.horizonDays)}`
  );
}

// Khối evidence để dán vào PRESETS (đúng định dạng verify-preset-evidence sẽ chấm
// sau khi cron dựng lại timeline bằng cache Fed đã sửa nhãn).
console.log("\n=== evidence mới (dán vào src/lib/types.ts) ===");
for (const p of PRESETS) {
  const h = String(p.horizonDays) as H;
  const pts = tl.points.filter((q) => q.returns[h] !== null);
  const idxOf = new Map(tl.points.map((q, i) => [q.date, i]));
  const hit = (seg: typeof pts) =>
    seg
      .filter((q) => presetComposite({ ...q.scores, fed: sNew[idxOf.get(q.date)!] ?? q.scores.fed }, p) >= p.buyThreshold)
      .map((q) => q.returns[h] as number);
  const tr = stats(hit(pts.filter((q) => q.date < SPLIT_DATE)));
  const te = stats(hit(pts.filter((q) => q.date >= SPLIT_DATE)));
  const trB = stats(pts.filter((q) => q.date < SPLIT_DATE).map((q) => q.returns[h] as number));
  const teB = stats(pts.filter((q) => q.date >= SPLIT_DATE).map((q) => q.returns[h] as number));
  console.log(
    `${p.id}: { trainFav: ${f(tr.fav)}, trainN: ${tr.n}, trainBaseline: ${f(trB.fav)}, ` +
      `testFav: ${f(te.fav)}, testN: ${te.n}, testBaseline: ${f(teB.fav)}, ` +
      `medianTestReturnPct: ${+te.med.toFixed(1)} }  | biên train ${f(tr.fav - trB.fav)}pt, test ${f(te.fav - teB.fav)}pt`
  );
}
