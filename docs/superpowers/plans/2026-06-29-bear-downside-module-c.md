# Bear Downside (Module C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lớp "phân phối rủi ro bear" — báo phân phối lịch sử mức-rơi-thêm (đáy tệ nhất về sau) ở 1/3/6/12 tháng, có điều kiện theo độ sâu drawdown hiện tại, kèm CI; validate điều kiện hóa có thêm thông tin không, luôn ship được phân phối vô-điều-kiện.

**Architecture:** Stats tính tại collection-time (như backtest/bottom): engine thuần (`bear-downside.ts`) gom mức-rơi-thêm theo (bucket × horizon) trên lưới thưa STEP=3, tính trung vị/p10/p90/P(đáy phía sau) + block-bootstrap CI; study kiểm 3 điều kiện train/test → cờ `conditioningWorks`; engine chọn hiển thị bucket hiện tại hay phân phối tổng theo cờ; cron ghi JSON; UI tra cứu. Lớp độc lập, chỉ đọc, không đụng composite/Bottom Hunter/Bear DCA/Accumulation.

**Tech Stack:** TypeScript, Next.js (static export), vitest, tsx. Không thêm dependency.

## Global Constraints

(Áp dụng MỌI task — copy verbatim từ spec `docs/superpowers/specs/2026-06-29-bear-downside-design.md` + CLAUDE.md)

- **No prediction claims — decision support only.** Phân phối lịch sử có điều kiện, KHÔNG tiên lượng điểm số.
- **Metric "mức rơi thêm":** `furtherDrawdownPct(i,H) = min(price[i+1..i+H]) / price[i] − 1`, đơn vị %. ≤0 nếu còn rơi, =0 nếu hôm nay là đáy cửa sổ. Null nếu `i+H ≥ len` (chưa đáo hạn).
- **P(đáy đã phía sau) = tỉ lệ `furtherDrawdownPct ≥ 0`** (giá không xuống dưới hôm nay trong H phiên).
- **Bucket độ sâu (dd = (ATH−price)/ATH, fraction):** idx0 `[0,0.10)`, idx1 `[0.10,0.20)`, idx2 `[0.20,0.30)`, idx3 `[0.30,∞)`. ATH = rolling all-time-high từ đầu chuỗi.
- **Horizon:** 21, 63, 126, 252 phiên.
- **Lưới thưa STEP=3** cho mọi thống kê (chống pseudo-replication). Nhóm < **MIN_N=30** mẫu → coi "chưa đủ dữ liệu".
- **CI:** `blockBootstrapCi` (có sẵn) cho P(đáy phía sau); helper mới `blockBootstrapPercentileCi` cho trung vị. blockSize = `max(1, round(H/STEP))` (phần tử lưới thưa cách nhau STEP ngày; cửa sổ H ngày ≈ H/STEP phần tử).
- **conditioningWorks** là cờ chốt từ study (research gate train/test), lưu trong `BEAR_DOWNSIDE_CONFIG`; engine đọc cờ để chọn hiển thị. Phân phối vô-điều-kiện LUÔN tính & ship được.
- **Validate trên XAU/USD.** Không caveat VND (đây là phân phối lợi suất XAU, không phải giá vốn VND).
- **Free-tier, collection-time, repo là database** (không rewrite `public/data/history/`). UI tiếng Việt; chuỗi giải thích tiếng Việt.

---

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `src/lib/indicators.ts` (+test) | thêm `percentile`, `blockBootstrapPercentileCi` | 1 |
| `src/lib/types.ts` | kiểu `BearHorizonStat`, `BearBucketStat`, `BearDownsideAnalysis`, `BearDownsideConfig`, hằng `BEAR_DOWNSIDE_CONFIG` | 2 |
| `src/lib/bear-downside.ts` (+test) | hằng BUCKETS/HORIZONS, `bucketOf`, `furtherDrawdownPct`, `computeHorizonStat`; rồi `runBearDownside` | 2, 3 |
| `scripts/bear-downside-study.ts` | kiểm 3 điều kiện train/test, in kết quả | 4 |
| `docs/bear-downside.md` | phương pháp + bằng chứng + kết luận | 5 |
| `scripts/run.ts` | ghi `public/data/bear-downside.json` | 6 |
| `src/components/BearDownsideCard.tsx` | card UI | 7 |
| `src/app/page.tsx`, `src/components/Dashboard.tsx` | nạp JSON + accordion | 7 |

---

## Task 1: Helper CI bách phân vị

**Files:**
- Modify: `src/lib/indicators.ts` (thêm 2 export ở cuối file)
- Test: `src/lib/indicators.test.ts` (tạo nếu chưa có; nếu đã có thì thêm describe)

**Interfaces:**
- Consumes: `seededRandom` (đã có trong indicators.ts).
- Produces:
  - `function percentile(values: number[], q: number): number` — q∈[0,1], nội suy tuyến tính; NaN nếu rỗng.
  - `function blockBootstrapPercentileCi(values: number[], q: number, blockSize: number, iterations?: number, seed?: number): [number, number] | null` — CI 95% của bách phân vị q, resample khối; null nếu n<10.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/indicators.test.ts  (nếu file đã tồn tại, chỉ THÊM 2 describe dưới đây)
import { describe, it, expect } from "vitest";
import { percentile, blockBootstrapPercentileCi } from "./indicators";

describe("percentile", () => {
  it("trung vị khớp giữa mảng", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 6);
    expect(percentile([1, 2, 3], 0.5)).toBeCloseTo(2, 6);
  });
  it("p10 / p90 nội suy tuyến tính", () => {
    const v = Array.from({ length: 11 }, (_, i) => i * 10); // 0..100 bước 10
    expect(percentile(v, 0.1)).toBeCloseTo(10, 6);
    expect(percentile(v, 0.9)).toBeCloseTo(90, 6);
  });
});

describe("blockBootstrapPercentileCi", () => {
  it("trả null khi n<10", () => {
    expect(blockBootstrapPercentileCi([1, 2, 3], 0.5, 1)).toBeNull();
  });
  it("CI bao quanh trung vị thật và tái lập (cùng seed)", () => {
    const v = Array.from({ length: 200 }, (_, i) => (i % 20) - 10); // -10..9 lặp
    const ci1 = blockBootstrapPercentileCi(v, 0.5, 3, 500, 123)!;
    const ci2 = blockBootstrapPercentileCi(v, 0.5, 3, 500, 123)!;
    expect(ci1).toEqual(ci2);                 // tái lập
    expect(ci1[0]).toBeLessThanOrEqual(ci1[1]); // lo ≤ hi
    const med = percentile(v, 0.5);
    expect(ci1[0]).toBeLessThanOrEqual(med);
    expect(ci1[1]).toBeGreaterThanOrEqual(med);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/indicators.test.ts`
Expected: FAIL — `percentile`/`blockBootstrapPercentileCi` không tồn tại.

- [ ] **Step 3: Write implementation (append vào cuối `src/lib/indicators.ts`)**

```ts
/** Bách phân vị q∈[0,1] với nội suy tuyến tính. NaN nếu rỗng. */
export function percentile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const idx = q * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * Block bootstrap CI 95% cho bách phân vị q. Resample theo KHỐI liên tiếp (tôn
 * trọng autocorrelation — chuỗi mức-rơi-thêm cách STEP phiên vẫn chồng lấn cửa sổ).
 * null nếu n<10. Trả [lo, hi] làm tròn 0.1.
 */
export function blockBootstrapPercentileCi(
  values: number[],
  q: number,
  blockSize: number,
  iterations = 2000,
  seed = 20260629
): [number, number] | null {
  const n = values.length;
  if (n < 10) return null;
  const b = Math.max(1, Math.min(blockSize, n));
  const nBlocks = Math.ceil(n / b);
  const rand = seededRandom(seed);
  const ests: number[] = [];
  for (let it = 0; it < iterations; it++) {
    const sample: number[] = [];
    for (let k = 0; k < nBlocks && sample.length < n; k++) {
      const start = Math.floor(rand() * n);
      for (let j = 0; j < b && sample.length < n; j++) sample.push(values[(start + j) % n]);
    }
    ests.push(percentile(sample, q));
  }
  ests.sort((a, c) => a - c);
  const lo = ests[Math.floor(0.025 * (iterations - 1))];
  const hi = ests[Math.floor(0.975 * (iterations - 1))];
  return [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/indicators.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indicators.ts src/lib/indicators.test.ts
git commit -m "feat(bear-downside): helper percentile + block-bootstrap percentile CI (Module C task 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Kiểu + nguyên thủy thống kê thuần

**Files:**
- Modify: `src/lib/types.ts` (thêm khối kiểu + hằng, đặt sau khối `BEAR_DCA`/cuối file — cạnh các config khác)
- Create: `src/lib/bear-downside.ts`
- Test: `src/lib/bear-downside.test.ts`

**Interfaces:**
- Consumes: `blockBootstrapCi`, `blockBootstrapPercentileCi`, `percentile` từ `./indicators`.
- Produces (trong `types.ts`):
  ```ts
  export interface BearHorizonStat {
    horizonDays: number;
    median: number;        // % mức rơi thêm
    p10: number;           // % kịch bản xấu
    p90: number;           // %
    pBottomBehind: number; // % (furtherDrawdown ≥ 0)
    pCi: [number, number] | null;      // CI cho pBottomBehind
    medianCi: [number, number] | null; // CI cho median
    n: number;
  }
  export interface BearBucketStat {
    bucketIdx: number;          // 0..3
    ddLowPct: number;           // 0,10,20,30
    ddHighPct: number | null;   // 10,20,30,null
    horizons: BearHorizonStat[];
  }
  export interface BearDownsideAnalysis {
    generatedAt: string;
    dataDate: string;
    currentDdPct: number;       // %
    currentBucketIdx: number;   // 0..3
    conditioningWorks: boolean;
    shownSource: "bucket" | "unconditional";
    shown: BearHorizonStat[];
    buckets: BearBucketStat[];
    unconditional: BearHorizonStat[];
    note: string;
  }
  export interface BearDownsideConfig { conditioningWorks: boolean; }
  export const BEAR_DOWNSIDE_CONFIG: BearDownsideConfig = { conditioningWorks: false };
  ```
- Produces (trong `bear-downside.ts`):
  - `export const BUCKETS: { lo: number; hi: number | null }[]` — 4 bucket (fraction).
  - `export const HORIZONS = [21, 63, 126, 252]`
  - `function bucketOf(dd: number): number` — dd fraction → 0..3.
  - `function furtherDrawdownPct(closes: number[], i: number, H: number): number | null`
  - `function computeHorizonStat(values: number[], H: number): BearHorizonStat` — values = mảng furtherDrawdownPct (%) của một nhóm.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/bear-downside.test.ts
import { describe, it, expect } from "vitest";
import { bucketOf, furtherDrawdownPct, computeHorizonStat, BUCKETS, HORIZONS } from "./bear-downside";

describe("bucketOf", () => {
  it("ánh xạ dd fraction sang 0..3", () => {
    expect(bucketOf(0.05)).toBe(0);
    expect(bucketOf(0.15)).toBe(1);
    expect(bucketOf(0.25)).toBe(2);
    expect(bucketOf(0.40)).toBe(3);
    expect(bucketOf(0)).toBe(0);
    expect(bucketOf(0.10)).toBe(1); // biên trên thuộc bucket kế
  });
});

describe("furtherDrawdownPct", () => {
  it("đáy tệ nhất trong H phiên tới (âm khi còn rơi)", () => {
    const closes = [100, 90, 95, 80]; // từ i=0, H=3: min(90,95,80)=80 -> -20%
    expect(furtherDrawdownPct(closes, 0, 3)!).toBeCloseTo(-20, 6);
  });
  it("dương khi hôm nay là đáy (giá chỉ đi lên)", () => {
    const closes = [80, 90, 100]; // min(90,100)=90 > 80 -> +12.5% (≥0 ⇒ tính là "đáy đã phía sau")
    expect(furtherDrawdownPct(closes, 0, 2)!).toBeGreaterThan(0);
  });
  it("null khi chưa đủ H phiên tương lai", () => {
    expect(furtherDrawdownPct([100, 90], 0, 5)).toBeNull();
  });
});

describe("computeHorizonStat", () => {
  it("tính trung vị, P(đáy phía sau), n", () => {
    // 40 giá trị: 20 âm (-10), 20 bằng 0 -> pBottomBehind 50%, median -5
    const vals = [...Array(20).fill(-10), ...Array(20).fill(0)];
    const s = computeHorizonStat(vals, 63);
    expect(s.horizonDays).toBe(63);
    expect(s.n).toBe(40);
    expect(s.pBottomBehind).toBeCloseTo(50, 0);
    expect(s.median).toBeCloseTo(-5, 6); // nội suy giữa -10 và 0
  });
});
```

> **Chú thích test "furtherDrawdownPct = 0 khi đáy":** định nghĩa metric trả `min(tương lai)/giá[i]−1`. Khi giá chỉ đi lên, `min` tương lai vẫn > giá[i] ⇒ giá trị DƯƠNG (vd +12.5%), KHÔNG phải 0. Sửa test cho đúng định nghĩa: dùng `toBeGreaterThan(0)` thay vì `toBeCloseTo(0)`. (P(đáy phía sau) đếm `≥ 0`, nên cả dương lẫn 0 đều tính là "đáy đã phía sau".) Cập nhật assertion:

```ts
  it("dương khi hôm nay là đáy (giá chỉ đi lên)", () => {
    const closes = [80, 90, 100];
    expect(furtherDrawdownPct(closes, 0, 2)!).toBeGreaterThan(0); // min(90,100)=90 -> +12.5%
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bear-downside.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3a: Thêm kiểu vào `src/lib/types.ts`** (khối ở mục Interfaces ở trên — dán nguyên văn vào cuối file, sau các config Bear DCA).

- [ ] **Step 3b: Write `src/lib/bear-downside.ts`** (phần nguyên thủy; `runBearDownside` ở Task 3)

```ts
// src/lib/bear-downside.ts
/** Phân phối rủi ro bear: mức-rơi-thêm có điều kiện theo độ sâu drawdown. Tính tại collection-time. */
import { blockBootstrapCi, blockBootstrapPercentileCi, percentile } from "./indicators";
import type { BearHorizonStat } from "./types";

export const BUCKETS: { lo: number; hi: number | null }[] = [
  { lo: 0, hi: 0.10 },
  { lo: 0.10, hi: 0.20 },
  { lo: 0.20, hi: 0.30 },
  { lo: 0.30, hi: null },
];
export const HORIZONS = [21, 63, 126, 252];
export const STEP = 3;
export const MIN_N = 30;

/** dd fraction (0..1) -> chỉ số bucket 0..3. Biên trên thuộc bucket kế. */
export function bucketOf(dd: number): number {
  for (let b = 0; b < BUCKETS.length; b++) {
    const { hi } = BUCKETS[b];
    if (hi === null || dd < hi) return b;
  }
  return BUCKETS.length - 1;
}

/** Đáy tệ nhất H phiên tới so với hôm nay, %: min(closes[i+1..i+H])/closes[i]-1. null nếu chưa đáo hạn. */
export function furtherDrawdownPct(closes: number[], i: number, H: number): number | null {
  if (i + H >= closes.length) return null;
  let mn = Infinity;
  for (let j = i + 1; j <= i + H; j++) if (closes[j] < mn) mn = closes[j];
  return (mn / closes[i] - 1) * 100;
}

/** Thống kê một nhóm mức-rơi-thêm (%) cho horizon H. blockSize lưới-thưa = round(H/STEP). */
export function computeHorizonStat(values: number[], H: number): BearHorizonStat {
  const n = values.length;
  const blk = Math.max(1, Math.round(H / STEP));
  const favArr = values.map((v) => (v >= 0 ? 1 : -1));
  const pos = favArr.filter((x) => x > 0).length;
  return {
    horizonDays: H,
    median: n ? Math.round(percentile(values, 0.5) * 10) / 10 : 0,
    p10: n ? Math.round(percentile(values, 0.1) * 10) / 10 : 0,
    p90: n ? Math.round(percentile(values, 0.9) * 10) / 10 : 0,
    pBottomBehind: n ? Math.round((pos / n) * 1000) / 10 : 0,
    pCi: blockBootstrapCi(favArr, blk),
    medianCi: blockBootstrapPercentileCi(values, 0.5, blk),
    n,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bear-downside.test.ts`
Expected: PASS (bucketOf 1, furtherDrawdownPct 3, computeHorizonStat 1).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/bear-downside.ts src/lib/bear-downside.test.ts
git commit -m "feat(bear-downside): kiểu + nguyên thủy thống kê (bucket, mức rơi thêm, horizon stat) (Module C task 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Engine `runBearDownside`

**Files:**
- Modify: `src/lib/bear-downside.ts` (thêm `runBearDownside` + rollingAth nội bộ)
- Test: `src/lib/bear-downside.test.ts` (thêm describe)

**Interfaces:**
- Consumes: `bucketOf`, `furtherDrawdownPct`, `computeHorizonStat`, `BUCKETS`, `HORIZONS`, `STEP`, `MIN_N`; `BEAR_DOWNSIDE_CONFIG`, các kiểu từ `./types`.
- Produces: `function runBearDownside(bars: { date: string; close: number }[], cfg?: BearDownsideConfig): BearDownsideAnalysis`.

Logic:
- `closes`, `dates`. rollingAth (ATH lũy kế từ đầu). `ddFrac[i] = (ath[i]-closes[i])/ath[i]`.
- Gom trên lưới thưa: `for i=0; i<len; i+=STEP` — với mỗi horizon H, nếu `furtherDrawdownPct(closes,i,H)` != null thì đẩy vào `byBucket[bucketOf(ddFrac[i])][H]` và `uncond[H]`.
- `buckets[b].horizons[h] = computeHorizonStat(byBucket[b][H], H)`; `unconditional[h] = computeHorizonStat(uncond[H], H)`.
- `currentDdPct = round(ddFrac[last]*1000)/10`; `currentBucketIdx = bucketOf(ddFrac[last])`.
- `shown`: nếu `cfg.conditioningWorks` ∧ mọi (hoặc đa số) horizon của bucket hiện tại có `n>=MIN_N` → `shownSource="bucket"`, lấy `buckets[currentBucketIdx].horizons`; else `shownSource="unconditional"`, lấy `unconditional`. (Quy tắc đủ-mẫu: dùng bucket nếu horizon NGẮN NHẤT 21 có n>=MIN_N — vì horizon dài luôn ít mẫu hơn; horizon dài thiếu mẫu sẽ tự có n nhỏ và UI ẩn.)
- `note`: nếu conditioningWorks → mô tả bucket; nếu không → "độ sâu drawdown không tiên lượng được mức rơi thêm — đây là phân phối lịch sử chung."

- [ ] **Step 1: Write the failing test**

```ts
// thêm vào src/lib/bear-downside.test.ts
import { runBearDownside } from "./bear-downside";
import type { BearDownsideConfig } from "@/lib/types";

describe("runBearDownside", () => {
  // chuỗi tăng dài để có ATH rõ rồi rơi cuối -> bucket hiện tại > 0
  const bars = [
    ...Array.from({ length: 400 }, (_, i) => ({ date: `2020-${String((i % 12) + 1).padStart(2, "0")}-01`, close: 100 + i })),
    ...Array.from({ length: 60 }, (_, i) => ({ date: "2024-01-01", close: 499 - i * 3 })), // rơi từ ~499
  ];
  it("báo bucket hiện tại theo drawdown và bảng đầy đủ 4 horizon", () => {
    const a = runBearDownside(bars, { conditioningWorks: true });
    expect(a.currentDdPct).toBeGreaterThan(0);
    expect(a.buckets.length).toBe(4);
    expect(a.unconditional.length).toBe(4);
    expect(a.unconditional[0].horizonDays).toBe(21);
  });
  it("conditioningWorks=false -> shownSource unconditional", () => {
    const a = runBearDownside(bars, { conditioningWorks: false });
    expect(a.shownSource).toBe("unconditional");
    expect(a.shown).toEqual(a.unconditional);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/bear-downside.test.ts -t runBearDownside`
Expected: FAIL — `runBearDownside` chưa export.

- [ ] **Step 3: Append `runBearDownside` vào `src/lib/bear-downside.ts`**

```ts
import { BEAR_DOWNSIDE_CONFIG, type BearDownsideAnalysis, type BearBucketStat, type BearDownsideConfig } from "./types";

function rollingAth(prices: number[]): number[] {
  const out: number[] = [];
  let mx = -Infinity;
  for (const p of prices) { if (p > mx) mx = p; out.push(mx); }
  return out;
}

export function runBearDownside(
  bars: { date: string; close: number }[],
  cfg: BearDownsideConfig = BEAR_DOWNSIDE_CONFIG
): BearDownsideAnalysis {
  const closes = bars.map((b) => b.close);
  const dates = bars.map((b) => b.date);
  const ath = rollingAth(closes);
  const ddFrac = closes.map((c, i) => (ath[i] === 0 ? 0 : (ath[i] - c) / ath[i]));

  // gom mức-rơi-thêm theo bucket × horizon + vô-điều-kiện, trên lưới thưa
  const byBucket: number[][][] = BUCKETS.map(() => HORIZONS.map(() => []));
  const uncond: number[][] = HORIZONS.map(() => []);
  for (let i = 0; i < closes.length; i += STEP) {
    const b = bucketOf(ddFrac[i]);
    HORIZONS.forEach((H, h) => {
      const fd = furtherDrawdownPct(closes, i, H);
      if (fd === null) return;
      byBucket[b][h].push(fd);
      uncond[h].push(fd);
    });
  }

  const buckets: BearBucketStat[] = BUCKETS.map((bk, b) => ({
    bucketIdx: b,
    ddLowPct: Math.round(bk.lo * 100),
    ddHighPct: bk.hi === null ? null : Math.round(bk.hi * 100),
    horizons: HORIZONS.map((H, h) => computeHorizonStat(byBucket[b][h], H)),
  }));
  const unconditional = HORIZONS.map((H, h) => computeHorizonStat(uncond[h], H));

  const last = closes.length - 1;
  const currentBucketIdx = bucketOf(ddFrac[last]);
  const useBucket = cfg.conditioningWorks && buckets[currentBucketIdx].horizons[0].n >= MIN_N;
  const shownSource: "bucket" | "unconditional" = useBucket ? "bucket" : "unconditional";
  const shown = useBucket ? buckets[currentBucketIdx].horizons : unconditional;

  const note = useBucket
    ? `Đang ở vùng ${buckets[currentBucketIdx].ddLowPct}–${buckets[currentBucketIdx].ddHighPct ?? "∞"}% dưới đỉnh. Phân phối đáy tệ nhất về sau theo các lần tương tự trong lịch sử.`
    : "Độ sâu drawdown không tiên lượng được mức rơi thêm — đây là phân phối lịch sử chung mọi thời điểm.";

  return {
    generatedAt: new Date().toISOString(),
    dataDate: dates[last] ?? "",
    currentDdPct: Math.round(ddFrac[last] * 1000) / 10,
    currentBucketIdx,
    conditioningWorks: cfg.conditioningWorks,
    shownSource,
    shown,
    buckets,
    unconditional,
    note,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/bear-downside.test.ts` rồi full `npx vitest run`.
Expected: tất cả PASS (đã đụng shared `types.ts` ở Task 2 — full suite xác nhận không regression).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bear-downside.ts src/lib/bear-downside.test.ts
git commit -m "feat(bear-downside): engine runBearDownside (gom bucket×horizon + chọn hiển thị) (Module C task 3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Study kiểm 3 điều kiện (chạy + ghi kết quả)

**Files:**
- Create: `scripts/bear-downside-study.ts`

**Interfaces:**
- Consumes: `fetchXau` từ `./fetch`; `bucketOf`, `furtherDrawdownPct`, `computeHorizonStat`, `BUCKETS`, `HORIZONS`, `STEP` từ `../src/lib/bear-downside`.

- [ ] **Step 1: Write `scripts/bear-downside-study.ts`**

```ts
/**
 * Kiểm chứng "điều kiện hóa theo drawdown có thêm thông tin?" cho Module C.
 * Chạy: npx tsx scripts/bear-downside-study.ts (fetch XAU như các study khác).
 * 3 điều kiện (đặt conditioningWorks=true khi đạt CẢ 3):
 *  (1) đơn điệu: bucket sâu hơn -> P(đáy phía sau) cao hơn (xét horizon 63);
 *  (2) khác biệt: CI(P-đáy-phía-sau) bucket sâu nhất đủ mẫu KHÔNG trùm CI vô-điều-kiện;
 *  (3) ổn định: (1)+(2) giữ ở CẢ train(<2019) lẫn test(>=2019).
 */
import { fetchXau } from "./fetch";
import { bucketOf, furtherDrawdownPct, computeHorizonStat, BUCKETS, HORIZONS, STEP } from "../src/lib/bear-downside";

const SPLIT = "2019-01-01";
const FOCUS_H = 63; // horizon trọng tâm để xét đơn điệu/tách bạch

function rollingAth(p: number[]): number[] { const o: number[] = []; let m = -Infinity; for (const x of p) { if (x > m) m = x; o.push(m); } return o; }

function analyze(closes: number[], ddFrac: number[], idxs: number[]) {
  // gom mức-rơi-thêm horizon FOCUS_H theo bucket + vô-điều-kiện trên các index cho trước
  const byB: number[][] = BUCKETS.map(() => []);
  const unc: number[] = [];
  for (const i of idxs) {
    const fd = furtherDrawdownPct(closes, i, FOCUS_H);
    if (fd === null) continue;
    byB[bucketOf(ddFrac[i])].push(fd);
    unc.push(fd);
  }
  const bucketStats = byB.map((vals) => computeHorizonStat(vals, FOCUS_H));
  const uncStat = computeHorizonStat(unc, FOCUS_H);
  return { bucketStats, uncStat };
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const ath = rollingAth(closes);
  const ddFrac = closes.map((c, i) => (ath[i] === 0 ? 0 : (ath[i] - c) / ath[i]));

  const grid: number[] = [];
  for (let i = 0; i < closes.length; i += STEP) grid.push(i);
  const tr = grid.filter((i) => dates[i] < SPLIT);
  const te = grid.filter((i) => dates[i] >= SPLIT);

  for (const [name, idxs] of [["TRAIN <2019", tr], ["TEST >=2019", te]] as const) {
    const { bucketStats, uncStat } = analyze(closes, ddFrac, idxs);
    console.log(`\n=== ${name} (horizon ${FOCUS_H} phiên) ===`);
    console.log(`Vô-điều-kiện: P(đáy phía sau) ${uncStat.pBottomBehind}% (CI ${uncStat.pCi?.join("–") ?? "n/a"}), trung vị ${uncStat.median}%, n=${uncStat.n}`);
    bucketStats.forEach((s, b) => {
      const hi = BUCKETS[b].hi === null ? "∞" : Math.round(BUCKETS[b].hi! * 100);
      console.log(`  bucket ${Math.round(BUCKETS[b].lo * 100)}–${hi}%: P ${s.pBottomBehind}% (CI ${s.pCi?.join("–") ?? "n/a"}), trung vị ${s.median}%, n=${s.n}`);
    });
    // (1) đơn điệu giữa các bucket đủ mẫu
    const ok = bucketStats.filter((s) => s.n >= 30);
    const mono = ok.every((s, k) => k === 0 || s.pBottomBehind >= ok[k - 1].pBottomBehind);
    console.log(`  → đơn điệu P theo độ sâu (bucket đủ mẫu): ${mono ? "CÓ" : "KHÔNG"}`);
    // (2) tách bạch: bucket sâu nhất đủ mẫu vs vô-điều-kiện
    const deepest = ok[ok.length - 1];
    const sep = deepest && deepest.pCi && uncStat.pCi ? deepest.pCi[0] > uncStat.pCi[1] : false;
    console.log(`  → CI bucket sâu nhất TÁCH khỏi vô-điều-kiện: ${sep ? "CÓ" : "KHÔNG"}`);
  }
  console.log(`\nKẾT LUẬN: đặt BEAR_DOWNSIDE_CONFIG.conditioningWorks = true CHỈ KHI cả TRAIN lẫn TEST đều "đơn điệu CÓ" và "tách bạch CÓ". Ngược lại = false (chỉ hiện phân phối tổng).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 2: Chạy study**

Run: `npx tsx scripts/bear-downside-study.ts`
Expected: in P(đáy phía sau) + CI + trung vị từng bucket cho train & test, và 2 dòng kết luận đơn điệu/tách bạch mỗi giai đoạn. **Ghi lại output verbatim** cho Task 5. Nếu fetch lỗi mạng, thử lại 1 lần; vẫn lỗi thì báo lại — không bịa số.

- [ ] **Step 3: Commit**

```bash
git add scripts/bear-downside-study.ts
git commit -m "feat(bear-downside): study kiểm 3 điều kiện điều kiện-hóa train/test (Module C task 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Doc + chốt `conditioningWorks`

**Files:**
- Create: `docs/bear-downside.md`
- Modify: `src/lib/types.ts` (`BEAR_DOWNSIDE_CONFIG.conditioningWorks` theo kết luận study)

- [ ] **Step 1: Đặt `conditioningWorks`**

Dựa output Task 4: nếu CẢ train lẫn test đều "đơn điệu CÓ" + "tách bạch CÓ" → `conditioningWorks: true`; ngược lại để `false` (mặc định). Sửa hằng trong `types.ts`:

```ts
export const BEAR_DOWNSIDE_CONFIG: BearDownsideConfig = { conditioningWorks: false }; // hoặc true theo study
```

- [ ] **Step 2: Viết `docs/bear-downside.md`**

Bắt buộc (mirror `docs/bottom.md`/`docs/dca-copilot.md`):
- Mục tiêu + metric (mức rơi thêm = min tương lai/giá hôm nay−1).
- Phương pháp: bucket dd, horizon, lưới thưa STEP=3, CI (block-bootstrap + percentile CI).
- **Bảng bằng chứng** từ output Task 4: P(đáy phía sau) + CI + trung vị mỗi bucket × (train/test) cho horizon 63; kết luận 3 điều kiện và giá trị `conditioningWorks`.
- Ghi rõ: validate XAU, không caveat VND. Nếu conditioningWorks=false → ghi "điều kiện hóa không thêm thông tin bền vững; ship phân phối vô-điều-kiện."

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: sạch.

- [ ] **Step 4: Commit**

```bash
git add docs/bear-downside.md src/lib/types.ts
git commit -m "docs(bear-downside): phương pháp + bằng chứng study + chốt conditioningWorks (Module C task 5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wiring cron — ghi `bear-downside.json`

**Files:**
- Modify: `scripts/run.ts`

**Interfaces:**
- Consumes: `runBearDownside` từ `../src/lib/bear-downside`; `BearDownsideAnalysis` từ `../src/lib/types`.

- [ ] **Step 1: Import (cạnh import `runBearDca`)**

```ts
import { runBearDownside } from "../src/lib/bear-downside";
import type { BearDownsideAnalysis } from "../src/lib/types";
```

- [ ] **Step 2: Tính + ghi**

Sau khối `const bearDca = runBearDca(...)` (khoảng dòng 311), thêm:

```ts
const bearDownside: BearDownsideAnalysis = runBearDownside(xauRes.bars);
```

Trong cụm `writeFileSync` (cạnh `bear-dca.json`), thêm:

```ts
writeFileSync(join(DATA_DIR, "bear-downside.json"), JSON.stringify(bearDownside, null, 1));
```

Nối vào `console.log` tổng kết: `` bearDdNow=${bearDownside.currentDdPct}% bucket=${bearDownside.currentBucketIdx} cond=${bearDownside.conditioningWorks} ``.

- [ ] **Step 3: Chạy cron sinh file**

Run: `npm run collect`
Expected: log có `bearDdNow=...`; file `public/data/bear-downside.json` hợp lệ (có `shown`, `buckets` 4 phần tử, `unconditional`).

- [ ] **Step 4: Commit**

```bash
git add scripts/run.ts public/data/bear-downside.json
git commit -m "feat(bear-downside): cron ghi bear-downside.json (Module C task 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: UI — card Bear Downside

**Files:**
- Create: `src/components/BearDownsideCard.tsx`
- Modify: `src/app/page.tsx` (import JSON + prop)
- Modify: `src/components/Dashboard.tsx` (prop + accordion)

**Interfaces:**
- Consumes: `BearDownsideAnalysis` từ `@/lib/types`.

- [ ] **Step 1: Write `src/components/BearDownsideCard.tsx`**

```tsx
import type { BearDownsideAnalysis, BearHorizonStat } from "@/lib/types";

const HLABEL: Record<number, string> = { 21: "1 tháng", 63: "3 tháng", 126: "6 tháng", 252: "12 tháng" };
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;

function Row({ s }: { s: BearHorizonStat }) {
  if (s.n < 30) return (
    <li className="muted"><b>{HLABEL[s.horizonDays] ?? s.horizonDays}</b>: chưa đủ dữ liệu (n={s.n})</li>
  );
  return (
    <li>
      <b>{HLABEL[s.horizonDays] ?? s.horizonDays}</b>: đáy tệ nhất về sau — trung vị {signed(s.median)},
      xấu nhất (10%) {signed(s.p10)}, {fmt1(s.pBottomBehind)}% lần đáy đã phía sau
      {s.pCi && <> (CI {fmt1(s.pCi[0])}–{fmt1(s.pCi[1])}%)</>}.
    </li>
  );
}

export default function BearDownsideCard({ bd }: { bd: BearDownsideAnalysis }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Nếu giá còn rơi (rủi ro bear)</h2>
        <span className="muted">−{fmt1(bd.currentDdPct)}% dưới đỉnh</span>
      </div>
      <p className="sig-expl">{bd.note}</p>
      <ul className="signals">
        {bd.shown.map((s) => <Row key={s.horizonDays} s={s} />)}
      </ul>
      <p className="muted small">
        Phân phối lịch sử trên XAU/USD ({bd.shownSource === "bucket" ? "các lần cùng độ sâu drawdown" : "mọi thời điểm"}),
        lưới thưa chống trùng lặp. Tham khảo rủi ro, không phải dự đoán.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Nạp JSON trong `src/app/page.tsx`**

Sau dòng `import bearDcaHealthJson ...`, thêm:
```ts
import bearDownsideJson from "../../public/data/bear-downside.json";
```
Thêm `BearDownsideAnalysis` vào khối `import type { ... } from "@/lib/types";`.
Trong `Home()`, sau `const bearDcaHealth = ...`, thêm:
```ts
const bearDownside = bearDownsideJson as unknown as BearDownsideAnalysis;
```
Thêm prop vào `<Dashboard ... bearDownside={bearDownside} />`.

- [ ] **Step 3: Prop + accordion trong `Dashboard.tsx`**

- Import: `import BearDownsideCard from "./BearDownsideCard";` và thêm `BearDownsideAnalysis` vào type import.
- Thêm `bearDownside: BearDownsideAnalysis` vào kiểu props + tham số hàm.
- Thêm accordion NGAY SAU accordion "Vùng tích lũy (DCA)" (Bear DCA):

```tsx
{/* ── ACCORDION: Nếu giá còn rơi (rủi ro bear) ── */}
<details className="acc">
  <summary className="acc-sum">
    <span className="acc-sum-text">
      <span className="acc-sum-title">Nếu giá còn rơi</span>
      <span className="acc-sum-meta">rủi ro bear · 1/3/6/12 tháng</span>
    </span>
    <span className="acc-chev">▸</span>
  </summary>
  <div className="acc-body flat">
    <BearDownsideCard bd={bearDownside} />
  </div>
</details>
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build tĩnh OK, không lỗi type/SSR.

- [ ] **Step 5: Commit**

```bash
git add src/components/BearDownsideCard.tsx src/components/Dashboard.tsx src/app/page.tsx
git commit -m "feat(bear-downside): card UI 'Nếu giá còn rơi' (Module C task 7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Hoàn tất Module C

- [ ] `npx vitest run` → tất cả PASS.
- [ ] `npm run build` → OK.
- [ ] `public/data/bear-downside.json` hợp lệ.
- [ ] Final whole-branch review.

**Lưu ý đặc thù NO-GO mềm:** nếu Task 4 cho `conditioningWorks=false`, đó KHÔNG phải thất bại — card vẫn ship phân phối vô-điều-kiện (hữu ích) kèm câu giải thích trung thực. Chỉ khác ở `shownSource`.
