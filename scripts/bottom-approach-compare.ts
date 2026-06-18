/**
 * SO SÁNH các HƯỚNG phát hiện đáy (read-only, dữ liệu commit) — chọn hướng tốt nhất
 * bằng bằng chứng, không cảm tính. Mỗi hướng = cờ đáy walk-forward (past-only).
 * Chấm: (1) độ phủ năm (sửa lỗi 2009-2013?), (2) lợi nhuận tương lai 6T (có thật gần
 * đáy?), (3) độ gần confirmedBottoms (cycle). Chạy: npx tsx scripts/bottom-approach-compare.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const DATA = join(process.cwd(), "public", "data");
type Pt = { date: string; price: number; cycleProb?: number | null; cycleBin?: number; returns: { "126": number | null } };
const tl: Pt[] = JSON.parse(readFileSync(join(DATA, "timeline.json"), "utf8")).points;
const bottom = JSON.parse(readFileSync(join(DATA, "bottom.json"), "utf8"));
const N = tl.length;

// --- chỉ báo phái sinh (walk-forward) ---
const trailHigh = (i: number, w: number) => { let m = -Infinity; for (let j = Math.max(0, i - w + 1); j <= i; j++) m = Math.max(m, tl[j].price); return m; };
const drawdown = tl.map((_, i) => { const h = trailHigh(i, 252); return h > 0 ? (h - tl[i].price) / h * 100 : 0; }); // % dưới đỉnh 1 năm
// percentile của X trong cửa sổ trượt W (past-only, gồm i)
function pctl(arr: number[], i: number, w: number) { const cur = arr[i]; let le = 0, n = 0; for (let j = Math.max(0, i - w + 1); j <= i; j++) { n++; if (arr[j] <= cur) le++; } return le / n * 100; }
const ddPctl = tl.map((_, i) => pctl(drawdown, i, 504)); // chiết khấu sâu tới đâu so 2 năm

// --- ground truth: đáy chu kỳ đã xác nhận ---
const idxByDate = new Map(tl.map((p, i): [string, number] => [p.date, i]));
const cycBottoms = [...new Set(bottom.confirmedBottoms.filter((b: any) => b.tier === "cycle").map((b: any) => idxByDate.get(b.date)).filter((x: any): x is number => x !== undefined))] as number[];
const nearBottom = (i: number) => cycBottoms.some((b) => Math.abs(b - i) <= 10);

const median = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN;
function score(name: string, flag: (i: number) => boolean) {
  const idx: number[] = []; for (let i = 252; i < N; i++) if (flag(i)) idx.push(i);
  const years = new Set(idx.map((i) => tl[i].date.slice(0, 4)));
  const rets = idx.map((i) => tl[i].returns["126"]).filter((r): r is number => r != null);
  const win = rets.length ? rets.filter((r) => r > 0).length / rets.length * 100 : NaN;
  const near = idx.length ? idx.filter(nearBottom).length / idx.length * 100 : 0;
  const yr = [...years].sort();
  console.log(
    name.padEnd(40) +
    `cờ ${String(idx.length).padStart(4)} | năm phủ ${String(years.size).padStart(2)}/18 (${yr[0]}–${yr[yr.length-1]}) | ` +
    `win6T ${isNaN(win)?'-':win.toFixed(0)}% | trung vị6T ${rets.length?(median(rets)>=0?'+':'')+median(rets).toFixed(1):'-'}% | gần đáy ${near.toFixed(0)}%`
  );
}

console.log(`Lưới ${N} phiên ${tl[0].date}→${tl[N-1].date} · ${cycBottoms.length} đáy chu kỳ thật\n`);
console.log('NỀN: mọi ngày'.padEnd(40) + `(tham chiếu)`);
score("  baseline mọi ngày", () => true);
console.log('\n— HƯỚNG cũ (lập bập / hỏng) —');
score("  cycleProb≥60 (tuyệt đối, đã hỏng)", (i) => (tl[i].cycleProb ?? -1) >= 60);
score("  cycleProb top15% (percentile)", (i) => pctl(tl.map((p) => p.cycleProb ?? -1), i, 252) >= 85 && tl[i].cycleProb != null);
score("  cycleBin==3 (oversold+vĩ mô)", (i) => tl[i].cycleBin === 3);
console.log('\n— HƯỚNG MỚI (độ rẻ / hội tụ) —');
score("  A. Chiết khấu ≥15% đỉnh 1 năm", (i) => drawdown[i] >= 15);
score("  A2. Chiết khấu top15% (2 năm)", (i) => ddPctl[i] >= 85);
score("  B. Hội tụ: rẻ top15% VÀ cycleBin≥2", (i) => ddPctl[i] >= 85 && (tl[i].cycleBin ?? 0) >= 2);
score("  B2. Hội tụ: chiết khấu≥12% VÀ cycleBin==3", (i) => drawdown[i] >= 12 && tl[i].cycleBin === 3);
