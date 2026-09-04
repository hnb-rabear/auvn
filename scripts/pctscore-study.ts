/**
 * P1-2 — Đo phân bố điểm của hai tín hiệu percentile giá (`pct1y`, `pct3y`) theo năm.
 *
 * Vì sao: bug #8 (docs/audit-and-improvement-proposals-2026.md) đo được signal mùa vụ
 * thoái hóa gần thành hằng số dương (7/12 tháng cho +1, 0/12 cho −1) vì ngưỡng tuyệt đối
 * gặp tài sản xu-hướng-tăng. `pctScore` bị nghi CÙNG HỌ: vàng lập đỉnh liên tục ⇒
 * percentileRank luôn ≥90 ⇒ điểm luôn −2. Doc ghi "chưa kiểm" — đây là đi kiểm.
 *
 * GIỚI HẠN CỦA PHÉP ĐO NÀY (đọc trước khi kết luận): lệch phân bố KHÔNG tự động = bug.
 * Mùa vụ là signal LỊCH (7/12 tháng dương = cái lịch không phân biệt được gì); pct là
 * signal TRẠNG THÁI (nằm −2 hai năm là phát biểu ĐÚNG: giá đang ở đỉnh dải). Bảng này chỉ
 * trả lời được một câu hẹp: PHÍA MUA của signal có bao giờ bắn trong giai đoạn test không.
 * Câu "signal có mang thông tin không" cần ablation ⇒ thuộc P1-1, không thuộc script này.
 *
 * Thống kê MÔ TẢ trên lưới DÀY (mỗi phiên): không có n độc lập, không CI, không p-value,
 * không tuyên bố hiệu quả. Không dùng STEP=3 vì không suy diễn forward-return.
 *
 * Chạy: npx tsx scripts/pctscore-study.ts
 */
import assert from "node:assert/strict";
import { fetchXau } from "./fetch";
import { statsCriterion, seasonalityTable } from "../src/lib/criteria";
import { percentileRank } from "../src/lib/indicators";
import type { SubSignal } from "../src/lib/types";

const SPLIT_DATE = "2019-01-01";
/** Khớp cửa sổ trong statsCriterion (criteria.ts:552-555) — signal unavailable trước mốc này. */
const WINDOWS = { pct1y: 252, pct3y: 756 } as const;
type SigId = keyof typeof WINDOWS;
const SIG_IDS = Object.keys(WINDOWS) as SigId[];

interface Row {
  n: number;
  ranks: number[];
  /** đếm theo điểm −2..+2, index = score + 2 */
  buckets: [number, number, number, number, number];
}
const emptyRow = (): Row => ({ n: 0, ranks: [], buckets: [0, 0, 0, 0, 0] });

const quantile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.floor(p * (sorted.length - 1))] : null;
const r0 = (x: number | null) => (x === null ? "—" : String(Math.round(x)));
const pctOf = (k: number, n: number) => (n ? `${Math.round((k / n) * 1000) / 10}%` : "—");

/**
 * Biên ngưỡng kiểm qua CHÍNH statsCriterion, không qua bản copy ngưỡng: `pctScore` là
 * closure private, copy 5 dòng ngưỡng sang đây sẽ tạo hai bản sự thật và script sẽ nói
 * khác engine khi ai đó sửa criteria.ts. Test này đỏ đúng lúc đó.
 *
 * Dựng chuỗi có `below` giá thấp hơn giá cuối trong cửa sổ 252 ⇒ rank = below/251*100.
 */
function checkThresholds() {
  const scoreAtRank = (targetRank: number): number => {
    const below = Math.round((targetRank / 100) * 251);
    // 252 phiên: `below` phiên ở mức 1, phần còn lại ở mức 3, phiên cuối ở mức 2.
    const closes = [
      ...Array(below).fill(1),
      ...Array(252 - below - 1).fill(3),
      2,
    ];
    const dates = closes.map((_, i) =>
      new Date(Date.UTC(2000, 0, 1) + i * 86400_000).toISOString().slice(0, 10)
    );
    const sig = statsCriterion(closes, dates).signals.find((s) => s.id === "pct1y")!;
    assert.equal(sig.available, true, "pct1y phải available ở 252 phiên");
    const rank = percentileRank(closes, 252)!;
    assert.ok(Math.abs(rank - targetRank) < 0.5, `rank dựng lệch: ${rank} vs ${targetRank}`);
    return sig.score;
  };
  // Hai phía của từng ngưỡng 10/30/70/90 trong criteria.ts:539-545.
  assert.equal(scoreAtRank(5), 2, "rank ≤10 ⇒ +2");
  assert.equal(scoreAtRank(10), 2, "rank =10 ⇒ +2 (biên đóng)");
  assert.equal(scoreAtRank(20), 1, "10< rank ≤30 ⇒ +1");
  assert.equal(scoreAtRank(30), 1, "rank =30 ⇒ +1 (biên đóng)");
  assert.equal(scoreAtRank(50), 0, "30< rank <70 ⇒ 0");
  assert.equal(scoreAtRank(70), -1, "rank =70 ⇒ −1 (biên đóng)");
  assert.equal(scoreAtRank(80), -1, "70≤ rank <90 ⇒ −1");
  assert.equal(scoreAtRank(90), -2, "rank =90 ⇒ −2 (biên đóng)");
  assert.equal(scoreAtRank(95), -2, "rank ≥90 ⇒ −2");
}

async function main() {
  checkThresholds();

  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  // Truyền cho đúng API production; bảng mùa vụ KHÔNG ảnh hưởng hai signal percentile.
  const season = seasonalityTable(closes, dates);

  console.log("P1-2 — phân bố điểm percentile giá (pct1y/pct3y). CHỈ MÔ TẢ, không suy diễn.");
  console.log(
    `nguồn=${xau.source} bars=${closes.length} khoảng=${dates[0]}..${dates[dates.length - 1]}`
  );
  console.log(
    "lưới=mỗi phiên (không STEP) ⇒ các phiên kề nhau tự tương quan: KHÔNG có n độc lập, không CI.\n"
  );

  const byYear: Record<SigId, Map<string, Row>> = { pct1y: new Map(), pct3y: new Map() };
  const all: Record<SigId, Row> = { pct1y: emptyRow(), pct3y: emptyRow() };
  const testBuy: Record<SigId, number> = { pct1y: 0, pct3y: 0 };
  const testN: Record<SigId, number> = { pct1y: 0, pct3y: 0 };
  const lastBuyDate: Record<SigId, string | null> = { pct1y: null, pct3y: null };

  // Bắt đầu từ cửa sổ nhỏ nhất − 1: trước đó cả hai signal đều unavailable, không có gì đo.
  for (let i = WINDOWS.pct1y - 1; i < closes.length; i++) {
    const prefix = closes.slice(0, i + 1);
    const res = statsCriterion(prefix, dates.slice(0, i + 1), season);
    const year = dates[i].slice(0, 4);
    for (const id of SIG_IDS) {
      const sig = res.signals.find((s) => s.id === id) as SubSignal;
      // Cổng availability phải khớp engine (criteria.ts:556).
      assert.equal(
        sig.available,
        prefix.length >= WINDOWS[id],
        `${id} availability lệch cổng cửa sổ tại ${dates[i]}`
      );
      if (!sig.available) continue;
      const row = byYear[id].get(year) ?? emptyRow();
      const rank = percentileRank(prefix, WINDOWS[id])!;
      for (const t of [row, all[id]]) {
        t.n++;
        t.ranks.push(rank);
        t.buckets[sig.score + 2]++;
      }
      byYear[id].set(year, row);
      if (dates[i] >= SPLIT_DATE) {
        testN[id]++;
        if (sig.score > 0) testBuy[id]++;
      }
      if (sig.score > 0) lastBuyDate[id] = dates[i];
    }
  }

  for (const id of SIG_IDS) {
    console.log(`── ${id} (cửa sổ ${WINDOWS[id]} phiên) ──`);
    console.log("năm    |    n | rank p10/p50/p90 |     −2 |     −1 |      0 |     +1 |     +2 | phía MUA");
    const years = [...byYear[id].keys()].sort();
    const rows: [string, Row][] = [["TẤT CẢ", all[id]], ...years.map((y) => [y, byYear[id].get(y)!] as [string, Row])];
    for (const [label, row] of rows) {
      const s = [...row.ranks].sort((a, b) => a - b);
      const buy = row.buckets[3] + row.buckets[4];
      const cell = (k: number) => `${String(k).padStart(4)} ${pctOf(k, row.n).padStart(6)}`;
      console.log(
        `${label.padEnd(6)} | ${String(row.n).padStart(4)} | ` +
          `${`${r0(quantile(s, 0.1))}/${r0(quantile(s, 0.5))}/${r0(quantile(s, 0.9))}`.padStart(16)} | ` +
          `${cell(row.buckets[0])} | ${cell(row.buckets[1])} | ${cell(row.buckets[2])} | ` +
          `${cell(row.buckets[3])} | ${cell(row.buckets[4])} | ${cell(buy)}`
      );
      // Tổng 5 bucket phải bằng n (mọi phiên available rơi vào đúng một bucket).
      assert.equal(row.buckets.reduce((a, b) => a + b, 0), row.n, `tổng bucket ≠ n ở ${id}/${label}`);
    }
    // Tổng các năm phải bằng dòng TẤT CẢ.
    const sumYears = years.reduce((a, y) => a + byYear[id].get(y)!.n, 0);
    assert.equal(sumYears, all[id].n, `tổng các năm ≠ TẤT CẢ ở ${id}`);
    console.log();
  }

  console.log("── Câu trả lời trực tiếp cho nghi vấn #8-cùng-họ ──");
  for (const id of SIG_IDS) {
    console.log(
      `${id}: phía MUA (+1/+2) bắn ${testBuy[id]}/${testN[id]} phiên trong giai đoạn test ` +
        `(≥${SPLIT_DATE}) = ${pctOf(testBuy[id], testN[id])}; phiên MUA gần nhất: ${lastBuyDate[id] ?? "chưa từng"}`
    );
  }
  console.log(
    "\nĐối chiếu bug #8: signal mùa vụ có 0/12 tháng cho điểm âm (một phía chết hẳn).\n" +
      "Cổng quyết định (viết TRƯỚC khi thấy số, docs/audit-and-improvement-proposals-2026.md):\n" +
      "  - phía MUA CÓ bắn trong test ⇒ không thoái hóa thành hằng số ⇒ ĐÓNG P1-2, engine giữ nguyên.\n" +
      "  - phía MUA KHÔNG bắn phiên nào từ 2019 ⇒ trong test signal chỉ còn là HẰNG SỐ ÂM cộng vào\n" +
      "    tổng có trọng số (buyThreshold thì cố định) ⇒ chuyển câu hỏi sang P1-1. Đây là phát biểu\n" +
      "    về HẰNG SỐ, KHÔNG phải kết luận 'signal vô dụng' — thông tin content cần ablation."
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
