# Lớp "Vùng tích lũy" (phanh DCA) — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm một lớp độc lập điều tiết DCA — ghìm khối lượng mua (không bao giờ về 0) khi vàng đắt bất thường so với dải 2 năm HOẶC composite bi quan.

**Architecture:** Tính ở thời điểm collect (như Bottom Hunter): hàm thuần `runAccumulation` trên `timeline.points` → `accumulation.json`; monitor thoái hóa → `accumulation-health.json`; enrich `timeline.points` cho Time Machine. UI là một accordion riêng. Không nguồn dữ liệu mới, không đụng composite/bottom.

**Tech Stack:** TypeScript, Next.js (static export), Vitest. Chạy test: `npx vitest run <file>`.

## Global Constraints

- UI tiếng Việt; chuỗi giải thích là tiếng Việt cho người dùng.
- Hệ số phanh ∈ {1, 0.5, 0.25, 0.2}, **không bao giờ > 1, không bao giờ = 0** (sàn 0.2).
- Mọi tính toán ở collect-time; trình duyệt chỉ đọc JSON tĩnh.
- Cấu hình KHÓA (config B): `win=504`, `expHi=0.75`, `mExp=0.25`, `compThr=-30`, `mComp=0.5`, `floor=0.2`.
- Evidence (giữ khớp `docs/accumulation.md`): train +2.26% CI[0.63,4.27] (32 phanh) / test +8.24% CI[2.55,13.76] (65 phanh); placebo ≈0.
- Dùng composite **của timeline** (world composite), KHÔNG dùng `analysis.composite` — brake được kiểm chứng trên timeline composite.
- Field thêm vào `TimelinePoint` là **optional** (file timeline cũ không có).

---

### Task 1: Types & ACCUM_CONFIG

**Files:**
- Modify: `src/lib/types.ts` (thêm vào cuối file)

**Interfaces:**
- Produces: `AccumConfig`, `ACCUM_CONFIG`, `AccumBrake`, `AccumulationAnalysis`, `AccumulationHealth`, `AccumPoint`; bổ sung 2 field optional `accumMult?`, `pricePct2y?` vào `TimelinePoint`.

- [ ] **Step 1: Thêm 2 field optional vào `TimelinePoint`**

Trong `src/lib/types.ts`, trong `interface TimelinePoint`, ngay sau dòng `swingN?: number;` (trước dấu `}` đóng interface) thêm:

```ts
  /** hệ số phanh DCA as-of-ngày (lớp Vùng tích lũy). undefined = timeline.json cũ. */
  accumMult?: number;
  /** percentile giá so dải 2 năm (0..1) tại ngày này. undefined = timeline.json cũ. */
  pricePct2y?: number | null;
```

- [ ] **Step 2: Thêm types + config vào cuối `src/lib/types.ts`**

```ts
/** Một điểm tối thiểu để chấm Vùng tích lũy (lấy từ timeline.points). */
export interface AccumPoint {
  date: string;
  price: number;
  composite: number;
}

/** Một phanh đang bật + giải thích tiếng Việt. */
export interface AccumBrake {
  id: "price-top" | "comp-bear";
  label: string;
  explanation: string;
}

/**
 * Cấu hình phanh DCA "Vùng tích lũy". Tuyển bằng scripts/accumulation-study.ts
 * (lưới 54 cấu hình, 48 vượt cổng 2 giai đoạn train<2019/test>=2019, xếp min-excess
 * + CI block-bootstrap + placebo). Chốt config B (nhẹ) thay winner thuần min-excess (A)
 * vì trực giác hơn, CI chồng nhau. Chỉ phanh, không boost. Loại bằng bằng chứng:
 * Bottom Hunter (train âm), real-yield (overfit bull). Chi tiết: docs/accumulation.md.
 */
export interface AccumConfig {
  /** cửa sổ percentile giá (phiên), past-only */
  win: number;
  /** phanh khi percentile giá > expHi (0..1) */
  expHi: number;
  /** hệ số khi giá đắt */
  mExp: number;
  /** phanh thêm khi composite < compThr */
  compThr: number;
  /** hệ số khi composite bi quan */
  mComp: number;
  /** sàn hệ số */
  floor: number;
  evidence: {
    trainImprPct: number;
    trainCi: [number, number];
    testImprPct: number;
    testCi: [number, number];
  };
}

export const ACCUM_CONFIG: AccumConfig = {
  win: 504,
  expHi: 0.75,
  mExp: 0.25,
  compThr: -30,
  mComp: 0.5,
  floor: 0.2,
  evidence: {
    trainImprPct: 2.26,
    trainCi: [0.63, 4.27],
    testImprPct: 8.24,
    testCi: [2.55, 13.76],
  },
};

export interface AccumulationAnalysis {
  generatedAt: string;
  dataDate: string;
  /** percentile giá so 2 năm hôm nay (0..1); null nếu < warmup */
  pricePct2y: number | null;
  /** composite (world) hôm nay */
  composite: number;
  /** hệ số phanh hôm nay ∈ {1,0.5,0.25,0.2} */
  mult: number;
  /** các phanh đang bật */
  brakes: AccumBrake[];
  /** true khi chưa đủ 2 năm lịch sử (pricePct2y null) */
  provisional: boolean;
  /** hệ số + percentile theo NGÀY (mọi phiên) cho Time Machine */
  history: { date: string; pricePct2y: number | null; mult: number }[];
  note: string;
}

/** Sức khỏe lớp Vùng tích lũy — tính lại mỗi cron bởi scripts/monitor-accumulation.ts. */
export interface AccumulationHealth {
  generatedAt: string;
  /** cải thiện giá vốn vs phẳng trên ~2 năm gần nhất (pt %) */
  recentImprPct: number | null;
  recentBrakedMonths: number;
  status: "ok" | "degraded" | "insufficient";
}
```

- [ ] **Step 3: Kiểm tra biên dịch**

Run: `npx tsc --noEmit`
Expected: PASS (không lỗi type).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(accumulation): types + ACCUM_CONFIG (config B đã tuyển)"
```

---

### Task 2: Core engine `src/lib/accumulation.ts`

**Files:**
- Create: `src/lib/accumulation.ts`
- Test: `src/lib/accumulation.test.ts`

**Interfaces:**
- Consumes: `ACCUM_CONFIG`, `AccumConfig`, `AccumBrake`, `AccumulationAnalysis`, `AccumPoint` (Task 1).
- Produces:
  - `pricePct2y(closes: number[], i: number, win?: number): number | null`
  - `accumMult(pricePct: number | null, composite: number, cfg?: AccumConfig): number`
  - `brakeDescriptors(pricePct: number | null, composite: number, cfg?: AccumConfig): AccumBrake[]`
  - `realizedCostImpr(closes: number[], composites: number[], buyIdxs: number[], cfg?: AccumConfig): number`
  - `runAccumulation(points: AccumPoint[], cfg?: AccumConfig): AccumulationAnalysis`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/accumulation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  pricePct2y,
  accumMult,
  brakeDescriptors,
  realizedCostImpr,
  runAccumulation,
} from "./accumulation";
import { ACCUM_CONFIG, type AccumPoint } from "./types";

describe("pricePct2y", () => {
  it("null khi chưa đủ warmup", () => {
    expect(pricePct2y([1, 2, 3], 2, 504)).toBeNull();
  });
  it("percentile = tỉ lệ ngày quá khứ <= hôm nay", () => {
    // win=4: closes[0..3]=[10,20,30,40], i=4 giá=25 -> 2/4 (10,20 <=25)
    expect(pricePct2y([10, 20, 30, 40, 25], 4, 4)).toBe(0.5);
  });
  it("past-only: thêm dữ liệu tương lai không đổi giá trị quá khứ", () => {
    const base = [10, 20, 30, 40, 25, 99];
    const a = pricePct2y(base, 4, 4);
    const b = pricePct2y([...base, 1, 2, 3], 4, 4);
    expect(a).toBe(b);
  });
});

describe("accumMult", () => {
  it("x1 khi không đắt, composite ổn", () => {
    expect(accumMult(0.5, 0)).toBe(1);
  });
  it("x0.25 khi giá đắt (>expHi), composite ổn", () => {
    expect(accumMult(0.8, 0)).toBe(0.25);
  });
  it("x0.5 khi composite bi quan, giá không đắt", () => {
    expect(accumMult(0.5, -40)).toBe(0.5);
  });
  it("stack đắt + bi quan bị kẹp ở sàn 0.2 (0.25*0.5=0.125 -> 0.2)", () => {
    expect(accumMult(0.9, -50)).toBe(0.2);
  });
  it("pricePct null (warmup) coi như không đắt", () => {
    expect(accumMult(null, 0)).toBe(1);
  });
  it("không bao giờ >1 hay =0 trên dải đầu vào", () => {
    for (const pp of [null, 0, 0.5, 0.75, 0.76, 1]) {
      for (const c of [-100, -30, 0, 55]) {
        const m = accumMult(pp as number | null, c);
        expect(m).toBeGreaterThanOrEqual(ACCUM_CONFIG.floor);
        expect(m).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("brakeDescriptors", () => {
  it("rỗng khi không phanh", () => {
    expect(brakeDescriptors(0.5, 0)).toEqual([]);
  });
  it("price-top khi đắt", () => {
    const b = brakeDescriptors(0.8, 0);
    expect(b.map((x) => x.id)).toEqual(["price-top"]);
  });
  it("cả hai khi đắt + bi quan", () => {
    const b = brakeDescriptors(0.9, -40);
    expect(b.map((x) => x.id)).toEqual(["price-top", "comp-bear"]);
  });
});

describe("realizedCostImpr", () => {
  it("phanh ở tháng giá cao -> giá vốn rẻ hơn (impr > 0)", () => {
    // 5 tháng, tháng cuối rất đắt; warmup nhỏ để pricePct có giá trị
    const closes = [100, 100, 100, 100, 100, 100, 100, 200];
    const composites = closes.map(() => 0);
    const cfg = { ...ACCUM_CONFIG, win: 4, expHi: 0.75 };
    const idxs = [4, 5, 6, 7];
    expect(realizedCostImpr(closes, composites, idxs, cfg)).toBeGreaterThan(0);
  });
});

describe("runAccumulation", () => {
  const points: AccumPoint[] = Array.from({ length: 520 }, (_, i) => ({
    date: `d${String(i).padStart(4, "0")}`,
    price: 100 + i, // tăng đều -> ngày cuối ở đỉnh percentile
    composite: 0,
  }));
  it("ngày cuối ở đỉnh 2 năm -> phanh x0.25, provisional=false", () => {
    const a = runAccumulation(points);
    expect(a.provisional).toBe(false);
    expect(a.pricePct2y).toBeGreaterThan(0.75);
    expect(a.mult).toBe(0.25);
    expect(a.brakes.map((b) => b.id)).toContain("price-top");
  });
  it("history phủ mọi điểm, dataDate = ngày cuối", () => {
    const a = runAccumulation(points);
    expect(a.history.length).toBe(points.length);
    expect(a.dataDate).toBe(points[points.length - 1].date);
  });
  it("provisional=true khi < warmup", () => {
    const a = runAccumulation(points.slice(0, 100));
    expect(a.provisional).toBe(true);
    expect(a.mult).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run src/lib/accumulation.test.ts`
Expected: FAIL ("Failed to resolve import './accumulation'").

- [ ] **Step 3: Viết engine `src/lib/accumulation.ts`**

```ts
/** Engine "Vùng tích lũy" — phanh DCA chống mua đỉnh. Chi tiết: docs/accumulation.md. */
import {
  ACCUM_CONFIG,
  type AccumConfig,
  type AccumBrake,
  type AccumPoint,
  type AccumulationAnalysis,
} from "./types";

/** Percentile giá[i] so `win` phiên ngay trước (past-only, 0..1). null nếu < warmup. */
export function pricePct2y(closes: number[], i: number, win = ACCUM_CONFIG.win): number | null {
  if (i < win) return null;
  const cur = closes[i];
  let below = 0;
  for (let j = i - win; j < i; j++) if (closes[j] <= cur) below++;
  return below / win;
}

/** Hệ số phanh ∈ {1,0.5,0.25,0.2}. Chỉ phanh (≤1), không bao giờ 0. */
export function accumMult(
  pricePct: number | null,
  composite: number,
  cfg: AccumConfig = ACCUM_CONFIG
): number {
  let m = 1;
  if (pricePct !== null && pricePct > cfg.expHi) m *= cfg.mExp;
  if (composite < cfg.compThr) m *= cfg.mComp;
  return Math.max(cfg.floor, m);
}

const fmtPct = (x: number) => Math.round(x * 100);

/** Các phanh đang bật + giải thích tiếng Việt. */
export function brakeDescriptors(
  pricePct: number | null,
  composite: number,
  cfg: AccumConfig = ACCUM_CONFIG
): AccumBrake[] {
  const out: AccumBrake[] = [];
  if (pricePct !== null && pricePct > cfg.expHi) {
    out.push({
      id: "price-top",
      label: "Giá đỉnh vùng 2 năm",
      explanation: `Giá đang ở percentile ${fmtPct(pricePct)}% của dải 2 năm (> ${fmtPct(
        cfg.expHi
      )}%): vùng đắt — ghìm mua ×${cfg.mExp}.`,
    });
  }
  if (composite < cfg.compThr) {
    out.push({
      id: "comp-bear",
      label: "Composite bi quan",
      explanation: `Điểm tổng hợp ${composite > 0 ? "+" : ""}${composite} < ${cfg.compThr}: xu hướng/định giá bất lợi — ghìm thêm ×${cfg.mComp}.`,
    });
  }
  return out;
}

/** Giá vốn TB realized rẻ hơn DCA phẳng (capital-weighted) trên các index mua. */
export function realizedCostImpr(
  closes: number[],
  composites: number[],
  buyIdxs: number[],
  cfg: AccumConfig = ACCUM_CONFIG
): number {
  let fV = 0,
    fL = 0,
    tV = 0,
    tL = 0;
  for (const i of buyIdxs) {
    const m = accumMult(pricePct2y(closes, i, cfg.win), composites[i], cfg);
    fV += 1;
    fL += 1 / closes[i];
    tV += m;
    tL += m / closes[i];
  }
  if (fL === 0 || tL === 0) return 0;
  const flat = fV / fL;
  const tilt = tV / tL;
  return (flat - tilt) / flat;
}

export function runAccumulation(
  points: AccumPoint[],
  cfg: AccumConfig = ACCUM_CONFIG
): AccumulationAnalysis {
  const closes = points.map((p) => p.price);
  const history = points.map((p, i) => {
    const pp = pricePct2y(closes, i, cfg.win);
    return { date: p.date, pricePct2y: pp, mult: accumMult(pp, p.composite, cfg) };
  });
  const last = points.length - 1;
  const pp = history[last]?.pricePct2y ?? null;
  const comp = points[last]?.composite ?? 0;
  return {
    generatedAt: new Date().toISOString(),
    dataDate: points[last]?.date ?? "",
    pricePct2y: pp,
    composite: comp,
    mult: history[last]?.mult ?? 1,
    brakes: brakeDescriptors(pp, comp, cfg),
    provisional: pp === null,
    history,
    note: "Phanh DCA chống mua đỉnh: ghìm khi giá đắt so dải 2 năm hoặc composite bi quan. Lan can chống FOMO, không phải máy đẻ vàng.",
  };
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run src/lib/accumulation.test.ts`
Expected: PASS (tất cả).

- [ ] **Step 5: Commit**

```bash
git add src/lib/accumulation.ts src/lib/accumulation.test.ts
git commit -m "feat(accumulation): engine thuần + test (pricePct2y/accumMult/runAccumulation)"
```

---

### Task 3: Monitor thoái hóa `scripts/monitor-accumulation.ts`

**Files:**
- Create: `scripts/monitor-accumulation.ts`
- Test: `scripts/monitor-accumulation.test.ts`

**Interfaces:**
- Consumes: `realizedCostImpr`, `pricePct2y`, `accumMult` (Task 2); `ACCUM_CONFIG`, `AccumPoint`, `AccumulationHealth` (Task 1).
- Produces: `monitorAccumulation(points: AccumPoint[]): AccumulationHealth`.

- [ ] **Step 1: Viết test thất bại**

Tạo `scripts/monitor-accumulation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { monitorAccumulation } from "./monitor-accumulation";
import type { AccumPoint } from "../src/lib/types";

// 3 năm dữ liệu tháng-ngày giả: warmup đủ + cửa sổ 2 năm gần nhất có phanh
function makePoints(n: number, priceAt: (i: number) => number): AccumPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2020-01-${String((i % 28) + 1).padStart(2, "0")}`.replace(/^(\d{4})-(\d{2})-(\d{2})$/, `2${String(2000 + Math.floor(i / 300)).slice(1)}-01-$3`),
    price: priceAt(i),
    composite: 0,
  }));
}

describe("monitorAccumulation", () => {
  it("insufficient khi quá ít điểm", () => {
    const pts: AccumPoint[] = Array.from({ length: 50 }, (_, i) => ({
      date: `d${i}`,
      price: 100 + i,
      composite: 0,
    }));
    expect(monitorAccumulation(pts).status).toBe("insufficient");
  });
  it("ok/degraded có giá trị recentImprPct khi đủ dữ liệu", () => {
    // tăng đều dài -> đủ warmup, ngày gần đây ở đỉnh -> có phanh
    const pts: AccumPoint[] = Array.from({ length: 1400 }, (_, i) => ({
      date: `2009-06-${String((i % 28) + 1).padStart(2, "0")}`,
      price: 100 + i,
      composite: 0,
    }));
    const h = monitorAccumulation(pts);
    expect(["ok", "degraded"]).toContain(h.status);
    expect(h.recentImprPct).not.toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run scripts/monitor-accumulation.test.ts`
Expected: FAIL ("Failed to resolve import './monitor-accumulation'").

- [ ] **Step 3: Viết `scripts/monitor-accumulation.ts`**

```ts
/** Giám sát lớp Vùng tích lũy ~2 năm gần nhất. Gọi trong run.ts; ghi accumulation-health.json. */
import { realizedCostImpr } from "../src/lib/accumulation";
import { ACCUM_CONFIG, type AccumPoint, type AccumulationHealth } from "../src/lib/types";

const STEP = 21; // nhịp DCA tháng
const MIN_RECENT = 12; // tối thiểu tháng gần đây để đánh giá

export function monitorAccumulation(points: AccumPoint[]): AccumulationHealth {
  const closes = points.map((p) => p.price);
  const composites = points.map((p) => p.composite);
  const dates = points.map((p) => p.date);
  const lastDate = dates.length ? dates[dates.length - 1] : "";
  const cutoff = lastDate
    ? new Date(new Date(lastDate).getTime() - 730 * 86400000).toISOString().slice(0, 10)
    : "";

  const monthly: number[] = [];
  for (let i = 0; i < points.length; i += STEP) monthly.push(i);
  const recent = monthly.filter((i) => dates[i] >= cutoff);
  const braked = recent.filter(
    (i) => accumMultLocal(closes, composites, i) < 1
  ).length;

  let status: "ok" | "degraded" | "insufficient" = "insufficient";
  let recentImprPct: number | null = null;
  if (recent.length >= MIN_RECENT && braked > 0) {
    const impr = realizedCostImpr(closes, composites, recent);
    recentImprPct = Math.round(impr * 1000) / 10;
    status = impr > 0 ? "ok" : "degraded";
  }
  return {
    generatedAt: new Date().toISOString(),
    recentImprPct,
    recentBrakedMonths: braked,
    status,
  };
}

// nội bộ: tránh import vòng — tái dùng realizedCostImpr cho 1 điểm để biết có phanh không
import { pricePct2y, accumMult } from "../src/lib/accumulation";
function accumMultLocal(closes: number[], composites: number[], i: number): number {
  return accumMult(pricePct2y(closes, i, ACCUM_CONFIG.win), composites[i]);
}
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run scripts/monitor-accumulation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/monitor-accumulation.ts scripts/monitor-accumulation.test.ts
git commit -m "feat(accumulation): monitor thoái hóa ~2 năm gần nhất"
```

---

### Task 4: Nối pipeline `scripts/run.ts`

**Files:**
- Modify: `scripts/run.ts`

**Interfaces:**
- Consumes: `runAccumulation` (Task 2), `monitorAccumulation` (Task 3), `AccumulationAnalysis`/`AccumulationHealth` (Task 1).
- Produces: `public/data/accumulation.json`, `public/data/accumulation-health.json`; enrich `timeline.points` với `accumMult` + `pricePct2y`.

- [ ] **Step 1: Thêm import**

Trong `scripts/run.ts`, sau dòng `import { monitorBottom, type BottomHealth } from "./monitor-bottom";` thêm:

```ts
import { runAccumulation } from "../src/lib/accumulation";
import { monitorAccumulation } from "./monitor-accumulation";
import type { AccumPoint } from "../src/lib/types";
```

- [ ] **Step 2: Tính accumulation + enrich timeline (sau `forwardFillBottomHistory(...)`, trước `const bottomHealth`)**

Chèn:

```ts
  // --- Lớp Vùng tích lũy (phanh DCA). Dùng composite + giá của timeline (world composite).
  const accumPoints: AccumPoint[] = timeline.points.map((pt) => ({
    date: pt.date,
    price: pt.price,
    composite: pt.composite,
  }));
  const accumulation = runAccumulation(accumPoints);
  // enrich timeline cho Time Machine (merge theo NGÀY như cycleBin)
  const accumByDate = new Map(accumulation.history.map((h) => [h.date, h]));
  for (const pt of timeline.points) {
    const a = accumByDate.get(pt.date);
    if (a) {
      pt.accumMult = a.mult;
      pt.pricePct2y = a.pricePct2y;
    }
  }
  const accumulationHealth = monitorAccumulation(accumPoints);
```

- [ ] **Step 3: Ghi 2 file JSON (sau dòng `writeFileSync(... "bottom-health.json" ...)`)**

Chèn:

```ts
  writeFileSync(join(DATA_DIR, "accumulation.json"), JSON.stringify(accumulation, null, 1));
  writeFileSync(
    join(DATA_DIR, "accumulation-health.json"),
    JSON.stringify(accumulationHealth, null, 1)
  );
```

- [ ] **Step 4: Thêm vào dòng log OK (tùy chọn, hữu ích)**

Sửa template log cuối `main()` — thêm vào cuối chuỗi trước backtick đóng:
` accumMult=${accumulation.mult} pricePct2y=${accumulation.pricePct2y}`

- [ ] **Step 5: Chạy collect để sinh file + kiểm tra**

Run: `npm run collect`
Expected: chạy xong, in dòng OK có `accumMult=...`; tạo `public/data/accumulation.json` và `accumulation-health.json`.

- [ ] **Step 6: Xác nhận timeline có field mới**

Run: `node -e "const t=require('./public/data/timeline.json');const p=t.points[t.points.length-1];console.log('accumMult',p.accumMult,'pricePct2y',p.pricePct2y)"`
Expected: in ra số (không undefined).

- [ ] **Step 7: Commit**

```bash
git add scripts/run.ts public/data/accumulation.json public/data/accumulation-health.json public/data/timeline.json
git commit -m "feat(accumulation): nối vào pipeline collect + enrich timeline"
```

---

### Task 5: UI — card + nối Dashboard/page

**Files:**
- Create: `src/components/AccumulationCard.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `AccumulationAnalysis`, `AccumulationHealth`, `ACCUM_CONFIG` (Task 1); file JSON (Task 4).
- Produces: component `<AccumulationCard accumulation={...} health={...} />`; accordion mới trong Dashboard.

- [ ] **Step 1: Viết `src/components/AccumulationCard.tsx`**

```tsx
"use client";
import { ACCUM_CONFIG, type AccumulationAnalysis, type AccumulationHealth } from "@/lib/types";

const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

export default function AccumulationCard({
  accumulation,
  health,
}: {
  accumulation: AccumulationAnalysis;
  health: AccumulationHealth;
}) {
  const a = accumulation;
  const ev = ACCUM_CONFIG.evidence;
  const ppNum = a.pricePct2y === null ? 0 : Math.round(a.pricePct2y * 100);
  const verdict =
    a.mult >= 1
      ? `Vùng thường (${pct(a.pricePct2y)}) — mua đều ×1`
      : `${a.pricePct2y !== null && a.pricePct2y > ACCUM_CONFIG.expHi ? "Đỉnh vùng 2 năm" : "Bất lợi"} (${pct(
          a.pricePct2y
        )}) — ghìm mua ×${a.mult}`;
  const cls = a.mult >= 1 ? "buy" : a.mult <= 0.25 ? "sell" : "neutral";

  return (
    <section className="card">
      <div className="card-head">
        <h2>Vùng tích lũy — phanh DCA chống mua đỉnh</h2>
      </div>
      <p className="muted small">
        DCA đều, nhưng ghìm khối lượng (không bao giờ về 0) khi vàng đắt bất thường so với dải 2 năm
        hoặc composite bi quan. Lan can chống FOMO mua đỉnh — KHÔNG phải máy đẻ vàng.
      </p>

      {health.status === "degraded" && (
        <div className="banner warn">
          ⚠ Lớp Vùng tích lũy đang mất hiệu quả trên ~2 năm gần nhất (cải thiện {health.recentImprPct}%,
          kiểm tra tự động mỗi cron) — cân nhắc bỏ qua gợi ý phanh.
        </div>
      )}

      {a.provisional ? (
        <div className="muted small">Chưa đủ 2 năm dữ liệu để chấm — chưa kích hoạt phanh.</div>
      ) : (
        <>
          <div className={`bottom-gauge-pct ${cls}`}>{verdict}</div>
          <div className="bottom-gauge-bar">
            <div className="bottom-gauge-fill neutral" style={{ width: `${ppNum}%` }} />
          </div>
          <div className="gauge-scale">
            <span>0 rẻ</span>
            <span>phanh ở {pct(ACCUM_CONFIG.expHi)}</span>
            <span>đắt 100</span>
          </div>
          {a.brakes.length > 0 && (
            <ul className="signals">
              {a.brakes.map((b) => (
                <li key={b.id}>
                  <div>
                    <div className="sig-label">{b.label}</div>
                    <div className="sig-expl">{b.explanation}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="verdict-bt muted">
            Kiểm chứng: phanh này hạ giá vốn trung bình +{ev.trainImprPct}% (2009–2018, CI{" "}
            {ev.trainCi[0]}–{ev.trainCi[1]}%) / +{ev.testImprPct}% (2019–2026, CI {ev.testCi[0]}–
            {ev.testCi[1]}%). Lưu ý: số 2019–2026 bị sóng tăng tô hồng; biên lợi chế độ thường ~2% có
            thể trong tầm spread mua-bán vật chất.
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Nối `src/app/page.tsx`**

Sau dòng `import fusionHealthJson from "../../public/data/fusion-health.json";` thêm:

```ts
import accumulationJson from "../../public/data/accumulation.json";
import accumulationHealthJson from "../../public/data/accumulation-health.json";
```

Sửa dòng import type để thêm 2 type:

```ts
import type { Analysis, Backtest, BottomAnalysis, FusionHealthFile, PresetHealthFile, Timeline, AccumulationAnalysis, AccumulationHealth } from "@/lib/types";
```

Trong thân `Home()`, sau `const fusionHealth = ...` thêm:

```ts
  const accumulation = accumulationJson as unknown as AccumulationAnalysis;
  const accumulationHealth = accumulationHealthJson as unknown as AccumulationHealth;
```

Sửa JSX trả về thêm 2 prop:

```tsx
    <Dashboard analysis={analysis} backtest={backtest} timeline={timeline} health={health} bottom={bottom} fusionHealth={fusionHealth} accumulation={accumulation} accumulationHealth={accumulationHealth} />
```

- [ ] **Step 3: Nối `src/components/Dashboard.tsx`**

Thêm import (sau `import BottomGauges from "./BottomGauges";`):

```ts
import AccumulationCard from "./AccumulationCard";
```

Thêm 2 type vào khối import từ `@/lib/types` (thêm tên `AccumulationAnalysis, AccumulationHealth`).

Sửa chữ ký props của `Dashboard` — thêm vào object destructure và type:

```ts
  accumulation,
  accumulationHealth,
}: {
  analysis: Analysis;
  backtest: Backtest;
  timeline: Timeline;
  health: PresetHealthFile;
  bottom: BottomAnalysis;
  fusionHealth: FusionHealthFile;
  accumulation: AccumulationAnalysis;
  accumulationHealth: AccumulationHealth;
}) {
```

Thêm accordion mới ngay SAU accordion "Săn đáy" (sau thẻ `</details>` của ACCORDION 5, trước ACCORDION 6 Máy thời gian):

```tsx
      {/* ── ACCORDION: Vùng tích lũy (DCA) ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Vùng tích lũy (DCA)</span>
            <span className="acc-sum-meta">phanh chống mua đỉnh 2 năm</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <AccumulationCard accumulation={accumulation} health={accumulationHealth} />
        </div>
      </details>
```

- [ ] **Step 4: Kiểm tra build**

Run: `npm run build`
Expected: build tĩnh thành công, không lỗi type.

- [ ] **Step 5: Commit**

```bash
git add src/components/AccumulationCard.tsx src/app/page.tsx src/components/Dashboard.tsx
git commit -m "feat(accumulation): card UI + accordion Vùng tích lũy"
```

---

### Task 6: Tích hợp Time Machine

**Files:**
- Modify: `src/components/TimeMachine.tsx`

**Interfaces:**
- Consumes: `point.accumMult`, `point.pricePct2y` (Task 4 enrich).

- [ ] **Step 1: Thêm dòng phanh DCA as-of-ngày sau khối `tm-dateband`**

Trong `src/components/TimeMachine.tsx`, ngay SAU thẻ đóng `</div>` của `<div className="tm-dateband">…</div>` (trước khối `{highConfDay && (`), chèn:

```tsx
      {p.accumMult !== undefined && (
        <div className="muted small">
          DCA tích lũy:{" "}
          <b className={p.accumMult >= 1 ? "buy" : p.accumMult <= 0.25 ? "sell" : "neutral"}>
            ×{p.accumMult}
          </b>
          {p.pricePct2y != null && ` · giá ở ${Math.round(p.pricePct2y * 100)}% dải 2 năm`}
          {p.accumMult < 1 ? " — ghìm mua" : " — mua đều"}
        </div>
      )}
```

- [ ] **Step 2: Kiểm tra build**

Run: `npm run build`
Expected: thành công.

- [ ] **Step 3: Xác minh thủ công (tùy chọn nhưng nên làm)**

Run: `npm run dev`, mở Máy thời gian, tua tới một ngày đỉnh 2 năm (vd cuối 2011 hoặc 2020) → thấy dòng "DCA tích lũy: ×0.25 · giá ở >75% dải 2 năm — ghìm mua".

- [ ] **Step 4: Commit**

```bash
git add src/components/TimeMachine.tsx
git commit -m "feat(accumulation): hiển thị hệ số phanh as-of-ngày trong Time Machine"
```

---

### Task 7: Tài liệu `docs/accumulation.md`

**Files:**
- Create: `docs/accumulation.md`
- Modify: `CLAUDE.md` (thêm 1 dòng study + 1 dòng nguồn lớp)

**Interfaces:** không có code; doc evidence phải khớp `ACCUM_CONFIG`.

- [ ] **Step 1: Viết `docs/accumulation.md`**

```markdown
# Vùng tích lũy — phanh DCA chống mua đỉnh: phương pháp & bằng chứng

Cập nhật: 2026-06-20. Sinh bởi `scripts/accumulation-study.ts` trên dữ liệu thật.

Lớp **độc lập**, KHÔNG đụng composite mua/bán hay Bottom Hunter. Trả lời câu hỏi riêng:
**"gom bây giờ có hạ giá vốn trung bình 2–3 năm không?"** — bằng cách ghìm khối lượng DCA
(không bao giờ về 0) khi vàng đắt bất thường so với dải 2 năm hoặc composite bi quan.

## Thước đo

Giá MUA trung bình mỗi lượng (capital-weighted = ΣVND/Σlượng) của DCA-phanh vs DCA phẳng.
Chỉ dùng dữ liệu TẠI thời điểm mua (percentile trailing past-only + composite as-of) → không
forward-return, không pseudo-replication. Giá vốn thấp hơn = nhiều lượng/VND hơn = tốt.

## Cấu hình chốt (B)

| Tham số | Giá trị |
| --- | --- |
| Cửa sổ percentile | 504 phiên (≈2 năm) |
| Phanh khi giá | > percentile 75 → ×0.25 |
| Phanh khi composite | < −30 → ×0.5 |
| Sàn hệ số | 0.2 |

Evidence (cổng 2 giai đoạn, CI block-bootstrap):

| Giai đoạn | Cải thiện giá vốn | CI95 | Số tháng phanh |
| --- | --- | --- | --- |
| train 2009–2018 | +2.26% | [0.63%, 4.27%] | 32 |
| test 2019–2026 | +8.24% | [2.55%, 13.76%] | 65 |
| placebo (phanh ngẫu nhiên cùng số tháng) | ≈0 | — | — |

48/54 cấu hình lưới vượt cổng 2 giai đoạn. Winner thuần min-excess (A: đắt>0.6) phanh gần
như mọi tháng; chọn B (đắt>0.75) để ship vì trực giác hơn, CI chồng nhau.

## Giới hạn — đọc kỹ

1. Cận dưới CI train +0.63% — mỏng; chế độ phẳng/gấu lợi ích có thể ~0.6%, trong tầm spread
   mua-bán SJC vật chất. Đây là lan can chống FOMO, không phải máy đẻ vàng.
2. Số test +8% bị sóng tăng 2019–26 tô hồng — số train (~2%) đáng tin hơn.
3. Phanh-chỉ: mua ít hơn lúc đắt → giá vốn thấp hơn, đổi lại gom được ít vàng hơn lúc đắt.
4. Cheapness của XAU thế giới, không phải SJC. Premium VN không trong mô hình (như composite/bottom).
5. Cấu hình chọn khi biết test (như presets/bottom); `scripts/monitor-accumulation.ts` giám sát thoái hóa live.

## Đã LOẠI bằng bằng chứng (KHÔNG tái thêm khi chưa chạy lại study)

| Hướng | Kết quả | Phán quyết |
| --- | --- | --- |
| BOOST (gom mạnh khi rẻ/đáy) | train yếu/âm | LOẠI — chỉ giữ nửa BRAKE |
| Bottom Hunter làm booster | train −2.15% | LOẠI |
| Real-yield (DFII10) làm neo định giá | test +10.7% nhưng train âm | NO-GO — overfit bull (hồ sơ `scripts/accumulation-ryield.ts`) |
| Cửa sổ 3/4/5 năm | dương nhưng yếu hơn 2 năm | chọn 2 năm |

## Tái lập

```bash
npm run collect
npx tsx scripts/accumulation-study.ts    # tuyển config + cổng 2 giai đoạn + CI + placebo
npx tsx scripts/accumulation-ryield.ts   # hồ sơ NO-GO real-yield (cần mạng)
```

`ACCUM_CONFIG` khai báo tại `src/lib/types.ts` — số evidence trong code phải khớp doc này.
```

- [ ] **Step 2: Cập nhật `CLAUDE.md`**

Trong mục "Key commands", thêm vào danh sách Studies: `accumulation-study` (tuyển phanh DCA, cổng 2 giai đoạn + CI + placebo).

Trong "Scoring engine", sau đoạn mô tả Bottom Hunter, thêm:

```markdown
An independent **Accumulation brake** layer (DCA sizing: ease off buying — never to zero — when XAU is expensive vs its trailing 2-year range or composite is bearish; validated 2-period, see `docs/accumulation.md`) suggests a buy-size multiplier and does NOT touch the composite or Bottom Hunter.
```

- [ ] **Step 3: Commit**

```bash
git add docs/accumulation.md CLAUDE.md
git commit -m "docs(accumulation): phương pháp + evidence + bảng NO-GO"
```

---

## Self-Review

**Spec coverage:**
- §2 config khóa + evidence → Task 1 (ACCUM_CONFIG) + Task 7 (doc).
- §3.1 core engine → Task 2. §3.2 types → Task 1. §3.3 pipeline → Task 4. §3.4 monitor → Task 3. §3.5 study → đã có (commit trước). 
- §4 UI accordion + Time Machine → Task 5 + Task 6.
- §5 testing → Task 2 (past-only, bounds, golden shape) + Task 3 (monitor status).
- §6 rejected/out-of-scope → Task 7 bảng NO-GO.
- §7 docs/accumulation.md → Task 7.

**Placeholder scan:** không có TODO/TBD; mọi step có code/lệnh cụ thể.

**Type consistency:** `runAccumulation(points)`, `accumMult(pricePct, composite)`, `pricePct2y(closes,i,win)`, `realizedCostImpr(closes,composites,buyIdxs)`, `monitorAccumulation(points)` nhất quán giữa Task 2/3/4. `TimelinePoint.accumMult/pricePct2y` (Task 1) khớp dùng ở Task 4 (ghi) và Task 6 (đọc). `AccumulationHealth.recentImprPct/status` (Task 1) khớp Task 3 + Task 5 (banner).
