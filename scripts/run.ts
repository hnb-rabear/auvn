/** Orchestrator chạy bởi cron: fetch -> tích lũy lịch sử -> chấm điểm -> backtest -> ghi JSON. */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  fetchXau,
  fetchDxy,
  fetchFedFunds,
  fetchVnGold,
  fetchUsdVnd,
  fetchYield10y,
} from "./fetch";
import { runBacktest } from "./backtest";
import {
  technicalCriterion,
  premiumCriterion,
  macroCriterion,
  statsCriterion,
} from "../src/lib/criteria";
import {
  compositeScore,
  zoneOf,
  DEFAULT_WEIGHTS,
  type Analysis,
  type VnGoldEntry,
  type Prices,
} from "../src/lib/types";

const DATA_DIR = join(process.cwd(), "public", "data");
const HISTORY_DIR = join(DATA_DIR, "history");
const VN_HISTORY_FILE = join(HISTORY_DIR, "vn-gold.json");
// FRED hay 504 lẻ tẻ; lưu lại chuỗi Fed mỗi lần fetch được để một lần hỏng
// không xóa macro khỏi toàn bộ lịch sử backtest (xem backtest.ts).
const FED_CACHE_FILE = join(HISTORY_DIR, "fed-funds.json");

const TROY_OZ_GRAMS = 31.1034768;
const LUONG_GRAMS = 37.5;

function vnToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

function loadVnHistory(): VnGoldEntry[] {
  if (!existsSync(VN_HISTORY_FILE)) return [];
  try {
    const arr = JSON.parse(readFileSync(VN_HISTORY_FILE, "utf8"));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

type FedSeries = { date: string; value: number }[];

function loadFedCache(): FedSeries | null {
  if (!existsSync(FED_CACHE_FILE)) return null;
  try {
    const arr = JSON.parse(readFileSync(FED_CACHE_FILE, "utf8"));
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
}

async function main() {
  const warnings: string[] = [];
  const today = vnToday();

  const [xauRes, dxyRes, fedRes, vnRes, usdVndRes, yieldRes] = await Promise.all([
    fetchXau().catch(() => null),
    fetchDxy().catch(() => null),
    fetchFedFunds().catch(() => null),
    fetchVnGold().catch(() => null),
    fetchUsdVnd().catch(() => null),
    fetchYield10y().catch(() => null),
  ]);

  if (!xauRes) {
    // Không có giá thế giới thì không phân tích được gì mới — giữ nguyên dữ liệu cũ.
    console.error("FATAL: không lấy được giá XAU/USD từ mọi nguồn. Giữ dữ liệu cũ.");
    process.exitCode = 1;
    return;
  }
  console.log(`XAU: ${xauRes.bars.length} bars (${xauRes.source})`);
  if (dxyRes) console.log(`DXY: ${dxyRes.bars.length} bars (${dxyRes.source})`);
  else warnings.push("Không lấy được DXY — tín hiệu USD tạm bỏ qua.");
  // Fed: fetch được thì dùng + cache lại; hỏng thì lùi về chuỗi đã lưu để
  // macro không biến mất khỏi backtest chỉ vì FRED chập chờn một lần.
  let fed = fedRes;
  if (fed) {
    console.log(`FED: ${fed.length} months`);
  } else {
    fed = loadFedCache();
    if (fed) {
      console.log(`FED: dùng cache đã lưu (${fed.length} months) — FRED không phản hồi.`);
      warnings.push("Không lấy được lãi suất Fed mới — dùng số liệu Fed đã lưu gần nhất.");
    } else {
      warnings.push("Không lấy được lãi suất Fed — tín hiệu lãi suất tạm bỏ qua.");
    }
  }
  if (vnRes) console.log(`VN gold (${vnRes.source}):`, vnRes);
  else warnings.push("Không lấy được giá vàng VN hôm nay — dùng dữ liệu gần nhất.");
  if (usdVndRes) console.log(`USD/VND: ${usdVndRes.value} (${usdVndRes.source})`);
  else warnings.push("Không lấy được tỷ giá USD/VND hôm nay.");
  if (yieldRes) console.log(`YIELD10Y: ${yieldRes.bars.length} bars (${yieldRes.source})`);
  else warnings.push("Không lấy được lợi suất Mỹ 10 năm — tín hiệu lợi suất tạm bỏ qua.");

  const history = loadVnHistory();
  const xauLast = xauRes.bars[xauRes.bars.length - 1].close;

  // --- cập nhật lịch sử VN nếu fetch hôm nay thành công
  let usdVnd = usdVndRes?.value ?? null;
  if (usdVnd === null) {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].usdVnd !== null) {
        usdVnd = history[i].usdVnd;
        break;
      }
    }
  }

  const worldVndPerLuong =
    usdVnd !== null ? (xauLast / TROY_OZ_GRAMS) * LUONG_GRAMS * usdVnd : null;

  if (vnRes && vnRes.sjcSell !== null) {
    const premiumPct =
      worldVndPerLuong !== null
        ? ((vnRes.sjcSell - worldVndPerLuong) / worldVndPerLuong) * 100
        : null;
    const entry: VnGoldEntry = {
      date: today,
      sjcBuy: vnRes.sjcBuy,
      sjcSell: vnRes.sjcSell,
      ringBuy: vnRes.ringBuy,
      ringSell: vnRes.ringSell,
      usdVnd,
      xauUsd: xauLast,
      premiumPct: premiumPct === null ? null : Math.round(premiumPct * 100) / 100,
    };
    const idx = history.findIndex((e) => e.date === today);
    if (idx >= 0) history[idx] = entry;
    else history.push(entry);
  }

  // --- entry hiệu lực (hôm nay hoặc gần nhất)
  const effective = history.length ? history[history.length - 1] : null;
  const staleDays = effective
    ? Math.round((new Date(today).getTime() - new Date(effective.date).getTime()) / 86400_000)
    : 9999;
  const stale = staleDays > 1;

  const prices: Prices = {
    sjcBuy: effective?.sjcBuy ?? null,
    sjcSell: effective?.sjcSell ?? null,
    ringBuy: effective?.ringBuy ?? null,
    ringSell: effective?.ringSell ?? null,
    xauUsd: xauLast,
    usdVnd,
    worldVndPerLuong:
      worldVndPerLuong === null ? null : Math.round(worldVndPerLuong),
    premiumPct: effective?.premiumPct ?? null,
    premiumVnd:
      effective?.sjcSell != null && worldVndPerLuong != null
        ? Math.round(effective.sjcSell - worldVndPerLuong)
        : null,
  };

  // --- chấm điểm 4 tiêu chí
  const closes = xauRes.bars.map((b) => b.close);
  const dates = xauRes.bars.map((b) => b.date);

  const spreadPct =
    prices.sjcBuy !== null && prices.sjcSell !== null
      ? ((prices.sjcSell - prices.sjcBuy) / prices.sjcSell) * 100
      : null;
  const ringDiscountPct =
    prices.ringSell !== null && prices.sjcSell !== null
      ? ((prices.sjcSell - prices.ringSell) / prices.sjcSell) * 100
      : null;

  const criteria = [
    technicalCriterion(closes),
    premiumCriterion({
      premiumPct: prices.premiumPct,
      spreadPct,
      ringDiscountPct,
      premiumHistory: history
        .map((e) => e.premiumPct)
        .filter((p): p is number => p !== null),
    }),
    macroCriterion({
      dxyCloses: dxyRes?.bars.map((b) => b.close) ?? [],
      fedRates: fed?.map((f) => f.value) ?? [],
      usdVndHistory: history
        .filter((e) => e.usdVnd !== null)
        .map((e) => ({ date: e.date, value: e.usdVnd as number })),
      yield10y: yieldRes
        ? { closes: yieldRes.bars.map((b) => b.close), real: yieldRes.real }
        : undefined,
    }),
    statsCriterion(closes, dates),
  ];

  const premiumSeries = history
    .filter((e) => e.premiumPct !== null)
    .map((e) => ({ date: e.date, value: e.premiumPct as number }));
  const sortedPrems = premiumSeries.map((p) => p.value).sort((a, b) => a - b);
  const pct = (p: number) =>
    sortedPrems.length
      ? Math.round(sortedPrems[Math.floor(p * (sortedPrems.length - 1))] * 100) / 100
      : 0;

  const composite = compositeScore(criteria, DEFAULT_WEIGHTS);
  const analysis: Analysis = {
    generatedAt: new Date().toISOString(),
    dataDate: dates[dates.length - 1],
    stale,
    staleDays: stale ? staleDays : 0,
    prices,
    criteria,
    defaultWeights: DEFAULT_WEIGHTS,
    composite,
    zone: zoneOf(composite),
    vnHistoryDays: history.length,
    warnings,
    premiumSeries,
    premiumPercentiles:
      sortedPrems.length >= 90
        ? { p20: pct(0.2), p50: pct(0.5), p80: pct(0.8) }
        : undefined,
  };

  // --- backtest + timeline giả lập lịch sử (cùng bộ tín hiệu với phân tích live)
  const { backtest, timeline } = runBacktest(
    xauRes.bars,
    dxyRes?.bars ?? null,
    fed,
    undefined,
    { yield10y: yieldRes }
  );

  mkdirSync(HISTORY_DIR, { recursive: true });
  writeFileSync(VN_HISTORY_FILE, JSON.stringify(history, null, 1));
  // Chỉ cache khi fetch tươi thành công (fedRes), không ghi đè bằng chính bản fallback.
  if (fedRes) writeFileSync(FED_CACHE_FILE, JSON.stringify(fedRes, null, 1));
  writeFileSync(join(DATA_DIR, "analysis.json"), JSON.stringify(analysis, null, 1));
  writeFileSync(join(DATA_DIR, "backtest.json"), JSON.stringify(backtest, null, 1));
  writeFileSync(join(DATA_DIR, "timeline.json"), JSON.stringify(timeline));

  console.log(
    `OK: composite=${composite} zone=${analysis.zone} premium=${prices.premiumPct}% backtest obs=${backtest.observations}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
