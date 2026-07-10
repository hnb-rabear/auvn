/**
 * FOMC sell-timing study — người bán linh hoạt vài ngày quanh kỳ họp Fed: nên bán
 * TRƯỚC hay SAU công bố? Sự kiện lịch FOMC là "mechanism family" cuối cùng còn
 * khả thi dữ liệu-free cho câu hỏi timing bán (intraday/ring/premium-mùa vụ đều bị
 * chặn dữ liệu).
 *
 * Dữ liệu ngày họp:
 *   - 2009–2018: CSV lịch sử returnandrisk/r-code (fomcdates_1936_2018.csv, dedupe
 *     enddate, chỉ scheduled) — đặt tại FOMC_CSV (mặc định /tmp/fomc_1936_2018.csv).
 *   - 2019–2026: hardcode từ federalreserve.gov (fomccalendars + historical 2019/2020,
 *     lấy 2026-07-10; chỉ scheduled, bỏ unscheduled/notation vote; 2020-03-17/18 bị hủy).
 * Ngày quyết định = ngày 2 của kỳ họp (công bố 14h ET). d = bar giao dịch ĐÚNG ngày đó
 * (lệch thì bỏ kỳ họp — hiếm).
 *
 * Đo (train <2019 / test ≥2019, ~80/60 sự kiện — độc lập thật, không pseudo-replication):
 *   1. ret(d−1 → d+k), k ∈ {1,2,3,5,10}: dương hệ thống ⇒ bán SAU công bố tốt hơn.
 *      fav% + trung vị + block-bootstrap CI (block 2).
 *   2. drift trước họp: ret(d−5 → d−1).
 *   3. |move| ngày công bố vs ngày thường (bối cảnh vol).
 * Cổng: CI của mean ret(d−1→d+k) tách 0 CÙNG DẤU ở cả 2 era với ít nhất một k.
 *
 * Chạy: FOMC_CSV=/tmp/fomc_1936_2018.csv npx tsx scripts/fomc-sell-study.ts
 */
import { readFileSync } from "node:fs";
import { fetchXau } from "./fetch";
import { blockBootstrapCi, median, seededRandom } from "../src/lib/indicators";

const SPLIT = "2019-01-01";
const CSV = process.env.FOMC_CSV ?? "/tmp/fomc_1936_2018.csv";

/** CI 95% bootstrap khối cho TRUNG BÌNH (blockBootstrapCi của repo là cho tỉ lệ >0). */
function meanBlockCi(xs: number[], block: number, iters = 2000, seed = 20260711): [number, number] | null {
  const n = xs.length;
  if (n < 10) return null;
  const b = Math.max(1, Math.min(block, n));
  const nBlocks = Math.ceil(n / b);
  const rand = seededRandom(seed);
  const means: number[] = [];
  for (let it = 0; it < iters; it++) {
    let s = 0, tot = 0;
    for (let k = 0; k < nBlocks; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < b && tot < n; j++) { s += xs[(start + j) % n]; tot++; }
    }
    means.push(s / tot);
  }
  means.sort((a, c) => a - c);
  return [means[Math.floor(0.025 * (iters - 1))], means[Math.floor(0.975 * (iters - 1))]];
}

function loadFomcDates(): string[] {
  // 2009-2018 từ CSV
  const iso = (mdY: string): string => {
    const [m, d, y] = mdY.split("/").map(Number);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const set = new Set<string>();
  for (const line of readFileSync(CSV, "utf8").split("\n").slice(1)) {
    const cols = line.split(",");
    if (cols.length < 4) continue;
    const end = cols[1]?.trim();
    const scheduled = cols[3]?.trim();
    if (!end || scheduled !== "1") continue;
    const d = iso(end);
    if (d >= "2009-01-01" && d < "2019-01-01") set.add(d);
  }
  // 2019-2026 hardcode (scheduled, ngày 2; nguồn federalreserve.gov lấy 2026-07-10)
  const hard = [
    "2019-01-30", "2019-03-20", "2019-05-01", "2019-06-19", "2019-07-31", "2019-09-18", "2019-10-30", "2019-12-11",
    "2020-01-29", "2020-04-29", "2020-06-10", "2020-07-29", "2020-09-16", "2020-11-05", "2020-12-16",
    "2021-01-27", "2021-03-17", "2021-04-28", "2021-06-16", "2021-07-28", "2021-09-22", "2021-11-03", "2021-12-15",
    "2022-01-26", "2022-03-16", "2022-05-04", "2022-06-15", "2022-07-27", "2022-09-21", "2022-11-02", "2022-12-14",
    "2023-02-01", "2023-03-22", "2023-05-03", "2023-06-14", "2023-07-26", "2023-09-20", "2023-11-01", "2023-12-13",
    "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12", "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
    "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
  ];
  for (const d of hard) set.add(d);
  return [...set].sort();
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const idxByDate = new Map(dates.map((d, i) => [d, i]));

  const fomc = loadFomcDates().filter((d) => d >= dates[0] && d <= dates[dates.length - 1]);
  const events: number[] = [];
  let skipped = 0;
  for (const d of fomc) {
    const i = idxByDate.get(d);
    if (i === undefined) { skipped++; continue; } // ngày họp rơi vào ngày không có bar
    if (i < 6 || i + 11 >= closes.length) continue;
    events.push(i);
  }
  const tr = events.filter((i) => dates[i] < SPLIT);
  const te = events.filter((i) => dates[i] >= SPLIT);
  console.log(`FOMC events dùng được: ${events.length} (train ${tr.length}/test ${te.length}), bỏ ${skipped} kỳ không khớp bar.`);

  const pct = (a: number, b: number) => ((b - a) / a) * 100;
  const fmt = (xs: number[], block = 2) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const ci = meanBlockCi(xs, block);
    const fav = xs.filter((x) => x > 0).length / xs.length;
    return `mean ${mean >= 0 ? "+" : ""}${mean.toFixed(2)}% (CI ${ci ? ci.map((x) => x.toFixed(2)).join("..") : "—"}) med ${median(xs)!.toFixed(2)}% %>0 ${(fav * 100).toFixed(0)}% n=${xs.length}`;
  };

  console.log("\n=== 1. Bán trước (d−1) vs bán sau (d+k): ret(d−1 → d+k), dương = SAU tốt hơn ===");
  for (const k of [1, 2, 3, 5, 10]) {
    const rTr = tr.map((i) => pct(closes[i - 1], closes[i + k]));
    const rTe = te.map((i) => pct(closes[i - 1], closes[i + k]));
    const ciTr = meanBlockCi(rTr, 2);
    const ciTe = meanBlockCi(rTe, 2);
    const sameSign = ciTr && ciTe && ((ciTr[0] > 0 && ciTe[0] > 0) || (ciTr[1] < 0 && ciTe[1] < 0));
    console.log(`  k=${String(k).padEnd(2)} train: ${fmt(rTr)} | test: ${fmt(rTe)} → ${sameSign ? "✓ CI cùng dấu 2 era" : "✗"}`);
  }

  console.log("\n=== 2. Drift trước họp: ret(d−5 → d−1) ===");
  console.log(`  train: ${fmt(tr.map((i) => pct(closes[i - 5], closes[i - 1])))}`);
  console.log(`  test : ${fmt(te.map((i) => pct(closes[i - 5], closes[i - 1])))}`);

  console.log("\n=== 3. |move| ngày công bố vs ngày thường ===");
  const absMove = (i: number) => Math.abs(pct(closes[i - 1], closes[i]));
  const evAbs = events.map(absMove);
  const evSet = new Set(events);
  const normAbs: number[] = [];
  for (let i = 1; i < closes.length; i++) if (!evSet.has(i)) normAbs.push(Math.abs(pct(closes[i - 1], closes[i])));
  console.log(`  FOMC: med ${median(evAbs)!.toFixed(2)}% | ngày thường: med ${median(normAbs)!.toFixed(2)}%`);

  console.log("\n=== 4. Điều kiện chu kỳ (tham khảo, n nhỏ): ret(d−1→d+3) khi Fed đang thắt vs nới ===");
  // dùng fed-funds.json local cache
  try {
    const fed: { date: string; value: number }[] = JSON.parse(
      readFileSync("public/data/history/fed-funds.json", "utf8")
    );
    const dir = (d: string): "thắt" | "nới" | "đi ngang" => {
      const past = fed.filter((f) => f.date <= d);
      if (past.length < 4) return "đi ngang";
      const delta = past[past.length - 1].value - past[past.length - 4].value;
      return delta > 0.05 ? "thắt" : delta < -0.05 ? "nới" : "đi ngang";
    };
    for (const era of [["train", tr], ["test", te]] as const) {
      const parts = ["thắt", "nới", "đi ngang"].map((mode) => {
        const xs = era[1].filter((i) => dir(dates[i]) === mode).map((i) => pct(closes[i - 1], closes[i + 3]));
        return xs.length >= 8 ? `${mode}: ${fmt(xs)}` : `${mode}: n=${xs.length} <8`;
      });
      console.log(`  ${era[0]}: ${parts.join(" | ")}`);
    }
  } catch {
    console.log("  (không đọc được fed-funds.json — bỏ mục 4)");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
