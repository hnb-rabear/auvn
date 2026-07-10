/**
 * Sell-preset DEEP dive — vòng 2 của sell-preset-study: các cấu hình FED-nặng
 * qua cổng với min-excess khổng lồ nhưng năm bắn tập trung 2018 + 2022 (hai chu kỳ
 * Fed thắt). Ngày-mức fav-down với cửa sổ chồng lấn trong 1 cụm ≈ 1 quan sát —
 * placebo ngày-rời KHÔNG xử lý clustering. Vòng này đo mức CỤM:
 *
 * 1. Đếm cụm độc lập (gap > 21 phiên) mỗi era cho top config từng H.
 * 2. Độ chính xác CẤP CỤM: mỗi cụm 1 quan sát (trung vị lợi suất các ngày thành viên
 *    < 0 ⇒ cụm đúng). Yêu cầu tối thiểu để tin: ≥3 cụm đúng/era hoặc ≥5 cụm tổng.
 * 3. Placebo LIỀN KHỐI cùng cấu trúc: bốc các run liên tiếp cùng độ dài với run
 *    thật (200 draws/era) → p95 fav-down ngày-mức + tỉ lệ cụm đúng.
 * 4. Bảng lợi suất theo cụm (năm, số ngày, trung vị ret H63) để đọc bằng mắt.
 *
 * Chạy: npx tsx scripts/sell-preset-deep-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SPLIT_DATE } from "./study-lib";
import { seededRandom, median } from "../src/lib/indicators";
import type { TimelinePoint } from "../src/lib/types";

type H = "21" | "63" | "126";
const HS: H[] = ["21", "63", "126"];

// Top config mỗi H từ sell-preset-study (2026-07-10) + biến thể phủ-rộng FED=0.5
const CONFIGS: { label: string; w: Record<string, number>; thr: number }[] = [
  { label: "H21-top TK:0.6 FED:0.2 YLD:0.2 thr-60", w: { stats: 0.6, fed: 0.2, yield10y: 0.2 }, thr: -60 },
  { label: "H63-top TK:0.3 MOM:0.1 FED:0.4 YLD:0.2 thr-60", w: { stats: 0.3, momentum: 0.1, fed: 0.4, yield10y: 0.2 }, thr: -60 },
  { label: "H126-phủ TK:0.4 MOM:0.1 FED:0.4 YLD:0.1 thr-50", w: { stats: 0.4, momentum: 0.1, fed: 0.4, yield10y: 0.1 }, thr: -50 },
  { label: "FED-max KT:0.2 TK:0.2 DXY:0.1 FED:0.5 thr-60", w: { technical: 0.2, stats: 0.2, dxy: 0.1, fed: 0.5 }, thr: -60 },
];

interface Pt { date: string; idx: number; scores: Record<string, number>; returns: Record<H, number | null>; }

function composite(p: Pt, w: Record<string, number>): number {
  let s = 0, tw = 0;
  for (const [k, wk] of Object.entries(w)) {
    if (wk === 0) continue;
    const sc = p.scores[k];
    if (sc === undefined) continue;
    s += sc * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

/** Nhóm chỉ số liên tiếp (gap > 21 chỉ số phiên = cụm mới). */
function episodesOf(idxs: number[]): number[][] {
  const eps: number[][] = [];
  let cur: number[] = [];
  let last = -1e9;
  for (const i of idxs) {
    if (i - last > 21 && cur.length) { eps.push(cur); cur = []; }
    cur.push(i);
    last = i;
  }
  if (cur.length) eps.push(cur);
  return eps;
}

function main() {
  const tl: { points: TimelinePoint[] } = JSON.parse(
    readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
  );
  const points: Pt[] = tl.points.map((p, idx) => ({
    date: p.date,
    idx,
    scores: p.scores as Record<string, number>,
    returns: p.returns as Record<H, number | null>,
  }));

  for (const cfg of CONFIGS) {
    console.log(`\n############ ${cfg.label} ############`);
    for (const h of HS) {
      const valid = points.filter((p) => p.returns[h] !== null);
      const sig = valid.filter((p) => composite(p, cfg.w) <= cfg.thr);
      if (sig.length < 10) { console.log(`  H${h}: chỉ ${sig.length} ngày tín hiệu — bỏ`); continue; }

      const eras: [string, (d: string) => boolean][] = [
        ["train", (d) => d < SPLIT_DATE],
        ["test", (d) => d >= SPLIT_DATE],
      ];
      for (const [era, inEra] of eras) {
        const eraValid = valid.filter((p) => inEra(p.date));
        const eraSig = sig.filter((p) => inEra(p.date));
        if (!eraSig.length) { console.log(`  H${h} ${era}: 0 tín hiệu`); continue; }
        const eps = episodesOf(eraSig.map((p) => p.idx));
        const byIdx = new Map(points.map((p) => [p.idx, p]));
        const epStats = eps.map((e) => {
          const rets = e.map((i) => byIdx.get(i)!.returns[h] as number);
          const md = median(rets)!;
          return { y: byIdx.get(e[0])!.date.slice(0, 7), n: e.length, med: md, right: md < 0 };
        });
        const dayFav = eraSig.filter((p) => (p.returns[h] as number) < 0).length / eraSig.length;
        const epRight = epStats.filter((e) => e.right).length;

        // placebo liền khối cùng cấu trúc run
        const runLens = eps.map((e) => e.length);
        const rand = seededRandom(20260710 + h.length + era.length);
        const plaDay: number[] = [];
        const plaEp: number[] = [];
        for (let d = 0; d < 200; d++) {
          let fav = 0, tot = 0, right = 0;
          for (const L of runLens) {
            const start = Math.floor(rand() * Math.max(1, eraValid.length - L));
            const run = eraValid.slice(start, start + L);
            const rets = run.map((p) => p.returns[h] as number);
            fav += rets.filter((r) => r < 0).length;
            tot += rets.length;
            if (median(rets)! < 0) right++;
          }
          plaDay.push(fav / tot);
          plaEp.push(right / runLens.length);
        }
        const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)];

        console.log(
          `  H${h} ${era}: ${eraSig.length} ngày / ${eps.length} cụm | fav-down ngày ${(dayFav * 100).toFixed(0)}% (placebo-khối p95 ${(p95(plaDay) * 100).toFixed(0)}%) | ` +
            `cụm đúng ${epRight}/${eps.length} (placebo-khối p95 ${(p95(plaEp) * 100).toFixed(0)}%)`
        );
        console.log(
          `    cụm: ${epStats.map((e) => `${e.y}(n=${e.n},med${e.med >= 0 ? "+" : ""}${e.med.toFixed(1)}%${e.right ? "✓" : "✗"})`).join(" ")}`
        );
      }
    }
  }
  console.log(
    "\nĐọc kết quả: tin cấu hình CHỈ KHI cụm đúng vượt placebo-khối p95 ở cả hai era VÀ tổng cụm ≥5; " +
      "nếu toàn bộ tín hiệu test là 1-2 cụm (2022) thì đây là 'nhận diện chu kỳ Fed thắt', n độc lập quá nhỏ để claim %."
  );
}

main();
