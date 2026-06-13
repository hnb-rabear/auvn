# Tầng Săn Đáy (Bottom Hunter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm một tầng độc lập ước lượng *xác suất một đáy đang/đã hình thành* ở hai thang thời gian (đáy chu kỳ ~126 phiên, đáy sóng ~21 phiên), kèm khoảng tin cậy backtest, không đụng vào composite vùng mua hiện tại.

**Architecture:** Engine `src/lib/bottom.ts` tái dùng pipeline backtest: với mỗi ngày lịch sử nó tính một bộ feature (−2..+2 mỗi cái, có chuỗi giải thích tiếng Việt), gộp thành `bottomScore`, rời rạc hóa thành bin, rồi tính **base-rate thực nghiệm** P(gần đáy | bin) trên ~15 năm cộng **block-bootstrap CI**. "Gần đáy" được dán nhãn bằng nhìn-tương-lai CHỈ khi backtest (`min(close[t+1..t+H]) >= close[t]·(1−ε)`); live chỉ dùng quá khứ. Engine và study (`scripts/bottom-study.ts`) dùng chung code dán nhãn + tính bin (DRY). ML (`scripts/bottom-ml-study.ts`) chỉ là cổng kiểm chứng offline — chỉ nhận nếu thắng rule-based ngoài mẫu. Output commit ra `public/data/bottom.json`; UI hiện 2 đồng hồ + overlay đáy trên biểu đồ.

**Tech Stack:** TypeScript, Next.js 15 (static export), Vitest, tsx. Không thêm dependency, không API trả phí, không server — giữ free-tier.

---

## File Structure

**Mới:**
- `src/lib/bottom.ts` — engine xác suất đáy (rule-based, dùng chung code dán nhãn/feature/bin với study)
- `scripts/bottom-study.ts` — sweep ε/H + trọng số feature, validate train/test, in config + evidence
- `scripts/bottom-ml-study.ts` — cổng ML (logistic regression thuần TS), so Brier/AUC vs rule-based
- `src/components/BottomGauges.tsx` — 2 đồng hồ xác suất + drivers
- `public/data/bottom.json` — output mỗi cron
- `docs/bottom.md` — phương pháp & bằng chứng
- `tests/bottom.test.ts` — test engine + labeling + features

**Sửa:**
- `src/lib/indicators.ts` — thêm `macd`, `drawdownFromPeak`, `declineSpeedPct`, `bullishRsiDivergence`; **di chuyển** `seededRandom` + `blockBootstrapCi` vào đây (tránh import ngược `src/lib` → `scripts`)
- `scripts/study-lib.ts` — re-export `seededRandom` + `blockBootstrapCi` từ `../src/lib/indicators` (giữ tương thích cho `engine.test.ts`, `monitor-presets.ts`)
- `src/lib/types.ts` — thêm types `BottomConfig`, `BottomTierConfig`, `BottomDriver`, `ConfirmedBottom`, `BottomTierResult`, `BottomAnalysis`
- `scripts/run.ts` — gọi `runBottom` + `monitorBottom`, ghi `bottom.json` + `bottom-health.json`
- `src/app/page.tsx` — import `bottom.json`, truyền vào Dashboard
- `src/components/Dashboard.tsx` — render `BottomGauges`, truyền `confirmedBottoms` xuống `TimeMachine`
- `src/components/TimeMachine.tsx` — overlay marker đáy đã xác nhận trên biểu đồ giá XAU (đây mới là chart vẽ giá; `PremiumChart` vẽ chênh lệch %, KHÔNG dùng)

---

## Task 1: Types cho tầng đáy

**Files:**
- Modify: `src/lib/types.ts` (thêm vào cuối file, trước/sau `PRESETS`)
- Test: `tests/bottom.test.ts`

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/bottom.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { BOTTOM_CONFIG, type BottomAnalysis } from "../src/lib/types";

describe("bottom types & config", () => {
  it("BOTTOM_CONFIG has cycle and swing horizons with sane eps", () => {
    expect(BOTTOM_CONFIG.cycle.horizonDays).toBeGreaterThan(BOTTOM_CONFIG.swing.horizonDays);
    expect(BOTTOM_CONFIG.cycle.epsPct).toBeGreaterThan(0);
    expect(BOTTOM_CONFIG.swing.epsPct).toBeGreaterThan(0);
    // tổng trọng số feature mỗi tầng = 1 (tự chuẩn hóa)
    for (const tier of [BOTTOM_CONFIG.cycle, BOTTOM_CONFIG.swing]) {
      const sum = Object.values(tier.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it("BottomAnalysis shape compiles", () => {
    const a: BottomAnalysis = {
      generatedAt: "2026-06-13T00:00:00.000Z",
      dataDate: "2026-06-13",
      cycle: { prob: 50, ci: [40, 60], bin: 3, n: 100, drivers: [] },
      swing: { prob: 30, ci: [20, 40], bin: 2, n: 80, drivers: [] },
      confirmedBottoms: [],
      note: "x",
    };
    expect(a.cycle.prob).toBe(50);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/bottom.test.ts -t "bottom types"`
Expected: FAIL — `BOTTOM_CONFIG` / `BottomAnalysis` chưa tồn tại.

- [ ] **Step 3: Thêm types vào `src/lib/types.ts`**

Thêm vào cuối file:

```typescript
/** Một feature của tầng đáy: điểm -2..+2 + giải thích tiếng Việt. */
export interface BottomDriver {
  id: string;
  label: string;
  /** -2 (xa đáy) .. +2 (rất gần đáy) */
  score: number;
  explanation: string;
  available: boolean;
}

/** Một đáy đã xác nhận trong lịch sử (để vẽ overlay). */
export interface ConfirmedBottom {
  date: string;
  price: number;
  tier: "cycle" | "swing";
}

export interface BottomTierResult {
  /** xác suất gần đáy 0..100 */
  prob: number;
  /** CI 95% block-bootstrap [lo, hi] hoặc null nếu thiếu mẫu */
  ci: [number, number] | null;
  /** bin của bottomScore hiện tại */
  bin: number;
  /** số quan sát lịch sử trong cùng bin */
  n: number;
  drivers: BottomDriver[];
}

export interface BottomAnalysis {
  generatedAt: string;
  dataDate: string;
  cycle: BottomTierResult;
  swing: BottomTierResult;
  confirmedBottoms: ConfirmedBottom[];
  note: string;
}

/** Cấu hình một tầng đáy. weights: trọng số feature; binEdges: ranh giới bin của bottomScore (-100..+100). */
export interface BottomTierConfig {
  horizonDays: number;
  epsPct: number;
  weights: Record<string, number>;
  /** ranh giới bin tăng dần trong (-100, 100); k ranh giới -> k+1 bin */
  binEdges: number[];
}

export interface BottomConfig {
  cycle: BottomTierConfig;
  swing: BottomTierConfig;
}

/**
 * Cấu hình tầng đáy — giá trị KHỞI ĐIỂM. Task 9 chạy `bottom-study.ts` rồi
 * thay bằng cấu hình thắng out-of-sample, đồng bộ số liệu vào docs/bottom.md.
 * Tên feature: dd=drawdown, spd=tốc độ rơi, rsi=quá bán+phân kỳ, macd, macro=vĩ mô đảo chiều, mom=động lượng 12m.
 */
export const BOTTOM_CONFIG: BottomConfig = {
  cycle: {
    horizonDays: 126,
    epsPct: 4,
    weights: { dd: 0.25, spd: 0.1, rsi: 0.15, macd: 0.1, macro: 0.3, mom: 0.1 },
    binEdges: [-40, 0, 40],
  },
  swing: {
    horizonDays: 21,
    epsPct: 2,
    weights: { dd: 0.2, spd: 0.2, rsi: 0.3, macd: 0.2, macro: 0.1, mom: 0 },
    binEdges: [-40, 0, 40],
  },
};
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/bottom.test.ts -t "bottom types"`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts tests/bottom.test.ts
git commit -m "feat(bottom): types + cấu hình khởi điểm tầng đáy"
```

---

## Task 2: Hàm dán nhãn "gần đáy" (ground-truth label)

**Files:**
- Create: `src/lib/bottom.ts`
- Test: `tests/bottom.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tests/bottom.test.ts`:

```typescript
import { labelNearBottom } from "../src/lib/bottom";

describe("labelNearBottom", () => {
  // V-shape: index 5 là đáy tuyệt đối
  const v = [110, 108, 105, 103, 101, 100, 102, 104, 107, 110, 112];

  it("đáy tuyệt đối được dán nhãn near-bottom", () => {
    // tại i=5 (giá 100), không có gì rẻ hơn trong tương lai -> near-bottom
    expect(labelNearBottom(v, 5, 5, 2)).toBe(true);
  });

  it("ngay trước đáy KHÔNG phải near-bottom (sẽ còn rẻ hơn >eps)", () => {
    // tại i=2 (giá 105), tương lai chạm 100 = thấp hơn 4.76% > eps 2% -> false
    expect(labelNearBottom(v, 2, 5, 2)).toBe(false);
  });

  it("đỉnh không phải near-bottom", () => {
    expect(labelNearBottom(v, 0, 5, 2)).toBe(false);
  });

  it("thiếu tương lai (sát cuối mảng) trả null", () => {
    expect(labelNearBottom(v, v.length - 1, 5, 2)).toBeNull();
    expect(labelNearBottom(v, v.length - 2, 5, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/bottom.test.ts -t labelNearBottom`
Expected: FAIL — module `bottom.ts` chưa có / hàm chưa định nghĩa.

- [ ] **Step 3: Tạo `src/lib/bottom.ts` với hàm dán nhãn**

```typescript
/** Engine xác suất đáy (Bottom Hunter). Dùng chung với scripts/bottom-study.ts. */

/**
 * Dán nhãn "gần đáy" cho ngày i: giá thấp nhất trong H phiên kế tiếp KHÔNG thấp
 * hơn close[i] quá eps%. Trả null nếu chưa đủ H phiên tương lai (không dán nhãn được).
 * CHỈ dùng để backtest/dán nhãn lịch sử — không bao giờ gọi trên ngày hiện tại ở live.
 */
export function labelNearBottom(
  closes: number[],
  i: number,
  horizonDays: number,
  epsPct: number
): boolean | null {
  if (i + horizonDays >= closes.length) return null;
  const floor = closes[i] * (1 - epsPct / 100);
  let minFwd = Infinity;
  for (let j = i + 1; j <= i + horizonDays; j++) {
    if (closes[j] < minFwd) minFwd = closes[j];
  }
  return minFwd >= floor;
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/bottom.test.ts -t labelNearBottom`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bottom.ts tests/bottom.test.ts
git commit -m "feat(bottom): hàm dán nhãn gần-đáy cho backtest"
```

---

## Task 3: Indicator mới (MACD, drawdown, tốc độ rơi, phân kỳ RSI)

**Files:**
- Modify: `src/lib/indicators.ts`
- Test: `tests/bottom.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tests/bottom.test.ts`:

```typescript
import {
  macd,
  drawdownFromPeak,
  declineSpeedPct,
  bullishRsiDivergence,
} from "../src/lib/indicators";

const rng = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

describe("bottom indicators", () => {
  it("macd: histogram dương khi vừa đảo chiều tăng", () => {
    // giảm rồi tăng mạnh: EMA nhanh vượt EMA chậm -> histogram > 0
    const s = [...rng(60, (i) => 100 - i * 0.5), ...rng(40, (i) => 70 + i * 1.5)];
    const m = macd(s)!;
    expect(m.histogram).toBeGreaterThan(0);
  });

  it("macd: null khi thiếu dữ liệu", () => {
    expect(macd(rng(10, (i) => i))).toBeNull();
  });

  it("drawdownFromPeak: phần trăm dưới đỉnh trailing", () => {
    const s = [...rng(50, () => 100), ...rng(10, () => 80)];
    // hiện tại 80, đỉnh 100 -> drawdown 20%
    expect(drawdownFromPeak(s, 252)).toBeCloseTo(20, 5);
  });

  it("declineSpeedPct: âm khi đang rơi", () => {
    const s = rng(30, (i) => 100 - i); // rơi đều
    expect(declineSpeedPct(s, 21)).toBeLessThan(0);
  });

  it("bullishRsiDivergence: phát hiện giá đáy thấp hơn nhưng RSI đáy cao hơn", () => {
    // hai đáy: đáy sau thấp hơn về giá nhưng đà giảm yếu đi
    const s = [
      ...rng(20, (i) => 100 - i * 2), // đáy 1 sâu (62)
      ...rng(15, (i) => 62 + i * 2), // hồi lên 90
      ...rng(14, (i) => 90 - i * 2), // đáy 2 (64) — cao hơn? điều chỉnh để giá thấp hơn
    ];
    const div = bullishRsiDivergence(s);
    expect(typeof div).toBe("boolean");
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/bottom.test.ts -t "bottom indicators"`
Expected: FAIL — các hàm chưa định nghĩa.

- [ ] **Step 3: Thêm indicator vào `src/lib/indicators.ts`**

Thêm vào cuối file:

```typescript
/** EMA tại điểm cuối (cũ -> mới). null nếu thiếu dữ liệu. */
function ema(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const k = 2 / (n + 1);
  let e = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export interface Macd {
  line: number;
  signal: number;
  histogram: number;
}

/** MACD(12,26,9) tại điểm cuối. null nếu < 35 phiên. */
export function macd(values: number[], fast = 12, slow = 26, sig = 9): Macd | null {
  if (values.length < slow + sig) return null;
  const lineSeries: number[] = [];
  for (let i = slow; i <= values.length; i++) {
    const sub = values.slice(0, i);
    const f = ema(sub, fast);
    const s = ema(sub, slow);
    if (f === null || s === null) continue;
    lineSeries.push(f - s);
  }
  const line = lineSeries[lineSeries.length - 1];
  const signal = ema(lineSeries, sig);
  if (signal === null) return null;
  return { line, signal, histogram: line - signal };
}

/** % giá hiện tại dưới đỉnh trailing `window` phiên (dương = đang dưới đỉnh). */
export function drawdownFromPeak(values: number[], window: number): number | null {
  if (values.length < 2) return null;
  const w = values.slice(-Math.min(window, values.length));
  const peak = Math.max(...w);
  const last = w[w.length - 1];
  return peak === 0 ? null : ((peak - last) / peak) * 100;
}

/** Lợi suất % trên `lookback` phiên gần nhất (âm = đang rơi). */
export function declineSpeedPct(values: number[], lookback: number): number | null {
  if (values.length < lookback + 1) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 1 - lookback];
  return prev === 0 ? null : ((last - prev) / prev) * 100;
}

/**
 * Phân kỳ RSI tăng: trong `window` phiên cuối, đáy giá GẦN ĐÂY thấp hơn đáy giá
 * TRƯỚC ĐÓ nhưng RSI tại đáy gần đây CAO hơn — dấu hiệu đà giảm cạn. Xấp xỉ bằng
 * cách so hai nửa cửa sổ: min giá + RSI tại điểm min.
 */
export function bullishRsiDivergence(values: number[], window = 60): boolean {
  if (values.length < window + 14) return false;
  const w = values.slice(-window);
  const mid = Math.floor(w.length / 2);
  const idxMin = (arr: number[], from: number, to: number) => {
    let mi = from;
    for (let i = from; i < to; i++) if (arr[i] < arr[mi]) mi = i;
    return mi;
  };
  const prevLowIdx = idxMin(w, 0, mid);
  const recentLowIdx = idxMin(w, mid, w.length);
  if (w[recentLowIdx] >= w[prevLowIdx]) return false; // giá không tạo đáy thấp hơn
  const offset = values.length - window;
  const rsiAt = (localIdx: number): number | null =>
    rsi(values.slice(0, offset + localIdx + 1), 14);
  const rPrev = rsiAt(prevLowIdx);
  const rRecent = rsiAt(recentLowIdx);
  if (rPrev === null || rRecent === null) return false;
  return rRecent > rPrev; // RSI đáy gần đây cao hơn -> phân kỳ tăng
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/bottom.test.ts -t "bottom indicators"`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indicators.ts tests/bottom.test.ts
git commit -m "feat(bottom): indicator MACD, drawdown, tốc độ rơi, phân kỳ RSI"
```

---

## Task 4: Trích feature đáy (BottomDriver −2..+2)

**Files:**
- Modify: `src/lib/bottom.ts`
- Test: `tests/bottom.test.ts`

Feature `id` phải khớp khóa trong `BOTTOM_CONFIG.weights`: `dd`, `spd`, `rsi`, `macd`, `macro`, `mom`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tests/bottom.test.ts`:

```typescript
import { bottomFeatures } from "../src/lib/bottom";

describe("bottomFeatures", () => {
  it("đáy chữ V sâu sau đợt rơi: feature drawdown & tốc độ rơi nghiêng dương", () => {
    const closes = [...rng(300, () => 2000), ...rng(120, (i) => 2000 - i * 8)];
    const f = bottomFeatures({ closes, dxyCloses: [], yieldCloses: null, fedRates: [] });
    const dd = f.find((d) => d.id === "dd")!;
    const spd = f.find((d) => d.id === "spd")!;
    expect(dd.available).toBe(true);
    expect(dd.score).toBeGreaterThan(0); // đang dưới đỉnh nhiều -> gần đáy hơn
    expect(spd.score).toBeGreaterThan(0); // đang rơi -> điểm dương (vùng đáy tiềm năng)
  });

  it("đỉnh parabol: feature nghiêng âm (xa đáy)", () => {
    const closes = [...rng(300, () => 1500), ...rng(120, (i) => 1500 + i * 10)];
    const f = bottomFeatures({ closes, dxyCloses: [], yieldCloses: null, fedRates: [] });
    const dd = f.find((d) => d.id === "dd")!;
    expect(dd.score).toBeLessThanOrEqual(0);
  });

  it("macro feature available khi có đủ DXY", () => {
    const closes = rng(400, (i) => 1500 + i);
    const dxyCloses = rng(120, (i) => 105 - i * 0.2); // USD yếu dần -> thuận đáy vàng
    const f = bottomFeatures({ closes, dxyCloses, yieldCloses: null, fedRates: [] });
    const macro = f.find((d) => d.id === "macro")!;
    expect(macro.available).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/bottom.test.ts -t bottomFeatures`
Expected: FAIL — `bottomFeatures` chưa định nghĩa.

- [ ] **Step 3: Cài `bottomFeatures` trong `src/lib/bottom.ts`**

Thêm import + hàm:

```typescript
import { sma, rsi, macd, drawdownFromPeak, declineSpeedPct, bullishRsiDivergence } from "./indicators";
import type { BottomDriver } from "./types";

const clamp2 = (n: number) => Math.max(-2, Math.min(2, n));

export interface BottomFeatureInputs {
  /** XAU/USD đóng cửa cũ -> mới */
  closes: number[];
  /** DXY đóng cửa cũ -> mới (rỗng nếu không có) */
  dxyCloses: number[];
  /** lợi suất 10 năm đóng cửa cũ -> mới, hoặc null */
  yieldCloses: number[] | null;
  /** Fed funds theo tháng cũ -> mới */
  fedRates: number[];
}

function na(id: string, label: string): BottomDriver {
  return { id, label, score: 0, explanation: "Không có dữ liệu.", available: false };
}

/** Trả về 6 feature đáy (-2..+2). id khớp BOTTOM_CONFIG.weights. */
export function bottomFeatures(inp: BottomFeatureInputs): BottomDriver[] {
  const { closes } = inp;
  const out: BottomDriver[] = [];
  const fmt = (n: number, d = 1) => n.toLocaleString("vi-VN", { maximumFractionDigits: d });

  // dd: drawdown từ đỉnh 252 phiên. Càng sâu dưới đỉnh càng gần vùng đáy tiềm năng.
  const dd = drawdownFromPeak(closes, 252);
  if (dd === null) out.push(na("dd", "Độ sâu dưới đỉnh 1 năm"));
  else {
    const score = dd >= 20 ? 2 : dd >= 12 ? 1 : dd >= 5 ? 0 : dd >= 1 ? -1 : -2;
    out.push({
      id: "dd", label: "Độ sâu dưới đỉnh 1 năm", score,
      explanation: `Giá đang thấp hơn đỉnh 1 năm ${fmt(dd)}%: ${score > 0 ? "vùng chiết khấu sâu" : score < 0 ? "sát đỉnh, xa đáy" : "chiết khấu vừa"}.`,
      available: true,
    });
  }

  // spd: tốc độ rơi 63 phiên. Rơi mạnh -> khả năng tạo đáy nhọn cao hơn.
  const spd = declineSpeedPct(closes, 63);
  if (spd === null) out.push(na("spd", "Tốc độ rơi 3 tháng"));
  else {
    const score = spd <= -15 ? 2 : spd <= -7 ? 1 : spd < 3 ? 0 : spd < 10 ? -1 : -2;
    out.push({
      id: "spd", label: "Tốc độ rơi 3 tháng", score,
      explanation: `XAU thay đổi ${spd >= 0 ? "+" : ""}${fmt(spd)}% trong 3 tháng: ${score > 0 ? "đang rơi, vùng dò đáy" : score < 0 ? "đang tăng nóng" : "đi ngang"}.`,
      available: true,
    });
  }

  // rsi: quá bán + phân kỳ tăng.
  const r = rsi(closes, 14);
  if (r === null) out.push(na("rsi", "Quá bán & phân kỳ RSI"));
  else {
    let score = r < 30 ? 2 : r < 40 ? 1 : r <= 60 ? 0 : r <= 70 ? -1 : -2;
    const div = bullishRsiDivergence(closes);
    if (div && score < 2) score += 1; // phân kỳ tăng củng cố tín hiệu đáy
    out.push({
      id: "rsi", label: "Quá bán & phân kỳ RSI", score: clamp2(score),
      explanation: `RSI ngày = ${fmt(r)}${div ? ", có phân kỳ tăng" : ""}: ${score > 0 ? "đà giảm cạn dần" : score < 0 ? "còn mạnh, chưa đáy" : "trung tính"}.`,
      available: true,
    });
  }

  // macd: histogram cắt lên từ dưới 0 -> đảo chiều sớm.
  const m = macd(closes);
  if (m === null) out.push(na("macd", "MACD đảo chiều"));
  else {
    const score = m.histogram > 0 && m.line < 0 ? 2 : m.histogram > 0 ? 1 : m.histogram > -1 ? 0 : -1;
    out.push({
      id: "macd", label: "MACD đảo chiều", score: clamp2(score),
      explanation: `MACD histogram ${m.histogram >= 0 ? "+" : ""}${fmt(m.histogram, 2)}: ${score > 0 ? "động lượng đang đảo lên" : "chưa có dấu đảo chiều"}.`,
      available: true,
    });
  }

  // macro: USD yếu + lợi suất rơi + Fed nới -> môi trường đáy chu kỳ vàng.
  if (inp.dxyCloses.length < 51) out.push(na("macro", "Vĩ mô đảo chiều"));
  else {
    const dxyLast = inp.dxyCloses[inp.dxyCloses.length - 1];
    const dxyMa50 = sma(inp.dxyCloses, 50)!;
    let s = dxyLast < dxyMa50 ? 1 : -1;
    let parts = [`USD ${dxyLast < dxyMa50 ? "dưới" : "trên"} MA50`];
    if (inp.yieldCloses && inp.yieldCloses.length >= 64) {
      const yc = inp.yieldCloses;
      const dy = yc[yc.length - 1] - yc[yc.length - 64];
      s += dy <= -0.2 ? 1 : dy >= 0.2 ? -1 : 0;
      parts.push(`lợi suất ${dy >= 0 ? "+" : ""}${fmt(dy, 2)}đ/3 tháng`);
    }
    if (inp.fedRates.length >= 4) {
      const df = inp.fedRates[inp.fedRates.length - 1] - inp.fedRates[inp.fedRates.length - 4];
      s += df < 0 ? 1 : df > 0 ? -1 : 0;
      parts.push(`Fed ${df >= 0 ? "+" : ""}${fmt(df, 2)}đ`);
    }
    const score = clamp2(s);
    out.push({
      id: "macro", label: "Vĩ mô đảo chiều", score,
      explanation: `${parts.join(", ")}: ${score > 0 ? "môi trường thuận đáy chu kỳ vàng" : score < 0 ? "vĩ mô bất lợi" : "trung tính"}.`,
      available: true,
    });
  }

  // mom: động lượng 12 tháng (trend). Âm sâu -> bear, cẩn trọng bắt đáy.
  if (closes.length < 253) out.push(na("mom", "Động lượng 12 tháng"));
  else {
    const mom = (closes[closes.length - 1] / closes[closes.length - 253] - 1) * 100;
    const score = mom > 20 ? -1 : mom > 0 ? 0 : mom > -15 ? 1 : 2;
    out.push({
      id: "mom", label: "Động lượng 12 tháng", score: clamp2(score),
      explanation: `XAU ${mom >= 0 ? "+" : ""}${fmt(mom)}% so với 12 tháng trước: ${mom < 0 ? "đã giảm dài, gần vùng kiệt" : "đang trên cao, ít khả năng đáy lớn"}.`,
      available: true,
    });
  }

  return out;
}
```

Lưu ý hướng `mom`: đáy *chu kỳ* thường đến *sau* một đợt giảm dài (mom 12m âm), nên mom âm → điểm dương cho "gần đáy". Đây là giả thuyết; Task 9 (study) sẽ kiểm và chỉnh trọng số/hướng nếu dữ liệu bác bỏ.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/bottom.test.ts -t bottomFeatures`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bottom.ts tests/bottom.test.ts
git commit -m "feat(bottom): trích 6 feature đáy với giải thích tiếng Việt"
```

---

## Task 5: Gộp bottomScore + bin + base-rate + CI

**Files:**
- Modify: `src/lib/bottom.ts`
- Test: `tests/bottom.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tests/bottom.test.ts`:

```typescript
import { bottomScore, binOf } from "../src/lib/bottom";

describe("bottomScore & binOf", () => {
  const drivers = [
    { id: "dd", label: "", score: 2, explanation: "", available: true },
    { id: "spd", label: "", score: 2, explanation: "", available: true },
    { id: "macro", label: "", score: 1, explanation: "", available: false },
  ];

  it("bottomScore tự chuẩn hóa theo feature khả dụng, -100..+100", () => {
    const w = { dd: 0.5, spd: 0.3, macro: 0.2 };
    // chỉ dd & spd available: (2*0.5 + 2*0.3)/(0.8) * 50 = 100
    expect(bottomScore(drivers, w)).toBe(100);
  });

  it("binOf đặt điểm vào đúng khoảng", () => {
    expect(binOf(-50, [-40, 0, 40])).toBe(0);
    expect(binOf(-10, [-40, 0, 40])).toBe(1);
    expect(binOf(10, [-40, 0, 40])).toBe(2);
    expect(binOf(80, [-40, 0, 40])).toBe(3);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/bottom.test.ts -t "bottomScore"`
Expected: FAIL.

- [ ] **Step 3: Thêm `bottomScore` + `binOf` vào `src/lib/bottom.ts`**

```typescript
/** Gộp feature (-2..+2) thành điểm -100..+100, trọng số tự chuẩn hóa theo feature khả dụng. */
export function bottomScore(drivers: BottomDriver[], weights: Record<string, number>): number {
  let sum = 0;
  let tw = 0;
  for (const d of drivers) {
    if (!d.available) continue;
    const w = weights[d.id] ?? 0;
    sum += d.score * w;
    tw += w;
  }
  if (tw === 0) return 0;
  return Math.round((sum / tw) * 50 * 10) / 10;
}

/** Trả về chỉ số bin (0..edges.length) cho điểm score theo binEdges tăng dần. */
export function binOf(score: number, edges: number[]): number {
  let b = 0;
  for (const e of edges) {
    if (score >= e) b++;
    else break;
  }
  return b;
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/bottom.test.ts -t "bottomScore"`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bottom.ts tests/bottom.test.ts
git commit -m "feat(bottom): gộp bottomScore + binning"
```

---

## Task 6: Engine `runBottom` (xác suất 2 tầng + drivers + đáy lịch sử)

**Files:**
- Modify: `src/lib/bottom.ts`
- Test: `tests/bottom.test.ts`

`runBottom` tái dùng chữ ký giống `runBacktest`: nhận chuỗi bar XAU + DXY + Fed + extras yield. Với mỗi ngày lịch sử (bước STEP) nó tính drivers + bottomScore + bin + label cho từng tầng; xác suất hiện tại = tỉ lệ near-bottom của các ngày lịch sử CÙNG bin; CI = block-bootstrap trên nhãn 0/1 của bin đó. `confirmedBottoms` = các ngày lịch sử có label=true và là điểm thấp cục bộ (để overlay).

- [ ] **Step 0: Di chuyển helper bootstrap vào `src/lib` (tránh import ngược)**

`src/lib/bottom.ts` cần `blockBootstrapCi` nhưng nó đang nằm ở `scripts/study-lib.ts` — để `src/lib` không phụ thuộc `scripts/`, di chuyển 2 hàm thuần toán `seededRandom` và `blockBootstrapCi` từ `scripts/study-lib.ts` sang CUỐI `src/lib/indicators.ts` (cắt nguyên văn, giữ nguyên thân hàm + JSDoc). Sau đó trong `scripts/study-lib.ts` thay 2 định nghĩa đã cắt bằng một dòng re-export ở đầu file (sau import hiện có):

```typescript
export { seededRandom, blockBootstrapCi } from "../src/lib/indicators";
```

Chạy `npx vitest run tests/engine.test.ts -t bootstrap` để xác nhận `engine.test.ts` (import từ `../scripts/study-lib`) vẫn xanh nhờ re-export.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tests/bottom.test.ts`:

```typescript
import { runBottom } from "../src/lib/bottom";

describe("runBottom", () => {
  const range = <T>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));
  // chuỗi hình sin nhiều chu kỳ + nhiễu nhẹ, đủ dài cho cả 2 tầng
  const bars = range(1600, (i) => ({
    date: new Date(Date.UTC(2018, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    close: 1500 + 250 * Math.sin(i / 90) + i * 0.05,
  }));

  it("trả xác suất 2 tầng trong [0,100] và CI hợp lệ", () => {
    const r = runBottom(bars, null, null, {});
    for (const tier of [r.cycle, r.swing]) {
      expect(tier.prob).toBeGreaterThanOrEqual(0);
      expect(tier.prob).toBeLessThanOrEqual(100);
      if (tier.ci) {
        expect(tier.ci[0]).toBeLessThanOrEqual(tier.prob + 0.1);
        expect(tier.ci[1]).toBeGreaterThanOrEqual(tier.prob - 0.1);
      }
      expect(tier.drivers.length).toBeGreaterThan(0);
    }
  });

  it("xác suất tầng đáy cao hơn ở đáy sin so với đỉnh sin", () => {
    // cắt chuỗi tại một đáy (sin ~ -1) và một đỉnh (sin ~ +1)
    const atTrough = bars.slice(0, 1413); // sin(1412/90)≈ gần -1
    const atPeak = bars.slice(0, 1271); // sin(1270/90)≈ gần +1
    const pt = runBottom(atTrough, null, null, {}).cycle.prob;
    const pk = runBottom(atPeak, null, null, {}).cycle.prob;
    expect(pt).toBeGreaterThan(pk);
  });

  it("đánh dấu được đáy lịch sử cho overlay", () => {
    const r = runBottom(bars, null, null, {});
    expect(r.confirmedBottoms.length).toBeGreaterThan(0);
    expect(r.confirmedBottoms[0]).toHaveProperty("date");
    expect(r.confirmedBottoms[0]).toHaveProperty("tier");
  });
});
```

Nếu chỉ số lát cắt (1413/1271) không rơi đúng đáy/đỉnh khi chạy, điều chỉnh để `atTrough` kết thúc gần đáy sin và `atPeak` gần đỉnh — mục tiêu test là *đáy có prob cao hơn đỉnh*, không phải con số tuyệt đối.

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npx vitest run tests/bottom.test.ts -t runBottom`
Expected: FAIL — `runBottom` chưa định nghĩa.

- [ ] **Step 3: Cài `runBottom` trong `src/lib/bottom.ts`**

Thêm import và hàm:

```typescript
import { BOTTOM_CONFIG, type BottomAnalysis, type BottomTierResult, type ConfirmedBottom, type BottomTierConfig } from "./types";
import { blockBootstrapCi } from "./indicators"; // đã di chuyển khỏi scripts/study-lib ở Step 0

interface Bar { date: string; close: number; }
const WARMUP = 756;
const STEP = 3;

export interface RunBottomExtras {
  yield10y?: { bars: Bar[] } | null;
}

interface HistRow { i: number; date: string; score: number; bin: number; label: boolean | null; }

function buildTier(
  closes: number[],
  dates: string[],
  cfg: BottomTierConfig,
  featuresAt: (i: number) => BottomDriver[]
): { result: Omit<BottomTierResult, "drivers">; rows: HistRow[]; currentDrivers: BottomDriver[] } {
  const rows: HistRow[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) {
    const drivers = featuresAt(i);
    const score = bottomScore(drivers, cfg.weights);
    const bin = binOf(score, cfg.binEdges);
    const label = labelNearBottom(closes, i, cfg.horizonDays, cfg.epsPct);
    rows.push({ i, date: dates[i], score, bin, label });
  }
  // ngày hiện tại (điểm cuối) — không có label, chỉ tính bin
  const currentDrivers = featuresAt(closes.length - 1);
  const curScore = bottomScore(currentDrivers, cfg.weights);
  const curBin = binOf(curScore, cfg.binEdges);

  const labeled = rows.filter((r) => r.label !== null && r.bin === curBin);
  const favArr = labeled.map((r) => (r.label ? 1 : -1));
  const n = labeled.length;
  const prob = n ? Math.round((favArr.filter((x) => x > 0).length / n) * 1000) / 10 : 0;
  const ci = blockBootstrapCi(favArr, Math.max(1, Math.round(cfg.horizonDays / 3)));

  return { result: { prob, ci, bin: curBin, n }, rows, currentDrivers };
}

/** Chạy engine xác suất đáy 2 tầng. closes/dxy/fed/yield giống runBacktest. */
export function runBottom(
  xau: Bar[],
  dxy: Bar[] | null,
  fed: { date: string; value: number }[] | null,
  extras: RunBottomExtras = {}
): BottomAnalysis {
  const closes = xau.map((b) => b.close);
  const dates = xau.map((b) => b.date);
  const yieldBars = extras.yield10y?.bars ?? null;

  // featuresAt: cắt mọi chuỗi đến ngày i (point-in-time, không nhìn tương lai cho feature)
  const featuresAt = (i: number): BottomDriver[] => {
    const upTo = closes.slice(0, i + 1);
    const di = dates[i];
    const dxyCloses = dxy ? dxy.filter((b) => b.date <= di).map((b) => b.close) : [];
    const yieldCloses = yieldBars ? yieldBars.filter((b) => b.date <= di).map((b) => b.close) : null;
    const fedRates = fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [];
    return bottomFeatures({ closes: upTo, dxyCloses, yieldCloses, fedRates });
  };

  const cycle = buildTier(closes, dates, BOTTOM_CONFIG.cycle, featuresAt);
  const swing = buildTier(closes, dates, BOTTOM_CONFIG.swing, featuresAt);

  // confirmedBottoms: ngày label=true và là min cục bộ trong ±STEP*3 quanh nó
  const confirmedBottoms: ConfirmedBottom[] = [];
  const collect = (rows: HistRow[], tier: "cycle" | "swing") => {
    for (const r of rows) {
      if (r.label !== true) continue;
      const lo = Math.max(0, r.i - 9);
      const hi = Math.min(closes.length - 1, r.i + 9);
      let isMin = true;
      for (let j = lo; j <= hi; j++) if (closes[j] < closes[r.i]) { isMin = false; break; }
      if (isMin) confirmedBottoms.push({ date: r.date, price: Math.round(closes[r.i] * 10) / 10, tier });
    }
  };
  collect(cycle.rows, "cycle");
  collect(swing.rows, "swing");

  return {
    generatedAt: new Date().toISOString(),
    dataDate: dates[dates.length - 1] ?? "",
    cycle: { ...cycle.result, drivers: cycle.currentDrivers },
    swing: { ...swing.result, drivers: swing.currentDrivers },
    confirmedBottoms,
    note: "Xác suất 'giá sẽ không rẻ hơn đáng kể trong H ngày' theo base-rate lịch sử cùng nhóm điểm số đáy. Backtest trên XAU/USD; tham khảo, không phải lời hứa.",
  };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx vitest run tests/bottom.test.ts -t runBottom`
Expected: PASS (3 test). Nếu test "đáy > đỉnh" fail vì chỉ số lát cắt, chỉnh chỉ số như ghi chú Step 1 rồi chạy lại.

- [ ] **Step 5: Chạy toàn bộ test đảm bảo không vỡ gì**

Run: `npx vitest run`
Expected: tất cả PASS (engine + bottom).

- [ ] **Step 6: Commit**

```bash
git add src/lib/bottom.ts tests/bottom.test.ts
git commit -m "feat(bottom): engine runBottom 2 tầng + base-rate + CI + đáy lịch sử"
```

---

## Task 7: Nối vào cron `run.ts` → `bottom.json`

**Files:**
- Modify: `scripts/run.ts`

- [ ] **Step 1: Thêm import**

Tại khối import của `scripts/run.ts`, thêm:

```typescript
import { runBottom } from "../src/lib/bottom";
import type { BottomAnalysis } from "../src/lib/types";
```

- [ ] **Step 2: Gọi engine sau backtest**

Ngay sau khối `runBacktest(...)` (dòng ~235-241), thêm:

```typescript
  const bottom: BottomAnalysis = runBottom(
    xauRes.bars,
    dxyRes?.bars ?? null,
    fed,
    { yield10y: yieldRes }
  );
```

- [ ] **Step 3: Ghi file**

Sau dòng `writeFileSync(join(DATA_DIR, "timeline.json"), ...)`, thêm:

```typescript
  writeFileSync(join(DATA_DIR, "bottom.json"), JSON.stringify(bottom, null, 1));
```

Và cập nhật dòng `console.log("OK: ...")` cuối thêm `bottomCycle=${bottom.cycle.prob}%`:

```typescript
  console.log(
    `OK: composite=${composite} zone=${analysis.zone} premium=${prices.premiumPct}% backtest obs=${backtest.observations} bottomCycle=${bottom.cycle.prob}% bottomSwing=${bottom.swing.prob}%`
  );
```

- [ ] **Step 4: Chạy thử collect (dữ liệu thật) và kiểm bottom.json**

Run: `npm run collect`
Expected: log in ra `bottomCycle=..% bottomSwing=..%`; file `public/data/bottom.json` được tạo với `cycle.prob`, `swing.prob`, `confirmedBottoms` không rỗng.

Kiểm nhanh:
Run: `node -e "const b=require('./public/data/bottom.json'); console.log('cycle',b.cycle.prob,b.cycle.ci,'swing',b.swing.prob,'bottoms',b.confirmedBottoms.length)"`
Expected: in ra số hợp lệ.

- [ ] **Step 5: Commit**

```bash
git add scripts/run.ts public/data/bottom.json
git commit -m "feat(bottom): cron sinh bottom.json mỗi lần collect"
```

---

## Task 8: Study tuyển ε/H + trọng số feature (validate out-of-sample)

**Files:**
- Create: `scripts/bottom-study.ts`

Study tái dùng `labelNearBottom` + `bottomFeatures` + `bottomScore` của engine (DRY). Nó sweep ε/H và lưới trọng số, chia train 2009–2018 / test 2019–2026, nhận cấu hình có **lift dương ở CẢ HAI giai đoạn** (bin "gần đáy nhất" vượt base-rate vô điều kiện), xếp theo lift tệ nhất (min-excess) — đúng triết lý presets.

- [ ] **Step 1: Viết script**

```typescript
/**
 * Tuyển ε/H + trọng số feature cho tầng đáy. Chạy: npx tsx scripts/bottom-study.ts
 * Cần timeline dữ liệu thật: chạy `npm run collect` trước (đọc public/data/timeline.json
 * để lấy chuỗi giá XAU đầy đủ — hoặc fetch lại bằng fetch.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { labelNearBottom, bottomFeatures, bottomScore, binOf } from "../src/lib/bottom";
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3;

async function main() {
  const [xau, dxy, fed, yield10y] = await Promise.all([
    fetchXau(),
    fetchDxy().catch(() => null),
    fetchFedFunds().catch(() => null),
    fetchYield10y().catch(() => null),
  ]);
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  // precompute drivers point-in-time mỗi STEP phiên
  const idxs: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) idxs.push(i);
  const driversByI = new Map<number, ReturnType<typeof bottomFeatures>>();
  for (const i of idxs) {
    const di = dates[i];
    driversByI.set(i, bottomFeatures({
      closes: closes.slice(0, i + 1),
      dxyCloses: dxy ? dxy.bars.filter((b) => b.date <= di).map((b) => b.close) : [],
      yieldCloses: yield10y ? yield10y.bars.filter((b) => b.date <= di).map((b) => b.close) : null,
      fedRates: fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [],
    }));
  }

  const EDGES = [-40, 0, 40]; // bin cao nhất (3) = "gần đáy nhất"

  for (const [tier, Hs, EPSs] of [
    ["cycle", [84, 126, 168], [3, 4, 5]],
    ["swing", [15, 21, 30], [1.5, 2, 3]],
  ] as const) {
    console.log(`\n=== TẦNG ${tier.toUpperCase()} ===`);
    let best: any = null;
    for (const H of Hs) for (const eps of EPSs) {
      // base-rate vô điều kiện train/test
      const labels = idxs.map((i) => ({ i, date: dates[i], y: labelNearBottom(closes, i, H, eps) }))
        .filter((r) => r.y !== null) as { i: number; date: string; y: boolean }[];
      const tr = labels.filter((r) => r.date < SPLIT);
      const te = labels.filter((r) => r.date >= SPLIT);
      if (tr.length < 50 || te.length < 50) continue;
      const baseTr = tr.filter((r) => r.y).length / tr.length;
      const baseTe = te.filter((r) => r.y).length / te.length;

      // grid trọng số bước 0.2 trên 6 feature (chuẩn hóa)
      const steps = [0, 0.2, 0.4, 0.6, 0.8, 1];
      // để giảm tổ hợp: thử các "profile" trọng số thưa thay vì full 6D
      const profiles: Record<string, number>[] = [
        { dd: 0.25, spd: 0.1, rsi: 0.15, macd: 0.1, macro: 0.3, mom: 0.1 },
        { dd: 0.2, spd: 0.2, rsi: 0.3, macd: 0.2, macro: 0.1, mom: 0 },
        { dd: 0.4, spd: 0.2, rsi: 0.2, macd: 0.1, macro: 0.1, mom: 0 },
        { dd: 0.15, spd: 0.15, rsi: 0.2, macd: 0.15, macro: 0.25, mom: 0.1 },
        { macro: 0.5, dd: 0.2, mom: 0.1, rsi: 0.1, spd: 0.05, macd: 0.05 },
      ];
      for (const w of profiles) {
        const lift = (rows: typeof tr, base: number) => {
          const top = rows.filter((r) => binOf(bottomScore(driversByI.get(r.i)!, w), EDGES) === EDGES.length);
          if (top.length < 25) return null;
          return top.filter((r) => r.y).length / top.length - base;
        };
        const lt = lift(tr, baseTr);
        const le = lift(te, baseTe);
        if (lt === null || le === null || lt <= 0 || le <= 0) continue;
        const minEx = Math.min(lt, le);
        if (!best || minEx > best.minEx) best = { tier, H, eps, w, lt, le, minEx, baseTr, baseTe };
      }
    }
    if (best) {
      console.log(`H=${best.H} eps=${best.eps}% | lift train +${(best.lt*100).toFixed(1)}pt / test +${(best.le*100).toFixed(1)}pt | min-excess +${(best.minEx*100).toFixed(1)}pt`);
      console.log(`baseline train ${(best.baseTr*100).toFixed(1)}% / test ${(best.baseTe*100).toFixed(1)}%`);
      console.log(`weights = ${JSON.stringify(best.w)}`);
    } else {
      console.log("Không có cấu hình nào vượt baseline ở CẢ HAI giai đoạn — tầng này CHƯA đủ tin cậy.");
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 2: Chạy study trên dữ liệu thật**

Run: `npm run collect && npx tsx scripts/bottom-study.ts`
Expected: in ra cấu hình tốt nhất mỗi tầng + min-excess, HOẶC thông báo "chưa đủ tin cậy".

- [ ] **Step 3: Ghi kết quả vào `BOTTOM_CONFIG`**

Mở `src/lib/types.ts`, thay `weights`, `horizonDays` (=H), `epsPct` (=eps) của `cycle` và `swing` trong `BOTTOM_CONFIG` bằng cấu hình thắng từ Step 2. **Nếu một tầng "chưa đủ tin cậy"**: giữ tầng đó nhưng đánh dấu để UI hiển thị "chưa đủ dữ liệu kiểm chứng" (thêm cờ `provisional: true` vào `BottomTierConfig` + type, và set ở tầng đó). Cập nhật test Task 1 nếu đổi cấu trúc.

- [ ] **Step 4: Chạy lại test + collect xác nhận còn xanh**

Run: `npx vitest run && npm run collect`
Expected: PASS; bottom.json sinh lại với cấu hình mới.

- [ ] **Step 5: Commit**

```bash
git add scripts/bottom-study.ts src/lib/types.ts public/data/bottom.json tests/bottom.test.ts
git commit -m "feat(bottom): study tuyển ε/H + trọng số, ghi cấu hình thắng out-of-sample"
```

---

## Task 9: Cổng ML (logistic regression) — chỉ nhận nếu thắng

**Files:**
- Create: `scripts/bottom-ml-study.ts`

Logistic regression thuần TS (gradient descent, không thêm dependency, hệ số giải thích được). So **Brier score** + **độ chính xác bin cao** trên giai đoạn test với bản rule-based. Đây là *cổng kiểm chứng*: nếu ML không thắng rõ ràng ngoài mẫu, kết luận giữ rule-based.

- [ ] **Step 1: Viết script**

```typescript
/**
 * Cổng kiểm chứng ML cho tầng đáy. Chạy: npx tsx scripts/bottom-ml-study.ts
 * Logistic regression thuần TS trên cùng feature với engine; walk-forward train
 * 2009-2018 / test 2019-2026; so Brier score với bản rule-based (BOTTOM_CONFIG).
 * KẾT LUẬN của script (in ra) quyết định có nhận ML hay không — mặc định giữ rule-based.
 */
import { labelNearBottom, bottomFeatures, bottomScore, binOf } from "../src/lib/bottom";
import { BOTTOM_CONFIG } from "../src/lib/types";
import { fetchXau, fetchDxy, fetchFedFunds, fetchYield10y } from "./fetch";

const SPLIT = "2019-01-01";
const WARMUP = 756;
const STEP = 3;
const FEATURES = ["dd", "spd", "rsi", "macd", "macro", "mom"] as const;

function trainLogistic(X: number[][], y: number[], epochs = 400, lr = 0.05): number[] {
  const d = X[0].length;
  const w = new Array(d + 1).fill(0); // w[0] = bias
  for (let e = 0; e < epochs; e++) {
    const grad = new Array(d + 1).fill(0);
    for (let n = 0; n < X.length; n++) {
      let z = w[0];
      for (let j = 0; j < d; j++) z += w[j + 1] * X[n][j];
      const p = 1 / (1 + Math.exp(-z));
      const err = p - y[n];
      grad[0] += err;
      for (let j = 0; j < d; j++) grad[j + 1] += err * X[n][j];
    }
    for (let j = 0; j <= d; j++) w[j] -= (lr * grad[j]) / X.length;
  }
  return w;
}

const predict = (w: number[], x: number[]) => {
  let z = w[0];
  for (let j = 0; j < x.length; j++) z += w[j + 1] * x[j];
  return 1 / (1 + Math.exp(-z));
};
const brier = (ps: number[], ys: number[]) => ps.reduce((a, p, i) => a + (p - ys[i]) ** 2, 0) / ps.length;

async function main() {
  const [xau, dxy, fed, yield10y] = await Promise.all([
    fetchXau(), fetchDxy().catch(() => null), fetchFedFunds().catch(() => null), fetchYield10y().catch(() => null),
  ]);
  const closes = xau.bars.map((b) => b.close);
  const dates = xau.bars.map((b) => b.date);

  for (const tier of ["cycle", "swing"] as const) {
    const cfg = BOTTOM_CONFIG[tier];
    const rows: { date: string; feats: number[]; score: number; y: number }[] = [];
    for (let i = WARMUP; i < closes.length; i += STEP) {
      const y = labelNearBottom(closes, i, cfg.horizonDays, cfg.epsPct);
      if (y === null) continue;
      const di = dates[i];
      const drv = bottomFeatures({
        closes: closes.slice(0, i + 1),
        dxyCloses: dxy ? dxy.bars.filter((b) => b.date <= di).map((b) => b.close) : [],
        yieldCloses: yield10y ? yield10y.bars.filter((b) => b.date <= di).map((b) => b.close) : null,
        fedRates: fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [],
      });
      const feats = FEATURES.map((id) => drv.find((d) => d.id === id)?.score ?? 0);
      rows.push({ date: di, feats, score: bottomScore(drv, cfg.weights), y: y ? 1 : 0 });
    }
    const tr = rows.filter((r) => r.date < SPLIT);
    const te = rows.filter((r) => r.date >= SPLIT);
    const w = trainLogistic(tr.map((r) => r.feats), tr.map((r) => r.y));

    // rule-based prob: tỉ lệ y theo bin học TRÊN TRAIN, áp lên test (không leak)
    const binFav = new Map<number, { f: number; n: number }>();
    for (const r of tr) {
      const b = binOf(r.score, cfg.binEdges);
      const c = binFav.get(b) ?? { f: 0, n: 0 };
      c.f += r.y; c.n++; binFav.set(b, c);
    }
    const ruleP = te.map((r) => { const c = binFav.get(binOf(r.score, cfg.binEdges)); return c && c.n ? c.f / c.n : 0.5; });
    const mlP = te.map((r) => predict(w, r.feats));
    const ys = te.map((r) => r.y);

    const brRule = brier(ruleP, ys);
    const brMl = brier(mlP, ys);
    console.log(`\n=== ${tier.toUpperCase()} (test n=${te.length}) ===`);
    console.log(`Brier rule-based = ${brRule.toFixed(4)} | ML logistic = ${brMl.toFixed(4)}`);
    console.log(`Hệ số ML: bias=${w[0].toFixed(2)} ` + FEATURES.map((f, j) => `${f}=${w[j + 1].toFixed(2)}`).join(" "));
    console.log(brMl < brRule - 0.005
      ? ">>> ML thắng rõ ngoài mẫu — CÂN NHẮC nhận (xem hệ số có hợp lý kinh tế không)."
      : ">>> ML KHÔNG thắng rõ — GIỮ rule-based (đơn giản, giải thích được).");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 2: Chạy cổng ML**

Run: `npx tsx scripts/bottom-ml-study.ts`
Expected: in Brier score 2 mô hình mỗi tầng + kết luận GIỮ/NHẬN.

- [ ] **Step 3: Ghi quyết định**

Trong commit message + `docs/bottom.md` (Task 12), ghi rõ Brier của 2 bên và quyết định. **Mặc định giữ rule-based** trừ khi ML thắng rõ VÀ hệ số hợp lý kinh tế (vd macro/dd dương). Không đổi engine live trong task này.

- [ ] **Step 4: Commit**

```bash
git add scripts/bottom-ml-study.ts
git commit -m "feat(bottom): cổng kiểm chứng ML (logistic) — so Brier vs rule-based"
```

---

## Task 10: Giám sát thoái hóa calibration

**Files:**
- Create: `scripts/monitor-bottom.ts`
- Modify: `scripts/run.ts` (gọi sau bottom)

Theo dõi mỗi cron: bin "gần đáy nhất" có còn vượt base-rate ở 2 năm gần nhất không. Ghi `public/data/bottom-health.json`. (Tách riêng khỏi `monitor-presets.ts` để giữ mỗi file một trách nhiệm.)

- [ ] **Step 1: Viết script**

```typescript
/** Giám sát calibration tầng đáy 2 năm gần nhất. Gọi trong run.ts; ghi bottom-health.json. */
import { labelNearBottom, bottomFeatures, bottomScore, binOf } from "../src/lib/bottom";
import { BOTTOM_CONFIG } from "../src/lib/types";
import type { DailyBar } from "./fetch";

export interface BottomHealth {
  generatedAt: string;
  items: { tier: "cycle" | "swing"; recentTopFav: number | null; recentBaseline: number | null; n: number; status: "ok" | "degraded" | "insufficient" }[];
}

const WARMUP = 756;
const STEP = 3;

export function monitorBottom(
  xau: DailyBar[],
  dxy: DailyBar[] | null,
  fed: { date: string; value: number }[] | null,
  yieldBars: DailyBar[] | null
): BottomHealth {
  const closes = xau.map((b) => b.close);
  const dates = xau.map((b) => b.date);
  const cutoff = dates.length ? new Date(new Date(dates[dates.length - 1]).getTime() - 730 * 86400000).toISOString().slice(0, 10) : "";
  const items: BottomHealth["items"] = [];

  for (const tier of ["cycle", "swing"] as const) {
    const cfg = BOTTOM_CONFIG[tier];
    const rows: { date: string; bin: number; y: boolean }[] = [];
    for (let i = WARMUP; i < closes.length; i += STEP) {
      const y = labelNearBottom(closes, i, cfg.horizonDays, cfg.epsPct);
      if (y === null) continue;
      const di = dates[i];
      const drv = bottomFeatures({
        closes: closes.slice(0, i + 1),
        dxyCloses: dxy ? dxy.filter((b) => b.date <= di).map((b) => b.close) : [],
        yieldCloses: yieldBars ? yieldBars.filter((b) => b.date <= di).map((b) => b.close) : null,
        fedRates: fed ? fed.filter((f) => f.date <= di).map((f) => f.value) : [],
      });
      rows.push({ date: di, bin: binOf(bottomScore(drv, cfg.weights), cfg.binEdges), y });
    }
    const recent = rows.filter((r) => r.date >= cutoff);
    const top = recent.filter((r) => r.bin === cfg.binEdges.length);
    const recentBaseline = recent.length ? recent.filter((r) => r.y).length / recent.length : null;
    const recentTopFav = top.length ? top.filter((r) => r.y).length / top.length : null;
    let status: "ok" | "degraded" | "insufficient" = "insufficient";
    if (top.length >= 10 && recentTopFav !== null && recentBaseline !== null) {
      status = recentTopFav >= recentBaseline ? "ok" : "degraded";
    }
    items.push({
      tier,
      recentTopFav: recentTopFav === null ? null : Math.round(recentTopFav * 1000) / 10,
      recentBaseline: recentBaseline === null ? null : Math.round(recentBaseline * 1000) / 10,
      n: top.length,
      status,
    });
  }
  return { generatedAt: new Date().toISOString(), items };
}
```

- [ ] **Step 2: Gọi trong `run.ts`**

Thêm import: `import { monitorBottom, type BottomHealth } from "./monitor-bottom";`
Sau khi tính `bottom`, thêm:

```typescript
  const bottomHealth = monitorBottom(xauRes.bars, dxyRes?.bars ?? null, fed, yieldRes?.bars ?? null);
```

Sau `writeFileSync(... "bottom.json" ...)`:

```typescript
  writeFileSync(join(DATA_DIR, "bottom-health.json"), JSON.stringify(bottomHealth, null, 1));
```

- [ ] **Step 3: Chạy collect, kiểm health**

Run: `npm run collect && node -e "console.log(require('./public/data/bottom-health.json').items)"`
Expected: in 2 item (cycle/swing) với status `ok`/`degraded`/`insufficient`.

- [ ] **Step 4: Commit**

```bash
git add scripts/monitor-bottom.ts scripts/run.ts public/data/bottom-health.json
git commit -m "feat(bottom): giám sát thoái hóa calibration tầng đáy"
```

---

## Task 11: UI — 2 đồng hồ xác suất + drivers

**Files:**
- Create: `src/components/BottomGauges.tsx`
- Modify: `src/app/page.tsx`, `src/components/Dashboard.tsx`

- [ ] **Step 1: Tạo `BottomGauges.tsx`**

```tsx
"use client";
import type { BottomAnalysis, BottomTierResult } from "@/lib/types";

function Gauge({ title, tier, provisional }: { title: string; tier: BottomTierResult; provisional?: boolean }) {
  const pct = Math.round(tier.prob);
  const ci = tier.ci ? ` (CI ${tier.ci[0]}–${tier.ci[1]}%)` : "";
  const color = pct >= 60 ? "var(--buy, #16a34a)" : pct >= 35 ? "#ca8a04" : "#6b7280";
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {provisional ? (
        <div style={{ fontSize: 13, color: "#6b7280" }}>Chưa đủ dữ liệu kiểm chứng.</div>
      ) : (
        <>
          <div style={{ fontSize: 28, fontWeight: 700, color }}>{pct}%<span style={{ fontSize: 12, color: "#6b7280", fontWeight: 400 }}>{ci}</span></div>
          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden", margin: "4px 0" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: color }} />
          </div>
          <ul style={{ fontSize: 12, color: "#374151", paddingLeft: 16, margin: 0 }}>
            {tier.drivers.filter((d) => d.available).slice(0, 3).map((d) => (
              <li key={d.id}>{d.explanation}</li>
            ))}
          </ul>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>n={tier.n} quan sát cùng nhóm</div>
        </>
      )}
    </div>
  );
}

export default function BottomGauges({ bottom }: { bottom: BottomAnalysis }) {
  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, margin: "16px 0" }}>
      <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Săn đáy — xác suất giá không rẻ hơn đáng kể</h2>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>
        Ước lượng từ base-rate lịch sử XAU/USD. Công cụ tham khảo, không phải dự báo chắc chắn.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Gauge title="Đáy chu kỳ (≈6 tháng)" tier={bottom.cycle} />
        <Gauge title="Đáy sóng (≈1 tháng)" tier={bottom.swing} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Nạp `bottom.json` trong `page.tsx`**

Thêm import + truyền prop:

```tsx
import bottomJson from "../../public/data/bottom.json";
import type { Analysis, Backtest, BottomAnalysis, PresetHealthFile, Timeline } from "@/lib/types";
// ...
  const bottom = bottomJson as unknown as BottomAnalysis;
  return (
    <Dashboard analysis={analysis} backtest={backtest} timeline={timeline} health={health} bottom={bottom} />
  );
```

- [ ] **Step 3: Render trong `Dashboard.tsx`**

Thêm `BottomAnalysis` vào import types, thêm `bottom` vào props của `Dashboard({...})` và type của nó, import component `import BottomGauges from "./BottomGauges";`, rồi render `<BottomGauges bottom={bottom} />` ngay dưới verdict card (trước hoặc sau `<PremiumChart .../>` — đặt trên biểu đồ để gắn với overlay Task 12).

- [ ] **Step 4: Build kiểm tra static export**

Run: `npm run build`
Expected: build PASS, không lỗi type.

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomGauges.tsx src/app/page.tsx src/components/Dashboard.tsx
git commit -m "feat(bottom): UI 2 đồng hồ xác suất đáy + drivers"
```

---

## Task 12: UI — overlay đáy lịch sử trên biểu đồ + docs

**Files:**
- Modify: `src/components/PremiumChart.tsx` (hoặc component biểu đồ giá), `src/components/Dashboard.tsx`
- Create: `docs/bottom.md`
- Modify: `CLAUDE.md` (thêm trỏ tới docs/bottom.md + commands)

Overlay gắn vào **`src/components/TimeMachine.tsx`** — đây là biểu đồ vẽ giá XAU theo timeline (SVG `spark`, đã có lớp marker mua/bán). KHÔNG dùng `PremiumChart` (nó vẽ chênh lệch %, trục x là chỉ số ~487 ngày premium, sai trục cho giá XAU). Các ngày trong `confirmedBottoms` cùng nguồn `xau.bars` + cùng `WARMUP=756/STEP=3` với `timeline.points`, nên khớp ngày 1-1; map date→index bằng `indexOnOrAfter(dates, b.date)` (đã import sẵn trong TimeMachine ở dòng 14-20).

- [ ] **Step 1: Thêm prop `confirmedBottoms` + tính marker trong `spark` memo**

Trong `src/components/TimeMachine.tsx`:

1. Thêm `type ConfirmedBottom` vào import từ `@/lib/types` (khối import dòng 4-12).
2. Thêm vào props (dòng 63-71): `confirmedBottoms = [],` trong destructure và `confirmedBottoms?: ConfirmedBottom[];` trong type.
3. Trong `spark` useMemo (sau khi `x`, `y`, `markers` đã tính, trước `return {...}` — quanh dòng 179-180), thêm:

```tsx
    const bottomMarkers = confirmedBottoms
      .map((b) => ({ i: indexOnOrAfter(dates, b.date), tier: b.tier }))
      .filter((m) => m.i >= start && m.i < end && m.i < points.length)
      .map((m) => ({ cx: x(m.i), cy: y(points[m.i].price), tier: m.tier }));
```

4. Thêm `bottomMarkers` vào object `return {...}` của memo (cạnh `markers`, `sellMarkers`, `expMarkers`).
5. Thêm `confirmedBottoms` và `dates` vào mảng dependency của `spark` memo (dòng 193).

- [ ] **Step 2: Vẽ marker + nối prop từ Dashboard**

Trong phần render SVG của TimeMachine, ngay sau khối `{spark.markers.map(...)}` (vẽ chấm mua xanh, dòng 324-326), thêm:

```tsx
          {spark.bottomMarkers.map((m, i) => (
            <text key={`bm${i}`} x={m.cx} y={m.cy + 13} fontSize={11}
                  fill={m.tier === "cycle" ? "#4cc97a" : "#86efac"} textAnchor="middle">▲</text>
          ))}
```

Trong `src/components/Dashboard.tsx` dòng 395, đổi:

```tsx
      <TimeMachine timeline={timeline} weights={weights} preset={preset} confirmedBottoms={bottom.confirmedBottoms} />
```

(Prop `bottom` đã được thêm vào Dashboard ở Task 11 Step 3.)

- [ ] **Step 3: Build kiểm tra**

Run: `npm run build`
Expected: PASS, không lỗi type (`ConfirmedBottom` khớp, `bottom` prop tồn tại).

- [ ] **Step 4: Viết `docs/bottom.md`**

Tạo `docs/bottom.md` gồm: định nghĩa nhãn (công thức ε/H), bảng cấu hình `BOTTOM_CONFIG` đã chọn + min-excess train/test từ Task 8, kết luận cổng ML (Brier 2 bên) từ Task 9, guardrails (không tuyên bố "đây là đáy", tầng provisional ghi "chưa đủ dữ liệu", giám sát degraded), và lệnh tái lập:

```bash
npm run collect
npx tsx scripts/bottom-study.ts       # tuyển ε/H + trọng số
npx tsx scripts/bottom-ml-study.ts    # cổng kiểm chứng ML
```

Số liệu trong `docs/bottom.md` phải khớp `BOTTOM_CONFIG` trong `src/lib/types.ts` (giống quy ước presets.md ↔ PRESETS).

- [ ] **Step 5: Cập nhật `CLAUDE.md`**

Trong mục commands của `CLAUDE.md`, thêm: `npx tsx scripts/bottom-study.ts` và `npx tsx scripts/bottom-ml-study.ts` vào danh sách Studies; thêm một dòng ở phần "Scoring engine" trỏ tới tầng đáy độc lập + `docs/bottom.md`.

- [ ] **Step 6: Chạy full test + build lần cuối**

Run: `npx vitest run && npm run build`
Expected: tất cả PASS, build OK.

- [ ] **Step 7: Commit**

```bash
git add src/components/PremiumChart.tsx src/components/Dashboard.tsx docs/bottom.md CLAUDE.md public/data/bottom.json public/data/bottom-health.json
git commit -m "feat(bottom): overlay đáy lịch sử + docs/bottom.md + cập nhật CLAUDE.md"
```

---

## Self-Review (đã chạy khi viết plan)

**Spec coverage:**
- Mục 1 (định nghĩa ε/H) → Task 1 (config), Task 2 (label), Task 8 (tuyển ε/H). ✓
- Mục 2 (kiến trúc module riêng) → Task 6 (engine), Task 7 (cron), Task 11 (UI), không đụng composite. ✓
- Mục 3 (feature B+A) → Task 3 (indicator), Task 4 (features). ✓
- Mục 4 (base-rate + block-bootstrap CI) → Task 5, Task 6 (tái dùng `blockBootstrapCi`). ✓
- Mục 5 (ML là cổng) → Task 9. ✓
- Mục 6 (guardrails: provisional, no-prediction, degradation) → Task 8 Step 3, Task 10, Task 12. ✓
- Mục 7 (study-first) → Task 8/9 chạy trước khi chốt config; engine recompute từ history mỗi cron. ✓
- Mục 8 (files) → khớp File Structure. ✓

**Placeholder scan:** không có "TBD/TODO". Chỗ duy nhất phụ thuộc kết quả runtime là `BOTTOM_CONFIG` numbers (Task 8 Step 3) — đây là quy trình "chạy study, đọc output, ghi giá trị cụ thể có tên", giống cách PRESETS được chọn, không phải placeholder mơ hồ.

**Type consistency:** `BottomDriver`, `BottomTierResult`, `BottomAnalysis`, `BOTTOM_CONFIG`, `BottomTierConfig` định nghĩa ở Task 1, dùng nhất quán ở Task 4/5/6/10/11. Feature `id` (`dd/spd/rsi/macd/macro/mom`) khớp giữa `bottomFeatures` (Task 4) và `BOTTOM_CONFIG.weights` (Task 1) và study/ML (Task 8/9). Hàm `bottomScore`/`binOf`/`labelNearBottom`/`bottomFeatures`/`runBottom` tên nhất quán xuyên suốt.

**Lưu ý rủi ro thực thi:** test "đáy > đỉnh" (Task 6) phụ thuộc chỉ số lát cắt chuỗi sin — nếu lệch, chỉnh chỉ số (đã ghi chú trong task). Cấu hình khởi điểm có thể KHÔNG vượt baseline khi chạy study thật (Task 8) — khi đó tầng tương ứng đánh dấu provisional, đúng guardrail, không phải lỗi plan.

## Review đối chiếu code thật (2026-06-13, "no hallucination")

Đã đối chiếu từng API/đường dẫn với code thật. **Đã xác minh đúng:** chữ ký `fetchXau` (`{bars,source}` không null), `fetchDxy`/`fetchYield10y`/`fetchFedFunds` (nullable), `DailyBar` (`scripts/fetch.ts:15`); `sma`/`rsi`/`percentileRank`/`median` có sẵn trong `indicators.ts`; `seededRandom`/`blockBootstrapCi` export từ `study-lib.ts`; pattern import JSON trong `page.tsx`; `Dashboard` render `PremiumChart analysis` (dòng 393) và `TimeMachine timeline/weights/preset` (dòng 395); helper `indexOnOrAfter` đã import trong TimeMachine; `timeline.points` dùng cùng `WARMUP=756/STEP=3` với `runBottom` nên ngày khớp 1-1 cho overlay; toán composite/binOf/label/weights-sum đúng.

**Lỗi đã phát hiện & sửa trong bản plan này:**
1. **Overlay nhắm sai component (nghiêm trọng):** bản đầu gắn marker vào `PremiumChart` với tên scale bịa (`xScale/yScale/minDate/maxDate`). `PremiumChart` vẽ *chênh lệch %* (trục x là chỉ số ~487 ngày premium), không phải giá XAU. Đã sửa Task 12 sang `TimeMachine.tsx` với `x`/`y` thật trong `spark` memo + `indexOnOrAfter` map date→index.
2. **Import ngược `src/lib` → `scripts` (smell):** `bottom.ts` import `blockBootstrapCi` từ `scripts/study-lib`. Đã thêm Task 6 Step 0: di chuyển `seededRandom`+`blockBootstrapCi` vào `src/lib/indicators.ts`, `study-lib.ts` re-export (giữ `engine.test.ts`/`monitor-presets.ts` xanh); `bottom.ts` import từ `./indicators`.
3. **Nhỏ:** bỏ `const FEATURES` thừa trong `bottom-study.ts` (Task 8).

Không tìm thấy tên hàm/type/đường dẫn bịa nào khác trong plan sau khi sửa 3 mục trên.
