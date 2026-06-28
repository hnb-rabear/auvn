/**
 * Tìm các chu kỳ bear trọn vẹn: SỤP CẤP TÍNH → RỈ MÁU → HỒI PHỤC nối tiếp nhau.
 * Làm mượt nhãn pha (debounce: cần 2 nhịp liên tiếp mới đổi pha) để bỏ nhiễu nhấp nháy,
 * rồi gom block và quét chuỗi acute→grind→recovery liền kề.
 *
 * Chạy: npx tsx scripts/bear-phase-cycles.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
const tl = JSON.parse(readFileSync(join(process.cwd(), "public/data/timeline.json"), "utf8"));
const pts: any[] = tl.points;
const STEP = 21;

const prices = pts.map((p) => p.price);
let mx = 0;
const dd: number[] = [];
for (const p of prices) { if (p > mx) mx = p; dd.push((mx - p) / mx); }

type Phase = "bull" | "acute" | "recovery" | "grind";
function classify(i: number): Phase {
  const d = dd[i];
  if (d < 0.15) return "bull";
  const ch = d - dd[Math.max(0, i - STEP)];
  if (ch > 0.03) return "acute";
  if (ch < -0.03) return "recovery";
  return "grind";
}

interface Mon { date: string; price: number; dd: number; raw: Phase; }
const mons: Mon[] = [];
for (let i = 0; i < pts.length; i += STEP) mons.push({ date: pts[i].date, price: pts[i].price, dd: dd[i], raw: classify(i) });

// --- gom block thô (KHÔNG làm mượt — bear thật đổi sub-pha nhanh, smoothing xóa mất acute) ---
interface Block { phase: Phase; from: string; to: string; n: number; pFrom: number; pTo: number; ddMax: number; }
const blocks: Block[] = [];
for (let k = 0; k < mons.length; k++) {
  const ph = mons[k].raw, m = mons[k], last = blocks[blocks.length - 1];
  if (last && last.phase === ph) { last.to = m.date; last.n++; last.pTo = m.price; last.ddMax = Math.max(last.ddMax, m.dd); }
  else blocks.push({ phase: ph, from: m.date, to: m.date, n: 1, pFrom: m.price, pTo: m.price, ddMax: m.dd });
}

const LABEL: Record<Phase, string> = { bull: "Tăng", acute: "Sụp cấp tính", recovery: "Hồi phục", grind: "Rỉ máu" };
const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(0) + "%";
const blkStr = (b: Block) => `${b.from}→${b.to} (${b.n}n, $${b.pFrom.toFixed(0)}→$${b.pTo.toFixed(0)} ${pct((b.pTo-b.pFrom)/b.pFrom)}, dd≤${pct(b.ddMax)})`;

// --- quét chuỗi acute → grind → recovery liền kề (cho phép lặp giữa, miễn đúng thứ tự) ---
console.log("===== CHU KỲ TRỌN VẸN: Sụp cấp tính → Rỉ máu → Hồi phục (liền kề) =====");
let found = 0;
for (let k = 0; k + 2 < blocks.length; k++) {
  if (blocks[k].phase === "acute" && blocks[k + 1].phase === "grind" && blocks[k + 2].phase === "recovery") {
    found++;
    console.log(`\nChu kỳ #${found}:`);
    console.log(`  ① CẤP TÍNH : ${blkStr(blocks[k])}`);
    console.log(`  ② RỈ MÁU   : ${blkStr(blocks[k + 1])}`);
    console.log(`  ③ HỒI PHỤC : ${blkStr(blocks[k + 2])}`);
  }
}
if (!found) console.log("  (không có chuỗi 3-pha liền kề chính xác — xem dòng thời gian mượt bên dưới)");

console.log("\n===== DÒNG THỜI GIAN ĐÃ LÀM MƯỢT =====");
for (const b of blocks) console.log(`  ${LABEL[b.phase].padEnd(12)} | ${blkStr(b)}`);
