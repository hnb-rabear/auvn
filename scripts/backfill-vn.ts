/**
 * Backfill lịch sử giá SJC từ CafeF (~16 tháng) vào vn-gold.json, kèm premium
 * tính từ XAU (GC=F) × tỷ giá (VND=X) cùng ngày (hoặc phiên gần nhất trước đó).
 * Entry đã có (do cron thu thập) luôn được giữ nguyên — backfill chỉ lấp chỗ trống.
 * Chạy một lần: npx tsx scripts/backfill-vn.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fetchXau, type DailyBar } from "./fetch";
import type { VnGoldEntry } from "../src/lib/types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36";
const HISTORY_DIR = join(process.cwd(), "public", "data", "history");
const VN_HISTORY_FILE = join(HISTORY_DIR, "vn-gold.json");

const TROY_OZ_GRAMS = 31.1034768;
const LUONG_GRAMS = 37.5;

async function fetchCafefSjc(): Promise<{ date: string; buy: number; sell: number }[]> {
  const res = await fetch("https://cafef.vn/du-lieu/Ajax/ajaxgoldpricehistory.ashx?index=all", {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`cafef HTTP ${res.status}`);
  const json = JSON.parse(await res.text());
  const rows: { name: string; buyPrice: number; sellPrice: number; createdAt: string }[] =
    json?.Data?.goldPriceWorldHistories ?? [];
  const byDate = new Map<string, { date: string; buy: number; sell: number; at: string }>();
  for (const r of rows) {
    if (r.name !== "SJC" || !r.buyPrice || !r.sellPrice) continue;
    // createdAt UTC -> ngày VN; bản ghi muộn nhất trong ngày thắng
    const date = new Date(new Date(r.createdAt).getTime() + 7 * 3600_000)
      .toISOString()
      .slice(0, 10);
    const cur = byDate.get(date);
    if (!cur || r.createdAt > cur.at) {
      byDate.set(date, {
        date,
        buy: Math.round(r.buyPrice * 1_000_000),
        sell: Math.round(r.sellPrice * 1_000_000),
        at: r.createdAt,
      });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function fetchUsdVndHistory(): Promise<DailyBar[]> {
  const res = await fetch(
    "https://query1.finance.yahoo.com/v8/finance/chart/VND=X?range=20y&interval=1d",
    { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) }
  );
  const json = await res.json();
  const r0 = json?.chart?.result?.[0];
  const ts: number[] = r0?.timestamp ?? [];
  const closes: (number | null)[] = r0?.indicators?.quote?.[0]?.close ?? [];
  const out: DailyBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null && c > 10000 && c < 60000)
      out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
  }
  if (out.length < 500) throw new Error(`VND=X: only ${out.length} rows`);
  return out;
}

/** Giá trị tại ngày d hoặc phiên gần nhất TRƯỚC đó (chợ VN mở cả ngày XAU nghỉ). */
function atOrBefore(bars: DailyBar[], d: string): number | null {
  let lo = 0;
  let hi = bars.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= d) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans >= 0 ? bars[ans].close : null;
}

async function main() {
  const [cafef, xau, usdVnd] = await Promise.all([
    fetchCafefSjc(),
    fetchXau(),
    fetchUsdVndHistory(),
  ]);
  console.log(
    `cafef: ${cafef.length} ngày (${cafef[0]?.date}..${cafef[cafef.length - 1]?.date}), ` +
      `xau: ${xau.bars.length}, vnd: ${usdVnd.length}`
  );

  let history: VnGoldEntry[] = [];
  if (existsSync(VN_HISTORY_FILE)) {
    history = JSON.parse(readFileSync(VN_HISTORY_FILE, "utf8"));
  }
  const have = new Set(history.map((e) => e.date));

  let added = 0;
  for (const c of cafef) {
    if (have.has(c.date)) continue;
    const xauClose = atOrBefore(xau.bars, c.date);
    const rate = atOrBefore(usdVnd, c.date);
    const world =
      xauClose !== null && rate !== null
        ? (xauClose / TROY_OZ_GRAMS) * LUONG_GRAMS * rate
        : null;
    const premiumPct =
      world !== null ? Math.round(((c.sell - world) / world) * 10000) / 100 : null;
    history.push({
      date: c.date,
      sjcBuy: c.buy,
      sjcSell: c.sell,
      ringBuy: null,
      ringSell: null,
      usdVnd: rate,
      xauUsd: xauClose,
      premiumPct,
      backfilled: true,
    });
    added++;
  }

  history.sort((a, b) => (a.date < b.date ? -1 : 1));
  mkdirSync(HISTORY_DIR, { recursive: true });
  writeFileSync(VN_HISTORY_FILE, JSON.stringify(history, null, 1));

  const withPremium = history.filter((e) => e.premiumPct !== null).length;
  console.log(
    `backfill xong: thêm ${added} ngày, tổng ${history.length} ngày, ${withPremium} ngày có premium.`
  );
  const prems = history
    .filter((e) => e.premiumPct !== null)
    .map((e) => e.premiumPct as number)
    .sort((a, b) => a - b);
  if (prems.length) {
    const q = (p: number) => prems[Math.floor(p * (prems.length - 1))];
    console.log(
      `premium: min=${q(0)}% p20=${q(0.2)}% p50=${q(0.5)}% p80=${q(0.8)}% max=${q(1)}%`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
