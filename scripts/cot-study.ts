/**
 * COT study — ablation tiêu chí thứ 6: positioning của large specs (CFTC
 * Commitments of Traders, hợp đồng tương lai VÀNG COMEX, báo cáo legacy
 * futures-only, tuần).
 *
 * Câu hỏi: các preset macro-nặng câm trong những năm vàng tăng mà macro không
 * nới (2017 +13,6%, 2023 +13,3%). COT có phải yếu tố trực giao bắt được các
 * đợt đó không, hay lại rớt cổng như GPR/VIX?
 *
 * Giả thuyết chính (contrarian, chuẩn văn liệu): net-long của specs quá THẤP
 * so lịch sử (washout) = nhiên liệu cho sóng tăng → điểm +; quá CAO (crowded)
 * → điểm −. Biến thể trend (thuận chiều positioning) chạy kèm để đối chứng —
 * grid sẽ tự đưa về 0 nếu vô ích.
 *
 * Chống look-ahead:
 *   - Báo cáo as-of thứ Ba, CFTC công bố thứ Sáu ⇒ chỉ khả dụng từ asOf + 4
 *     ngày lịch.
 *   - Percentile tính trên trailing 156 tuần ĐÃ CÔNG BỐ tính đến ngày đó,
 *     cần ≥52 tuần mới chấm (trước đó không gắn điểm — composite tự chuẩn hóa
 *     như đường live khi thiếu tiêu chí).
 *
 * Khung kiểm chứng: giống factor-study-momentum-offline — grid 5D bước 10% ×
 * ngưỡng 30/40/50/60, cổng ≥25 tín hiệu + thắng baseline Ở CẢ train <2019 và
 * test ≥2019, xếp min-excess; so best min-excess với grid 4D cùng dữ liệu.
 * Thêm: phân bố NĂM của tín hiệu cấu hình dùng COT (có bắn 2017/2021–2023
 * không — mục tiêu ban đầu), và tương quan điểm COT với điểm macro.
 *
 * Dữ liệu: tải trước các file legacy futures-only về COT_DIR (mặc định
 * scratchpad/cot), mỗi năm một annual.txt:
 *   for y in $(seq 2006 2026); do
 *     curl -sSo deacot$y.zip "https://www.cftc.gov/files/dea/history/deacot$y.zip"
 *     unzip -p deacot$y.zip > cot-$y.txt
 *   done
 * (cftc.gov cần được allow trong network policy của môi trường chạy.)
 *
 * Chạy: COT_DIR=/path/to/cot npx tsx scripts/cot-study.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SPLIT_DATE, MIN_SIGNALS, stats } from "./study-lib";
import type { TimelinePoint } from "../src/lib/types";

const COT_DIR = process.env.COT_DIR ?? "/tmp/cot";
const MARKET_PREFIX = "GOLD - COMMODITY EXCHANGE";
const PUBLICATION_LAG_DAYS = 4; // as-of thứ Ba → công bố thứ Sáu
const TRAILING_WEEKS = 156; // ~3 năm
const MIN_WEEKS = 52;

type H = "21" | "63" | "126";
const HS: H[] = ["21", "63", "126"];

// ---------- parse legacy annual.txt (CSV có quote quanh tên market) ----------
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

interface CotWeek {
  asOf: string; // YYYY-MM-DD
  availableFrom: string; // YYYY-MM-DD
  /** net non-commercial / open interest, -1..1 */
  net: number;
}

function parseCotDir(dir: string): CotWeek[] {
  const weeks = new Map<string, CotWeek>();
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt"));
  if (!files.length) throw new Error(`COT_DIR ${dir} không có file .txt nào`);
  for (const f of files) {
    const lines = readFileSync(join(dir, f), "utf8").split(/\r?\n/);
    const header = splitCsv(lines[0]);
    const col = (needle: string) => header.findIndex((h) => h.includes(needle));
    const iName = col("Market and Exchange Names");
    const iDateIso = col("As of Date in Form YYYY-MM-DD");
    const iDateYmd = col("As of Date in Form YYMMDD");
    const iOi = col("Open Interest (All)");
    const iLong = col("Noncommercial Positions-Long (All)");
    const iShort = col("Noncommercial Positions-Short (All)");
    if (iName < 0 || iOi < 0 || iLong < 0 || iShort < 0 || (iDateIso < 0 && iDateYmd < 0))
      throw new Error(`${f}: không nhận diện được cột (header: ${header.slice(0, 6).join(" | ")}…)`);
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const c = splitCsv(line);
      if (!c[iName]?.toUpperCase().startsWith(MARKET_PREFIX)) continue;
      let asOf: string;
      if (iDateIso >= 0 && c[iDateIso]) asOf = c[iDateIso];
      else {
        const y = c[iDateYmd];
        // YYMMDD: 06xxxx..99xxxx → 20xx cho <50
        const yy = Number(y.slice(0, 2));
        asOf = `${yy < 50 ? 2000 + yy : 1900 + yy}-${y.slice(2, 4)}-${y.slice(4, 6)}`;
      }
      const oi = Number(c[iOi]);
      const lo = Number(c[iLong]);
      const sh = Number(c[iShort]);
      if (!isFinite(oi) || oi <= 0 || !isFinite(lo) || !isFinite(sh)) continue;
      const avail = new Date(new Date(asOf).getTime() + PUBLICATION_LAG_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);
      weeks.set(asOf, { asOf, availableFrom: avail, net: (lo - sh) / oi });
    }
  }
  return [...weeks.values()].sort((a, b) => (a.asOf < b.asOf ? -1 : 1));
}

// ---------- gắn điểm COT past-only vào timeline ----------
function addCot(points: TimelinePoint[], weeks: CotWeek[], orientation: "contrarian" | "trend"): number {
  let covered = 0;
  let w = -1;
  for (const p of points) {
    while (w + 1 < weeks.length && weeks[w + 1].availableFrom <= p.date) w++;
    if (w < 0) continue;
    const lo = Math.max(0, w - TRAILING_WEEKS + 1);
    const window = weeks.slice(lo, w + 1);
    if (window.length < MIN_WEEKS) continue;
    const cur = weeks[w].net;
    const below = window.filter((x) => x.net <= cur).length;
    const pct = below / window.length;
    let s = 0;
    if (pct <= 0.1) s = 2;
    else if (pct <= 0.25) s = 1;
    else if (pct >= 0.9) s = -2;
    else if (pct >= 0.75) s = -1;
    if (orientation === "trend") s = -s;
    (p.scores as Record<string, number>)["cot"] = s;
    covered++;
  }
  return covered;
}

// ---------- grid search (4D base / 5D +cot) ----------
function composite(p: TimelinePoint, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores as Record<string, number>)) {
    const wk = w[k] ?? 0;
    s += score * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

interface Cand {
  w: Record<string, number>;
  thr: number;
  tr: ReturnType<typeof stats>;
  te: ReturnType<typeof stats>;
  minExcess: number;
}

function gridSearch(points: TimelinePoint[], h: H, includeCot: boolean) {
  const valid = points.filter((p) => p.returns[h] !== null);
  const train = valid.filter((p) => p.date < SPLIT_DATE);
  const test = valid.filter((p) => p.date >= SPLIT_DATE);
  const baseTrain = stats(train.map((p) => p.returns[h] as number)).fav;
  const baseTest = stats(test.map((p) => p.returns[h] as number)).fav;
  const candidates: Cand[] = [];

  const tryW = (w: Record<string, number>) => {
    for (const thr of [30, 40, 50, 60]) {
      const tr = stats(train.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number));
      const te = stats(test.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number));
      if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
      const exTr = tr.fav - baseTrain;
      const exTe = te.fav - baseTest;
      if (exTr <= 0 || exTe <= 0) continue;
      candidates.push({ w, thr, tr, te, minExcess: Math.min(exTr, exTe) });
    }
  };

  for (let wt = 0; wt <= 10; wt++)
    for (let ws = 0; ws <= 10 - wt; ws++)
      for (let wmom = 0; wmom <= 10 - wt - ws; wmom++) {
        if (includeCot) {
          for (let wc = 0; wc <= 10 - wt - ws - wmom; wc++) {
            const wm = 10 - wt - ws - wmom - wc;
            tryW({ technical: wt / 10, stats: ws / 10, macro: wm / 10, momentum: wmom / 10, cot: wc / 10 });
          }
        } else {
          const wm = 10 - wt - ws - wmom;
          tryW({ technical: wt / 10, stats: ws / 10, macro: wm / 10, momentum: wmom / 10 });
        }
      }

  candidates.sort((a, b) => b.minExcess - a.minExcess);
  return { baseTrain, baseTest, candidates, train, test };
}

const fmtW = (w: Record<string, number>) =>
  ["technical", "stats", "macro", "momentum", "cot"]
    .filter((k) => w[k] !== undefined && w[k] > 0)
    .map((k) => `${k === "technical" ? "KT" : k === "stats" ? "TK" : k === "macro" ? "VM" : k === "momentum" ? "MOM" : "COT"}:${w[k]}`)
    .join(" ");
const fmtCand = (c: Cand) =>
  `w=${fmtW(c.w)} thr=${c.thr} | train ${(c.tr.fav * 100).toFixed(1)}% (n=${c.tr.n}) | ` +
  `test ${(c.te.fav * 100).toFixed(1)}% (n=${c.te.n} med=${c.te.med.toFixed(1)}%) | min-excess +${(c.minExcess * 100).toFixed(1)}pt`;

// ---------- main ----------
const tl: { points: TimelinePoint[] } = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const weeks = parseCotDir(COT_DIR);
console.log(
  `COT vàng COMEX: ${weeks.length} tuần (${weeks[0].asOf} → ${weeks[weeks.length - 1].asOf}) | ` +
    `net/OI: min ${Math.min(...weeks.map((w) => w.net)).toFixed(3)} max ${Math.max(...weeks.map((w) => w.net)).toFixed(3)}`
);
console.log(`timeline: ${tl.points.length} điểm (${tl.points[0].date} → ${tl.points[tl.points.length - 1].date})\n`);

const variants: [string, TimelinePoint[], boolean][] = [];
const ptsBase = tl.points.map((p) => ({ ...p, scores: { ...p.scores } }));
variants.push(["base (4 tiêu chí)", ptsBase, false]);
for (const orient of ["contrarian", "trend"] as const) {
  const pts = tl.points.map((p) => ({ ...p, scores: { ...p.scores } }));
  const covered = addCot(pts, weeks, orient);
  const dist: Record<number, number> = {};
  for (const p of pts) {
    const s = (p.scores as Record<string, number>)["cot"];
    if (s !== undefined) dist[s] = (dist[s] ?? 0) + 1;
  }
  // tương quan điểm COT × điểm macro (orthogonality thô)
  const pairs = pts
    .map((p) => [(p.scores as Record<string, number>)["cot"], (p.scores as Record<string, number>)["macro"]])
    .filter(([a, b]) => a !== undefined && b !== undefined) as [number, number][];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ma = mean(pairs.map((x) => x[0]));
  const mb = mean(pairs.map((x) => x[1]));
  const cov = mean(pairs.map(([a, b]) => (a - ma) * (b - mb)));
  const sd = (xs: number[], m: number) => Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  const corr = cov / (sd(pairs.map((x) => x[0]), ma) * sd(pairs.map((x) => x[1]), mb) || 1);
  console.log(
    `+COT ${orient}: phủ ${covered}/${pts.length} điểm | phân phối ${Object.entries(dist)
      .sort(([a], [b]) => +a - +b)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ")} | corr(COT, macro) = ${corr.toFixed(2)}`
  );
  variants.push([`+COT ${orient} (5 tiêu chí)`, pts, true]);
}
console.log("");

const results: Record<string, Record<H, number>> = {};
const bestCotCand: Record<string, Partial<Record<H, Cand>>> = {};
for (const [name, points, incCot] of variants) {
  console.log(`################ ${name} ################`);
  results[name] = { "21": 0, "63": 0, "126": 0 };
  bestCotCand[name] = {};
  for (const h of HS) {
    const { baseTrain, baseTest, candidates } = gridSearch(points, h, incCot);
    if (!candidates.length) {
      console.log(`  H${h}: KHÔNG cấu hình nào đạt chuẩn`);
      continue;
    }
    results[name][h] = candidates[0].minExcess;
    console.log(`  H${h} (baseline ${(baseTrain * 100).toFixed(1)}/${(baseTest * 100).toFixed(1)}%) BEST: ${fmtCand(candidates[0])}`);
    if (incCot) {
      const withCot = candidates.find((c) => (c.w.cot ?? 0) > 0);
      bestCotCand[name][h] = withCot;
      if (withCot && withCot !== candidates[0]) console.log(`      best-có-COT: ${fmtCand(withCot)}`);
      // mục tiêu ban đầu: cấu hình dùng COT có bắn trong các năm câm không?
      if (withCot) {
        const byYear: Record<string, number> = {};
        for (const p of points) {
          if (p.returns[h] === null) continue;
          if (composite(p, withCot.w) >= withCot.thr) {
            const y = p.date.slice(0, 4);
            byYear[y] = (byYear[y] ?? 0) + 1;
          }
        }
        const quiet = ["2017", "2021", "2022", "2023"].map((y) => `${y}:${byYear[y] ?? 0}`).join(" ");
        console.log(`      tín hiệu các năm câm (${quiet}) | tổng theo năm: ${Object.entries(byYear).map(([y, n]) => `${y.slice(2)}:${n}`).join(" ")}`);
      }
    }
  }
  console.log("");
}

console.log("################ SO SÁNH MIN-EXCESS (pt) ################");
console.log(`${"Biến thể".padEnd(28)} ${"1 tháng".padStart(9)} ${"3 tháng".padStart(9)} ${"6 tháng".padStart(9)}`);
for (const [name, r] of Object.entries(results)) {
  console.log(
    `${name.padEnd(28)} ${(r["21"] * 100).toFixed(1).padStart(8)} ${(r["63"] * 100).toFixed(1).padStart(8)} ${(r["126"] * 100).toFixed(1).padStart(8)}`
  );
}
const base = results["base (4 tiêu chí)"];
for (const orient of ["contrarian", "trend"]) {
  const r = results[`+COT ${orient} (5 tiêu chí)`];
  const ds = HS.map((h) => (r[h] - base[h]) * 100);
  const improved = ds.filter((d) => d > 0).length;
  console.log(
    `\nΔ +COT ${orient} vs base: ${ds.map((d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}pt`).join("  ")} → ` +
      (improved >= 2 ? "CẢI THIỆN đa số kỳ hạn — đáng cân nhắc thêm vào engine" : improved === 1 ? "chỉ 1 kỳ hạn — hiệu quả giới hạn" : "KHÔNG cải thiện — LOẠI (như GPR/VIX)")
  );
}
