/**
 * Đo cổng premium ≥p80 — cổng `premium-wait` từng CHẶN gợi ý mua (guidance.ts).
 *
 * Câu hỏi: "chênh VN cao thì đợi chênh hạ rồi mua" có đúng không?
 * Trả lời bằng ĐÚNG kỳ hạn quyết định của nó (người mua hoãn vài ngày–vài tuần,
 * KHÔNG phải 126 phiên), đếm cụm độc lập trên lưới khối cố định như mọi CI khác
 * trong repo (xem CLAUDE.md "Cluster definition — use a fixed block grid").
 *
 * Kết quả (2026-09-15, 583 phiên VN): H=5 SAI DẤU −5,2pt với 40 cụm — thừa công
 * suất để tin. Cổng bị HẠ CẤP thành ghi chú chi phí; xem docs/presets.md
 * "Cổng premium ≥p80 — hạ cấp".
 *
 * Tái lập: npx tsx scripts/premium-gate-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRESETS, presetComposite, type Timeline, type VnGoldEntry } from "../src/lib/types";
import { clusterRanges } from "../src/lib/indicators";

const DATA = join(process.cwd(), "public", "data");

/** Kỳ hạn quyết định THẬT của cổng: "đợi" nghĩa là vài phiên, không phải nửa năm. */
const HORIZONS = [5, 10, 21, 63] as const;

function pctile(sorted: number[], p: number): number {
  return sorted[Math.floor(p * (sorted.length - 1))];
}

function main() {
  const vn: VnGoldEntry[] = JSON.parse(
    readFileSync(join(DATA, "history", "vn-gold.json"), "utf8")
  );
  const rows = vn.filter(
    (r): r is VnGoldEntry & { premiumPct: number; sjcSell: number } =>
      r.premiumPct !== null && r.sjcSell !== null
  );
  const sorted = rows.map((r) => r.premiumPct).sort((a, b) => a - b);
  const p80 = pctile(sorted, 0.8);
  const p20 = pctile(sorted, 0.2);

  const hiIdxs = rows.map((r, i) => (r.premiumPct >= p80 ? i : -1)).filter((i) => i >= 0);
  console.log(
    `${rows.length} phiên VN ${rows[0].date}..${rows[rows.length - 1].date} | p20=${p20.toFixed(2)}% p80=${p80.toFixed(2)}%`
  );
  console.log(
    `cổng bật ${hiIdxs.length}/${rows.length} ngày = ${((100 * hiIdxs.length) / rows.length).toFixed(1)}%\n`
  );

  // --- 1. Cổng có báo trước "giá sẽ rẻ hơn nếu đợi" không?
  // fav = P(giá SJC sau H phiên RẺ HƠN hôm nay) — đợi có lợi khi tỉ lệ này CAO hơn base.
  console.log("Đợi khi chênh ≥p80 có rẻ hơn không? (fav = P(giá rẻ hơn sau H))");
  console.log("H\tcụm\tfav cổng\tfav base\tchênh");
  for (const H of HORIZONS) {
    let hitCheap = 0,
      hitN = 0,
      baseCheap = 0,
      baseN = 0;
    const idxs: number[] = [];
    for (let i = 0; i + H < rows.length; i++) {
      const cheaper = rows[i + H].sjcSell < rows[i].sjcSell ? 1 : 0;
      baseCheap += cheaper;
      baseN++;
      if (rows[i].premiumPct >= p80) {
        hitCheap += cheaper;
        hitN++;
        idxs.push(i);
      }
    }
    const hp = (100 * hitCheap) / hitN;
    const bp = (100 * baseCheap) / baseN;
    const d = hp - bp;
    console.log(
      `${H}\t${clusterRanges(idxs, H).length}\t${hp.toFixed(1)}%\t\t${bp.toFixed(1)}%\t\t${d >= 0 ? "+" : ""}${d.toFixed(1)}pt`
    );
  }

  // --- 2. Cổng đè lên bao nhiêu tín hiệu mua ĐÃ kiểm chứng 2 giai đoạn?
  const tl: Timeline = JSON.parse(readFileSync(join(DATA, "timeline.json"), "utf8"));
  const pos = new Map(rows.map((r, i) => [r.date, i]));
  const blocked: { date: string; k: string; prem: number; i: number }[] = [];
  let buyDays = 0;
  for (const q of tl.points) {
    const i = pos.get(q.date);
    if (i === undefined) continue;
    const ks = PRESETS.filter((p) => presetComposite(q.scores, p) >= p.buyThreshold);
    if (!ks.length) continue;
    buyDays++;
    if (rows[i].premiumPct >= p80)
      blocked.push({ date: q.date, k: ks.map((p) => p.id).join("+"), prem: rows[i].premiumPct, i });
  }
  console.log(
    `\nNgày preset báo MUA trong kỳ có dữ liệu VN: ${buyDays}; bị cổng đè: ${blocked.length}` +
      (buyDays ? ` (${((100 * blocked.length) / buyDays).toFixed(0)}%)` : "")
  );
  console.log(
    `cụm độc lập của tập bị đè (H=21): ${clusterRanges(blocked.map((b) => b.i), 21).length}`
  );
  for (const b of blocked) console.log(`  ${b.date} ${b.k} chênh ${b.prem.toFixed(1)}%`);

  // --- 3. Các ngày bị đè đó về sau ra sao? (cổng có cứu được gì không)
  console.log("\nKết cục các ngày mua bị đè:");
  for (const H of [21, 63] as const) {
    const rets = blocked
      .filter((b) => b.i + H < rows.length)
      .map((b) => rows[b.i + H].sjcSell / rows[b.i].sjcSell - 1);
    if (!rets.length) {
      console.log(`  H=${H}: chưa đủ tương lai`);
      continue;
    }
    const med = [...rets].sort((a, b) => a - b)[Math.floor(rets.length / 2)];
    console.log(
      `  H=${H}: n=${rets.length} tăng=${rets.filter((r) => r > 0).length}/${rets.length} trung vị=${(med * 100).toFixed(1)}%`
    );
  }

  // --- 4. Ngưỡng p80 tính toàn chuỗi vs past-only (cổng dùng ≥90 ngày lịch sử)
  const all = rows.map((r) => r.premiumPct);
  let flip = 0,
    measurable = 0,
    pastHi = 0;
  for (let i = 90; i < rows.length; i++) {
    measurable++;
    const w = all.slice(0, i + 1).sort((a, b) => a - b);
    const past = rows[i].premiumPct >= pctile(w, 0.8);
    if (past) pastHi++;
    if (past !== rows[i].premiumPct >= p80) flip++;
  }
  console.log(
    `\np80 toàn chuỗi vs past-only: ${flip}/${measurable} ngày đổi trạng thái = ${((100 * flip) / measurable).toFixed(1)}% ` +
      `(past-only bật ${pastHi} ngày)`
  );
}

main();
