/**
 * Tuyển chọn preset trọng số cho từng kỳ hạn 1/3/6 tháng.
 *
 * Phương pháp: grid search trọng số (bước 10%) × ngưỡng mua (30..60) trên
 * timeline thật, chia 2 giai đoạn độc lập: train 2009–2018, test 2019–2026.
 * Điều kiện nhận: ≥25 tín hiệu mỗi giai đoạn VÀ thắng baseline (mua ngày
 * bất kỳ) ở CẢ HAI giai đoạn. Xếp hạng theo lợi thế tệ nhất trong 2 giai
 * đoạn (ưu tiên ổn định, không ưu tiên đỉnh cao ăn may).
 *
 * Chạy: npm run collect (tạo timeline.json) rồi npx tsx scripts/presets-study.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Timeline, TimelinePoint } from "../src/lib/types";

const SPLIT_DATE = "2019-01-01";
const MIN_SIGNALS = 25;

const tl: Timeline = JSON.parse(
  readFileSync(join(process.cwd(), "public", "data", "timeline.json"), "utf8")
);

type H = "21" | "63" | "126";

function composite(p: TimelinePoint, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores)) {
    const wk = w[k] ?? 0;
    s += (score as number) * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

function stats(rets: number[]): { n: number; fav: number; med: number } {
  if (rets.length === 0) return { n: 0, fav: 0, med: 0 };
  const fav = rets.filter((r) => r > 0).length / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  return { n: rets.length, fav, med: sorted[Math.floor(sorted.length / 2)] };
}

function evalBuy(data: TimelinePoint[], h: H, w: Record<string, number>, thr: number) {
  return stats(
    data.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number)
  );
}

function main() {
  for (const h of ["21", "63", "126"] as H[]) {
    const pts = tl.points.filter((p) => p.returns[h] !== null);
    const train = pts.filter((p) => p.date < SPLIT_DATE);
    const test = pts.filter((p) => p.date >= SPLIT_DATE);
    const baseTrain = stats(train.map((p) => p.returns[h] as number)).fav;
    const baseTest = stats(test.map((p) => p.returns[h] as number)).fav;

    console.log(`\n========== KỲ HẠN ${h} phiên ==========`);
    console.log(
      `train n=${train.length} baseline=${(baseTrain * 100).toFixed(1)}% | test n=${test.length} baseline=${(baseTest * 100).toFixed(1)}%`
    );

    const candidates: {
      w: Record<string, number>;
      thr: number;
      tr: ReturnType<typeof stats>;
      te: ReturnType<typeof stats>;
      minExcess: number;
    }[] = [];

    for (let wt = 0; wt <= 10; wt++) {
      for (let ws = 0; ws <= 10 - wt; ws++) {
        const wm = 10 - wt - ws;
        const w = { technical: wt / 10, stats: ws / 10, macro: wm / 10 };
        for (const thr of [30, 40, 50, 60]) {
          const tr = evalBuy(train, h, w, thr);
          const te = evalBuy(test, h, w, thr);
          if (tr.n < MIN_SIGNALS || te.n < MIN_SIGNALS) continue;
          const exTr = tr.fav - baseTrain;
          const exTe = te.fav - baseTest;
          if (exTr <= 0 || exTe <= 0) continue;
          candidates.push({ w, thr, tr, te, minExcess: Math.min(exTr, exTe) });
        }
      }
    }

    if (candidates.length === 0) {
      console.log(
        "KHÔNG có cấu hình nào thắng baseline ổn định ở cả 2 giai đoạn -> không nên phát hành preset cho kỳ hạn này."
      );
      continue;
    }

    candidates.sort((a, b) => b.minExcess - a.minExcess);
    console.log(`đạt chuẩn: ${candidates.length} cấu hình. TOP 5 theo lợi thế tệ nhất:`);
    for (const c of candidates.slice(0, 5)) {
      console.log(
        `w=KT:${c.w.technical} TK:${c.w.stats} VM:${c.w.macro} thr=${c.thr} | ` +
          `train ${(c.tr.fav * 100).toFixed(1)}% (n=${c.tr.n}, med=${c.tr.med.toFixed(1)}%) | ` +
          `test ${(c.te.fav * 100).toFixed(1)}% (n=${c.te.n}, med=${c.te.med.toFixed(1)}%) | ` +
          `lợi thế min=+${(c.minExcess * 100).toFixed(1)}pt`
      );
    }
  }
}
main();
