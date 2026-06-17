/**
 * SO SÁNH quy tắc phát hiện đáy (read-only, dữ liệu đã commit) — để brainstorm
 * hướng "săn đáy precision cao". Ground truth = confirmedBottoms (đáy cục bộ
 * nhìn-lại). Mỗi rule chỉ dùng tín hiệu past-only có sẵn trong timeline.json
 * (cycleBin/swingBin/composite). Đo: precision-vùng, recall, lead, và lời thực
 * (win% + trung vị return 3/6 tháng) — vì "precision" đáng tin nhất là "vào có lời".
 *
 * KHÔNG bịa số. Chạy: npx tsx scripts/bottom-detection-compare.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DATA = join(process.cwd(), "public", "data");
type Pt = {
  date: string; price: number; composite: number;
  returns: { "21": number | null; "63": number | null; "126": number | null };
  cycleBin?: number; swingBin?: number;
};
const tl: Pt[] = JSON.parse(readFileSync(join(DATA, "timeline.json"), "utf8")).points;
const bottom = JSON.parse(readFileSync(join(DATA, "bottom.json"), "utf8"));

const idxByDate = new Map(tl.map((p, i) => [p.date, i]));
const cycleBottomIdx = [
  ...new Set(
    bottom.confirmedBottoms
      .filter((b: any) => b.tier === "cycle")
      .map((b: any) => idxByDate.get(b.date))
      .filter((i: number | undefined): i is number => i !== undefined)
  ),
].sort((a, b) => a - b) as number[];

const W = 10; // cửa sổ "gần đáy" tính theo phiên (±10 ≈ nửa tháng)
const inZone = (i: number) => cycleBottomIdx.some((b) => Math.abs(b - i) <= W);
const nearestBottom = (i: number) =>
  cycleBottomIdx.reduce((best, b) => (Math.abs(b - i) < Math.abs(best - i) ? b : best), cycleBottomIdx[0]);

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const has = (p: Pt) => p.cycleBin !== undefined && p.swingBin !== undefined;

type Rule = { name: string; pred: (p: Pt) => boolean };
const TOP = 3; // bin cao nhất
const rules: Rule[] = [
  { name: "NỀN (mọi ngày)", pred: () => true },
  { name: "cycleBin=3 (hiện tại)", pred: (p) => p.cycleBin === TOP },
  { name: "cycle=3 VÀ swing=3 (confluence chặt)", pred: (p) => p.cycleBin === TOP && p.swingBin === TOP },
  { name: "cycle=3 VÀ swing>=2", pred: (p) => p.cycleBin === TOP && (p.swingBin ?? 0) >= 2 },
  { name: "cycle=3 VÀ composite>=-20 (không bán sâu)", pred: (p) => p.cycleBin === TOP && p.composite >= -20 },
  { name: "cycle>=2 (nới — để so recall)", pred: (p) => (p.cycleBin ?? 0) >= 2 },
];

// Rule xác nhận đảo chiều (lagging): từng ở cycleBin=3 trong 20 phiên qua,
// VÀ giá đã bật >=3% khỏi đáy thấp nhất 20 phiên, VÀ đang lên (>5 phiên trước).
const idxList = tl.map((_, i) => i);
const confirmIdx = new Set(
  idxList.filter((i) => {
    if (i < 20) return false;
    const win = tl.slice(i - 20, i + 1);
    const wasOversold = win.some((q) => q.cycleBin === TOP);
    const lo = Math.min(...win.map((q) => q.price));
    const bounced = tl[i].price >= lo * 1.03;
    const rising = tl[i].price > tl[i - 5].price;
    return wasOversold && bounced && rising;
  })
);
rules.push({ name: "XÁC NHẬN đảo chiều (sau cycle=3 + bật 3%)", pred: (p) => confirmIdx.has(idxByDate.get(p.date)!) });

console.log(`Lưới ${tl.length} phiên ${tl[0].date}→${tl[tl.length - 1].date} · ${cycleBottomIdx.length} đáy chu kỳ · cửa sổ ±${W} phiên\n`);
const baseInzone = tl.filter(has).filter((p) => inZone(idxByDate.get(p.date)!)).length / tl.filter(has).length;
console.log(`Tỉ lệ ngày "gần đáy" nền = ${(baseInzone * 100).toFixed(1)}% (precision của đoán mò)\n`);

const pad = (s: string, n: number) => s.padEnd(n);
console.log(pad("Quy tắc", 40) + pad("#cờ", 7) + pad("prec-vùng", 11) + pad("recall", 9) + pad("lead(median)", 14) + pad("win6T", 8) + "trung vị 6T");
for (const r of rules) {
  const flagged = tl.filter(has).filter((p) => r.pred(p));
  const fi = flagged.map((p) => idxByDate.get(p.date)!);
  const prec = fi.length ? fi.filter(inZone).length / fi.length : 0;
  const hitBottoms = cycleBottomIdx.filter((b) => fi.some((i) => Math.abs(i - b) <= W)).length;
  const recall = cycleBottomIdx.length ? hitBottoms / cycleBottomIdx.length : 0;
  const leads = fi.filter(inZone).map((i) => nearestBottom(i) - i); // + = cờ TRƯỚC đáy
  const r126 = flagged.map((p) => p.returns["126"]).filter((x): x is number => x != null);
  const win = r126.length ? (r126.filter((x) => x > 0).length / r126.length) * 100 : NaN;
  console.log(
    pad(r.name, 40) +
    pad(String(fi.length), 7) +
    pad((prec * 100).toFixed(0) + "%", 11) +
    pad((recall * 100).toFixed(0) + "%", 9) +
    pad(isNaN(median(leads)) ? "—" : median(leads) + "p", 14) +
    pad(isNaN(win) ? "—" : win.toFixed(0) + "%", 8) +
    (r126.length ? (median(r126) >= 0 ? "+" : "") + median(r126).toFixed(1) + "%" : "—")
  );
}
console.log(`\nprec-vùng = % ngày cờ nằm trong ±${W} phiên quanh đáy thật · recall = % đáy thật được bắt · lead + = báo trước đáy`);
