/**
 * Một lần (2026-09-25): hợp nhất chuỗi usdVnd trong public/data/history/vn-gold.json về
 * MỘT nguồn — giá bán Vietcombank (chủ dự án chọn). Trước đó ~515 dòng backfill dùng
 * Yahoo VND=X, các dòng cron dùng Vietcombank; hai nguồn lệch ~0,73% nên premium của
 * các dòng không so được với nhau (percentile p20/p50/p80 lệch theo).
 *
 * CHỈ đổi `usdVnd` và `premiumPct` (tính lại bằng đúng công thức cron/backfill đang dùng
 * — đã kiểm: công thức tái lập 593/593 dòng hiện có). Không đụng giá SJC/nhẫn/XAU, không
 * thêm/bớt dòng. Dòng nào Vietcombank không trả thì GIỮ NGUYÊN và in cảnh báo.
 *
 * Idempotent: dòng đã khớp Vietcombank thì không đổi. Chạy thử: `--dry-run`.
 *   npx tsx scripts/migrate-usdvnd-vcb.ts --dry-run
 *   npx tsx scripts/migrate-usdvnd-vcb.ts
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchVcbUsdVndAt } from "./fetch";
import type { VnGoldEntry } from "../src/lib/types";

const FILE = join(process.cwd(), "public", "data", "history", "vn-gold.json");
const TROY_OZ_GRAMS = 31.1034768;
const LUONG_GRAMS = 37.5;

/** Đúng công thức scripts/run.ts + backfill-vn.ts (làm tròn 2 số lẻ). */
export function premiumOf(sjcSell: number, xauUsd: number, usdVnd: number): number {
  const world = (xauUsd / TROY_OZ_GRAMS) * LUONG_GRAMS * usdVnd;
  return Math.round(((sjcSell - world) / world) * 10000) / 100;
}

function selfCheck(rows: VnGoldEntry[]) {
  // công thức phải tái lập premium đang lưu, nếu không thì đừng ghi gì cả
  let bad = 0;
  for (const e of rows) {
    if (e.premiumPct == null || e.usdVnd == null || e.xauUsd == null || e.sjcSell == null) continue;
    if (Math.abs(premiumOf(e.sjcSell, e.xauUsd, e.usdVnd) - e.premiumPct) > 0.011) bad++;
  }
  if (bad) throw new Error(`công thức không tái lập được ${bad} dòng premium — dừng, không ghi`);
  // ví dụ số: 86tr, XAU 2500, tỷ giá 25400 ⇒ 12,33% (khóa cùng số với tests/ring-gold-sync)
  if (premiumOf(86_000_000, 2500, 25400) !== 12.33) throw new Error("premiumOf sai");
  console.log("self-check OK");
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const rows: VnGoldEntry[] = JSON.parse(readFileSync(FILE, "utf8"));
  if (!Array.isArray(rows) || !rows.length) throw new Error("vn-gold.json rỗng/không phải mảng");
  selfCheck(rows);

  let changed = 0;
  let same = 0;
  const missing: string[] = [];
  const out: VnGoldEntry[] = [];
  for (const e of rows) {
    const vcb = await fetchVcbUsdVndAt(e.date);
    if (vcb === null) {
      missing.push(e.date);
      out.push(e);
      continue;
    }
    if (e.usdVnd === vcb) {
      same++;
      out.push(e);
      continue;
    }
    const premiumPct =
      e.sjcSell != null && e.xauUsd != null ? premiumOf(e.sjcSell, e.xauUsd, vcb) : e.premiumPct;
    if (changed < 5 || dry)
      console.log(`${e.date}: usdVnd ${e.usdVnd} → ${vcb}, premium ${e.premiumPct} → ${premiumPct}`);
    out.push({ ...e, usdVnd: vcb, premiumPct });
    changed++;
  }

  if (out.length !== rows.length) throw new Error("mất dòng — dừng");
  console.log(`\n${rows.length} dòng: đổi ${changed}, đã khớp ${same}, Vietcombank không trả ${missing.length}`);
  if (missing.length) console.log(`  giữ nguyên (không có tỷ giá VCB): ${missing.join(", ")}`);

  if (dry) {
    console.log("--dry-run: không ghi file.");
    return;
  }
  // ghi qua file tạm + rename: không để lại vn-gold.json ghi dở (data/ là database)
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(out, null, 1));
  renameSync(tmp, FILE);
  console.log("đã ghi vn-gold.json");
}

// Chỉ chạy khi gọi trực tiếp — import module này (ví dụ để dùng premiumOf) KHÔNG
// được ghi đè lịch sử. Cùng khuôn với scripts/backfill-vn.ts.
const isEntrypoint =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
