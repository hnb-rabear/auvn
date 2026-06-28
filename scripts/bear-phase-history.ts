/**
 * Liệt kê các đoạn lịch sử theo pha (acute / recovery / grind), gom nhịp liên tiếp.
 * Dùng đúng mô hình 4-pha đã ship (classifyPhase trên dd rolling ATH + ddChange 21 phiên).
 *
 * Chạy: npx tsx scripts/bear-phase-history.ts
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

interface Mon { date: string; price: number; dd: number; phase: Phase; }
const mons: Mon[] = [];
for (let i = 0; i < pts.length; i += STEP) mons.push({ date: pts[i].date, price: pts[i].price, dd: dd[i], phase: classify(i) });

// gom đoạn liên tiếp cùng pha
interface Seg { phase: Phase; from: string; to: string; n: number; pFrom: number; pTo: number; ddMax: number; }
const segs: Seg[] = [];
for (const m of mons) {
  const last = segs[segs.length - 1];
  if (last && last.phase === m.phase) {
    last.to = m.date; last.n++; last.pTo = m.price; last.ddMax = Math.max(last.ddMax, m.dd);
  } else {
    segs.push({ phase: m.phase, from: m.date, to: m.date, n: 1, pFrom: m.price, pTo: m.price, ddMax: m.dd });
  }
}

const LABEL: Record<Phase, string> = { bull: "Tăng", acute: "Sụp cấp tính", recovery: "Hồi phục", grind: "Rỉ máu" };
const pct = (x: number) => (x >= 0 ? "+" : "") + (x * 100).toFixed(0) + "%";

function show(phase: Phase) {
  const list = segs.filter((s) => s.phase === phase);
  console.log(`\n===== ${LABEL[phase].toUpperCase()} (${list.length} đoạn) =====`);
  for (const s of list) {
    const move = (s.pTo - s.pFrom) / s.pFrom;
    console.log(`  ${s.from} → ${s.to} (${s.n} nhịp) | giá $${s.pFrom.toFixed(0)}→$${s.pTo.toFixed(0)} (${pct(move)}) | dd sâu nhất ${pct(s.ddMax)}`);
  }
}

show("acute");
show("grind");
show("recovery");

// Tổng quan dòng thời gian (mọi đoạn, kể cả bull) để thấy bức tranh
console.log(`\n===== DÒNG THỜI GIAN ĐẦY ĐỦ =====`);
for (const s of segs) {
  console.log(`  ${s.from} → ${s.to} | ${LABEL[s.phase].padEnd(12)} | ${s.n} nhịp | dd sâu nhất ${pct(s.ddMax)}`);
}
