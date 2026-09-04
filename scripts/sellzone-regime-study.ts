/**
 * Tái lập các con số theo NĂM đang in cho người dùng ở src/lib/guidance.ts (level
 * "headwind") và src/components/Dashboard.tsx (verdict-note vùng bán).
 *
 * Vì sao cần: những số đó ("1 tháng median ≈ 0..−5%", "năm bull giá cao hơn 98–100%",
 * "năm yếu thấp hơn 70–100%") dẫn xuất từ timeline composite, mà composite có stats
 * trọng số 0,2 ⇒ chúng TRÔI mỗi lần engine stats đổi (ví dụ bản sửa look-ahead mùa vụ
 * #10, 2026-09-04). Trước script này không có gì tái lập được chúng — vi phạm CLAUDE.md
 * "never fabricate a number". Chạy lại script này mỗi khi sửa engine rồi sync text.
 *
 * PHẠM VI: thống kê MÔ TẢ lịch sử. KHÔNG train/test, KHÔNG placebo, KHÔNG CI, KHÔNG
 * tuyên bố hiệu quả. Đúng như chính sách vùng bán (2026-07-04): phía bán của composite
 * CHƯA được kiểm chứng như tín hiệu hành động — bảng này tồn tại để nói rằng kết cục
 * 6 tháng ĐẢO DẤU theo chế độ thị trường, tức là không dịch được thành lệnh mua/bán.
 *
 * Chạy: npx tsx scripts/sellzone-regime-study.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { median } from "../src/lib/indicators";
import type { Timeline } from "../src/lib/types";

const FILE = join(process.cwd(), "public", "data", "timeline.json");
/** Ngưỡng vùng bán trong zoneOf (src/lib/types.ts) — sell và strong-sell gộp. */
const SELL_THRESHOLD = -40;
const HORIZONS = ["21", "126"] as const;

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (k: number, n: number) => (n ? r1((k / n) * 100) : null);

function main() {
  const tl: Timeline = JSON.parse(readFileSync(FILE, "utf8"));
  const sell = tl.points.filter((p) => p.composite <= SELL_THRESHOLD);
  // Cổng nhất quán với engine: mọi điểm ≤ −40 phải được zoneOf xếp vào phía bán.
  for (const p of sell) assert.ok(p.zone === "sell" || p.zone === "strong-sell", `zone lệch ở ${p.date}: ${p.zone}`);

  console.log("Vùng bán (composite ≤ −40) — kết cục theo NĂM. THỐNG KÊ MÔ TẢ, không CI, không claim.");
  console.log(`nguồn=${FILE} điểm=${tl.points.length} khoảng=${tl.points[0].date}..${tl.points[tl.points.length - 1].date}`);
  console.log(`ngày vùng bán=${sell.length} (${pct(sell.length, tl.points.length)}% lịch sử)`);
  console.log("lưới=mỗi phiên ⇒ ngày kề nhau chồng cửa sổ forward: KHÔNG có n độc lập.\n");

  const byYear = new Map<string, typeof sell>();
  for (const p of sell) {
    const y = p.date.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), p]);
  }

  console.log("năm    |    n | 1 tháng: median | %giá cao hơn | 6 tháng: median | %giá cao hơn");
  const rows: [string, typeof sell][] = [["TẤT CẢ", sell], ...[...byYear.keys()].sort().map((y) => [y, byYear.get(y)!] as [string, typeof sell])];
  for (const [label, pts] of rows) {
    const cells = HORIZONS.map((h) => {
      const rs = pts.map((p) => p.returns[h]).filter((r): r is number => r !== null);
      if (!rs.length) return ["—".padStart(15), "—".padStart(12)];
      const up = rs.filter((r) => r > 0).length;
      return [`${r1(median(rs)!) >= 0 ? "+" : ""}${r1(median(rs)!)}% (n=${rs.length})`.padStart(15), `${pct(up, rs.length)}%`.padStart(12)];
    });
    console.log(`${label.padEnd(6)} | ${String(pts.length).padStart(4)} | ${cells[0][0]} | ${cells[0][1]} | ${cells[1][0]} | ${cells[1][1]}`);
  }
  // Tổng các năm phải bằng dòng TẤT CẢ (mọi ngày rơi vào đúng một năm).
  assert.equal([...byYear.values()].reduce((a, v) => a + v.length, 0), sell.length, "tổng các năm ≠ TẤT CẢ");

  console.log(
    "\nĐọc bảng: cột 1 tháng cho biết gió ngược ngắn hạn có bền xuyên chế độ hay không;\n" +
      "cột 6 tháng %giá-cao-hơn cho biết phía bán ĐẢO DẤU theo chế độ (bull vs yếu). Chế độ\n" +
      "KHÔNG biết trước ⇒ không dịch thành lệnh 'bớt mua/cấm mua'. Text trong guidance.ts và\n" +
      "Dashboard.tsx phải nằm trong biên bảng này; lệch thì sửa text, không sửa bảng."
  );
}

main();
