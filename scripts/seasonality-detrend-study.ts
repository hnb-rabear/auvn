/**
 * P1-1b-detrend — tín hiệu mùa vụ: ngưỡng tuyệt đối (đang phát hành) vs de-trend vs rank.
 *
 * Vì sao: bug #8 (docs/audit-and-improvement-proposals-2026.md) đo được `season` thoái hóa
 * gần thành hằng số dương — ngưỡng TUYỆT ĐỐI `avg >= 2 ? +1 : avg <= -2 ? -1 : 0`
 * (criteria.ts:578) gặp tài sản xu-hướng-tăng: lợi suất 63 phiên trung bình mọi tháng đã
 * ~+2%, nên 7/12 tháng cho +1 và 0/12 cho -1. Bỏ look-ahead (#10, đã ship) KHÔNG sửa được
 * việc này — đo thật sau walk-forward vẫn `-1: 0,0% / +1: 62,1%`. Hai bug độc lập.
 *
 * Probe trước đó cho thấy de-trend (trừ trung bình chéo-tháng) mở lại phía âm. NHƯNG mở lại
 * phía âm là ĐỔI TÍN HIỆU, không phải sửa bug ⇒ phải qua cổng như mọi ứng viên khác.
 *
 * CỔNG 2 GIAI ĐOẠN (viết TRƯỚC khi xem số — không nới sau):
 *   G1. n >= 25 quan sát ở CẢ train và test (MIN_SIGNALS chuẩn của repo).
 *   G2. excess = fav - baseline > 0 ở CẢ train và test (cùng dấu, hai giai đoạn).
 *   G3. CI95 block-bootstrap của fav KHÔNG trùm baseline, ở CẢ train và test.
 *   G4. fav > placebo p95 ở CẢ train và test (placebo = chọn NGẪU NHIÊN cùng số tháng,
 *       giữ nguyên cấu trúc khối lịch — thước duy nhất trả lời "đúng THÁNG NÀY hay chỉ
 *       đúng vì chọn ít ngày hơn").
 * Biến thể nào không qua đủ 4 cổng ở cùng một kỳ hạn ⇒ NO-GO, không ship.
 *
 * Walk-forward: bảng mùa vụ tại ngày i chỉ dùng cặp (j, j+63) với j+63 <= i — y hệt
 * criteria.ts:570 trên đường live sau bản sửa #10. Cập nhật tăng dần (mỗi bar mới thêm
 * đúng 1 cặp) nên O(n).
 *
 * Lưới THƯA STEP=3 cho mọi thống kê (chống pseudo-replication: ngày kề nhau có cửa sổ
 * forward-return chồng lấn) + block-bootstrap block=H/STEP.
 *
 * Chạy: npx tsx scripts/seasonality-detrend-study.ts
 */
import assert from "node:assert/strict";
import { fetchXau } from "./fetch";
import { blockBootstrapCi, seededRandom } from "../src/lib/indicators";

const SPLIT_DATE = "2019-01-01";
const MIN_SIGNALS = 25;
/** Khớp WARMUP của scripts/backtest.ts — trước mốc này engine chưa chấm điểm. */
const WARMUP = 756;
/** Khớp STEP của scripts/backtest.ts (lưới thống kê thưa). */
const STEP = 3;
/** Kỳ hạn lợi suất 63 phiên mà seasonalityTable dùng (criteria.ts:518). */
const SEASON_H = 63;
const HORIZONS = [21, 63, 126] as const;
const PLACEBO_DRAWS = 400;

/** Điểm mùa vụ theo biến thể: nhận bảng trung bình theo tháng, trả -1|0|+1. */
interface Variant {
  id: string;
  desc: string;
  score: (avg: Map<number, number>, month: number) => number;
}

const absVariant = (thr: number): Variant => ({
  id: `abs${thr}`,
  desc: `ngưỡng tuyệt đối ±${thr}pp`,
  score: (avg, m) => {
    const v = avg.get(m);
    if (v === undefined) return 0;
    return v >= thr ? 1 : v <= -thr ? -1 : 0;
  },
});

const demeanVariant = (thr: number): Variant => ({
  id: `demean${thr}`,
  desc: `trừ trung bình chéo-tháng, ngưỡng ±${thr}pp`,
  score: (avg, m) => {
    const v = avg.get(m);
    if (v === undefined) return 0;
    const vals = [...avg.values()];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const d = v - mean;
    return d >= thr ? 1 : d <= -thr ? -1 : 0;
  },
});

const rankVariant = (k: number): Variant => ({
  id: `rank${k}`,
  desc: `xếp hạng: ${k} tháng tốt nhất +1, ${k} tệ nhất -1`,
  score: (avg, m) => {
    const v = avg.get(m);
    if (v === undefined) return 0;
    const sorted = [...avg.entries()].sort((a, b) => b[1] - a[1]).map(([mm]) => mm);
    if (sorted.length < 2 * k + 1) return 0;
    if (sorted.slice(0, k).includes(m)) return 1;
    if (sorted.slice(-k).includes(m)) return -1;
    return 0;
  },
});

const VARIANTS: Variant[] = [
  absVariant(1),
  absVariant(2), // ĐANG PHÁT HÀNH
  absVariant(3),
  demeanVariant(0.5),
  demeanVariant(1),
  demeanVariant(2),
  rankVariant(2),
  rankVariant(3),
  rankVariant(4),
];
const SHIPPED = "abs2";

interface Obs {
  date: string;
  month: number;
  /** điểm theo từng biến thể */
  scores: Map<string, number>;
  /** lợi suất tương lai theo kỳ hạn, null nếu chưa đủ bar */
  ret: Map<number, number | null>;
}

function fav(rets: number[]): number {
  return rets.length === 0 ? 0 : (rets.filter((r) => r > 0).length / rets.length) * 100;
}

async function main() {
  const { bars } = await fetchXau();
  const closes = bars.map((b) => b.close);
  const dates = bars.map((b) => b.date);
  console.log(`XAU/USD ${bars.length} bar: ${dates[0]} .. ${dates[dates.length - 1]}`);

  // --- bảng mùa vụ walk-forward, cập nhật tăng dần.
  const sums = new Map<number, { s: number; n: number }>();
  /** cặp (j, j+SEASON_H) tiếp theo chưa nạp vào bảng */
  let pairPtr = 0;
  const obs: Obs[] = [];

  for (let i = 0; i < closes.length; i++) {
    // nạp mọi cặp đã KẾT THÚC tại hoặc trước i (cùng điều kiện criteria.ts:518 trên tiền tố)
    while (pairPtr + SEASON_H <= i) {
      const m = new Date(dates[pairPtr]).getUTCMonth() + 1;
      const r = (closes[pairPtr + SEASON_H] / closes[pairPtr] - 1) * 100;
      const cur = sums.get(m) ?? { s: 0, n: 0 };
      cur.s += r;
      cur.n++;
      sums.set(m, cur);
      pairPtr++;
    }
    if (i < WARMUP || (i - WARMUP) % STEP !== 0) continue;

    const avg = new Map<number, number>();
    for (const [m, { s, n }] of sums) avg.set(m, s / n);
    const month = new Date(dates[i]).getUTCMonth() + 1;
    const scores = new Map<string, number>();
    for (const v of VARIANTS) scores.set(v.id, v.score(avg, month));
    const ret = new Map<number, number | null>();
    for (const h of HORIZONS) {
      ret.set(h, i + h < closes.length ? (closes[i + h] / closes[i] - 1) * 100 : null);
    }
    obs.push({ date: dates[i], month, scores, ret });
  }

  // Chốt bảng cuối để kiểm walk-forward khớp engine: bảng tại bar cuối phải bằng
  // seasonalityTable trên TOÀN chuỗi (cùng tập cặp), tức bản sửa #10 nhất quán.
  assert.equal(pairPtr, Math.max(0, closes.length - SEASON_H), "pairPtr phải quét hết cặp");
  assert.ok(obs.length > 500, `quá ít quan sát: ${obs.length}`);

  console.log(`quan sát lưới thưa STEP=${STEP}: ${obs.length}\n`);

  // --- phân bố điểm theo biến thể (chẩn đoán bug #8, không phải cổng)
  console.log("PHÂN BỐ ĐIỂM (toàn giai đoạn, % quan sát)");
  console.log("biến thể      |    -1 |     0 |    +1 | mô tả");
  for (const v of VARIANTS) {
    const c = [0, 0, 0];
    for (const o of obs) c[(o.scores.get(v.id) as number) + 1]++;
    const pct = (x: number) => ((x / obs.length) * 100).toFixed(1).padStart(5);
    const mark = v.id === SHIPPED ? " <= ĐANG PHÁT HÀNH" : "";
    console.log(
      `${v.id.padEnd(13)} | ${pct(c[0])} | ${pct(c[1])} | ${pct(c[2])} | ${v.desc}${mark}`
    );
  }
  console.log();

  // --- cổng 2 giai đoạn, phía MUA (score == +1)
  const rand = seededRandom(20260904);
  const months = Array.from({ length: 12 }, (_, k) => k + 1);
  const passed: string[] = [];

  for (const h of HORIZONS) {
    const usable = obs.filter((o) => o.ret.get(h) !== null);
    const train = usable.filter((o) => o.date < SPLIT_DATE);
    const test = usable.filter((o) => o.date >= SPLIT_DATE);
    const baseTr = fav(train.map((o) => o.ret.get(h) as number));
    const baseTe = fav(test.map((o) => o.ret.get(h) as number));
    const block = Math.max(1, Math.ceil(h / STEP));

    console.log(
      `=== kỳ hạn ${h} phiên | baseline train ${baseTr.toFixed(1)}% (n=${train.length}) ` +
        `test ${baseTe.toFixed(1)}% (n=${test.length}) | block=${block}`
    );

    for (const v of VARIANTS) {
      const pick = (set: Obs[]) =>
        set.filter((o) => o.scores.get(v.id) === 1).map((o) => o.ret.get(h) as number);
      const rTr = pick(train);
      const rTe = pick(test);
      const favTr = fav(rTr);
      const favTe = fav(rTe);
      const ciTr = blockBootstrapCi(rTr, block);
      const ciTe = blockBootstrapCi(rTe, block);

      // placebo cùng-n: chọn NGẪU NHIÊN cùng SỐ THÁNG mà biến thể đang gán +1.
      // Giữ cấu trúc khối lịch (một tháng = một khối ngày liên tiếp) nên đây là
      // đối chứng structure-matched, không phải shuffle từng ngày.
      const kMonths = new Set(train.filter((o) => o.scores.get(v.id) === 1).map((o) => o.month))
        .size;
      const placebo = (set: Obs[], base: number): { p95: number; medN: number } => {
        if (kMonths === 0 || kMonths >= 12) return { p95: base, medN: 0 };
        const favs: number[] = [];
        const ns: number[] = [];
        for (let d = 0; d < PLACEBO_DRAWS; d++) {
          const pool = [...months];
          const sel = new Set<number>();
          for (let k = 0; k < kMonths; k++) {
            sel.add(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
          }
          const r = set.filter((o) => sel.has(o.month)).map((o) => o.ret.get(h) as number);
          if (r.length >= 10) {
            favs.push(fav(r));
            ns.push(r.length);
          }
        }
        if (favs.length === 0) return { p95: base, medN: 0 };
        favs.sort((a, b) => a - b);
        ns.sort((a, b) => a - b);
        return {
          p95: favs[Math.floor(0.95 * (favs.length - 1))],
          medN: ns[Math.floor(ns.length / 2)],
        };
      };
      const plTr = placebo(train, baseTr);
      const plTe = placebo(test, baseTe);

      const g1 = rTr.length >= MIN_SIGNALS && rTe.length >= MIN_SIGNALS;
      const g2 = favTr - baseTr > 0 && favTe - baseTe > 0;
      const g3 = !!ciTr && !!ciTe && ciTr[0] > baseTr && ciTe[0] > baseTe;
      const g4 = favTr > plTr.p95 && favTe > plTe.p95;
      const ok = g1 && g2 && g3 && g4;
      if (ok) passed.push(`${v.id}@${h}`);

      const gate = `${g1 ? "n" : "-"}${g2 ? "e" : "-"}${g3 ? "c" : "-"}${g4 ? "p" : "-"}`;
      const ciS = (ci: [number, number] | null) =>
        ci ? `[${ci[0].toFixed(0)}-${ci[1].toFixed(0)}]` : "[--]";
      console.log(
        `  ${v.id.padEnd(11)} ${ok ? "GO  " : "no  "} ${gate} | ` +
          `train ${favTr.toFixed(1)}% n=${String(rTr.length).padStart(4)} ${ciS(ciTr)} ` +
          `ex ${(favTr - baseTr >= 0 ? "+" : "") + (favTr - baseTr).toFixed(1)}pt ` +
          `pl95 ${plTr.p95.toFixed(1)} | ` +
          `test ${favTe.toFixed(1)}% n=${String(rTe.length).padStart(4)} ${ciS(ciTe)} ` +
          `ex ${(favTe - baseTe >= 0 ? "+" : "") + (favTe - baseTe).toFixed(1)}pt ` +
          `pl95 ${plTe.p95.toFixed(1)}`
      );
    }
    console.log();
  }

  console.log(
    passed.length === 0
      ? "PHÁN QUYẾT: NO-GO — 0 biến thể qua đủ 4 cổng (n/excess/CI/placebo) ở bất kỳ kỳ hạn nào."
      : `PHÁN QUYẾT: ${passed.length} ứng viên qua cổng: ${passed.join(", ")}`
  );
  console.log("Ký hiệu cổng: n=đủ mẫu, e=excess>0 hai giai đoạn, c=CI không trùm baseline, p=vượt placebo p95.");
}

void main();
