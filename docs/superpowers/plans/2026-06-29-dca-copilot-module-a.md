# DCA Co-pilot — Module A (Vùng vào trong tháng) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây engine "DCA Co-pilot" Module A — mỗi ngày báo hôm nay có phải vùng giá đẹp để mua DCA tháng này, với luật được tuyển bằng backtest giá-vốn-dài-hạn vượt baseline + placebo ở cả train/test.

**Architecture:** Một bộ mô phỏng DCA thuần (`dca-sim.ts`) tính giá vốn = tổng tiền ÷ tổng chỉ; một bộ luật "vùng đẹp" thuần (`dca-zone.ts`) chấm past-only; một study script đua các luật chọn cấu hình thắng gate; một engine live (`dca-copilot.ts`) phát trạng thái 🟢/🟡/🔴; wiring vào cron (`run.ts`) ghi `dca-copilot.json`; một card UI mới. Tái dùng `rsi`/`blockBootstrapCi`/`seededRandom` có sẵn trong `indicators.ts`.

**Họ luật ứng viên (3, không dùng zscore):** R1 `relpos` (giá ≤ percentile p của W phiên), R3 `signal` (relpos ∧ RSI quá bán), R4 `monthdd` (giá ≤ x% dưới đỉnh-trong-tháng). Spec liệt kê cả R2 `zscore` nhưng plan BỎ vì trùng ý R1 mà kém vững hơn (giả định phân phối chuẩn). **Không dùng `macd` trong R3** — `macd()` là O(n²)/lần gọi, gọi per-day trong study sẽ thành O(n³); RSI quá bán đủ vai trò xác nhận trũng và rẻ.

**Tech Stack:** TypeScript, Next.js (static export), vitest, tsx. Không thêm dependency.

## Global Constraints

(Áp dụng cho MỌI task — copy verbatim từ spec `docs/superpowers/specs/2026-06-29-dca-copilot-design.md` và CLAUDE.md)

- **No prediction claims — decision support only.** Module A không dự đoán giá; chỉ chấm "hôm nay có ở vùng trũng theo luật đã validated không".
- **Thước đo duy nhất = giá vốn dài hạn:** `giá vốn = tổng tiền ÷ tổng chỉ`. Với ngân sách cố định/tháng, giá vốn = `nMonths / Σ(1/price_mua)`.
- **Gate bằng chứng:** train `< 2019` / test `≥ 2019`; luật phải cho giá vốn THẤP HƠN baseline **và** thắng **placebo** (mua ngày ngẫu nhiên) ở **CẢ HAI** giai đoạn. Xếp theo min-improvement.
- **Baselines:** B0 = mua ngày giao dịch đầu tháng; B1 = mua ngày giữa tháng; placebo = mua ngày ngẫu nhiên (seeded, tái lập được).
- **Validate trên XAU/USD** (chuỗi dài duy nhất). UI ghi caveat: giá vốn VND chưa kiểm chứng được (chỉ ~6 tháng dữ liệu VN).
- **Free-tier, tính tại collection-time, repo là database** — không rewrite `public/data/history/`. UI tiếng Việt, chuỗi giải thích là tiếng Việt.
- **Past-only:** mọi hàm chấm điểm ngày `i` chỉ dùng `closes[0..i]`. Không nhìn tương lai (trừ hàm dán nhãn backtest, vốn không gọi ở live).
- **Phạm vi Module A:** KHÔNG gỡ Bottom Hunter khỏi UI trong plan này (nó còn được B/C tái dùng + wiring chung guidance/fusion/timeline). Card mới thêm SONG SONG; việc gỡ hẳn Bottom Hunter là plan dọn dẹp riêng sau khi B+C xong.

---

## File Structure

| File | Trách nhiệm | Task |
|---|---|---|
| `src/lib/dca-sim.ts` | Mô phỏng DCA + tính giá vốn (thuần) | 1 |
| `src/lib/dca-sim.test.ts` | Test simulator | 1 |
| `src/lib/dca-zone.ts` | Luật "vùng đẹp" past-only (thuần) | 2 |
| `src/lib/dca-zone.test.ts` | Test luật vùng | 2 |
| `scripts/dca-timing-study.ts` | Đua luật R1/R3/R4, gate giá vốn vs baseline+placebo | 3 |
| `src/lib/dca-copilot.types.ts` *(hoặc thêm vào `types.ts`)* | Kiểu `ZoneRule`, `DcaCopilotConfig`, `DcaCopilotAnalysis`, hằng `DCA_CONFIG` | 2, 4 |
| `docs/dca-copilot.md` | Phương pháp + bảng bằng chứng study | 4 |
| `src/lib/dca-copilot.ts` | Engine live `runDcaCopilot` | 5 |
| `src/lib/dca-copilot.test.ts` | Test engine | 5 |
| `scripts/run.ts` | Ghi `public/data/dca-copilot.json` | 6 |
| `src/components/DcaCopilotCard.tsx` | Card UI 🟢/🟡/🔴 | 7 |
| `src/components/Dashboard.tsx`, `src/app/page.tsx` | Nạp JSON + thêm accordion | 7 |

Ghi chú: để gọn import, đặt các kiểu mới trong **`src/lib/types.ts`** (theo pattern dự án — `BOTTOM_CONFIG`, `BearDca*` đều ở đó). Plan dưới dùng `@/lib/types` cho kiểu.

---

## Task 1: DCA cost-basis simulator

**Files:**
- Create: `src/lib/dca-sim.ts`
- Test: `src/lib/dca-sim.test.ts`

**Interfaces:**
- Produces:
  - `interface DcaBar { date: string; close: number }`
  - `type BuyPicker = (monthIdxs: number[], closes: number[]) => number` — trả GLOBAL index ngày mua trong tháng.
  - `interface DcaResult { costBasis: number; nMonths: number; sumInvPrice: number }`
  - `function groupByMonth(dates: string[]): number[][]` — gom global index theo `YYYY-MM`, giữ thứ tự thời gian.
  - `function simulateDca(closes: number[], months: number[][], pick: BuyPicker): DcaResult`
  - `function improvementPct(rule: DcaResult, base: DcaResult): number` — `(base.costBasis - rule.costBasis) / base.costBasis * 100` (dương = rẻ hơn baseline).
  - Pickers: `pickFirst`, `pickMid`, `pickSeededRandom(seed: number): BuyPicker`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dca-sim.test.ts
import { describe, it, expect } from "vitest";
import {
  groupByMonth, simulateDca, improvementPct,
  pickFirst, pickMid, pickSeededRandom, type BuyPicker,
} from "./dca-sim";

const dates = (...ds: string[]) => ds;

describe("groupByMonth", () => {
  it("gom index theo YYYY-MM giữ thứ tự", () => {
    const d = ["2020-01-02", "2020-01-31", "2020-02-03", "2020-03-01"];
    expect(groupByMonth(d)).toEqual([[0, 1], [2], [3]]);
  });
});

describe("simulateDca cost basis", () => {
  it("giá vốn = nMonths / Σ(1/price), thấp hơn trung bình cộng", () => {
    // 3 tháng, mua giá 10 / 8 / 12 (mỗi tháng 1 bar)
    const closes = [10, 8, 12];
    const months = [[0], [1], [2]];
    const r = simulateDca(closes, months, (m) => m[0]);
    // Σ(1/p) = 0.1 + 0.125 + 0.0833333 = 0.3083333 ; 3/0.3083333 = 9.7297…
    expect(r.nMonths).toBe(3);
    expect(r.costBasis).toBeCloseTo(9.7297, 3);
    expect(r.costBasis).toBeLessThan((10 + 8 + 12) / 3); // < trung bình cộng 10
  });
});

describe("pickers", () => {
  const closes = [10, 9, 8, 7]; // 1 tháng 4 phiên
  const months = [[0, 1, 2, 3]];
  it("pickFirst mua phiên đầu", () => {
    expect(simulateDca(closes, months, pickFirst).costBasis).toBe(10);
  });
  it("pickMid mua phiên giữa", () => {
    // mid index của [0,1,2,3] = floor(4/2)=2 -> price 8
    expect(simulateDca(closes, months, pickMid).costBasis).toBe(8);
  });
  it("pickSeededRandom tái lập (cùng seed -> cùng kết quả)", () => {
    const p1 = pickSeededRandom(42);
    const p2 = pickSeededRandom(42);
    expect(simulateDca(closes, months, p1).costBasis)
      .toBe(simulateDca(closes, months, p2).costBasis);
  });
});

describe("improvementPct", () => {
  it("dương khi luật rẻ hơn baseline", () => {
    const base = { costBasis: 10, nMonths: 1, sumInvPrice: 0.1 };
    const rule = { costBasis: 8, nMonths: 1, sumInvPrice: 0.125 };
    expect(improvementPct(rule, base)).toBeCloseTo(20, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dca-sim.test.ts`
Expected: FAIL — "Cannot find module './dca-sim'".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dca-sim.ts
/** Mô phỏng DCA ngân sách cố định/tháng + tính giá vốn. Thuần, dùng chung study + engine. */
import { seededRandom } from "./indicators";

export interface DcaBar { date: string; close: number; }

/** Trả GLOBAL index ngày mua trong tháng (monthIdxs là các global index của tháng đó). */
export type BuyPicker = (monthIdxs: number[], closes: number[]) => number;

export interface DcaResult {
  /** giá vốn = nMonths / Σ(1/price_mua) (ngân sách cố định triệt tiêu) */
  costBasis: number;
  nMonths: number;
  sumInvPrice: number;
}

/** Gom global index theo YYYY-MM (7 ký tự đầu của date), giữ thứ tự thời gian. */
export function groupByMonth(dates: string[]): number[][] {
  const out: number[][] = [];
  let curKey = "";
  for (let i = 0; i < dates.length; i++) {
    const key = dates[i].slice(0, 7);
    if (key !== curKey) { out.push([]); curKey = key; }
    out[out.length - 1].push(i);
  }
  return out;
}

export function simulateDca(closes: number[], months: number[][], pick: BuyPicker): DcaResult {
  let sumInv = 0;
  for (const m of months) {
    if (m.length === 0) continue;
    const idx = pick(m, closes);
    sumInv += 1 / closes[idx];
  }
  const n = months.length;
  return { costBasis: n / sumInv, nMonths: n, sumInvPrice: sumInv };
}

export function improvementPct(rule: DcaResult, base: DcaResult): number {
  return ((base.costBasis - rule.costBasis) / base.costBasis) * 100;
}

export const pickFirst: BuyPicker = (m) => m[0];
export const pickMid: BuyPicker = (m) => m[Math.floor(m.length / 2)];

/** Placebo: mua ngày ngẫu nhiên mỗi tháng, seed cố định để tái lập. */
export function pickSeededRandom(seed: number): BuyPicker {
  const rand = seededRandom(seed);
  return (m) => m[Math.floor(rand() * m.length)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dca-sim.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dca-sim.ts src/lib/dca-sim.test.ts
git commit -m "feat(dca-copilot): bộ mô phỏng DCA + giá vốn (Module A task 1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Luật "vùng đẹp" past-only + kiểu chung

**Files:**
- Create: `src/lib/dca-zone.ts`
- Test: `src/lib/dca-zone.test.ts`
- Modify: `src/lib/types.ts` (thêm kiểu `ZoneRule` ở cuối, trước `export const` cuối cùng hợp lý — đặt cạnh khối Bottom)

**Interfaces:**
- Consumes: `rsi` từ `./indicators`.
- Produces (trong `types.ts`):
  ```ts
  export interface ZoneRule {
    kind: "relpos" | "signal" | "monthdd";
    window?: number; // W phiên trailing
    pct?: number;    // ngưỡng percentile 0..100 (relpos / signal)
    x?: number;      // % dưới đỉnh-trong-tháng (monthdd)
  }
  ```
- Produces (trong `dca-zone.ts`):
  - `function inZone(closes: number[], i: number, rule: ZoneRule, monthStartIdx: number): boolean`
  - `function pricePercentile(closes: number[], i: number, window: number): number` — percentile (0..100) của `closes[i]` trong cửa sổ `window` phiên kết thúc ở `i`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dca-zone.test.ts
import { describe, it, expect } from "vitest";
import { inZone, pricePercentile } from "./dca-zone";
import type { ZoneRule } from "@/lib/types";

// chuỗi giảm dần đều: phần tử cuối luôn là thấp nhất -> percentile 0
const desc = Array.from({ length: 60 }, (_, j) => 100 - j);

describe("pricePercentile", () => {
  it("giá thấp nhất cửa sổ -> percentile 0", () => {
    expect(pricePercentile(desc, desc.length - 1, 30)).toBeCloseTo(0, 6);
  });
  it("giá cao nhất cửa sổ -> percentile 100", () => {
    const asc = Array.from({ length: 60 }, (_, j) => j);
    expect(pricePercentile(asc, asc.length - 1, 30)).toBeCloseTo(100, 6);
  });
});

describe("inZone relpos", () => {
  const rule: ZoneRule = { kind: "relpos", window: 30, pct: 25 };
  it("bật khi giá ở đáy biên độ gần đây", () => {
    expect(inZone(desc, desc.length - 1, rule, desc.length - 5)).toBe(true);
  });
  it("tắt khi giá ở đỉnh biên độ gần đây", () => {
    const asc = Array.from({ length: 60 }, (_, j) => j);
    expect(inZone(asc, asc.length - 1, rule, asc.length - 5)).toBe(false);
  });
});

describe("inZone monthdd", () => {
  it("bật khi giá ≥ x% dưới đỉnh trong tháng", () => {
    // tháng bắt đầu idx 0: đỉnh 100, hiện tại 90 -> dưới 10%
    const closes = [100, 95, 90];
    const rule: ZoneRule = { kind: "monthdd", x: 8 };
    expect(inZone(closes, 2, rule, 0)).toBe(true);
    expect(inZone(closes, 1, rule, 0)).toBe(false); // mới dưới 5%
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dca-zone.test.ts`
Expected: FAIL — "Cannot find module './dca-zone'" (và type lỗi nếu chưa thêm `ZoneRule`).

- [ ] **Step 3a: Thêm kiểu `ZoneRule` vào `src/lib/types.ts`**

Thêm khối sau (đặt ngay TRƯỚC `export const BOTTOM_CONFIG` để gom cạnh nhóm tín hiệu đáy):

```ts
/** Luật "vùng giá đẹp" trong tháng cho DCA Co-pilot. Tuyển bằng scripts/dca-timing-study.ts. */
export interface ZoneRule {
  kind: "relpos" | "signal" | "monthdd";
  /** số phiên trailing để xét vị trí tương đối */
  window?: number;
  /** ngưỡng percentile 0..100 (relpos / signal): bật khi giá ≤ pct */
  pct?: number;
  /** % dưới đỉnh-trong-tháng (monthdd): bật khi giá ≤ đỉnh×(1−x/100) */
  x?: number;
}
```

- [ ] **Step 3b: Write `src/lib/dca-zone.ts`**

```ts
// src/lib/dca-zone.ts
/** Luật "vùng giá đẹp" past-only cho DCA Co-pilot. Chấm ngày i chỉ bằng closes[0..i]. */
import { rsi } from "./indicators";
import type { ZoneRule } from "@/lib/types";

/** Percentile (0..100) của closes[i] trong cửa sổ `window` phiên KẾT THÚC ở i. */
export function pricePercentile(closes: number[], i: number, window: number): number {
  const from = Math.max(0, i - window + 1);
  const w = closes.slice(from, i + 1);
  if (w.length < 2) return 50;
  const last = closes[i];
  let below = 0;
  for (const v of w) if (v < last) below++;
  return (below / (w.length - 1)) * 100;
}

export function inZone(closes: number[], i: number, rule: ZoneRule, monthStartIdx: number): boolean {
  const W = rule.window ?? 42;
  switch (rule.kind) {
    case "relpos":
      return pricePercentile(closes, i, W) <= (rule.pct ?? 25);
    case "signal": {
      // relpos ∧ RSI quá bán. KHÔNG dùng macd (O(n²)/lần → O(n³) trong study).
      if (pricePercentile(closes, i, W) > (rule.pct ?? 30)) return false;
      const r = rsi(closes.slice(0, i + 1), 14);
      return r !== null && r < 35;
    }
    case "monthdd": {
      let hi = -Infinity;
      for (let j = monthStartIdx; j <= i; j++) if (closes[j] > hi) hi = closes[j];
      return closes[i] <= hi * (1 - (rule.x ?? 3) / 100);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dca-zone.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dca-zone.ts src/lib/dca-zone.test.ts src/lib/types.ts
git commit -m "feat(dca-copilot): luật vùng giá đẹp past-only + kiểu ZoneRule (Module A task 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Study đua luật + gate (chạy + ghi kết quả)

**Files:**
- Create: `scripts/dca-timing-study.ts`
- Test: `src/lib/dca-zone.test.ts` (thêm 1 test cho helper `monthsBetterFraction` nếu đặt helper trong `dca-sim.ts`) — xem Step 1.

**Interfaces:**
- Consumes: `fetchXau` từ `./fetch`; `groupByMonth`, `simulateDca`, `improvementPct`, `pickFirst`, `pickMid`, `pickSeededRandom` từ `../src/lib/dca-sim`; `inZone` từ `../src/lib/dca-zone`; `blockBootstrapCi` từ `../src/lib/indicators`.
- Produces (thêm vào `src/lib/dca-sim.ts`):
  - `function buildRulePicker(rule: ZoneRule, monthStart: Map<number, number>): BuyPicker` — mua phiên ĐẦU trong tháng có `inZone` true; không có thì mua phiên cuối tháng (buộc mua).
  - `function monthsBetterFraction(closes, months, rulePick, basePick): { favArr: number[]; pct: number }` — mảng ±1 (1 nếu giá luật ≤ giá baseline tháng đó) để bơm vào `blockBootstrapCi`.

- [ ] **Step 1: Write the failing test (helper `monthsBetterFraction`)**

Thêm vào `src/lib/dca-sim.test.ts`:

```ts
import { monthsBetterFraction } from "./dca-sim";

describe("monthsBetterFraction", () => {
  it("đếm tháng luật mua ≤ baseline", () => {
    const closes = [10, 8, /*m2*/ 5, 6];
    const months = [[0, 1], [2, 3]];
    const rulePick = (m: number[]) => m[1]; // luôn mua phiên 2 của tháng
    const basePick = (m: number[]) => m[0]; // baseline mua phiên 1
    const { favArr, pct } = monthsBetterFraction(closes, months, rulePick, basePick);
    // tháng1: rule idx1=8 ≤ base idx0=10 -> +1 ; tháng2: rule idx3=6 ≤ base idx2=5? 6≤5 sai -> -1
    expect(favArr).toEqual([1, -1]);
    expect(pct).toBeCloseTo(50, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dca-sim.test.ts -t monthsBetterFraction`
Expected: FAIL — "monthsBetterFraction is not a function".

- [ ] **Step 3a: Thêm helpers vào `src/lib/dca-sim.ts`**

```ts
import { inZone } from "./dca-zone";
import type { ZoneRule } from "@/lib/types";

/** Picker theo luật: phiên ĐẦU trong tháng có inZone=true; không có -> phiên cuối (buộc mua). */
export function buildRulePicker(rule: ZoneRule, monthStart: Map<number, number>): BuyPicker {
  return (m, closes) => {
    const start = monthStart.get(m[0]) ?? m[0];
    for (const idx of m) if (inZone(closes, idx, rule, start)) return idx;
    return m[m.length - 1];
  };
}

/** Mảng ±1: 1 nếu giá mua theo luật ≤ giá baseline trong cùng tháng. + tỉ lệ % (0..100). */
export function monthsBetterFraction(
  closes: number[], months: number[][], rulePick: BuyPicker, basePick: BuyPicker
): { favArr: number[]; pct: number } {
  const favArr: number[] = [];
  for (const m of months) {
    if (m.length === 0) continue;
    favArr.push(closes[rulePick(m, closes)] <= closes[basePick(m, closes)] ? 1 : -1);
  }
  const pos = favArr.filter((x) => x > 0).length;
  return { favArr, pct: favArr.length ? (pos / favArr.length) * 100 : 0 };
}
```

Lưu ý: `monthStart` map dùng `m[0]` (global index đầu tháng) → chính `m[0]`; truyền `new Map(months.map((m) => [m[0], m[0]]))`.

- [ ] **Step 3b: Write `scripts/dca-timing-study.ts`**

```ts
/**
 * Tuyển luật "vùng giá đẹp" cho DCA Co-pilot Module A.
 * Chạy: npx tsx scripts/dca-timing-study.ts (cần `npm run collect` trước để có cache fetch).
 * Tiêu chí nhận: giá vốn THẤP HƠN baseline B0 (mua ngày 1) VÀ thắng placebo (mua ngày ngẫu
 * nhiên) ở CẢ HAI giai đoạn train(<2019)/test(≥2019); xếp theo min-improvement.
 */
import { fetchXau } from "./fetch";
import {
  groupByMonth, simulateDca, improvementPct,
  pickFirst, pickMid, pickSeededRandom, buildRulePicker, monthsBetterFraction,
} from "../src/lib/dca-sim";
import { blockBootstrapCi } from "../src/lib/indicators";
import type { ZoneRule } from "../src/lib/types";

const SPLIT = "2019-01-01";

function ruleGrid(): ZoneRule[] {
  const out: ZoneRule[] = [];
  for (const window of [21, 42, 63]) {
    for (const pct of [20, 25, 30, 35]) out.push({ kind: "relpos", window, pct });
    for (const pct of [25, 30, 35]) out.push({ kind: "signal", window, pct });
  }
  for (const x of [2, 3, 4, 5]) out.push({ kind: "monthdd", x });
  return out;
}

async function main() {
  const xau = await fetchXau();
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);
  const allMonths = groupByMonth(dates);
  const monthStart = new Map(allMonths.map((m) => [m[0], m[0]]));

  const split = (ms: number[][]) => ({
    tr: ms.filter((m) => dates[m[0]] < SPLIT),
    te: ms.filter((m) => dates[m[0]] >= SPLIT),
  });
  const { tr, te } = split(allMonths);

  const baseTr = simulateDca(closes, tr, pickFirst);
  const baseTe = simulateDca(closes, te, pickFirst);
  const plac = pickSeededRandom(20260629);
  const placTr = improvementPct(simulateDca(closes, tr, plac), baseTr);
  const placTe = improvementPct(simulateDca(closes, te, plac), baseTe);
  console.log(`Baseline B0 giá vốn: train ${baseTr.costBasis.toFixed(2)} / test ${baseTe.costBasis.toFixed(2)}`);
  console.log(`B1 (giữa tháng): train +${improvementPct(simulateDca(closes, tr, pickMid), baseTr).toFixed(2)}% / test +${improvementPct(simulateDca(closes, te, pickMid), baseTe).toFixed(2)}%`);
  console.log(`Placebo (ngẫu nhiên): train ${placTr.toFixed(2)}% / test ${placTe.toFixed(2)}%`);

  let best: any = null;
  for (const rule of ruleGrid()) {
    const pick = buildRulePicker(rule, monthStart);
    const impTr = improvementPct(simulateDca(closes, tr, pick), baseTr);
    const impTe = improvementPct(simulateDca(closes, te, pick), baseTe);
    // gate: vượt B0 (>0) và thắng placebo ở CẢ HAI giai đoạn
    const passes = impTr > 0 && impTe > 0 && impTr > placTr && impTe > placTe;
    const minImp = Math.min(impTr, impTe);
    if (passes && (!best || minImp > best.minImp)) {
      const { favArr, pct } = monthsBetterFraction(closes, te, pick, pickFirst);
      best = { rule, impTr, impTe, minImp, monthsBetterPct: pct, ci: blockBootstrapCi(favArr, 3) };
    }
  }

  if (best) {
    console.log(`\n✓ LUẬT THẮNG: ${JSON.stringify(best.rule)}`);
    console.log(`  giá vốn rẻ hơn B0: train +${best.impTr.toFixed(2)}% / test +${best.impTe.toFixed(2)}% (min ${best.minImp.toFixed(2)}%)`);
    console.log(`  % tháng mua ≤ B0 (test): ${best.monthsBetterPct.toFixed(1)}% (CI ${best.ci ? best.ci.join("–") : "n/a"})`);
  } else {
    console.log("\n✗ KHÔNG luật nào vượt B0 + placebo ở cả hai giai đoạn — canh thời điểm trong tháng không có edge bền vững. Báo NO-GO ở doc/UI.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 4: Run helper test + run study**

Run test: `npx vitest run src/lib/dca-sim.test.ts` → Expected: PASS (6 tests).
Run study: `npx tsx scripts/dca-timing-study.ts`
Expected: in ra baseline + placebo + luật thắng (hoặc NO-GO). **Ghi lại nguyên văn output** để dùng ở Task 4 và Task 5 (cấu hình `DCA_CONFIG`).

- [ ] **Step 5: Commit**

```bash
git add scripts/dca-timing-study.ts src/lib/dca-sim.ts src/lib/dca-sim.test.ts
git commit -m "feat(dca-copilot): study tuyển luật vùng giá đẹp, gate giá vốn vs baseline+placebo (Module A task 3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Doc phương pháp + hằng cấu hình thắng gate

**Files:**
- Create: `docs/dca-copilot.md`
- Modify: `src/lib/types.ts` (thêm `DcaCopilotConfig`, `DCA_CONFIG`, `DcaCopilotAnalysis`)

**Interfaces:**
- Produces (trong `types.ts`):
  ```ts
  export interface DcaCopilotConfig {
    rule: ZoneRule;
    improveTrainPct: number;  // giá vốn rẻ hơn B0, train
    improveTestPct: number;   // ... test
    monthsBetterPct: number;  // % tháng mua ≤ B0 (test)
    monthsBetterCi: [number, number] | null;
    provisional?: boolean;    // true nếu study chưa qua gate
  }
  export interface DcaCopilotAnalysis {
    generatedAt: string;
    dataDate: string;
    status: "good" | "wait" | "month-end";
    percentileNow: number;        // percentile giá hôm nay trong cửa sổ rule.window (0..100)
    calDaysLeftInMonth: number;   // số ngày DƯƠNG LỊCH còn lại tới hết tháng
    rule: ZoneRule;
    evidence: { improveTrainPct: number; improveTestPct: number; monthsBetterPct: number; monthsBetterCi: [number, number] | null };
    note: string;
  }
  ```

- [ ] **Step 1: Thêm kiểu + hằng `DCA_CONFIG` vào `types.ts`**

Điền số TỪ output Task 3. Nếu Task 3 báo NO-GO, đặt `provisional: true` và `rule` = ứng viên min-improvement tốt nhất (in thêm ở study nếu cần), engine sẽ ẩn con số (xem Task 5).

```ts
/**
 * Cấu hình DCA Co-pilot Module A. Tuyển bởi scripts/dca-timing-study.ts (2026-06-29).
 * <DÁN output study vào đây: luật thắng + improvement train/test + % tháng tốt + CI>
 */
export const DCA_CONFIG: DcaCopilotConfig = {
  rule: { kind: "relpos", window: 42, pct: 25 }, // TODO: thay bằng luật thắng thực tế từ study
  improveTrainPct: 0,   // TODO
  improveTestPct: 0,    // TODO
  monthsBetterPct: 0,   // TODO
  monthsBetterCi: null, // TODO
  provisional: true,    // TODO: bỏ nếu qua gate
};
```

> **Quan trọng:** đây là task DUY NHẤT được để số 0/`provisional:true` tạm thời — nhưng PHẢI thay bằng số thật từ output Task 3 trong cùng task này trước khi commit. Không commit khi còn `// TODO`.

- [ ] **Step 2: Viết `docs/dca-copilot.md`**

Nội dung bắt buộc (mirror `docs/bottom.md`/`docs/bear-dca.md`):
- Mục tiêu: canh vùng vào DCA trong tháng, thước đo giá vốn.
- Phương pháp: luật ứng viên R1 relpos / R3 signal(rsi) / R4 monthdd, gate giá vốn vs B0+placebo, train/test, % tháng tốt + block-bootstrap CI.
- **Bảng bằng chứng** điền từ output Task 3 (luật thắng, improvement train/test, baseline, placebo, % tháng ≤ B0 + CI). Nếu NO-GO: ghi thẳng "không có edge bền vững — chỉ mua vào dip đơn giản".
- Ghi rõ: validate trên XAU, caveat giá vốn VND chưa kiểm chứng.
- Dòng "Tested and REJECTED" nếu loại được luật nào.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: không lỗi type.

- [ ] **Step 4: Commit**

```bash
git add docs/dca-copilot.md src/lib/types.ts
git commit -m "docs(dca-copilot): phương pháp + bằng chứng study + hằng DCA_CONFIG (Module A task 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Engine live `runDcaCopilot`

**Files:**
- Create: `src/lib/dca-copilot.ts`
- Test: `src/lib/dca-copilot.test.ts`

**Interfaces:**
- Consumes: `DcaBar` từ `./dca-sim`; `inZone`, `pricePercentile` từ `./dca-zone`; `DCA_CONFIG`, `DcaCopilotAnalysis`, `DcaCopilotConfig` từ `@/lib/types`.
- Produces: `function runDcaCopilot(bars: DcaBar[], cfg?: DcaCopilotConfig): DcaCopilotAnalysis`.

Quy tắc trạng thái (past-only; "tháng" = `YYYY-MM` của bar cuối):
- Tính `monthStartIdx` = index đầu tiên cùng tháng với bar cuối.
- `inZoneToday = inZone(closes, last, rule, monthStartIdx)`.
- `calDaysLeftInMonth` = số ngày dương lịch từ `dataDate` tới ngày cuối tháng đó.
- `status`: `"good"` nếu `inZoneToday`; ngược lại `"month-end"` nếu `calDaysLeftInMonth <= 3`; còn lại `"wait"`.
- Nếu `cfg.provisional` → vẫn phát status nhưng `note` ghi "luật chưa qua kiểm chứng — tham khảo".

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dca-copilot.test.ts
import { describe, it, expect } from "vitest";
import { runDcaCopilot } from "./dca-copilot";
import type { DcaCopilotConfig } from "@/lib/types";

const cfg: DcaCopilotConfig = {
  rule: { kind: "relpos", window: 30, pct: 25 },
  improveTrainPct: 1, improveTestPct: 1, monthsBetterPct: 60, monthsBetterCi: [50, 70],
};

// 60 phiên giảm dần trong cùng 1 tháng giả lập -> bar cuối là đáy -> good
const bars = Array.from({ length: 60 }, (_, j) => ({
  date: `2020-01-${String((j % 28) + 1).padStart(2, "0")}`,
  close: 100 - j,
}));

describe("runDcaCopilot", () => {
  it("phát status good khi hôm nay ở đáy biên độ", () => {
    const a = runDcaCopilot(bars, cfg);
    expect(a.status).toBe("good");
    expect(a.percentileNow).toBeCloseTo(0, 1);
    expect(a.rule).toEqual(cfg.rule);
  });
  it("phát status wait khi hôm nay ở đỉnh biên độ và còn nhiều ngày", () => {
    const asc = Array.from({ length: 60 }, (_, j) => ({
      date: `2020-01-${String((j % 27) + 1).padStart(2, "0")}`, // ngày cuối = 01-06 -> còn nhiều ngày
      close: 50 + j,
    }));
    const a = runDcaCopilot(asc, cfg);
    expect(a.status).toBe("wait");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dca-copilot.test.ts`
Expected: FAIL — "Cannot find module './dca-copilot'".

- [ ] **Step 3: Write `src/lib/dca-copilot.ts`**

```ts
// src/lib/dca-copilot.ts
/** Engine live DCA Co-pilot Module A: phát trạng thái vùng vào DCA cho tháng hiện tại. */
import type { DcaBar } from "./dca-sim";
import { inZone, pricePercentile } from "./dca-zone";
import { DCA_CONFIG, type DcaCopilotAnalysis, type DcaCopilotConfig } from "@/lib/types";

function calDaysLeftInMonth(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // ngày cuối tháng m (1-based month vào Date(…, m, 0))
  return lastDay - d;
}

export function runDcaCopilot(bars: DcaBar[], cfg: DcaCopilotConfig = DCA_CONFIG): DcaCopilotAnalysis {
  const closes = bars.map((b) => b.close);
  const last = closes.length - 1;
  const dataDate = bars[last]?.date ?? "";
  const curKey = dataDate.slice(0, 7);
  let monthStartIdx = last;
  while (monthStartIdx > 0 && bars[monthStartIdx - 1].date.slice(0, 7) === curKey) monthStartIdx--;

  const W = cfg.rule.window ?? 42;
  const pctNow = pricePercentile(closes, last, W);
  const inZoneToday = inZone(closes, last, cfg.rule, monthStartIdx);
  const daysLeft = calDaysLeftInMonth(dataDate);

  const status: DcaCopilotAnalysis["status"] = inZoneToday
    ? "good"
    : daysLeft <= 3
      ? "month-end"
      : "wait";

  const note = cfg.provisional
    ? "Luật canh thời điểm chưa qua kiểm chứng 2 giai đoạn — chỉ tham khảo, ưu tiên mua vào nhịp trũng."
    : status === "good"
      ? "Hôm nay giá ở vùng trũng so với gần đây — có thể xuống tiền DCA tháng này."
      : status === "month-end"
        ? "Gần hết tháng mà chưa gặp vùng đẹp — cân nhắc mua kẻo lỡ nhịp DCA tháng này."
        : "Chưa tới vùng đẹp, còn thời gian trong tháng — có thể chờ nhịp trũng.";

  return {
    generatedAt: new Date().toISOString(),
    dataDate,
    status,
    percentileNow: Math.round(pctNow * 10) / 10,
    calDaysLeftInMonth: daysLeft,
    rule: cfg.rule,
    evidence: {
      improveTrainPct: cfg.improveTrainPct,
      improveTestPct: cfg.improveTestPct,
      monthsBetterPct: cfg.monthsBetterPct,
      monthsBetterCi: cfg.monthsBetterCi,
    },
    note,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dca-copilot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dca-copilot.ts src/lib/dca-copilot.test.ts
git commit -m "feat(dca-copilot): engine live phát trạng thái vùng vào DCA (Module A task 5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wiring vào cron — ghi `dca-copilot.json`

**Files:**
- Modify: `scripts/run.ts`

**Interfaces:**
- Consumes: `runDcaCopilot` từ `../src/lib/dca-copilot`; `DcaCopilotAnalysis` từ `../src/lib/types`.

- [ ] **Step 1: Thêm import (cạnh import `runBottom`)**

```ts
import { runDcaCopilot } from "../src/lib/dca-copilot";
import type { DcaCopilotAnalysis } from "../src/lib/types";
```

- [ ] **Step 2: Tính + ghi JSON**

Sau khối `const bottom: BottomAnalysis = runBottom(...)` (khoảng dòng 270), thêm:

```ts
const dcaCopilot: DcaCopilotAnalysis = runDcaCopilot(xauRes.bars);
```

Trong khối `writeFileSync` (cạnh `bottom.json`), thêm:

```ts
writeFileSync(join(DATA_DIR, "dca-copilot.json"), JSON.stringify(dcaCopilot, null, 1));
```

Trong `console.log` tổng kết cuối `main`, nối thêm: `` dcaStatus=${dcaCopilot.status} pct=${dcaCopilot.percentileNow} ``.

- [ ] **Step 3: Chạy cron thật để sinh file**

Run: `npm run collect`
Expected: log có `dcaStatus=...`; file `public/data/dca-copilot.json` xuất hiện, đọc được JSON hợp lệ với `status`/`percentileNow`/`rule`.

- [ ] **Step 4: Commit**

```bash
git add scripts/run.ts public/data/dca-copilot.json
git commit -m "feat(dca-copilot): cron ghi dca-copilot.json (Module A task 6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: UI — card DCA Co-pilot

**Files:**
- Create: `src/components/DcaCopilotCard.tsx`
- Modify: `src/app/page.tsx` (đọc `dca-copilot.json`, truyền xuống Dashboard)
- Modify: `src/components/Dashboard.tsx` (prop + accordion mới)

**Interfaces:**
- Consumes: `DcaCopilotAnalysis` từ `@/lib/types`.

- [ ] **Step 1: Write `src/components/DcaCopilotCard.tsx`**

```tsx
import type { DcaCopilotAnalysis } from "@/lib/types";

const STATUS: Record<DcaCopilotAnalysis["status"], { dot: string; cls: string; title: string }> = {
  good: { dot: "🟢", cls: "buy", title: "Vùng đẹp — có thể vào" },
  wait: { dot: "🟡", cls: "neutral", title: "Chờ nhịp trũng" },
  "month-end": { dot: "🔴", cls: "sell", title: "Gần hết tháng — cân nhắc mua" },
};

const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export default function DcaCopilotCard({ dca }: { dca: DcaCopilotAnalysis }) {
  const s = STATUS[dca.status];
  return (
    <section className="card">
      <div className="card-head">
        <h2>Canh vào DCA tháng này</h2>
        <span className={`chip ${s.cls}`}>{s.dot} {s.title}</span>
      </div>
      <p className="sig-expl">{dca.note}</p>
      <p className="muted small">
        Giá hôm nay ở <b>{fmt1(dca.percentileNow)}%</b> biên độ {dca.rule.window ?? 42} phiên gần nhất
        {dca.calDaysLeftInMonth >= 0 && <> · còn {dca.calDaysLeftInMonth} ngày tới hết tháng</>}.
      </p>
      {dca.evidence.improveTestPct > 0 ? (
        <p className="muted small">
          Kiểm chứng (XAU): mua theo luật cho giá vốn rẻ hơn mua-ngày-1{" "}
          <b>+{fmt1(dca.evidence.improveTrainPct)}%</b> (2009–2018) /{" "}
          <b>+{fmt1(dca.evidence.improveTestPct)}%</b> (2019–2026); {fmt1(dca.evidence.monthsBetterPct)}% số tháng mua ≤ ngày-1
          {dca.evidence.monthsBetterCi && <> (CI {dca.evidence.monthsBetterCi[0]}–{dca.evidence.monthsBetterCi[1]}%)</>}.
          Giá vốn VND chưa đủ dữ liệu kiểm chứng.
        </p>
      ) : (
        <p className="muted small">
          Canh thời điểm trong tháng chưa cho lợi thế bền vững trên dữ liệu — chỉ nên mua vào nhịp trũng, đừng mua đỉnh tháng.
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Đọc JSON trong `src/app/page.tsx`**

Page dùng static import JSON. `dca-copilot.json` đã tồn tại sau Task 6 (`npm run collect`). Thêm 3 chỗ:

Sau dòng `import bearDcaHealthJson ...` (dòng 11), thêm:
```ts
import dcaCopilotJson from "../../public/data/dca-copilot.json";
```
Thêm `DcaCopilotAnalysis` vào khối `import type { ... } from "@/lib/types";` (dòng 12).

Trong thân `Home()`, sau dòng `const bearDcaHealth = ...` (dòng 24), thêm:
```ts
const dcaCopilot = dcaCopilotJson as unknown as DcaCopilotAnalysis;
```

Sửa lời gọi `<Dashboard ... />` (dòng 26): thêm prop `dca={dcaCopilot}`.

- [ ] **Step 3: Thêm prop + accordion trong `Dashboard.tsx`**

- Thêm import: `import DcaCopilotCard from "./DcaCopilotCard";` và `DcaCopilotAnalysis` vào khối type import.
- Thêm `dca` vào props + kiểu (cạnh `bottom`).
- Thêm accordion MỚI (đặt ngay TRƯỚC accordion "Săn đáy", vì đây là câu hỏi chính của người dùng):

```tsx
{/* ── ACCORDION: Canh vào DCA tháng này ── */}
<details className="acc" open>
  <summary className="acc-sum">
    <span className="acc-sum-text">
      <span className="acc-sum-title">Canh vào DCA tháng này</span>
      <span className="acc-sum-meta">vùng giá đẹp · {dca.status === "good" ? "có thể vào" : dca.status === "month-end" ? "gần hết tháng" : "chờ nhịp"}</span>
    </span>
    <span className="acc-chev">▸</span>
  </summary>
  <div className="acc-body flat">
    <DcaCopilotCard dca={dca} />
  </div>
</details>
```

- [ ] **Step 4: Build kiểm tra**

Run: `npm run build`
Expected: build tĩnh thành công, không lỗi type/SSR.

- [ ] **Step 5: Commit**

```bash
git add src/components/DcaCopilotCard.tsx src/components/Dashboard.tsx src/app/page.tsx
git commit -m "feat(dca-copilot): card UI canh vào DCA tháng này (Module A task 7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Hoàn tất Module A

Sau Task 7: chạy toàn bộ test + lint.

- [ ] `npx vitest run` → tất cả PASS.
- [ ] `npm run build` → OK.
- [ ] Kiểm tra `public/data/dca-copilot.json` hợp lệ.

**Còn lại (plan riêng, KHÔNG trong Module A):**
- Module C — phân phối rủi ro bear có điều kiện (`scripts/bear-downside-study.ts` + card).
- Module B — skip theo chế độ Bear DCA (`scripts/dca-skip-study.ts`), có thể provisional.
- Dọn dẹp — gỡ Bottom Hunter khỏi UI (guidance/fusion/timeline/TimeMachine/hero/BottomGauges) sau khi B+C xong.
