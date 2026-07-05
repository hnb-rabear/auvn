/**
 * Macro decomposition study — tách tiêu chí vĩ mô thành 3 tiêu chí riêng
 * (DXY / hướng Fed / lợi suất 10 năm) và cho grid search tự chọn trọng số.
 *
 * Câu hỏi: các preset macro-nặng câm 2017 (+13,6%) và 2023 (+13,3%). Nghi vấn
 * cụ thể: 2017 DXY sập ~10% (tín hiệu mua) nhưng Fed TĂNG lãi 3 lần (tín hiệu
 * bán) — hai sub-signal triệt tiêu nhau bên trong điểm macro trung bình cộng.
 * Nếu tách ra, grid có thể học "DXY nặng, Fed nhẹ" và bắn được 2017 không?
 * Đây KHÔNG phải yếu tố mới — chỉ là bỏ ràng buộc trọng số bằng nhau giữa 3
 * sub-signal có sẵn, nên không cần feed mới.
 *
 * Chống nhìn trước: mọi sub-score tính past-only theo đúng mapping của
 * macroCriterion (src/lib/criteria.ts):
 *   - DXY: trên/dưới MA50 + thay đổi 21 phiên ±1% → −2/−1/+1/+2
 *   - Fed: Δ 3 tháng của chuỗi FEDFUNDS tháng → −2..+2 (ngưỡng ±0,25)
 *   - Yield: Δ 63 phiên của ^TNX → −2..+2 (ngưỡng ±0,1/±0,4)
 * Golden check: mean(sub khả dụng) phải khớp điểm macro đã lưu trong
 * timeline.json (sai số ≤ 0,06 do làm tròn 1 chữ số) — bảo đảm tái tạo đúng.
 *
 * Khung kiểm chứng: giống cot-study/factor-study-momentum-offline — grid 6D
 * (KT/TK/MOM/DXY/FED/YLD) bước 10% × ngưỡng 30/40/50/60, cổng ≥25 tín hiệu +
 * thắng baseline Ở CẢ train <2019 và test ≥2019, xếp min-excess; so với grid
 * 4D gốc (KT/TK/VM/MOM). LƯU Ý ĐỌC KẾT QUẢ: không gian 6D bao gần trọn 4D nên
 * min-excess 6D ≥ 4D gần như chắc chắn trên train — chỉ tin cải thiện khi
 * (a) qua cổng 2 giai đoạn, (b) top-5 nhất quán về cấu trúc (không phải 1 cấu
 * hình lẻ), (c) không đánh đổi độ phủ kiểu COT (n test sập), (d) trả lời được
 * câu hỏi gốc: có tín hiệu 2017/2023 với chất lượng ≥ baseline không.
 *
 * Dữ liệu: timeline.json (điểm KT/TK/MOM + macro để golden check), cache
 * public/data/history/{fed-funds,yield10y}.json, DXY fetch Yahoo 20 năm
 * (cache tạm MACRO_DECOMP_DXY_CACHE, mặc định /tmp/dxy-cache.json để chạy lại
 * không cần mạng).
 *
 * Chạy: npx tsx scripts/macro-decomp-study.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SPLIT_DATE, MIN_SIGNALS, stats } from "./study-lib";
import { fetchDxy, type DailyBar } from "./fetch";
import type { TimelinePoint } from "../src/lib/types";

type H = "21" | "63" | "126";
const HS: H[] = ["21", "63", "126"];
const DXY_CACHE = process.env.MACRO_DECOMP_DXY_CACHE ?? join(tmpdir(), "dxy-cache.json");

// ---------- sub-score mappings (sao đúng macroCriterion) ----------
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
async function loadDxy(): Promise<DailyBar[]> {
  if (existsSync(DXY_CACHE)) {
    const bars = JSON.parse(readFileSync(DXY_CACHE, "utf8")) as DailyBar[];
    if (bars.length >= 500) return bars;
  }
  const res = await fetchDxy();
  if (!res) throw new Error("Không fetch được DXY (Yahoo + Stooq đều lỗi)");
  writeFileSync(DXY_CACHE, JSON.stringify(res.bars));
  console.log(`DXY: ${res.bars.length} bars từ ${res.source} (cache → ${DXY_CACHE})`);
  return res.bars;
}

interface Pt {
  date: string;
  scores: Record<string, number>; // technical/stats/momentum + dxy/fed/yield10y (+ macro gốc)
  returns: Record<H, number | null>;
}

// ---------- grid search ----------
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

function weightSets4(): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  for (let wt = 0; wt <= 10; wt++)
    for (let ws = 0; ws <= 10 - wt; ws++)
      for (let wmom = 0; wmom <= 10 - wt - ws; wmom++) {
        const wm = 10 - wt - ws - wmom;
        out.push({ technical: wt / 10, stats: ws / 10, macro: wm / 10, momentum: wmom / 10 });
      }
  return out;
}

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

const KEY_LABEL: Record<string, string> = {
  technical: "KT",
  stats: "TK",
  macro: "VM",
  momentum: "MOM",
  dxy: "DXY",
  fed: "FED",
  yield10y: "YLD",
};
const fmtW = (w: Record<string, number>) =>
  Object.entries(w)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${KEY_LABEL[k]}:${v}`)
    .join(" ");
const fmtCand = (c: Cand) =>
  `w=${fmtW(c.w)} thr=${c.thr} | train ${(c.tr.fav * 100).toFixed(1)}% (n=${c.tr.n}) | ` +
  `test ${(c.te.fav * 100).toFixed(1)}% (n=${c.te.n} med=${c.te.med.toFixed(1)}%) | min-excess +${(c.minExcess * 100).toFixed(1)}pt`;

function yearDist(points: Pt[], h: H, c: Cand): Record<string, number> {
  const byYear: Record<string, number> = {};
  for (const p of points) {
    if (p.returns[h] === null) continue;
    if (composite(p, c.w) >= c.thr) {
      const y = p.date.slice(0, 4);
      byYear[y] = (byYear[y] ?? 0) + 1;
    }
  }
  return byYear;
}
const fmtYears = (d: Record<string, number>) =>
  `câm(2017:${d["2017"] ?? 0} 2021:${d["2021"] ?? 0} 2022:${d["2022"] ?? 0} 2023:${d["2023"] ?? 0}) | ` +
  Object.entries(d)
    .map(([y, n]) => `${y.slice(2)}:${n}`)
    .join(" ");

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
  const dxy = await loadDxy();

  console.log(
    `timeline ${tl.points.length} điểm (${tl.points[0].date} → ${tl.points[tl.points.length - 1].date}) | ` +
      `dxy ${dxy.length} bars từ ${dxy[0].date} | fed ${fed.length} tháng | yield ${yld.bars.length} bars từ ${yld.bars[0].date}`
  );

  // gắn sub-score past-only theo từng ngày timeline (con trỏ đơn điệu)
  const points: Pt[] = [];
  let di = 0;
  let fi = 0;
  let yi = 0;
  const dxyCloses: number[] = [];
  const fedRates: number[] = [];
  const yldCloses: number[] = [];
  let goldenBad = 0;
  let goldenChecked = 0;
  for (const p of tl.points) {
    while (di < dxy.length && dxy[di].date <= p.date) dxyCloses.push(dxy[di++].close);
    while (fi < fed.length && fed[fi].date <= p.date) fedRates.push(fed[fi++].value);
    while (yi < yld.bars.length && yld.bars[yi].date <= p.date) yldCloses.push(yld.bars[yi++].close);
    const sD = dxyScore(dxyCloses);
    const sF = fedScore(fedRates);
    const sY = yieldScore(yldCloses);
    const scores: Record<string, number> = { ...(p.scores as Record<string, number>) };
    if (sD !== null) scores.dxy = sD;
    if (sF !== null) scores.fed = sF;
    if (sY !== null) scores.yield10y = sY;
    // golden check với điểm macro đã lưu (timeline làm tròn 1 chữ số)
    const avail = [sD, sF, sY].filter((s): s is number => s !== null);
    const macroStored = (p.scores as Record<string, number>).macro;
    if (avail.length && macroStored !== undefined) {
      goldenChecked++;
      const mean = Math.max(-2, Math.min(2, avail.reduce((a, b) => a + b, 0) / avail.length));
      if (Math.abs(mean - macroStored) > 0.06) goldenBad++;
    }
    points.push({ date: p.date, scores, returns: p.returns as Record<H, number | null> });
  }
  const cov = (k: string) => points.filter((p) => p.scores[k] !== undefined).length;
  console.log(
    `phủ sub-score: dxy ${cov("dxy")}/${points.length} fed ${cov("fed")}/${points.length} yield ${cov("yield10y")}/${points.length}`
  );
  console.log(
    `golden check macro tái tạo vs timeline: lệch >0,06 ở ${goldenBad}/${goldenChecked} điểm ${goldenBad / goldenChecked > 0.02 ? "— ⚠ TÁI TẠO SAI, dừng đọc kết quả" : "(đạt)"}\n`
  );

  const ws4 = weightSets4();
  const ws6 = weightSets6();
  console.log(`grid 4D: ${ws4.length} bộ trọng số | grid 6D: ${ws6.length} bộ trọng số × 4 ngưỡng\n`);

  // Trong vùng "trần" (test 100% → excess test bị chặn tại 100−baseline), min-excess
  // không phân biệt được các cấu hình — so thêm theo ĐỘ PHỦ: trong các ứng viên cách
  // best ≤1pt, chọn cấu hình n TRAIN lớn nhất (không nhìn test) rồi báo test của nó.
  const bestCoverage = (cands: Cand[]): Cand | null => {
    if (!cands.length) return null;
    const cut = cands[0].minExcess - 0.01;
    return cands.filter((c) => c.minExcess >= cut).reduce((a, b) => (b.tr.n > a.tr.n ? b : a));
  };

  const results: Record<string, Record<H, number>> = { "base 4D": { "21": 0, "63": 0, "126": 0 }, "decomp 6D": { "21": 0, "63": 0, "126": 0 } };
  for (const h of HS) {
    console.log(`================ H${h} ================`);
    const base = evalGrid(points, h, ws4);
    console.log(
      `  base 4D (baseline ${(base.baseTrain * 100).toFixed(1)}/${(base.baseTest * 100).toFixed(1)}%): ` +
        (base.candidates.length ? fmtCand(base.candidates[0]) : "KHÔNG cấu hình đạt chuẩn")
    );
    if (base.candidates.length) {
      results["base 4D"][h] = base.candidates[0].minExcess;
      const bc = bestCoverage(base.candidates)!;
      console.log(`  base 4D phủ-max (train-chọn, ≤1pt từ best): ${fmtCand(bc)}`);
      console.log(`    năm bắn: ${fmtYears(yearDist(points, h, bc))}`);
    }

    const dec = evalGrid(points, h, ws6);
    if (!dec.candidates.length) {
      console.log("  decomp 6D: KHÔNG cấu hình đạt chuẩn");
      continue;
    }
    results["decomp 6D"][h] = dec.candidates[0].minExcess;
    console.log("  decomp 6D top-5:");
    for (const c of dec.candidates.slice(0, 5)) console.log(`    ${fmtCand(c)}`);
    console.log(`    năm bắn (top-1): ${fmtYears(yearDist(points, h, dec.candidates[0]))}`);
    const dc = bestCoverage(dec.candidates)!;
    console.log(`  decomp 6D phủ-max (train-chọn, ≤1pt từ best): ${fmtCand(dc)}`);
    console.log(`    năm bắn: ${fmtYears(yearDist(points, h, dc))}`);
    // giả thuyết đặt trước: bỏ Fed (fed=0, dxy>0) có mở khóa 2017 không?
    const noFed = dec.candidates.find((c) => (c.w.fed ?? 0) === 0 && (c.w.dxy ?? 0) > 0);
    if (noFed) {
      console.log(`    best FED=0 DXY>0: ${fmtCand(noFed)}`);
      console.log(`    năm bắn (FED=0): ${fmtYears(yearDist(points, h, noFed))}`);
    }
    console.log("");
  }

  // ---------- chẩn đoán bổ sung cho verdict ----------
  console.log("================ CHẨN ĐOÁN ================");
  const episodes = (dates: string[], allDates: string[]): number => {
    // đếm cụm độc lập: tín hiệu cách nhau >21 phiên giao dịch = cụm mới
    const idx = new Map(allDates.map((d, i) => [d, i]));
    let n = 0;
    let last = -1e9;
    for (const d of dates) {
      const i = idx.get(d)!;
      if (i - last > 21) n++;
      last = i;
    }
    return n;
  };
  const allDates = points.map((p) => p.date);
  for (const h of HS) {
    const base = evalGrid(points, h, ws4);
    const dec = evalGrid(points, h, ws6);
    if (!base.candidates.length || !dec.candidates.length) continue;
    // (a) trần độ phủ TEST của từng variant trong các cấu hình ở mức best-1pt
    const cut = (cs: Cand[]) => cs.filter((c) => c.minExcess >= cs[0].minExcess - 0.01);
    const maxTe = (cs: Cand[]) => cs.reduce((a, b) => (b.te.n > a.te.n ? b : a));
    const bMax = maxTe(cut(base.candidates));
    const dMax = maxTe(cut(dec.candidates));
    console.log(`H${h}:`);
    console.log(`  trần phủ test @best-1pt: base n=${bMax.te.n} | decomp n=${dMax.te.n}`);
    // (b) cụm độc lập của 2 cấu hình phủ-max (train-chọn)
    const bc = bestCoverage(base.candidates)!;
    const dc = bestCoverage(dec.candidates)!;
    const sigDates = (c: Cand) =>
      points.filter((p) => p.returns[h] !== null && composite(p, c.w) >= c.thr).map((p) => p.date);
    const bDates = sigDates(bc);
    const dDates = sigDates(dc);
    console.log(
      `  cụm độc lập (gap>21 phiên, cả 2 giai đoạn): base ${episodes(bDates, allDates)} cụm/${bDates.length} ngày | ` +
        `decomp ${episodes(dDates, allDates)} cụm/${dDates.length} ngày`
    );
    // (c) tín hiệu 2023 của cấu hình FED=0: lợi suất thật
    const noFed = dec.candidates.find((c) => (c.w.fed ?? 0) === 0 && (c.w.dxy ?? 0) > 0);
    if (noFed) {
      const r23 = points
        .filter((p) => p.date.startsWith("2023") && p.returns[h] !== null && composite(p, noFed.w) >= noFed.thr)
        .map((p) => p.returns[h] as number);
      if (r23.length) {
        const s = stats(r23);
        console.log(`  tín hiệu 2023 (FED=0): n=${s.n} đúng ${(s.fav * 100).toFixed(0)}% med=${s.med.toFixed(1)}%`);
      } else console.log(`  tín hiệu 2023 (FED=0): 0`);
    }
    // (d) YLD đơn thuần (KT=TK=MOM=DXY=FED=0) — có phải toàn bộ câu chuyện là yield?
    const pureYld = dec.candidates.find((c) => Object.entries(c.w).every(([k, v]) => (k === "yield10y" ? v > 0 : v === 0)));
    console.log(`  YLD-đơn: ${pureYld ? fmtCand(pureYld) : "không qua cổng"}`);
    // (e) ổn định lân cận của cấu hình phủ-max decomp: dịch 0,1 từ khóa này sang khóa
    // kia (mọi cặp) — plateau (đa số lân cận vẫn qua cổng, min-excess gần) hay đỉnh nhọn?
    const keys6 = ["technical", "stats", "momentum", "dxy", "fed", "yield10y"];
    let neighborsTotal = 0;
    let neighborsPass = 0;
    let neighborsNear = 0;
    for (const from of keys6)
      for (const to of keys6) {
        if (from === to || (dc.w[from] ?? 0) < 0.1) continue;
        const w2: Record<string, number> = { ...dc.w, [from]: +((dc.w[from] ?? 0) - 0.1).toFixed(1), [to]: +((dc.w[to] ?? 0) + 0.1).toFixed(1) };
        neighborsTotal++;
        const found = dec.candidates.find(
          (c) => c.thr === dc.thr && keys6.every((k) => Math.abs((c.w[k] ?? 0) - (w2[k] ?? 0)) < 0.001)
        );
        if (found) {
          neighborsPass++;
          if (found.minExcess >= dc.minExcess - 0.05) neighborsNear++;
        }
      }
    console.log(
      `  lân cận phủ-max decomp (dịch 0,1 mọi cặp khóa, cùng thr): ${neighborsPass}/${neighborsTotal} qua cổng, ` +
        `${neighborsNear}/${neighborsTotal} trong 5pt của nó → ${neighborsNear >= neighborsTotal / 2 ? "plateau" : neighborsPass >= neighborsTotal / 2 ? "qua cổng nhưng tụt điểm" : "ĐỈNH NHỌN — nghi overfit"}`
    );
    // (f) tách đôi giai đoạn test: cấu hình đề cử phải thắng baseline ở CẢ 2 nửa
    const halves: [string, string, string][] = [
      ["test-a 2019-2022", "2019-01-01", "2023-01-01"],
      ["test-b 2023-2026", "2023-01-01", "2027-01-01"],
    ];
    for (const [label, cand] of [["phủ-max", dc], ["FED=0", noFed]] as const) {
      if (!cand) continue;
      const parts = halves.map(([nm, d0, d1]) => {
        const win = points.filter((p) => p.date >= d0 && p.date < d1 && p.returns[h] !== null);
        const bl = stats(win.map((p) => p.returns[h] as number)).fav;
        const sg = stats(win.filter((p) => composite(p, cand.w) >= cand.thr).map((p) => p.returns[h] as number));
        return `${nm}: ${sg.n ? `${(sg.fav * 100).toFixed(0)}% (n=${sg.n}) vs bl ${(bl * 100).toFixed(0)}% → ${sg.fav > bl ? "THẮNG" : "thua"}` : "0 tín hiệu"}`;
      });
      console.log(`  tách đôi test [${label}]: ${parts.join(" | ")}`);
    }
    // (g) độ chính xác của RIÊNG phần tín hiệu THÊM (decomp bắn, base phủ-max không bắn):
    // nếu phần thêm kém hơn baseline/phần chung thì độ phủ rộng chỉ là pha loãng.
    for (const [label, cand] of [["phủ-max", dc], ["FED=0", noFed]] as const) {
      if (!cand) continue;
      const baseSet = new Set(
        points.filter((p) => p.returns[h] !== null && composite(p, bc.w) >= bc.thr).map((p) => p.date)
      );
      const added = points.filter(
        (p) => p.returns[h] !== null && composite(p, cand.w) >= cand.thr && !baseSet.has(p.date)
      );
      const seg = (d0: string, d1: string, blPts: Pt[]) => {
        const a = added.filter((p) => p.date >= d0 && p.date < d1);
        if (!a.length) return `${d0.slice(0, 4)}-: 0 thêm`;
        const s = stats(a.map((p) => p.returns[h] as number));
        const bl = stats(
          blPts.filter((p) => p.date >= d0 && p.date < d1).map((p) => p.returns[h] as number)
        ).fav;
        return `${d0.slice(0, 4)}-: ${(s.fav * 100).toFixed(0)}% (n=${s.n} med=${s.med.toFixed(1)}%) vs bl ${(bl * 100).toFixed(0)}%`;
      };
      const valid = points.filter((p) => p.returns[h] !== null);
      console.log(
        `  tín hiệu THÊM so base phủ-max [${label}]: train ${seg("2009-01-01", SPLIT_DATE, valid)} | test ${seg(SPLIT_DATE, "2027-01-01", valid)}`
      );
    }
  }
  console.log("");

  console.log("================ SO SÁNH MIN-EXCESS (pt) ================");
  console.log(`${"Biến thể".padEnd(12)} ${"1 tháng".padStart(9)} ${"3 tháng".padStart(9)} ${"6 tháng".padStart(9)}`);
  for (const [name, r] of Object.entries(results))
    console.log(`${name.padEnd(12)} ${(r["21"] * 100).toFixed(1).padStart(8)} ${(r["63"] * 100).toFixed(1).padStart(8)} ${(r["126"] * 100).toFixed(1).padStart(8)}`);
  const ds = HS.map((h) => (results["decomp 6D"][h] - results["base 4D"][h]) * 100);
  const improved = ds.filter((d) => d > 0.5).length; // >0,5pt mới tính (6D bao 4D nên +0,0..0,5 là nhiễu tìm kiếm)
  console.log(
    `\nΔ decomp vs base: ${ds.map((d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}pt`).join("  ")} → ` +
      (improved >= 2
        ? "CẢI THIỆN đa số kỳ hạn — đọc tiếp top-5 + năm câm trước khi kết luận"
        : improved === 1
          ? "chỉ 1 kỳ hạn — hiệu quả giới hạn"
          : "KHÔNG cải thiện — ràng buộc trung bình cộng 3 sub-signal không phải nút thắt")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
