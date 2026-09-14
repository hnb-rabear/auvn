/** Hàm dùng chung cho các study tuyển chọn cấu hình trên timeline. */
import type { TimelinePoint } from "../src/lib/types";

export { blockBootstrapCi } from "../src/lib/indicators";
import { seededRandom } from "../src/lib/indicators";
export { seededRandom };

export type H = "21" | "63" | "126";
export const SPLIT_DATE = "2019-01-01";
export const MIN_SIGNALS = 25;

export function composite(p: TimelinePoint, w: Record<string, number>): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores)) {
    const wk = w[k] ?? 0;
    s += (score as number) * wk;
    tw += wk;
  }
  return tw === 0 ? 0 : (s / tw) * 50;
}

export interface BucketStats {
  n: number;
  fav: number;
  med: number;
}

export function stats(rets: number[]): BucketStats {
  if (rets.length === 0) return { n: 0, fav: 0, med: 0 };
  const fav = rets.filter((r) => r > 0).length / rets.length;
  const sorted = [...rets].sort((a, b) => a - b);
  return { n: rets.length, fav, med: sorted[Math.floor(sorted.length / 2)] };
}

export function evalBuy(
  data: TimelinePoint[],
  h: H,
  w: Record<string, number>,
  thr: number
): BucketStats {
  return stats(
    data.filter((p) => composite(p, w) >= thr).map((p) => p.returns[h] as number)
  );
}

export interface Candidate {
  w: Record<string, number>;
  thr: number;
  tr: BucketStats;
  te: BucketStats;
  minExcess: number;
}

/**
 * Grid search trọng số (bước 10%) × ngưỡng mua. Nhận cấu hình có ≥MIN_SIGNALS
 * tín hiệu và thắng baseline ở CẢ HAI giai đoạn; xếp theo lợi thế tệ nhất.
 * Tự phát hiện tiêu chí "momentum" trong timeline (4D search khi có, 3D khi không).
 */
export function gridSearch(points: TimelinePoint[], h: H): {
  baseTrain: number;
  baseTest: number;
  trainN: number;
  testN: number;
  candidates: Candidate[];
} {
  const pts = points.filter((p) => p.returns[h] !== null);
  const train = pts.filter((p) => p.date < SPLIT_DATE);
  const test = pts.filter((p) => p.date >= SPLIT_DATE);
  const baseTrain = stats(train.map((p) => p.returns[h] as number)).fav;
  const baseTest = stats(test.map((p) => p.returns[h] as number)).fav;

  const hasMomentum = pts.some(
    (p) => (p.scores as Record<string, number>)["momentum"] !== undefined
  );

  const candidates: Candidate[] = [];

  function tryConfig(w: Record<string, number>) {
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

  for (let wt = 0; wt <= 10; wt++) {
    for (let ws = 0; ws <= 10 - wt; ws++) {
      if (hasMomentum) {
        for (let wmom = 0; wmom <= 10 - wt - ws; wmom++) {
          const wm = 10 - wt - ws - wmom;
          tryConfig({ technical: wt / 10, stats: ws / 10, macro: wm / 10, momentum: wmom / 10 });
        }
      } else {
        tryConfig({ technical: wt / 10, stats: ws / 10, macro: (10 - wt - ws) / 10 });
      }
    }
  }

  candidates.sort((a, b) => b.minExcess - a.minExcess);
  return { baseTrain, baseTest, trainN: train.length, testN: test.length, candidates };
}

/**
 * Số CỤM ĐỘC LẬP trong một tập tín hiệu: hai tín hiệu cách nhau < H phiên thì cửa sổ
 * lợi suất tương lai của chúng chồng lấn ⇒ cùng một quan sát. `idxs` là chỉ số trên
 * lưới timeline (tăng dần), `h` là số phiên của kỳ hạn.
 *
 * Đây mới là n để đọc độ tin cậy — n NGÀY luôn lớn hơn nhiều lần và làm CI hẹp giả.
 */
export function countClusters(idxs: number[], h: number): number {
  let c = 0;
  let last = -Infinity;
  for (const i of idxs) {
    if (i - last >= h) c++;
    last = i;
  }
  return c;
}

/**
 * CI 95% cho % thuận chiều của một tập tín hiệu, resample theo KHỐI LỊCH.
 *
 * Vì sao không dùng blockBootstrapCi trực tiếp: hàm đó nhận MẢNG ĐÃ LỌC (chỉ các ngày
 * trúng tín hiệu) nên khoảng cách lịch giữa chúng biến mất — hai ngày trúng cách nhau
 * 3 năm nằm cạnh nhau trong mảng và được coi là liền kề, còn một chùm 40 ngày trúng
 * liên tiếp bị đếm thành 40 quan sát. Kết quả: CI hẹp giả ở đúng cái nó phải phản ánh.
 *
 * Ở đây khối được lấy trên TRỤC THỜI GIAN: chọn ngẫu nhiên một đoạn `blockSessions`
 * phiên liên tiếp của timeline, gom các ngày trúng rơi vào đoạn đó, lặp tới khi đủ
 * cỡ mẫu gốc. Một chùm dày vì thế vào/ra cùng nhau — đúng bản chất pseudo-replication.
 *
 * Trả null khi quá ít tín hiệu (<10) — như blockBootstrapCi.
 */
export function calendarBlockBootstrapCi(
  /** returns theo chỉ số timeline; null = ngày không trúng tín hiệu (hoặc chưa đáo hạn) */
  hitReturns: (number | null)[],
  blockSessions: number,
  iterations = 2000,
  seed = 20260611
): [number, number] | null {
  const n = hitReturns.length;
  const target = hitReturns.filter((r) => r !== null).length;
  if (target < 10 || n === 0) return null;
  const b = Math.max(1, Math.min(blockSessions, n));
  const rand = seededRandom(seed);
  const favs: number[] = [];
  for (let it = 0; it < iterations; it++) {
    let fav = 0;
    let total = 0;
    // Bốc khối lịch tới khi gom đủ ~target tín hiệu (khối rỗng vẫn tốn lượt —
    // đúng ý: giai đoạn câm tín hiệu là thông tin, không phải mẫu bị bỏ qua).
    let guard = 0;
    while (total < target && guard++ < 10000) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < b; j++) {
        const r = hitReturns[(start + j) % n];
        if (r === null) continue;
        if (r > 0) fav++;
        total++;
        if (total >= target) break;
      }
    }
    if (total > 0) favs.push(fav / total);
  }
  if (favs.length < 100) return null;
  favs.sort((a, c) => a - c);
  const lo = favs[Math.floor(0.025 * (favs.length - 1))];
  const hi = favs[Math.floor(0.975 * (favs.length - 1))];
  return [Math.round(lo * 1000) / 10, Math.round(hi * 1000) / 10];
}

export function fmtCand(c: Candidate): string {
  const momPart = c.w.momentum !== undefined && c.w.momentum > 0 ? ` MOM:${c.w.momentum}` : "";
  return (
    `w=KT:${c.w.technical} TK:${c.w.stats} VM:${c.w.macro}${momPart} thr=${c.thr} | ` +
    `train ${(c.tr.fav * 100).toFixed(1)}% (n=${c.tr.n}) | ` +
    `test ${(c.te.fav * 100).toFixed(1)}% (n=${c.te.n}, med=${c.te.med.toFixed(1)}%) | ` +
    `min-excess +${(c.minExcess * 100).toFixed(1)}pt`
  );
}
