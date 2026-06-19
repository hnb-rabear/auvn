/**
 * Fusion study — KIỂM CHỨNG việc ghép composite (preset mua/bán) với tín hiệu đáy
 * (Bottom Hunter, bin==3 = bottomScore≥40, driven bởi rsi+macro) có thật sự cải
 * thiện precision / recall / timing so với composite-gốc hay không.
 *
 * Ba cơ chế fusion (xem docs brainstorm):
 *   A — HỢP NHẤT (OR): mua nếu composite≥ngưỡng HOẶC ở vùng đáy. Kỳ vọng: recall↑,
 *       timing↑ (đường đáy vào giá thấp), precision giữ (hai lớp rời nhau).
 *   B — XÁC NHẬN CHÉO (AND): chỉ tính khi CẢ HAI cùng bật → "mua mạnh". Kỳ vọng:
 *       precision cao nhất nhưng mẫu có thể teo về ~0 (bằng chứng hai lớp rời nhau).
 *   C — GẤP OVERSOLD VÀO COMPOSITE: thêm tiêu chí "độ sâu quá bán" (driver rsi của
 *       bottomFeatures, tính lại RSI14 + phân kỳ tăng từ giá) rồi chạy lại grid 5D,
 *       để chính min-excess quyết trọng số. Nếu vô ích → grid đưa về 0.
 *
 * Khung kiểm chứng (đồng bộ presets-study / bottom-study, chống overfit):
 *   - Offline trên public/data/timeline.json đã commit. KHÔNG fetch.
 *   - Chia train <2019 / test ≥2019. "Đúng" = lợi suất H phiên sau tín hiệu > 0.
 *   - excess = precision − baseline (mua ngày bất kỳ); min-excess = min(train,test).
 *   - CI 95% block-bootstrap (block = H/3) vì timeline DÀY (step=1) ⇒ tín hiệu bắn
 *     chùm ⇒ n thô phình, CI là thước trung thực hơn precision điểm.
 *   - Cũng in precision trên LƯỚI THƯA (STEP=3) để soi mẫu hiệu dụng.
 *
 * Phán quyết: A/C "thắng" 1 kỳ hạn chỉ khi so composite-gốc: (1) min-excess vẫn >0
 *   cả 2 giai đoạn và không tụt đáng kể; (2) số tín hiệu ĐÚNG (TP) tăng (recall); (3)
 *   timing không thoái lui. Thiếu bất kỳ điều → GIỮ tách lớp cho kỳ hạn đó.
 *
 * Chạy: npx tsx scripts/fusion-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline, TimelinePoint } from "../src/lib/types";
import { PRESETS } from "../src/lib/types";
import { composite, stats, SPLIT_DATE, MIN_SIGNALS, type H } from "./study-lib";
import { rsi, bullishRsiDivergence, blockBootstrapCi } from "../src/lib/indicators";

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);
const PTS = tl.points;
const PRICES = PTS.map((p) => p.price);
const IDX = new Map(PTS.map((p, i) => [p.date, i] as const));
const TOP_BIN = 3; // binEdges [-40,0,40] -> bin 3 = bottomScore ≥ 40 (tín hiệu đáy đã validated)
const STEP = 3;
const HS: H[] = ["21", "63", "126"];
const clamp2 = (n: number) => Math.max(-2, Math.min(2, n));
const median = (xs: number[]) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN;
const pct = (x: number) => (x * 100).toFixed(1);

// --- Feature OVERSOLD cho hướng C: tái lập driver `rsi` của bottomFeatures
//     (quá bán + phân kỳ tăng), tính lại từ giá timeline. Past-only theo index.
const OVERSOLD: number[] = PRICES.map((_, i) => {
  const upTo = PRICES.slice(0, i + 1);
  const r = rsi(upTo, 14);
  if (r === null) return 0;
  let s = r < 30 ? 2 : r < 40 ? 1 : r <= 60 ? 0 : r <= 70 ? -1 : -2;
  if (bullishRsiDivergence(upTo) && s < 2) s += 1;
  return clamp2(s);
});
// Gắn oversold vào scores mỗi điểm (weight 0 ⇒ composite gốc không đổi vì w[k]??0).
PTS.forEach((p, i) => {
  (p.scores as Record<string, number>).oversold = OVERSOLD[i];
});

// --- Thước timing (trên LƯỚI DÀY đầy đủ, dùng index thật) ---
function minDrawdown(i: number, h: number): number {
  let m = 0;
  for (let j = i + 1; j <= i + h && j < PRICES.length; j++) {
    const d = PRICES[j] / PRICES[i] - 1;
    if (d < m) m = d;
  }
  return m * 100; // % sụt sâu nhất sau khi vào (gần 0 = vào sát đáy, ít đau)
}
function cheapPercentile(i: number): number {
  const lo = Math.max(0, i - 63);
  const hi = Math.min(PRICES.length - 1, i + 63);
  let c = 0, t = 0;
  for (let j = lo; j <= hi; j++) {
    t++;
    if (PRICES[j] <= PRICES[i]) c++;
  }
  return (c / t) * 100; // percentile giá vào trong cửa sổ ±63 (thấp = mua rẻ)
}

interface SetStat {
  n: number;
  favPct: number;
  excessPt: number;
  medRet: number;
  ci: [number, number] | null;
  tp: number; // số tín hiệu ĐÚNG (recall proxy)
  minDD: number; // median % sụt sâu nhất sau vào
  cheap: number; // median percentile giá vào
  nSparse: number; // mẫu hiệu dụng lưới thưa
  favSparsePct: number;
}
function describe(set: TimelinePoint[], h: H, base: number): SetStat {
  const hd = Number(h);
  const rets = set.map((p) => p.returns[h] as number);
  const s = stats(rets);
  const tp = rets.filter((r) => r > 0).length;
  const minDDs: number[] = [];
  const cheaps: number[] = [];
  for (const p of set) {
    const i = IDX.get(p.date)!;
    minDDs.push(minDrawdown(i, hd));
    cheaps.push(cheapPercentile(i));
  }
  // lưới thưa: lấy mỗi STEP điểm theo index toàn cục
  const sparse = set.filter((p) => IDX.get(p.date)! % STEP === 0).map((p) => p.returns[h] as number);
  const sp = stats(sparse);
  return {
    n: s.n,
    favPct: s.fav * 100,
    excessPt: (s.fav - base) * 100,
    medRet: s.med,
    ci: blockBootstrapCi(rets, Math.max(1, Math.round(hd / 3))),
    tp,
    minDD: median(minDDs),
    cheap: median(cheaps),
    nSparse: sp.n,
    favSparsePct: sp.fav * 100,
  };
}

function row(label: string, set: TimelinePoint[], h: H, baseTr: number, baseTe: number): { tr: SetStat; te: SetStat } {
  const tr = set.filter((p) => p.date < SPLIT_DATE);
  const te = set.filter((p) => p.date >= SPLIT_DATE);
  const sTr = describe(tr, h, baseTr);
  const sTe = describe(te, h, baseTe);
  const ciTr = sTr.ci ? `[${sTr.ci[0]}–${sTr.ci[1]}]` : "—";
  const ciTe = sTe.ci ? `[${sTe.ci[0]}–${sTe.ci[1]}]` : "—";
  console.log(
    `  ${label.padEnd(16)} ` +
    `train ${pct(sTr.favPct / 100)}% n=${String(sTr.n).padStart(4)} ex${sTr.excessPt >= 0 ? "+" : ""}${sTr.excessPt.toFixed(1)} | ` +
    `test ${pct(sTe.favPct / 100)}% n=${String(sTe.n).padStart(4)} ex${sTe.excessPt >= 0 ? "+" : ""}${sTe.excessPt.toFixed(1)} CI${ciTe} | ` +
    `TP tr/te ${sTr.tp}/${sTe.tp} | med ret te ${sTe.medRet.toFixed(1)}% | timing te minDD ${sTe.minDD.toFixed(1)}% cheap ${sTe.cheap.toFixed(0)}pct`
  );
  return { tr: sTr, te: sTe };
}

// ============ A + B: hợp nhất / xác nhận chéo ============
function fusionAB() {
  for (const h of HS) {
    const preset = PRESETS.find((p) => String(p.horizonDays) === h)!;
    const W = preset.weights as unknown as Record<string, number>;
    const T = preset.buyThreshold;
    const pts = PTS.filter((p) => p.returns[h] !== null);
    const tr = pts.filter((p) => p.date < SPLIT_DATE);
    const te = pts.filter((p) => p.date >= SPLIT_DATE);
    const baseTr = stats(tr.map((p) => p.returns[h] as number)).fav;
    const baseTe = stats(te.map((p) => p.returns[h] as number)).fav;

    const comp = (p: TimelinePoint) => composite(p, W) >= T;
    const bot = (p: TimelinePoint) => p.cycleBin === TOP_BIN;

    const COMP = pts.filter(comp);
    const BOT = pts.filter(bot);
    const UNION = pts.filter((p) => comp(p) || bot(p));
    const INTER = pts.filter((p) => comp(p) && bot(p));
    const BOTONLY = pts.filter((p) => bot(p) && !comp(p));

    console.log(`\n========== KỲ HẠN ${h} phiên (preset ${preset.id}, ngưỡng ${T}) ==========`);
    console.log(`  baseline mua-ngày-bất-kỳ: train ${pct(baseTr)}% (n=${tr.length}) | test ${pct(baseTe)}% (n=${te.length})`);
    const cR = row("COMPOSITE gốc", COMP, h, baseTr, baseTe);
    row("ĐÁY (bin==3)", BOT, h, baseTr, baseTe);
    const aR = row("A=HỢP NHẤT", UNION, h, baseTr, baseTe);
    const bR = row("B=XÁC NHẬN AND", INTER, h, baseTr, baseTe);
    row("(đáy-ngoài-comp)", BOTONLY, h, baseTr, baseTe);

    // Phán quyết A
    const compMinEx = Math.min(cR.tr.excessPt, cR.te.excessPt);
    const aMinEx = Math.min(aR.tr.excessPt, aR.te.excessPt);
    const recallUp = aR.tr.tp >= cR.tr.tp && aR.te.tp > cR.te.tp;
    const precisionOk = aR.tr.excessPt > 0 && aR.te.excessPt > 0 && aMinEx >= compMinEx - 3;
    const timingOk = aR.te.minDD >= cR.te.minDD - 0.5 || aR.te.cheap <= cR.te.cheap;
    const verdictA = precisionOk && recallUp && timingOk ? "GO" : "NO-GO";
    console.log(
      `  → A min-excess ${aMinEx.toFixed(1)}pt (composite ${compMinEx.toFixed(1)}pt) | ` +
      `recall ${recallUp ? "↑" : "≤"} | precision ${precisionOk ? "ok" : "tụt"} | timing ${timingOk ? "ok" : "tụt"} ⇒ ${verdictA}`
    );
    // Phán quyết B: precision phải vượt composite ở CẢ HAI giai đoạn (robust, không
    // chỉ test-regime) VÀ đủ mẫu. n giảm là chấp nhận được (đây là tầng "mua mạnh").
    const bBeatsBoth = bR.tr.favPct > cR.tr.favPct && bR.te.favPct > cR.te.favPct;
    const bEnough = bR.tr.n >= MIN_SIGNALS && bR.te.n >= MIN_SIGNALS;
    const verdictB = bEnough && bBeatsBoth ? "GO" : bEnough ? "NO-GO (không vượt composite cả 2 giai đoạn)" : "NO-GO (thiếu mẫu)";
    console.log(
      `  → B mẫu giao: train n=${bR.tr.n} (${pct(bR.tr.favPct / 100)}% vs comp ${pct(cR.tr.favPct / 100)}%), ` +
      `test n=${bR.te.n} (${pct(bR.te.favPct / 100)}% vs comp ${pct(cR.te.favPct / 100)}%) ⇒ ${verdictB}`
    );
  }
}

// ============ C: gấp oversold vào composite, grid 5D ============
interface Cand { w: Record<string, number>; thr: number; trFav: number; teFav: number; trN: number; teN: number; minEx: number; }
function fusionC() {
  console.log(`\n\n########## HƯỚNG C — GẤP OVERSOLD VÀO COMPOSITE (grid 5D) ##########`);
  for (const h of HS) {
    const pts = PTS.filter((p) => p.returns[h] !== null);
    const tr = pts.filter((p) => p.date < SPLIT_DATE);
    const te = pts.filter((p) => p.date >= SPLIT_DATE);
    const baseTr = stats(tr.map((p) => p.returns[h] as number)).fav;
    const baseTe = stats(te.map((p) => p.returns[h] as number)).fav;

    const cands: Cand[] = [];
    // 5 phần (technical, stats, macro, momentum, oversold) tổng = 10 (bước 0.1)
    for (let wt = 0; wt <= 10; wt++)
      for (let ws = 0; ws <= 10 - wt; ws++)
        for (let wm = 0; wm <= 10 - wt - ws; wm++)
          for (let wmom = 0; wmom <= 10 - wt - ws - wm; wmom++) {
            const wov = 10 - wt - ws - wm - wmom;
            const w = { technical: wt / 10, stats: ws / 10, macro: wm / 10, momentum: wmom / 10, oversold: wov / 10 };
            for (const thr of [30, 40, 50, 60]) {
              const trS = stats(tr.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number));
              const teS = stats(te.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number));
              if (trS.n < MIN_SIGNALS || teS.n < MIN_SIGNALS) continue;
              const exTr = trS.fav - baseTr;
              const exTe = teS.fav - baseTe;
              if (exTr <= 0 || exTe <= 0) continue;
              cands.push({ w, thr, trFav: trS.fav, teFav: teS.fav, trN: trS.n, teN: teS.n, minEx: Math.min(exTr, exTe) });
            }
          }
    cands.sort((a, b) => b.minEx - a.minEx);
    console.log(`\n----- KỲ HẠN ${h} (baseline tr ${pct(baseTr)}% / te ${pct(baseTe)}%) — ${cands.length} cấu hình đạt chuẩn -----`);
    if (!cands.length) { console.log("  KHÔNG có cấu hình vượt baseline 2 giai đoạn."); continue; }
    for (const c of cands.slice(0, 5)) {
      console.log(
        `  KT:${c.w.technical} TK:${c.w.stats} VM:${c.w.macro} MOM:${c.w.momentum} OVS:${c.w.oversold} thr=${c.thr} | ` +
        `train ${pct(c.trFav)}% (n=${c.trN}) | test ${pct(c.teFav)}% (n=${c.teN}) | min-excess +${(c.minEx * 100).toFixed(1)}pt`
      );
    }
    const best = cands[0];
    console.log(`  → Trọng số OVERSOLD ở cấu hình tốt nhất: ${best.w.oversold} ${best.w.oversold > 0 ? "(grid GIỮ ⇒ có thể đáng thử)" : "(grid ĐƯA VỀ 0 ⇒ oversold vô ích cho composite)"}`);
  }
}

// ============ KIỂM CHỨNG B (robust) ============
// B chỉ đáng tin nếu lớp đáy mang thông tin TRỰC GIAO, không chỉ "kén hơn".
function favOf(set: TimelinePoint[], h: H): { n: number; fav: number } {
  const r = set.map((p) => p.returns[h] as number);
  return { n: r.length, fav: r.length ? r.filter((x) => x > 0).length / r.length : 0 };
}
function verifyB() {
  console.log(`\n\n########## KIỂM CHỨNG B (composite ∧ đáy) — robust ##########`);
  for (const h of HS) {
    const preset = PRESETS.find((p) => String(p.horizonDays) === h)!;
    const W = preset.weights as unknown as Record<string, number>;
    const T = preset.buyThreshold;
    const pts = PTS.filter((p) => p.returns[h] !== null);
    const comp = (p: TimelinePoint) => composite(p, W) >= T;
    const bot = (p: TimelinePoint) => p.cycleBin === TOP_BIN;
    console.log(`\n----- KỲ HẠN ${h} (preset ${preset.id}) -----`);

    // (1) PLACEBO đồng-n: composite-buy sắp theo điểm giảm dần, lấy top-n_B.
    //     B vượt top-n ⇒ đáy thêm thông tin; B ≤ top-n ⇒ B chỉ là "kén hơn".
    for (const [lab, lo, hi] of [["train", "0000", SPLIT_DATE], ["test", SPLIT_DATE, "9999"]] as const) {
      const seg = pts.filter((p) => p.date >= lo && p.date < hi);
      const B = seg.filter((p) => comp(p) && bot(p));
      const compBuy = seg.filter(comp).sort((a, b) => composite(b, W) - composite(a, W));
      const topN = compBuy.slice(0, B.length);
      const fB = favOf(B, h), fT = favOf(topN, h);
      const orth = fB.fav > fT.fav;
      console.log(
        `  [${lab}] placebo đồng-n=${B.length}: B ${pct(fB.fav)}% vs composite-top-n ${pct(fT.fav)}% ` +
        `⇒ đáy ${orth ? "THÊM thông tin trực giao (+" + ((fB.fav - fT.fav) * 100).toFixed(1) + "pt)" : "KHÔNG thêm (B chỉ kén hơn)"}`
      );
    }

    // (2) Chia NHIỀU giai đoạn — đánh vào lo ngại "chỉ thắng 1 chế độ bull".
    const bounds = ["0000", "2014-01-01", "2019-01-01", "9999"];
    const segLabels = ["2009–2013", "2014–2018", "2019–2026"];
    for (let k = 0; k < 3; k++) {
      const seg = pts.filter((p) => p.date >= bounds[k] && p.date < bounds[k + 1]);
      const B = favOf(seg.filter((p) => comp(p) && bot(p)), h);
      const C = favOf(seg.filter(comp), h);
      const base = favOf(seg, h);
      console.log(
        `  [${segLabels[k]}] B ${pct(B.fav)}% (n=${B.n}) | composite ${pct(C.fav)}% (n=${C.n}) | baseline ${pct(base.fav)}% ` +
        `⇒ B vs comp ${B.fav > C.fav ? "+" : ""}${((B.fav - C.fav) * 100).toFixed(1)}pt`
      );
    }

    // (3) Lưới THƯA STEP=3 (mẫu hiệu dụng) + CI block-bootstrap.
    const sparse = pts.filter((p) => IDX.get(p.date)! % STEP === 0);
    const Bsp = sparse.filter((p) => comp(p) && bot(p));
    const Csp = sparse.filter(comp);
    const fBsp = favOf(Bsp, h), fCsp = favOf(Csp, h);
    const ciB = blockBootstrapCi(Bsp.map((p) => p.returns[h] as number), Math.max(1, Math.round(Number(h) / 3)));
    console.log(
      `  [thưa STEP=3] B n=${fBsp.n} ${pct(fBsp.fav)}% CI${ciB ? `[${ciB[0]}–${ciB[1]}]` : "—"} | composite n=${fCsp.n} ${pct(fCsp.fav)}%`
    );
  }
}

console.log(`Fusion study — timeline ${PTS.length} điểm (${PTS[0].date} → ${PTS[PTS.length - 1].date}), lưới DÀY step=1.`);
console.log(`Tín hiệu đáy = cycleBin==3 (${PTS.filter((p) => p.cycleBin === TOP_BIN).length} ngày). Split train<${SPLIT_DATE}.`);
fusionAB();
verifyB();
fusionC();
