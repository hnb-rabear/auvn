/**
 * P1-3 — DFII10 (lợi suất THỰC 10 năm, TIPS) làm sub-signal vĩ mô thứ tư.
 *
 * Vì sao chạy: đề xuất "thay ^TNX bằng DFII10" đã bị loại 2 lần bằng bằng chứng, nhưng
 * cả 2 lần đều ở bối cảnh KHÁC — thay-thế 1-đổi-1 trong tiêu chí macro trung bình cộng,
 * chưa lần nào DFII10 được vào LƯỚI cùng 3 sub-signal kia để grid tự chọn trọng số. Sau
 * v4 (macro-decomp, `macroSub`) ô đó mới mở ra. Đây là ô trống hợp lệ duy nhất của đề
 * xuất #4 trong docs/audit-and-improvement-proposals-2026.md.
 *
 * Dự báo viết TRƯỚC khi chạy: train âm như 2 lần trước. Chạy để ĐÓNG câu hỏi, không phải
 * để ship.
 *
 * CỔNG NGHIỆM THU (y hệt macro-decomp-study.ts, không nới):
 *   G1. n >= 25 tín hiệu ở CẢ train (<2019) và test (>=2019).
 *   G2. excess = fav − baseline > 0 ở CẢ train và test.
 *   G3. min-excess của lưới 7D phải hơn lưới 6D (v4 đang phát hành) > 0,5pt ở >= 2/3
 *       kỳ hạn. Ngưỡng 0,5pt vì 7D BAO TRỌN 6D (đặt rdx=0 là quay về 6D) nên
 *       min-excess 7D >= 6D là tất yếu về mặt toán — chênh 0,0..0,5pt là nhiễu tìm kiếm,
 *       không phải thông tin. Cùng lý lẽ đã dùng cho 6D-vs-4D.
 *   G4. Cấu hình thắng phải có rdx > 0 (nếu winner đặt rdx=0 thì DFII10 vô ích — grid
 *       tự bỏ nó) VÀ vượt placebo cùng-n: thay chuỗi DFII10 bằng chuỗi ĐÃ XÁO khối
 *       (block shuffle giữ tự tương quan) rồi chạy lại đúng cấu hình đó; fav thật phải
 *       vượt p95 của placebo ở CẢ train và test.
 * Không qua đủ 4 cổng ⇒ NO-GO, đóng câu hỏi, không sửa engine.
 *
 * Chống nhìn trước: `rdxScore` dùng ĐÚNG mapping của `yieldScore` (Δ 63 phiên, ngưỡng
 * ±0,1/±0,4) để so sánh là so bản chất CHUỖI (thực vs danh nghĩa), không phải so hai
 * cách chấm điểm khác nhau. Con trỏ đơn điệu, chỉ nạp bar có date <= ngày đang chấm.
 *
 * Dữ liệu: timeline.json (điểm KT/TK/MOM), cache
 * public/data/history/{fed-funds,yield10y}.json, DXY + DFII10 fetch (cache tạm để chạy
 * lại không cần mạng: DFII10_STUDY_DXY_CACHE / DFII10_STUDY_RDX_CACHE).
 *
 * Chạy: npx tsx scripts/dfii10-decomp-study.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SPLIT_DATE, MIN_SIGNALS, stats, seededRandom } from "./study-lib";
import { fetchDxy, fetchRealYield, type DailyBar } from "./fetch";
import type { TimelinePoint } from "../src/lib/types";

type H = "21" | "63" | "126";
const HS: H[] = ["21", "63", "126"];
const DXY_CACHE = process.env.DFII10_STUDY_DXY_CACHE ?? join(tmpdir(), "dxy-cache.json");
const RDX_CACHE = process.env.DFII10_STUDY_RDX_CACHE ?? join(tmpdir(), "dfii10-cache.json");
const PLACEBO_DRAWS = 200;
/** Khối xáo = 63 phiên, đúng cửa sổ mà rdxScore/yieldScore đọc. */
const PLACEBO_BLOCK = 63;

// ---------- sub-score mappings (sao đúng macroCriterion / macro-decomp-study) ----------
function sma(xs: number[], n: number): number | null {
  if (xs.length < n) return null;
  let s = 0;
  for (let i = xs.length - n; i < xs.length; i++) s += xs[i];
  return s / n;
}

function dxyScore(closes: number[]): number | null {
  if (closes.length < 51) return null;
  const last = closes[closes.length - 1];
  const ma50 = sma(closes, 50)!;
  const prev21 = closes[closes.length - 22];
  const chg = ((last - prev21) / prev21) * 100;
  const above = last > ma50;
  if (above && chg > 1) return -2;
  if (above) return -1;
  if (!above && chg < -1) return 2;
  return 1;
}

function fedScore(rates: number[]): number | null {
  if (rates.length < 4) return null;
  const d = rates[rates.length - 1] - rates[rates.length - 4];
  if (d <= -0.25) return 2;
  if (d < 0) return 1;
  if (d === 0) return 0;
  if (d < 0.25) return -1;
  return -2;
}

/** Dùng cho CẢ ^TNX (danh nghĩa) và DFII10 (thực) — so chuỗi, không so mapping. */
function yieldScore(closes: number[]): number | null {
  if (closes.length < 64) return null;
  const d = closes[closes.length - 1] - closes[closes.length - 64];
  if (d <= -0.4) return 2;
  if (d <= -0.1) return 1;
  if (d < 0.1) return 0;
  if (d < 0.4) return -1;
  return -2;
}

// ---------- load data ----------
async function cachedBars(
  cache: string,
  label: string,
  fn: () => Promise<{ bars: DailyBar[]; source: string } | null>
): Promise<DailyBar[]> {
  if (existsSync(cache)) {
    const bars = JSON.parse(readFileSync(cache, "utf8")) as DailyBar[];
    if (bars.length >= 500) return bars;
  }
  const res = await fn();
  if (!res) throw new Error(`Không fetch được ${label}`);
  writeFileSync(cache, JSON.stringify(res.bars));
  console.log(`${label}: ${res.bars.length} bars từ ${res.source} (cache → ${cache})`);
  return res.bars;
}

interface Pt {
  date: string;
  scores: Record<string, number>;
  returns: Record<H, number | null>;
}

// ---------- grid ----------
function composite(p: Pt, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (wk === 0) continue;
    const score = p.scores[k];
    if (score === undefined) continue;
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

function evalGrid(points: Pt[], h: H, weightSets: Record<string, number>[]) {
  const valid = points.filter((p) => p.returns[h] !== null);
  const train = valid.filter((p) => p.date < SPLIT_DATE);
  const test = valid.filter((p) => p.date >= SPLIT_DATE);
  const baseTrain = stats(train.map((p) => p.returns[h] as number)).fav;
  const baseTest = stats(test.map((p) => p.returns[h] as number)).fav;
  const candidates: Cand[] = [];
  for (const w of weightSets) {
    for (const thr of [30, 40, 50, 60]) {
      const tr = stats(train.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number));
      const te = stats(test.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number));
      if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
      const exTr = tr.fav - baseTrain;
      const exTe = te.fav - baseTest;
      if (exTr <= 0 || exTe <= 0) continue;
      candidates.push({ w, thr, tr, te, minExcess: Math.min(exTr, exTe) });
    }
  }
  candidates.sort((a, b) => b.minExcess - a.minExcess);
  return { baseTrain, baseTest, candidates };
}

/** Lưới 6D đang phát hành (v4): KT/TK/MOM/DXY/FED/YLD, bước 10%. */
function weightSets6(): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (let wt = 0; wt <= 10; wt++)
    for (let ws = 0; ws <= 10 - wt; ws++)
      for (let wmom = 0; wmom <= 10 - wt - ws; wmom++)
        for (let wd = 0; wd <= 10 - wt - ws - wmom; wd++)
          for (let wf = 0; wf <= 10 - wt - ws - wmom - wd; wf++) {
            const wy = 10 - wt - ws - wmom - wd - wf;
            out.push({
              technical: wt / 10,
              stats: ws / 10,
              momentum: wmom / 10,
              dxy: wd / 10,
              fed: wf / 10,
              yield10y: wy / 10,
            });
          }
  return out;
}

/** Lưới 7D: 6D + rdx (DFII10). Bao trọn 6D khi rdx=0 — xem lý lẽ G3 ở header. */
function weightSets7(): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (let wt = 0; wt <= 10; wt++)
    for (let ws = 0; ws <= 10 - wt; ws++)
      for (let wmom = 0; wmom <= 10 - wt - ws; wmom++)
        for (let wd = 0; wd <= 10 - wt - ws - wmom; wd++)
          for (let wf = 0; wf <= 10 - wt - ws - wmom - wd; wf++)
            for (let wy = 0; wy <= 10 - wt - ws - wmom - wd - wf; wy++) {
              const wr = 10 - wt - ws - wmom - wd - wf - wy;
              out.push({
                technical: wt / 10,
                stats: ws / 10,
                momentum: wmom / 10,
                dxy: wd / 10,
                fed: wf / 10,
                yield10y: wy / 10,
                rdx: wr / 10,
              });
            }
  return out;
}

const KEY_LABEL: Record<string, string> = {
  technical: "KT",
  stats: "TK",
  momentum: "MOM",
  dxy: "DXY",
  fed: "FED",
  yield10y: "YLD",
  rdx: "RDX",
};
const fmtW = (w: Record<string, number>) =>
  Object.entries(w)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${KEY_LABEL[k]}:${v}`)
    .join(" ");
const fmtCand = (c: Cand) =>
  `w=${fmtW(c.w)} thr=${c.thr} | train ${(c.tr.fav * 100).toFixed(1)}% (n=${c.tr.n}) | ` +
  `test ${(c.te.fav * 100).toFixed(1)}% (n=${c.te.n} med=${c.te.med.toFixed(1)}%) | min-excess +${(c.minExcess * 100).toFixed(1)}pt`;

// ---------- main ----------
async function main() {
  const tl: { points: TimelinePoint[] } = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
  );
  const fed: { date: string; value: number }[] = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "history", "fed-funds.json"), "utf8")
  );
  const yld: { bars: DailyBar[] } = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "history", "yield10y.json"), "utf8")
  );
  const dxy = await cachedBars(DXY_CACHE, "DXY", fetchDxy);
  const rdx = await cachedBars(RDX_CACHE, "DFII10", fetchRealYield);

  console.log(
    `timeline ${tl.points.length} điểm (${tl.points[0].date} → ${tl.points[tl.points.length - 1].date}) | ` +
      `dxy ${dxy.length} từ ${dxy[0].date} | fed ${fed.length} tháng | ` +
      `yld(^TNX) ${yld.bars.length} từ ${yld.bars[0].date} | rdx(DFII10) ${rdx.length} từ ${rdx[0].date}`
  );

  // gắn sub-score past-only (con trỏ đơn điệu)
  const points: Pt[] = [];
  let di = 0;
  let fi = 0;
  let yi = 0;
  let ri = 0;
  const dxyCloses: number[] = [];
  const fedRates: number[] = [];
  const yldCloses: number[] = [];
  const rdxCloses: number[] = [];
  for (const p of tl.points) {
    while (di < dxy.length && dxy[di].date <= p.date) dxyCloses.push(dxy[di++].close);
    while (fi < fed.length && fed[fi].date <= p.date) fedRates.push(fed[fi++].value);
    while (yi < yld.bars.length && yld.bars[yi].date <= p.date) yldCloses.push(yld.bars[yi++].close);
    while (ri < rdx.length && rdx[ri].date <= p.date) rdxCloses.push(rdx[ri++].close);
    const scores: Record<string, number> = { ...(p.scores as Record<string, number>) };
    const sD = dxyScore(dxyCloses);
    const sF = fedScore(fedRates);
    const sY = yieldScore(yldCloses);
    const sR = yieldScore(rdxCloses);
    if (sD !== null) scores.dxy = sD;
    if (sF !== null) scores.fed = sF;
    if (sY !== null) scores.yield10y = sY;
    if (sR !== null) scores.rdx = sR;
    points.push({ date: p.date, scores, returns: p.returns as Record<H, number | null> });
  }
  const cov = (k: string) => points.filter((p) => p.scores[k] !== undefined).length;
  console.log(
    `phủ sub-score: dxy ${cov("dxy")} fed ${cov("fed")} yld ${cov("yield10y")} rdx ${cov("rdx")} / ${points.length} điểm`
  );

  // Chẩn đoán: rdx và yld có phải cùng một tín hiệu? (tương quan điểm + % ngày trùng)
  const both = points.filter((p) => p.scores.rdx !== undefined && p.scores.yield10y !== undefined);
  const same = both.filter((p) => p.scores.rdx === p.scores.yield10y).length;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const a = both.map((p) => p.scores.rdx);
  const b = both.map((p) => p.scores.yield10y);
  const ma = mean(a);
  const mb = mean(b);
  const cor =
    a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) /
    Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0));
  console.log(
    `rdx vs yld trên ${both.length} ngày chung: trùng điểm ${((same / both.length) * 100).toFixed(1)}%, ` +
      `tương quan ${cor.toFixed(3)} (cao ⇒ DFII10 không mang thông tin mới so ^TNX)\n`
  );

  const ws6 = weightSets6();
  const ws7 = weightSets7();
  console.log(`lưới 6D (v4 đang phát hành): ${ws6.length} bộ | lưới 7D (+RDX): ${ws7.length} bộ × 4 ngưỡng\n`);

  const rand = seededRandom(20260905);
  /** Placebo: xáo KHỐI chuỗi DFII10 (giữ tự tương quan), chấm lại đúng cấu hình. */
  const placeboP95 = (h: H, c: Cand): { trP95: number; teP95: number } | null => {
    if ((c.w.rdx ?? 0) === 0) return null;
    const blocks: number[][] = [];
    for (let i = 0; i < rdx.length; i += PLACEBO_BLOCK) blocks.push(rdx.slice(i, i + PLACEBO_BLOCK).map((x) => x.close));
    const favsTr: number[] = [];
    const favsTe: number[] = [];
    for (let d = 0; d < PLACEBO_DRAWS; d++) {
      // xáo thứ tự khối rồi gán lại lên đúng dãy ngày của DFII10
      const order = blocks.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const shuffled: number[] = [];
      for (const oi of order) shuffled.push(...blocks[oi]);
      const fake: DailyBar[] = rdx.map((barr, i) => ({ date: barr.date, close: shuffled[i] ?? barr.close }));

      // chấm lại rdx past-only trên chuỗi giả
      let k = 0;
      const buf: number[] = [];
      const trR: number[] = [];
      const teR: number[] = [];
      for (const p of points) {
        while (k < fake.length && fake[k].date <= p.date) buf.push(fake[k++].close);
        const sR = yieldScore(buf);
        if (p.returns[h] === null) continue;
        const sc = { ...p.scores };
        if (sR !== null) sc.rdx = sR;
        else delete sc.rdx;
        if (composite({ ...p, scores: sc }, c.w) < c.thr) continue;
        (p.date < SPLIT_DATE ? trR : teR).push(p.returns[h] as number);
      }
      if (trR.length >= 10) favsTr.push(stats(trR).fav);
      if (teR.length >= 10) favsTe.push(stats(teR).fav);
    }
    if (!favsTr.length || !favsTe.length) return null;
    favsTr.sort((x, y) => x - y);
    favsTe.sort((x, y) => x - y);
    return {
      trP95: favsTr[Math.floor(0.95 * (favsTr.length - 1))],
      teP95: favsTe[Math.floor(0.95 * (favsTe.length - 1))],
    };
  };

  const res6: Record<H, number> = { "21": 0, "63": 0, "126": 0 };
  const res7: Record<H, number> = { "21": 0, "63": 0, "126": 0 };
  const winners: Partial<Record<H, Cand>> = {};

  for (const h of HS) {
    console.log(`================ H${h} ================`);
    const g6 = evalGrid(points, h, ws6);
    const g7 = evalGrid(points, h, ws7);
    console.log(`  baseline train ${(g6.baseTrain * 100).toFixed(1)}% / test ${(g6.baseTest * 100).toFixed(1)}%`);
    console.log(`  6D best: ${g6.candidates.length ? fmtCand(g6.candidates[0]) : "KHÔNG cấu hình đạt chuẩn"}`);
    if (!g7.candidates.length) {
      console.log("  7D: KHÔNG cấu hình đạt chuẩn\n");
      continue;
    }
    res6[h] = g6.candidates.length ? g6.candidates[0].minExcess : 0;
    res7[h] = g7.candidates[0].minExcess;
    console.log("  7D top-5:");
    for (const c of g7.candidates.slice(0, 5)) console.log(`    ${fmtCand(c)}`);

    // cấu hình 7D tốt nhất CÓ dùng RDX (nếu top-1 đặt rdx=0 thì grid tự bỏ DFII10)
    const withRdx = g7.candidates.find((c) => (c.w.rdx ?? 0) > 0);
    console.log(
      `  7D best CÓ RDX>0: ${withRdx ? fmtCand(withRdx) : "không cấu hình nào dùng RDX qua được cổng"}`
    );
    const share = g7.candidates.slice(0, 20).filter((c) => (c.w.rdx ?? 0) > 0).length;
    console.log(`  RDX>0 trong top-20 của 7D: ${share}/20`);
    if (withRdx) winners[h] = withRdx;
    console.log("");
  }

  console.log("================ PLACEBO (xáo khối DFII10) ================");
  const placeboPass: Record<string, boolean> = {};
  for (const h of HS) {
    const c = winners[h];
    if (!c) {
      console.log(`H${h}: bỏ qua (không có cấu hình RDX>0 qua cổng)`);
      continue;
    }
    const pl = placeboP95(h, c);
    if (!pl) {
      console.log(`H${h}: không tính được placebo`);
      continue;
    }
    const okTr = c.tr.fav > pl.trP95;
    const okTe = c.te.fav > pl.teP95;
    placeboPass[h] = okTr && okTe;
    console.log(
      `H${h}: thật train ${(c.tr.fav * 100).toFixed(1)}% vs placebo p95 ${(pl.trP95 * 100).toFixed(1)}% ${okTr ? "VƯỢT" : "không"} | ` +
        `thật test ${(c.te.fav * 100).toFixed(1)}% vs p95 ${(pl.teP95 * 100).toFixed(1)}% ${okTe ? "VƯỢT" : "không"}`
    );
  }

  // ---- Chẩn đoán bổ sung khi TEST ĐÃ TRẦN (te.fav = 100%) ----
  // min-excess = min(exTr, exTe); test trần ⇒ exTe đóng băng ⇒ Δ 7D-vs-6D = 0,0pt
  // theo định nghĩa, KHÔNG phải vì DFII10 vô ích. Đúng bệnh trần mà v4 (macro-decomp)
  // đã gặp. Nên soi tiếp đúng 3 chẩn đoán v4 đã dùng, cho kỳ hạn nào vừa trần vừa
  // qua placebo: cụm độc lập, tách đôi test, và độ chính xác riêng phần tín hiệu THÊM.
  const clusters = (dates: string[]) => {
    const idx = dates.map((d) => points.findIndex((p) => p.date === d)).sort((x, y) => x - y);
    let c = idx.length ? 1 : 0;
    for (let i = 1; i < idx.length; i++) if (idx[i] - idx[i - 1] > 21) c++;
    return c;
  };
  console.log("\n================ CHẨN ĐOÁN KỲ HẠN TRẦN ================");
  for (const h of HS) {
    const c = winners[h];
    if (!c || c.te.fav < 0.999) continue;
    const g6 = evalGrid(points, h, ws6);
    const b6 = g6.candidates[0];
    const valid = points.filter((p) => p.returns[h] !== null);
    const fire = (w: Record<string, number>, thr: number) =>
      valid.filter((p) => composite(p, w) >= thr);
    const s7 = fire(c.w, c.thr);
    const s6 = fire(b6.w, b6.thr);
    const set6 = new Set(s6.map((p) => p.date));
    const added = s7.filter((p) => !set6.has(p.date));
    const lost = s6.filter((p) => !s7.some((q) => q.date === p.date));
    const te7 = s7.filter((p) => p.date >= SPLIT_DATE);
    const half = "2023-01-01";
    const h1 = stats(te7.filter((p) => p.date < half).map((p) => p.returns[h] as number));
    const h2 = stats(te7.filter((p) => p.date >= half).map((p) => p.returns[h] as number));
    console.log(`H${h} (7D ${fmtW(c.w)} thr=${c.thr} vs 6D ${fmtW(b6.w)} thr=${b6.thr}):`);
    console.log(
      `  cụm độc lập (gap>21 phiên): 7D ${clusters(s7.map((p) => p.date))} vs 6D ${clusters(s6.map((p) => p.date))} ` +
        `| ngày tín hiệu: 7D ${s7.length} vs 6D ${s6.length}`
    );
    console.log(
      `  ngày THÊM ${added.length}: đúng ${added.length ? (stats(added.map((p) => p.returns[h] as number)).fav * 100).toFixed(1) + "%" : "—"} ` +
        `| ngày MẤT ${lost.length}: đúng ${lost.length ? (stats(lost.map((p) => p.returns[h] as number)).fav * 100).toFixed(1) + "%" : "—"}`
    );
    console.log(
      `  tách đôi test: 2019-2022 ${(h1.fav * 100).toFixed(1)}% (n=${h1.n}) | 2023-2026 ${(h2.fav * 100).toFixed(1)}% (n=${h2.n})`
    );
    const yr = (set: Pt[]) => {
      const m = new Map<string, number>();
      for (const p of set) m.set(p.date.slice(0, 4), (m.get(p.date.slice(0, 4)) ?? 0) + 1);
      return [...m.entries()].sort().map(([y, n]) => `${y}:${n}`).join(" ");
    };
    console.log(`  phân bố năm 7D: ${yr(s7)}`);
    console.log(`  phân bố năm 6D: ${yr(s6)}`);
  }

  console.log("\n================ SO SÁNH MIN-EXCESS (pt) ================");
  console.log(`${"Lưới".padEnd(14)} ${"1 tháng".padStart(9)} ${"3 tháng".padStart(9)} ${"6 tháng".padStart(9)}`);
  console.log(
    `${"6D (v4)".padEnd(14)} ${(res6["21"] * 100).toFixed(1).padStart(8)} ${(res6["63"] * 100).toFixed(1).padStart(8)} ${(res6["126"] * 100).toFixed(1).padStart(8)}`
  );
  console.log(
    `${"7D (+RDX)".padEnd(14)} ${(res7["21"] * 100).toFixed(1).padStart(8)} ${(res7["63"] * 100).toFixed(1).padStart(8)} ${(res7["126"] * 100).toFixed(1).padStart(8)}`
  );
  const ds = HS.map((h) => (res7[h] - res6[h]) * 100);
  const improved = ds.filter((d) => d > 0.5).length;
  const anyWinner = HS.some((h) => winners[h] !== undefined);
  const placeboOk = HS.filter((h) => placeboPass[h]).length;
  console.log(`\nΔ 7D vs 6D: ${ds.map((d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}pt`).join("  ")}`);
  console.log(
    `G3 (>0,5pt ở >=2/3 kỳ hạn): ${improved >= 2 ? "ĐẠT" : `KHÔNG (${improved}/3)`} | ` +
      `G4a (có cấu hình RDX>0 qua cổng): ${anyWinner ? "ĐẠT" : "KHÔNG"} | ` +
      `G4b (vượt placebo cả 2 giai đoạn): ${placeboOk}/3 kỳ hạn`
  );
  console.log(
    improved >= 2 && anyWinner && placeboOk >= 2
      ? "PHÁN QUYẾT: ỨNG VIÊN — đọc lại top-5 + tương quan rdx/yld trước khi ship."
      : "PHÁN QUYẾT: NO-GO — DFII10 không thêm thông tin vào lưới macroSub. Đóng câu hỏi, không sửa engine."
  );
  console.log(
    "Đọc Δ=0,0pt cho đúng: H63/H126 test đã ở TRẦN 100% nên exTe đóng băng, Δ bằng 0 theo\n" +
      "định nghĩa — phải xem khối CHẨN ĐOÁN KỲ HẠN TRẦN ở trên, đúng cách v4 đã làm. Ở đó\n" +
      "RDX CẮT tín hiệu chứ không mở: H126 295 vs 371 ngày, cụm độc lập 14=14, năm 2023 co\n" +
      "9→5, ngày MẤT vẫn đúng 96% ⇒ chỉ là siết ngưỡng bằng chính thông tin cũ (tương quan\n" +
      "0,775 với ^TNX), không phải thông tin mới. v4 pass được vì làm điều NGƯỢC LẠI (cụm\n" +
      "15→18, 16→29, mở khóa năm im lặng 2023)."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
