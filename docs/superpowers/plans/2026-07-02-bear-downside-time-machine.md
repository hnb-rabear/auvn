# Bear Downside Time Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the "Triển vọng 1/3/6 tháng tới" card (BearDownsideCard) a standalone time slider that shows the walk-forward as-of distribution the card WOULD have shown on any past day, side-by-side with what ACTUALLY happened from that day, plus two-faced ✓/✗ verdicts.

**Architecture:** All computed at collection time (repo-is-database, Approach A). New `runBearDownsideHistory(bars)` emits per-day as-of bands on the sparse STEP=3 grid from the same `bars` array the live engine uses; forward-filled onto `timeline.points` in `scripts/run.ts` (mirrors `forwardFillBottomHistory`). Card reads `points[X].bearAsOf` for the band and computes actual outcomes client-side from point prices.

**Tech Stack:** TypeScript, Next.js 15 (static export), React 19, vitest. No new deps.

## Global Constraints

- UI language: Vietnamese. Signal/explanation strings are user-facing Vietnamese, not codes.
- No paid infra; everything runs on free tiers. No new dependencies.
- Independent layer: MUST NOT touch composite, Bottom Hunter, Bear DCA, or Accumulation brake.
- No look-ahead: as-of band at day X uses only matured windows `j+H≤X`; dd uses `prices[0..X]`.
- Respect sparse-stats / dense-display split: as-of bands sampled on STEP=3 grid; price + actual outcomes on the dense per-session grid.
- `STEP=3`, `MIN_N=30`, `HORIZONS=[21,63,126]` — reuse existing constants from `src/lib/bear-downside.ts`, do not redefine.
- New `TimelinePoint` fields optional (old `timeline.json` must still load).
- Round stored numbers to 1 decimal.

---

### Task 1: Types for as-of band

**Files:**
- Modify: `src/lib/types.ts` (add interfaces near `BearDownsideAnalysis` ~line 533; add field to `TimelinePoint` ~line 127-151)

**Interfaces:**
- Produces: `BearAsOfBand { median, p10, endMedian, pUp, n: number }`; `BearAsOfRow { date: string; bands: Record<"21"|"63"|"126", BearAsOfBand | null> }`; `TimelinePoint.bearAsOf?: Record<"21"|"63"|"126", BearAsOfBand | null>`.

- [ ] **Step 1: Add the interfaces**

In `src/lib/types.ts`, near the other Bear Downside types:

```ts
/** Một dải Bear Downside as-of-ngày (walk-forward). CI bỏ vì card không hiển thị. */
export interface BearAsOfBand {
  median: number;    // đáy điển hình (worst-dip) %
  p10: number;       // đuôi 1/10 rủi ro %
  endMedian: number; // kết cục điển hình % tại mốc
  pUp: number;       // % lần giá cao hơn hôm nay
  n: number;
}

/** Dải as-of của một ngày lưới thưa, mọi horizon. band=null khi n<MIN_N. */
export interface BearAsOfRow {
  date: string;
  bands: Record<"21" | "63" | "126", BearAsOfBand | null>;
}
```

- [ ] **Step 2: Add optional field to `TimelinePoint`**

In `interface TimelinePoint`, after `pricePct2y`:

```ts
  /** Dải Bear Downside as-of-ngày (walk-forward, forward-fill lưới thưa). undefined = timeline.json cũ; band từng H = null khi chưa đủ mẫu. */
  bearAsOf?: Record<"21" | "63" | "126", BearAsOfBand | null>;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no usages yet, just declarations).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(bear-downside): add BearAsOfBand/Row types + TimelinePoint.bearAsOf"
```

---

### Task 2: `runBearDownsideHistory` producer

**Files:**
- Modify: `src/lib/bear-downside.ts` (add export; reuse existing `furtherDrawdownPct`, `terminalReturnPct`, `computeHorizonStat`, `STEP`, `MIN_N`, `HORIZONS`)
- Test: `src/lib/bear-downside.test.ts` (append)

**Interfaces:**
- Consumes: `bars: { date: string; close: number }[]`.
- Produces: `runBearDownsideHistory(bars): BearAsOfRow[]` — one row per sparse-grid day (indices `0, STEP, 2·STEP, …` plus forced last index), each `bands[H]` = as-of unconditional band over matured samples `j` (multiples of STEP, `j+H ≤ X`), or `null` if `n<MIN_N`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/bear-downside.test.ts`:

```ts
import { runBearDownsideHistory } from "./bear-downside";

describe("runBearDownsideHistory", () => {
  // chuỗi tăng dần có nhịp dúi định kỳ để có mẫu cả hai phía
  const bars = Array.from({ length: 900 }, (_, i) => ({
    date: `2020-${String(1 + Math.floor(i / 300)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`,
    close: 1000 + i - (i % 30 === 0 ? 50 : 0),
  }));

  it("phát 1 dòng mỗi ngày lưới thưa + ép index cuối", () => {
    const rows = runBearDownsideHistory(bars);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].date).toBe(bars[bars.length - 1].date); // ép ngày cuối
    // ngày sớm chưa đủ mẫu đáo hạn -> band null
    expect(rows[0].bands["126"]).toBeNull();
  });

  it("GOLDEN: dải as-of ngày cuối === runBearDownside(bars).unconditional (5 trường)", () => {
    const rows = runBearDownsideHistory(bars);
    const last = rows[rows.length - 1];
    const uncond = runBearDownside(bars).unconditional; // BearHorizonStat[]
    for (const H of [21, 63, 126] as const) {
      const band = last.bands[H];
      const u = uncond.find((s) => String(s.horizonDays) === H)!;
      expect(band).not.toBeNull();
      expect(band!.median).toBeCloseTo(u.median, 6);
      expect(band!.p10).toBeCloseTo(u.p10, 6);
      expect(band!.endMedian).toBeCloseTo(u.endMedian, 6);
      expect(band!.pUp).toBeCloseTo(u.pUp, 6);
      expect(band!.n).toBe(u.n);
    }
  });

  it("không look-ahead: n của dải as-of không giảm theo thời gian", () => {
    const rows = runBearDownsideHistory(bars).filter((r) => r.bands["21"] !== null);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].bands["21"]!.n).toBeGreaterThanOrEqual(rows[i - 1].bands["21"]!.n);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/bear-downside.test.ts -t runBearDownsideHistory`
Expected: FAIL — `runBearDownsideHistory is not a function`.

- [ ] **Step 3: Implement the producer**

First extend the existing top-of-file type import (line 4) — do NOT add a mid-file import:

```ts
import { BEAR_DOWNSIDE_CONFIG, type BearHorizonStat, type BearDownsideAnalysis, type BearBucketStat, type BearDownsideConfig, type BearAsOfRow, type BearAsOfBand } from "./types";
```

Then append the function to `src/lib/bear-downside.ts`:

```ts
/**
 * Dải Bear Downside as-of từng ngày (walk-forward). Lưới thưa STEP để chống
 * pseudo-replication; mẫu chỉ tính khi đã đáo hạn as-of ngày đó (j+H ≤ X).
 * Vô-điều-kiện (conditioning đã bị bác). Byte-đồng nhất runBearDownside ở ngày cuối.
 */
export function runBearDownsideHistory(bars: { date: string; close: number }[]): BearAsOfRow[] {
  const closes = bars.map((b) => b.close);
  const dates = bars.map((b) => b.date);
  const n = closes.length;
  if (n === 0) return [];

  // các ngày X phát dải: bội STEP + ép index cuối (như statIdxs của backtest)
  const gridX: number[] = [];
  for (let i = 0; i < n; i += STEP) gridX.push(i);
  if (gridX[gridX.length - 1] !== n - 1) gridX.push(n - 1);

  const toBand = (dips: number[], terms: number[], H: number): BearAsOfBand | null => {
    if (dips.length < MIN_N) return null;
    const s = computeHorizonStat(dips, H, terms);
    return { median: s.median, p10: s.p10, endMedian: s.endMedian, pUp: s.pUp, n: s.n };
  };

  return gridX.map((X) => {
    const bands = {} as Record<"21" | "63" | "126", BearAsOfBand | null>;
    HORIZONS.forEach((H) => {
      const dips: number[] = [];
      const terms: number[] = [];
      for (let j = 0; j <= X; j += STEP) {
        if (j + H > X) continue; // chỉ mẫu đã đáo hạn as-of X
        const fd = furtherDrawdownPct(closes, j, H);
        if (fd === null) continue;
        dips.push(fd);
        const tr = terminalReturnPct(closes, j, H);
        if (tr !== null) terms.push(tr);
      }
      bands[String(H) as "21" | "63" | "126"] = toBand(dips, terms, H);
    });
    return { date: dates[X], bands };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/bear-downside.test.ts -t runBearDownsideHistory`
Expected: PASS (all 3).

Note if GOLDEN fails: the boundary in `runBearDownside` skips samples where `i+H >= closes.length` ([bear-downside.ts:27](../../../src/lib/bear-downside.ts#L27)). As-of `X=n-1`, `j+H ≤ n-1` ⇔ `j+H < n` — identical set. Do not change either boundary; they must match.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bear-downside.ts src/lib/bear-downside.test.ts
git commit -m "feat(bear-downside): runBearDownsideHistory walk-forward as-of bands + golden test"
```

---

### Task 3: `forwardFillBearAsOf` merge helper

**Files:**
- Modify: `src/lib/timeline.ts` (add export, mirrors `forwardFillBottomHistory` at [timeline.ts:68](../../../src/lib/timeline.ts#L68))
- Test: `src/lib/timeline.test.ts` (create)

**Interfaces:**
- Consumes: `points: TimelinePoint[]`, `rows: BearAsOfRow[]`.
- Produces: `forwardFillBearAsOf(points, rows): void` — mutates each point, snapping to the nearest row with `date ≤ point.date`; sets `pt.bearAsOf = row.bands`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/timeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { forwardFillBearAsOf } from "./timeline";
import type { TimelinePoint, BearAsOfRow } from "./types";

const pt = (date: string): TimelinePoint => ({
  date, price: 1, composite: 0, zone: "neutral", scores: {},
  returns: { "21": null, "63": null, "126": null },
});
const band = { median: -3, p10: -8, endMedian: 5, pUp: 60, n: 100 };

describe("forwardFillBearAsOf", () => {
  it("snap nút gần nhất ≤ ngày; ngày trước nút đầu để undefined", () => {
    const points = [pt("2020-01-01"), pt("2020-01-05"), pt("2020-01-10")];
    const rows: BearAsOfRow[] = [
      { date: "2020-01-05", bands: { "21": band, "63": null, "126": null } },
    ];
    forwardFillBearAsOf(points, rows);
    expect(points[0].bearAsOf).toBeUndefined();          // trước nút đầu
    expect(points[1].bearAsOf!["21"]).toEqual(band);     // đúng nút
    expect(points[2].bearAsOf!["21"]).toEqual(band);     // forward-fill
  });

  it("rỗng history: không đụng points", () => {
    const points = [pt("2020-01-01")];
    forwardFillBearAsOf(points, []);
    expect(points[0].bearAsOf).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timeline.test.ts`
Expected: FAIL — `forwardFillBearAsOf is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/lib/timeline.ts`: extend the type import and add the function after `forwardFillBottomHistory`:

```ts
import type { CriterionKey, TimelinePoint, BottomHistoryRow, BearAsOfRow } from "./types";
```

```ts
/** Forward-fill dải Bear Downside as-of lên timeline (snap nút gần nhất ≤ ngày). */
export function forwardFillBearAsOf(points: TimelinePoint[], rows: BearAsOfRow[]): void {
  if (!rows.length) return;
  let h = 0;
  for (const pt of points) {
    while (h + 1 < rows.length && rows[h + 1].date <= pt.date) h++;
    if (rows[h].date <= pt.date) pt.bearAsOf = rows[h].bands;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/timeline.test.ts`
Expected: PASS (both).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline.ts src/lib/timeline.test.ts
git commit -m "feat(bear-downside): forwardFillBearAsOf timeline merge helper"
```

---

### Task 4: Wire producer into collection pipeline

**Files:**
- Modify: `scripts/run.ts` (~line 314, after `runBearDownside(xauRes.bars)`)

**Interfaces:**
- Consumes: `runBearDownsideHistory` (Task 2), `forwardFillBearAsOf` (Task 3), `xauRes.bars`.
- Produces: `timeline.points[*].bearAsOf` populated in the committed `timeline.json`.

- [ ] **Step 1: Add imports**

Ensure `scripts/run.ts` imports both symbols (extend existing import lines):

```ts
import { runBearDownside, runBearDownsideHistory } from "../src/lib/bear-downside";
import { forwardFillBottomHistory, forwardFillBearAsOf } from "../src/lib/timeline";
```

(Adjust to match the file's actual existing import style — `runBearDownside` and `forwardFillBottomHistory` are already imported; add the new names to those same statements.)

- [ ] **Step 2: Call producer + fill after `runBearDownside`**

Right after the `const bearDownside: BearDownsideAnalysis = runBearDownside(xauRes.bars);` line ([run.ts:314](../../../scripts/run.ts#L314)):

```ts
  // Làm giàu timeline bằng dải Bear Downside as-of (walk-forward) cho máy thời gian card Triển Vọng.
  forwardFillBearAsOf(timeline.points, runBearDownsideHistory(xauRes.bars));
```

- [ ] **Step 3: Run collection end-to-end**

Run: `npm run collect`
Expected: completes; `data/timeline.json` regenerated.

- [ ] **Step 4: Verify field present in output**

Run: `node -e "const t=require('./data/timeline.json'); const p=t.points[t.points.length-1]; console.log(JSON.stringify(p.bearAsOf));"`
Expected: prints an object with keys `21/63/126`, each a band object or `null` (not `undefined`).

- [ ] **Step 5: Run full test + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/run.ts data/timeline.json
git commit -m "feat(bear-downside): populate timeline.bearAsOf in collection pipeline"
```

---

### Task 5: Pure view helpers for the card

**Files:**
- Create: `src/lib/bear-downside-view.ts`
- Test: `src/lib/bear-downside-view.test.ts`

**Interfaces:**
- Consumes: `furtherDrawdownPct` (from `bear-downside.ts`), `BearAsOfBand` type.
- Produces:
  - `ddAsOfPct(prices: number[], X: number): number` — % dưới ATH của `prices[0..X]` (dương, ví dụ 12.3 nghĩa −12.3% dưới đỉnh).
  - `actualWorstDipPct(prices: number[], X: number, H: number): number | null` — `min(prices[X+1..X+H])/prices[X]-1` (%); null nếu `X+H ≥ prices.length`.
  - `verdict(actual: number | null, threshold: number | null): "right" | "wrong" | null` — `right` nếu `actual ≥ threshold`, `wrong` nếu thấp hơn, `null` nếu thiếu đầu vào. Dùng cho CẢ đáy (actual dip vs p10) và kết cục (actual terminal vs endMedian).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/bear-downside-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ddAsOfPct, actualWorstDipPct, verdict } from "./bear-downside-view";

describe("ddAsOfPct", () => {
  it("dùng ATH tới X, không nhìn tương lai", () => {
    const prices = [100, 120, 90, 200]; // tại X=2: ATH(100,120,90)=120, dd=(120-90)/120=25%
    expect(ddAsOfPct(prices, 2)).toBeCloseTo(25, 6);
  });
  it("0 khi đang ở đỉnh", () => {
    expect(ddAsOfPct([100, 120], 1)).toBeCloseTo(0, 6);
  });
});

describe("actualWorstDipPct", () => {
  it("đáy tệ nhất H phiên tới so hôm nay", () => {
    const prices = [100, 90, 95, 80];
    expect(actualWorstDipPct(prices, 0, 3)!).toBeCloseTo(-20, 6); // min(90,95,80)=80
  });
  it("null khi chưa đáo hạn", () => {
    expect(actualWorstDipPct([100, 90], 0, 5)).toBeNull();
  });
});

describe("verdict", () => {
  it("right khi actual ≥ ngưỡng (đáy không thủng p10)", () => {
    expect(verdict(-5, -8)).toBe("right");   // -5 ≥ -8
    expect(verdict(-9, -8)).toBe("wrong");   // thủng đuôi
  });
  it("right khi kết cục ≥ endMedian", () => {
    expect(verdict(12, 5)).toBe("right");
    expect(verdict(2, 5)).toBe("wrong");
  });
  it("null khi thiếu đầu vào", () => {
    expect(verdict(null, -8)).toBeNull();
    expect(verdict(-5, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/bear-downside-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/bear-downside-view.ts`:

```ts
// src/lib/bear-downside-view.ts
/** Helper thuần cho máy thời gian card Triển Vọng — không React, dễ test. */
import { furtherDrawdownPct } from "./bear-downside";

/** % dưới đỉnh (ATH) tính tới ngày X, không nhìn tương lai. Trả số dương. */
export function ddAsOfPct(prices: number[], X: number): number {
  let ath = -Infinity;
  for (let i = 0; i <= X && i < prices.length; i++) if (prices[i] > ath) ath = prices[i];
  if (ath <= 0) return 0;
  return ((ath - prices[X]) / ath) * 100;
}

/** Đáy tệ nhất thực tế H phiên sau X: min(prices[X+1..X+H])/prices[X]-1 (%). null nếu chưa đáo hạn. */
export function actualWorstDipPct(prices: number[], X: number, H: number): number | null {
  return furtherDrawdownPct(prices, X, H);
}

/** right nếu actual ≥ threshold; wrong nếu thấp hơn; null nếu thiếu đầu vào. */
export function verdict(actual: number | null, threshold: number | null): "right" | "wrong" | null {
  if (actual === null || threshold === null) return null;
  return actual >= threshold ? "right" : "wrong";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/bear-downside-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bear-downside-view.ts src/lib/bear-downside-view.test.ts
git commit -m "feat(bear-downside): pure view helpers (ddAsOf, actualWorstDip, verdict)"
```

---

### Task 6: Card UI — slider + as-of vs actual table

**Files:**
- Modify: `src/components/BearDownsideCard.tsx` (add `timeline` prop, day state, slider, rebuilt table)
- Modify: `src/components/Dashboard.tsx:586` (pass `timeline`)

**Interfaces:**
- Consumes: `bd: BearDownsideAnalysis`, `timeline: Timeline`; helpers `ddAsOfPct`, `actualWorstDipPct`, `verdict` (Task 5); `points[X].bearAsOf` (Tasks 1-4).
- Produces: no downstream consumers (leaf component).

- [ ] **Step 1: Pass `timeline` from Dashboard**

In `src/components/Dashboard.tsx`, change line 586:

```tsx
          <BearDownsideCard bd={bearDownside} timeline={timeline} />
```

- [ ] **Step 2: Rewrite the card**

Replace the whole body of `src/components/BearDownsideCard.tsx` with:

```tsx
"use client";
import { useMemo, useState } from "react";
import type { BearDownsideAnalysis, BearAsOfBand, Timeline } from "@/lib/types";
import { ddAsOfPct, actualWorstDipPct, verdict } from "@/lib/bear-downside-view";

const HLABEL: Record<string, string> = { "21": "1 tháng", "63": "3 tháng", "126": "6 tháng" };
const HS = ["21", "63", "126"] as const;
const fmt1 = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const signed = (n: number) => `${n >= 0 ? "+" : ""}${fmt1(n)}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("vi-VN")}`;
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function Mark({ v }: { v: "right" | "wrong" | null }) {
  if (v === "right") return <span className="tm-verdict buy"> ✓</span>;
  if (v === "wrong") return <span className="tm-verdict sell"> ✗</span>;
  return null;
}

/** Một hàng kỳ hạn: card-lúc-đó (as-of) | thực tế | ✓/✗ hai mặt. */
function Row({ H, band, price, actualDip, actualTerm }: {
  H: (typeof HS)[number];
  band: BearAsOfBand | null;
  price: number;
  actualDip: number | null;
  actualTerm: number | null;
}) {
  const label = HLABEL[H];
  if (!band) {
    return (<tr><td>{label}</td><td className="muted" colSpan={3}>chưa đủ dữ liệu</td></tr>);
  }
  const at = (pct: number) => usd(price * (1 + pct / 100));
  const notMatured = actualDip === null;
  return (
    <tr>
      <td>{label}</td>
      <td>
        {at(band.median)} <span className="down">({signed(band.median)})</span>
        <span className="muted small"> · kết {signed(band.endMedian)} · lên {fmt1(band.pUp)}%</span>
      </td>
      <td>
        {notMatured ? <span className="muted">chưa đáo hạn</span> : (
          <>
            <span className="down">{signed(actualDip!)}</span>
            {actualTerm !== null && <> · <span className={actualTerm >= 0 ? "up" : "down"}>{signed(actualTerm)}</span></>}
          </>
        )}
      </td>
      <td>
        <Mark v={verdict(actualDip, band.p10)} />
        <Mark v={verdict(actualTerm, band.endMedian)} />
      </td>
    </tr>
  );
}

export default function BearDownsideCard({ bd, timeline }: { bd: BearDownsideAnalysis; timeline: Timeline }) {
  const [showInfo, setShowInfo] = useState(false);
  const points = timeline.points;
  const hasAsOf = points.length > 0 && points[points.length - 1].bearAsOf !== undefined;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));

  const prices = useMemo(() => points.map((p) => p.price), [points]);
  const X = Math.min(idx, points.length - 1);
  const p = points[X];

  // fallback: timeline.json cũ không có bearAsOf -> giữ hành vi cũ (dải hiện tại, không slider)
  if (!hasAsOf || !p) {
    return (
      <section className="card">
        <div className="card-head">
          <h2>Triển vọng 1/3/6 tháng tới</h2>
          <span className="muted">{bd.currentPrice > 0 && <>{usd(bd.currentPrice)} · </>}−{fmt1(bd.currentDdPct)}% dưới đỉnh</span>
        </div>
        <div className="bt-table-wrap">
          <table className="bt-table">
            <thead><tr><th>Kỳ hạn</th><th>Đáy điển hình</th><th>Kết cục</th><th>Cơ hội tăng</th></tr></thead>
            <tbody>
              {bd.shown.map((s) => (
                <tr key={s.horizonDays}>
                  <td>{HLABEL[String(s.horizonDays)]}</td>
                  {s.n < 30 ? <td className="muted" colSpan={3}>chưa đủ dữ liệu (n={s.n})</td> : (
                    <>
                      <td>{usd(bd.currentPrice * (1 + s.median / 100))} <span className="down">({signed(s.median)})</span></td>
                      <td><span className={s.endMedian >= 0 ? "up" : "down"}>{signed(s.endMedian)}</span></td>
                      <td>{fmt1(s.pUp)}%</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  const isLatest = X === points.length - 1;
  const ddPct = ddAsOfPct(prices, X);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Triển vọng 1/3/6 tháng tới</h2>
        <span className="muted">
          {fmtDate(p.date)}{isLatest ? " (mới nhất)" : ""} · {usd(p.price)} · −{fmt1(ddPct)}% dưới đỉnh
        </span>
        <button className="iconbtn small-btn" aria-label="Giải thích ô này" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          {showInfo ? "✕" : "ⓘ"}
        </button>
      </div>

      <div className="tm-daterange muted small">
        <input
          type="range"
          min={0}
          max={points.length - 1}
          value={X}
          onChange={(e) => setIdx(Number(e.target.value))}
          aria-label="Trượt về ngày quá khứ"
          style={{ flex: 1 }}
        />
        <input
          type="date"
          value={p.date}
          min={points[0].date}
          max={points[points.length - 1].date}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            let lo = 0, hi = points.length - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].date < v) lo = m + 1; else hi = m; }
            setIdx(lo);
          }}
        />
      </div>

      {showInfo && (
        <div className="banner info">
          <p><b>Card lúc đó nói</b> = phân phối lịch sử walk-forward tính CHỈ từ dữ liệu tới ngày đang xem. <b>Thực tế</b> = đáy tệ nhất & kết cục thật đã xảy ra sau đó (biết được vì là ngày quá khứ).</p>
          <ul className="info-defs">
            <li><b className="down">Đáy điển hình</b> — nhịp dúi sâu nhất giữa kỳ (rủi ro).</li>
            <li>✓/✗ trái = đáy thực có thủng đuôi 1/10 (p10) không; ✓/✗ phải = kết cục thực có ≥ kết cục điển hình không.</li>
          </ul>
          <p className="muted">Tái hiện lịch sử để đối chiếu — KHÔNG phải dự đoán. Mẫu XAU/USD ~20 năm chủ yếu bull.</p>
        </div>
      )}

      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead>
            <tr><th>Kỳ hạn</th><th>Card lúc đó nói</th><th>Thực tế</th><th></th></tr>
          </thead>
          <tbody>
            {HS.map((H) => (
              <Row
                key={H}
                H={H}
                band={p.bearAsOf![H]}
                price={p.price}
                actualDip={actualWorstDipPct(prices, X, Number(H))}
                actualTerm={p.returns[H]}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (static export builds).

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open the card. Verify: slider present; dragging back changes date/price/dd; past days show "Thực tế" numbers + ✓/✗; latest day shows "chưa đáo hạn"; ⓘ toggles info. Confirm behavior, then stop dev.

- [ ] **Step 5: Commit**

```bash
git add src/components/BearDownsideCard.tsx src/components/Dashboard.tsx
git commit -m "feat(bear-downside): time-machine slider — as-of band vs actual + verdicts"
```

---

### Task 7: Docs

**Files:**
- Modify: `docs/bear-downside.md` (append a section)

- [ ] **Step 1: Append the as-of section**

Add to `docs/bear-downside.md`:

```markdown
## Máy thời gian as-of (card Triển Vọng)

Card có thanh trượt riêng: cuộn về ngày X bất kỳ và xem **dải card LÚC ĐÓ nói** cạnh **thứ THỰC TẾ xảy ra** từ X.

- **Dải as-of** — `runBearDownsideHistory(bars)` (`src/lib/bear-downside.ts`) tính walk-forward: tại ngày X, phân phối vô-điều-kiện trên mẫu lưới thưa STEP=3 đã đáo hạn (`j+H ≤ X`). Cùng mảng `bars` với engine live ⇒ tái hiện chính xác; golden test khóa: dải ngày cuối === `runBearDownside(bars).unconditional`. Forward-fill lên `timeline.points[*].bearAsOf` (mirror `forwardFillBottomHistory`).
- **Thực tế** — đáy tệ nhất `min(price[X+1..X+H])/price[X]-1` + kết cục `returns[H]`, tính client-side từ giá điểm.
- **✓/✗ hai mặt** — đáy thực vs p10 (rủi ro có thủng đuôi không), kết cục thực vs endMedian (triển vọng có đạt không). Chỉ chấm khi đủ mẫu + đã đáo hạn.
- Không look-ahead; conditioning theo bucket vẫn bị bác; không sync với Time Machine. Reaction/đối chiếu, KHÔNG dự đoán.
```

- [ ] **Step 2: Commit**

```bash
git add docs/bear-downside.md
git commit -m "docs(bear-downside): document as-of time-machine layer"
```

---

## Self-Review

**Spec coverage:**
- Data layer producer + attach → Tasks 2, 4. ✓
- New optional type → Task 1. ✓
- Card slider + as-of vs actual + two-faced verdict → Tasks 5, 6. ✓
- Present-day continuity (latest = today, actual="chưa đáo hạn") → Task 6 `notMatured` path. ✓
- No look-ahead / dd as-of X → Task 5 `ddAsOfPct`, Task 2 matured filter. ✓
- Old-JSON fallback → Task 6 `hasAsOf` branch. ✓
- Golden + verdict + fallback tests → Tasks 2, 3, 5 (fallback covered by Task 6 branch + build). ✓
- Docs → Task 7. ✓

**Placeholder scan:** none — all steps carry full code/commands.

**Type consistency:** `BearAsOfBand`/`BearAsOfRow`/`bearAsOf` identical across Tasks 1-6; `runBearDownsideHistory`, `forwardFillBearAsOf`, `ddAsOfPct`, `actualWorstDipPct`, `verdict` names consistent between definition and use; `verdict(actual, threshold)` arg order matches all call sites.

**Note on commits:** User's global rule forbids auto-commit. The `git commit` steps are the plan's record of logical checkpoints — when executing, stage the work and let the user commit unless they say otherwise.
