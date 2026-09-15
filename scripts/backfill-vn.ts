/**
 * Backfill lịch sử giá SJC từ CafeF (~16 tháng) vào vn-gold.json, kèm premium
 * tính từ XAU (GC=F) × tỷ giá (VND=X) cùng ngày (hoặc phiên gần nhất trước đó).
 * Entry đã có (do cron thu thập) luôn được giữ nguyên — backfill chỉ lấp chỗ trống.
 * Chạy một lần: npx tsx scripts/backfill-vn.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchXau, fetchVnGold, type DailyBar } from "./fetch";
import { collectRingGold } from "./ring-gold";
import type { VnGoldEntry } from "../src/lib/types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36";

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

export async function runBackfill(rootDir = process.cwd()): Promise<void> {
  const historyDir = join(rootDir, "public", "data", "history");
  const vnHistoryFile = join(historyDir, "vn-gold.json");
  const ringHistoryFile = join(historyDir, "ring-gold.json");

  let history: VnGoldEntry[] = [];
  if (existsSync(vnHistoryFile)) {
    const raw = readFileSync(vnHistoryFile, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Corrupt JSON in vn-gold history at ${vnHistoryFile}: ${e}`);
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid vn-gold history at ${vnHistoryFile}: expected array`);
    }
    history = parsed as VnGoldEntry[];
  }

  const [ringResult, cafefResult, xauResult, fxResult, liveResult] = await Promise.allSettled([
    collectRingGold(ringHistoryFile),
    fetchCafefSjc(),
    fetchXau(),
    fetchUsdVndHistory(),
    fetchVnGold(),
  ]);

  let cafef: { date: string; buy: number; sell: number }[] = [];
  if (cafefResult.status === "fulfilled") {
    cafef = cafefResult.value;
  } else {
    console.warn("cafef fetch failed:", cafefResult.reason);
  }

  let xau: { bars: DailyBar[] } | null = null;
  if (xauResult.status === "fulfilled") {
    xau = xauResult.value;
  } else {
    console.warn("xau fetch failed:", xauResult.reason);
  }

  let usdVnd: DailyBar[] | null = null;
  if (fxResult.status === "fulfilled") {
    usdVnd = fxResult.value;
  } else {
    console.warn("fx fetch failed:", fxResult.reason);
  }

  let live: Awaited<ReturnType<typeof fetchVnGold>> = null;
  if (liveResult.status === "fulfilled") {
    live = liveResult.value;
  } else {
    console.warn("live fetch failed:", liveResult.reason);
  }

  if (ringResult.status === "fulfilled") {
    if (ringResult.value.errors.btmc) {
      console.warn("ring btmc error:", ringResult.value.errors.btmc);
    }
    if (ringResult.value.errors.btmh) {
      console.warn("ring btmh error:", ringResult.value.errors.btmh);
    }
  }

  const ringCollected = ringResult.status === "fulfilled" ? ringResult.value.collected : 0;
  const hasUsefulPrice =
    ringCollected > 0 || cafef.length > 0 || live?.sjcSell != null;

  if (!hasUsefulPrice) {
    if (ringResult.status === "rejected") {
      throw ringResult.reason;
    }
    throw new Error("All gold price sources failed — no useful data collected");
  }

  console.log(
    `cafef: ${cafef.length} ngày (${cafef[0]?.date ?? "n/a"}..${cafef[cafef.length - 1]?.date ?? "n/a"}), ` +
      `xau: ${xau?.bars?.length ?? 0}, vnd: ${usdVnd?.length ?? 0}, ring: ${ringCollected}`
  );

  const have = new Set(history.map((e) => e.date));

  let added = 0;
  for (const c of cafef) {
    if (have.has(c.date)) continue;
    const xauClose = xau ? atOrBefore(xau.bars, c.date) : null;
    const rate = usdVnd ? atOrBefore(usdVnd, c.date) : null;
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

  // CafeF không có giá nhẫn, và dòng hôm nay trên CafeF có thể CHƯA xuất hiện
  // (độ trễ đăng dữ liệu) khi script chạy — patch-nếu-đã-có-entry từng bỏ sót
  // im lặng đúng ngày đó và mất vĩnh viễn (hôm sau "vnToday" đã đổi). Ghi đè
  // hẳn entry hôm nay bằng live (BTMC ưu tiên, chạy được trên IP nhà) — cùng
  // cách scripts/run.ts làm khi cron tự fetch được — để luôn có đủ sjc + nhẫn.
  if (live?.sjcSell) {
    const vnToday = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const idx = history.findIndex((e) => e.date === vnToday);
    const existing = idx >= 0 ? history[idx] : undefined;

    const freshXau = xau ? atOrBefore(xau.bars, vnToday) : null;
    const xauClose = freshXau ?? (existing?.xauUsd ?? null);

    const freshRate = usdVnd ? atOrBefore(usdVnd, vnToday) : null;
    const rate = freshRate ?? (existing?.usdVnd ?? null);

    const world =
      xauClose !== null && rate !== null
        ? (xauClose / TROY_OZ_GRAMS) * LUONG_GRAMS * rate
        : null;

    const premiumPct =
      world !== null && live.sjcSell !== null
        ? Math.round(((live.sjcSell - world) / world) * 10000) / 100
        : null;

    const hasNewRingPair =
      live.ringBuy != null &&
      live.ringSell != null &&
      live.ringBuy > 0 &&
      live.ringSell > 0 &&
      live.ringBuy <= live.ringSell;

    const ringBuy = hasNewRingPair ? live.ringBuy : (existing?.ringBuy ?? null);
    const ringSell = hasNewRingPair ? live.ringSell : (existing?.ringSell ?? null);

    const entry: VnGoldEntry = {
      date: vnToday,
      sjcBuy: live.sjcBuy,
      sjcSell: live.sjcSell,
      ringBuy,
      ringSell,
      usdVnd: rate,
      xauUsd: xauClose,
      premiumPct,
    };
    if (idx >= 0) history[idx] = entry;
    else history.push(entry);
    console.log(
      `entry hôm nay ${vnToday}: sjc=${live.sjcBuy}/${live.sjcSell} nhẫn=${ringBuy}/${ringSell} (nguồn: ${live.source})`
    );
  }

  if (added > 0 || live?.sjcSell) {
    history.sort((a, b) => (a.date < b.date ? -1 : 1));
    mkdirSync(historyDir, { recursive: true });
    writeFileSync(vnHistoryFile, JSON.stringify(history, null, 1));
  }

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

  if (ringResult.status === "rejected") {
    throw ringResult.reason;
  }
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntrypoint) {
  runBackfill().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
