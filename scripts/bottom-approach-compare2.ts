/**
 * Đào sâu cycleBin==3: (1) bền 2 giai đoạn (train<2019/test≥2019)? (2) "BẮT ĐẦU đáy"
 * = cạnh lên của bin==3 (ngày vừa vào oversold+vĩ mô) có tốt hơn? (3) đa kỳ hạn 1/3/6T.
 * (4) bin>=2 vs ==3. Read-only. Chạy: npx tsx scripts/bottom-approach-compare2.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const DATA = join(process.cwd(), "public", "data");
type Pt = { date: string; price: number; cycleBin?: number; composite: number; returns: { "21": number | null; "63": number | null; "126": number | null } };
const tl: Pt[] = JSON.parse(readFileSync(join(DATA, "timeline.json"), "utf8")).points;
const bottom = JSON.parse(readFileSync(join(DATA, "bottom.json"), "utf8"));
const N = tl.length, SPLIT = "2019-01-01";
const idxByDate = new Map(tl.map((p, i): [string, number] => [p.date, i]));
const cyc = [...new Set(bottom.confirmedBottoms.filter((b: any) => b.tier === "cycle").map((b: any) => idxByDate.get(b.date)).filter((x: any): x is number => x !== undefined))] as number[];
const nearestB = (i: number) => cyc.reduce((best, b) => Math.abs(b - i) < Math.abs(best - i) ? b : best, cyc[0]);
const median = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN;
const winMed = (idx: number[], h: "21" | "63" | "126") => { const r = idx.map((i) => tl[i].returns[h]).filter((x): x is number => x != null); return { win: r.length ? r.filter((x) => x > 0).length / r.length * 100 : NaN, med: median(r), n: r.length }; };

function row(name: string, idx: number[]) {
  const yrs = new Set(idx.map((i) => tl[i].date.slice(0, 4))).size;
  const fmt = (h: "21" | "63" | "126") => { const s = winMed(idx, h); return `${isNaN(s.win) ? "-" : s.win.toFixed(0)}% / ${s.n ? (s.med >= 0 ? "+" : "") + s.med.toFixed(1) : "-"}%`; };
  // lead: + nghĩa cờ TRƯỚC đáy gần nhất
  const leads = idx.filter((i) => Math.abs(nearestB(i) - i) <= 21).map((i) => nearestB(i) - i);
  console.log(name.padEnd(34) + `cờ ${String(idx.length).padStart(4)} | phủ ${String(yrs).padStart(2)}n | 1T ${fmt("21")} | 3T ${fmt("63")} | 6T ${fmt("126")} | lead ${leads.length ? median(leads) + "p" : "-"}`);
}

const bin3 = (i: number) => tl[i].cycleBin === 3;
const all3: number[] = [], edge3: number[] = [], ge2: number[] = [];
for (let i = 252; i < N; i++) {
  if (bin3(i)) all3.push(i);
  if (bin3(i) && !bin3(i - 1)) edge3.push(i); // cạnh lên = "bắt đầu" vào oversold+vĩ mô
  if ((tl[i].cycleBin ?? 0) >= 2) ge2.push(i);
}
const inTrain = (i: number) => tl[i].date < SPLIT, inTest = (i: number) => tl[i].date >= SPLIT;

console.log(`Lưới ${N} phiên · ${cyc.length} đáy chu kỳ · cột: win%/trung-vị theo kỳ hạn\n`);
console.log("=== cycleBin==3 (mọi ngày trong cụm) ===");
row("  tất cả", all3);
row("  train <2019", all3.filter(inTrain));
row("  test ≥2019", all3.filter(inTest));
console.log("\n=== BẮT ĐẦU đáy: cạnh lên bin==3 (vừa vào) ===");
row("  tất cả", edge3);
row("  train <2019", edge3.filter(inTrain));
row("  test ≥2019", edge3.filter(inTest));
console.log("\n=== bin>=2 (nới — so recall) ===");
row("  tất cả", ge2);
console.log(`\nlead median = số phiên cờ đứng TRƯỚC đáy chu kỳ gần nhất (trong ±21p); + = báo sớm, - = trễ`);
