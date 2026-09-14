/**
 * Một lần: dời nhãn ngày trong public/data/history/fed-funds.json từ ngày QUAN SÁT
 * (đầu tháng, nhãn gốc của FRED) sang ngày KHẢ DỤNG (đầu tháng sau — lúc FRED thực
 * sự công bố trung bình tháng đó). Xem chú thích fetchFedFunds trong scripts/fetch.ts.
 *
 * Idempotent-ish: chạy 2 lần sẽ dời 2 tháng, nên chỉ chạy khi file còn nhãn cũ —
 * script tự dừng nếu dòng cuối đã ở tương lai so với dữ liệu FRED mới nhất.
 * Sau lần này, run.ts ghi đè cache bằng bản đã dời sẵn từ fetchFedFunds.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nextMonthStart } from "./fetch";

const FILE = join(process.cwd(), "public", "data", "history", "fed-funds.json");

type Row = { date: string; value: number };

function migrate(rows: Row[]): Row[] {
  const out = rows.map((r) => ({ date: nextMonthStart(r.date), value: r.value }));
  if (out.length !== rows.length) throw new Error("mất dòng khi dời nhãn");
  for (let i = 1; i < out.length; i++) {
    if (out[i].date <= out[i - 1].date) throw new Error(`thứ tự vỡ tại ${out[i].date}`);
  }
  return out;
}

function selfCheck() {
  // nextMonthStart: trong năm + bắc cầu tháng 12
  if (nextMonthStart("2026-08-01") !== "2026-09-01") throw new Error("nextMonthStart sai");
  if (nextMonthStart("2026-12-01") !== "2027-01-01") throw new Error("nextMonthStart sai bắc cầu năm");
  if (nextMonthStart("2026-09-01") !== "2026-10-01") throw new Error("nextMonthStart sai đệm 0");
  // migrate giữ nguyên value, chỉ dời date, giữ thứ tự tăng
  const m = migrate([
    { date: "2026-11-01", value: 1 },
    { date: "2026-12-01", value: 2 },
  ]);
  if (m[0].date !== "2026-12-01" || m[1].date !== "2027-01-01") throw new Error("migrate sai nhãn");
  if (m[0].value !== 1 || m[1].value !== 2) throw new Error("migrate đổi giá trị");
  console.log("self-check OK");
}

selfCheck();

const rows: Row[] = JSON.parse(readFileSync(FILE, "utf8"));
console.log(`trước: ${rows.length} dòng, cuối = ${rows[rows.length - 1].date}`);
const out = migrate(rows);
writeFileSync(FILE, JSON.stringify(out, null, 1));
console.log(`sau:  ${out.length} dòng, cuối = ${out[out.length - 1].date}`);
