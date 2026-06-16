/**
 * "Gom ở đáy" có phải điểm vào tốt hơn điểm mua không? — kiểm chứng tỉ lệ thắng
 * + % lời theo lợi nhuận tương lai 1/3/6 tháng, trên dữ liệu ĐÃ commit
 * (public/data/timeline.json: returns 21/63/126 + cycleBin past-only; bottom.json:
 * confirmedBottoms). KHÔNG bịa số — returns là lợi nhuận thực sau N phiên.
 *
 * 4 nhóm vào lệnh, cùng vũ trụ XAU/USD thế giới:
 *   1. ĐIỂM MUA      — zone == "buy" (composite ≥ ngưỡng). Tradeable, theo thời gian thực.
 *   2. SĂN ĐÁY (cao) — cycleBin == bin cao nhất (điểm đáy past-only). Tradeable.
 *   3. ĐÁY xác nhận  — confirmedBottoms (đáy cục bộ). LOOK-AHEAD: cần ±9 phiên tương
 *                      lai mới xác nhận ⇒ KHÔNG vào được lúc đó. Chỉ là cận trên lý thuyết.
 *   4. NỀN (mọi ngày)— baseline: mua đại một ngày bất kỳ.
 *
 * Win% kèm CI 95% block-bootstrap (block = kỳ hạn/3 phiên) để tôn trọng tín hiệu
 * bắn chùm — điểm mua dồn cụm nên CI hẹp ảo nếu resample từng điểm.
 *
 * Chạy: npx tsx scripts/bottom-entry-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blockBootstrapCi } from "../src/lib/indicators";

const DATA = join(process.cwd(), "public", "data");
type Ret = { "21": number | null; "63": number | null; "126": number | null };
type Pt = {
  date: string;
  price: number;
  composite: number;
  zone: "buy" | "neutral" | "sell";
  returns: Ret;
  cycleBin?: number;
};
const tl: Pt[] = JSON.parse(readFileSync(join(DATA, "timeline.json"), "utf8")).points;
const bottom = JSON.parse(readFileSync(join(DATA, "bottom.json"), "utf8"));

const H = ["21", "63", "126"] as const;
const HL: Record<(typeof H)[number], string> = { "21": "1 tháng", "63": "3 tháng", "126": "6 tháng" };
const topBin = Math.max(...tl.filter((p) => p.cycleBin !== undefined).map((p) => p.cycleBin!));

const ms = (d: string) => new Date(d).getTime();
const nearestIdx = (date: string) => {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < tl.length; i++) {
    const x = Math.abs(ms(tl[i].date) - ms(date));
    if (x < bd) { bd = x; bi = i; }
  }
  return bi;
};
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

function row(label: string, pts: Pt[]) {
  console.log(`\n===== ${label} — ${pts.length} lần vào =====`);
  for (const h of H) {
    const rets = pts.map((p) => p.returns[h]).filter((r): r is number => r != null);
    if (rets.length < 10) { console.log(`  ${HL[h]}: n=${rets.length} (quá ít)`); continue; }
    const winArr = rets.map((r) => (r > 0 ? 1 : 0));
    const win = (avg(winArr) * 100);
    const ci = blockBootstrapCi(rets, Math.max(1, Math.round(Number(h) / 3)));
    const ciStr = ci ? ` [CI95 ${ci[0]}–${ci[1]}%]` : "";
    console.log(
      `  ${HL[h].padEnd(8)} n=${String(rets.length).padStart(4)}  ` +
      `thắng ${win.toFixed(0).padStart(3)}%${ciStr}  ` +
      `lời TB ${avg(rets) >= 0 ? "+" : ""}${avg(rets).toFixed(1)}%  ` +
      `trung vị ${median(rets) >= 0 ? "+" : ""}${median(rets).toFixed(1)}%`
    );
  }
}

console.log(`Lưới: ${tl.length} phiên, ${tl[0].date} → ${tl[tl.length - 1].date}. Bin đáy cao nhất = ${topBin}.`);

row("ĐIỂM MUA (zone=buy, composite≥ngưỡng) — tradeable", tl.filter((p) => p.zone === "buy"));
row(`SĂN ĐÁY cao (cycleBin=${topBin}, past-only) — tradeable`, tl.filter((p) => p.cycleBin === topBin));

const cbDates: string[] = [...new Set(bottom.confirmedBottoms.map((b: any) => b.date as string))] as string[];
const cbPts = cbDates.map((d) => tl[nearestIdx(d)]).filter(Boolean);
row("ĐÁY xác nhận (confirmedBottoms) — LOOK-AHEAD, cận trên lý thuyết", cbPts);

row("NỀN: mua ngày bất kỳ (baseline)", tl);
