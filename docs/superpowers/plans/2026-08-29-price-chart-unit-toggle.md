# Price Chart Unit Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho biểu đồ giá chính đổi giữa hai trục chung: USD/ounce và triệu VND/chỉ, để XAU và SJC luôn so sánh đúng trên cùng đơn vị.

**Architecture:** Giữ toán tiền tệ và hình học trong pure helper `src/lib/price-chart.ts`; React chỉ giữ state đơn vị và render nhãn. Mở rộng `ChartGeom` để mọi caller dùng toạ độ XAU đã quy đổi cho path, marker và axis; caller cũ không truyền tùy chọn vẫn giữ nguyên USD/oz.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, SVG, Vitest 3; không thêm dependency.

## Global Constraints

- Chỉ đổi biểu đồ giá chính; không đổi card giá, PremiumChart, Time Machine UI, Bear cards, engine, backtest hay JSON.
- `oz` là mặc định: XAU USD/oz; SJC quy đổi sang USD/oz bằng tỷ giá cùng ngày.
- `chi`: XAU quy đổi sang VND/chỉ bằng tỷ giá cùng ngày; SJC dùng VND/chỉ (`sjcSell / 10`).
- Không dùng tỷ giá hiện tại cho lịch sử thiếu tỷ giá; ngày thiếu `usdVnd` không có điểm quy đổi.
- `TimeMachine` và `BearDownsideCard` phải giữ hành vi USD/oz hiện tại qua default parameters.
- UI tiếng Việt; toggle có `aria-pressed` và `aria-label`.
- Dữ liệu và dịch vụ vẫn miễn phí; không thêm API/browser fetch hay package.

---

## File Structure

- Modify `src/lib/price-chart.ts`: type đơn vị, công thức quy đổi, formatter, geometry cho XAU thưa, marker y-coordinate.
- Modify `src/lib/price-chart.test.ts`: test công thức, bất biến premium, sparse geometry, format, hồi quy mặc định.
- Modify `src/components/PriceChart.tsx`: state/toggle, chọn series theo đơn vị, legend/note.
- Modify `src/components/PanZoomChart.tsx`: render path XAU nullable/tail, marker theo `geom.yOf`, axis theo đơn vị.
- No new runtime files; no CSS change (reuse `iconbtn small-btn pc-toggle`).

### Task 1: Pure conversion and geometry

**Files:**
- Modify: `src/lib/price-chart.ts:1-176`
- Test: `src/lib/price-chart.test.ts:1-107`

**Interfaces:**
- Consumes: `TimelinePoint.price` (USD/oz), `VnGoldEntry.sjcSell` (VND/lượng), `VnGoldEntry.usdVnd` (VND/USD).
- Produces:
  - `export type PriceUnit = "oz" | "chi"`
  - `export function unitSeries(points: TimelinePoint[], rows: VnGoldEntry[], unit: PriceUnit): { sjc: Map<string, number>; xau: Map<string, number> | null }`
  - `export function fmtPrice(v: number, unit: PriceUnit): string`
  - `buildGeom(..., opts?: { xau?: Map<string, number> | null; unit?: PriceUnit }): ChartGeom`
  - `ChartGeom.unit`, `hasData`, nullable `xauPath`, `xauTailPath/xauFrom/xauAsOf`, `yOf(i)`; `xauMin/xauMax` giữ kiểu `number` để test hiện có không phải sửa.

- [ ] **Step 1: Add failing conversion and formatter tests**

Update imports:

```ts
import {
  windowFor,
  sjcUsdMap,
  unitSeries,
  fmtPrice,
  buildGeom,
  idxAtFrac,
  MIN_SPAN,
  POINTS_PER_MONTH,
} from "./price-chart";
```

Add after `sjcUsdMap` tests:

```ts
describe("unitSeries", () => {
  const pts = [mkPt("2025-02-08", 2800), mkPt("2025-02-09", 2900)];
  const rows = [
    mkVn("2025-02-08", 100_000_000, 25_000),
    mkVn("2025-02-09", 110_000_000, null),
  ];

  it("oz giữ XAU gốc và quy đổi SJC sang USD/oz", () => {
    const s = unitSeries(pts, rows, "oz");
    expect(s.xau).toBeNull();
    expect(s.sjc.get("2025-02-08")).toBeCloseTo((100_000_000 / 25_000 / 37.5) * 31.1034768, 8);
  });

  it("chi quy đổi cả XAU và SJC sang VND/chỉ, bỏ ngày thiếu tỷ giá", () => {
    const s = unitSeries(pts, rows, "chi");
    expect(s.xau?.get("2025-02-08")).toBeCloseTo((2800 / 31.1034768) * 25_000 * 3.75, 8);
    expect(s.sjc.get("2025-02-08")).toBe(10_000_000);
    expect(s.xau?.has("2025-02-09")).toBe(false);
    expect(s.sjc.has("2025-02-09")).toBe(false);
  });

  it("giữ nguyên tỷ lệ SJC/XAU giữa hai đơn vị", () => {
    const oz = unitSeries(pts, rows, "oz");
    const chi = unitSeries(pts, rows, "chi");
    expect(chi.sjc.get("2025-02-08")! / chi.xau!.get("2025-02-08")!).toBeCloseTo(
      oz.sjc.get("2025-02-08")! / pts[0].price,
      12
    );
  });
});

describe("fmtPrice", () => {
  it("format theo đúng đơn vị chart", () => {
    expect(fmtPrice(4504.1, "oz")).toBe("$4.504");
    expect(fmtPrice(14_340_000, "chi")).toBe("14,3 tr₫");
  });
});
```

- [ ] **Step 2: Run focused tests and verify red state**

Run:

```bash
npx vitest run src/lib/price-chart.test.ts
```

Expected: FAIL because `unitSeries` and `fmtPrice` are not exported.

- [ ] **Step 3: Add failing sparse-XAU geometry tests**

Append inside `describe("buildGeom")`:

```ts
  it("chi dùng XAU thưa cùng trục và báo ngày bắt đầu", () => {
    const xau = new Map([
      ["2025-02-09", 9_000_000],
      ["2025-02-10", 9_500_000],
    ]);
    const sjc = new Map([
      ["2025-02-09", 10_000_000],
      ["2025-02-10", 10_500_000],
    ]);
    const g = buildGeom(pts, 0, 3, sjc, 700, 160, { xau, unit: "chi" });
    expect(g.unit).toBe("chi");
    expect(g.hasData).toBe(true);
    expect(g.xauFrom).toBe("2025-02-09");
    expect(g.xauPath).not.toBeNull();
    expect(g.min).toBe(9_000_000);
    expect(g.max).toBe(10_500_000);
    expect(g.y(10_500_000)).toBeLessThan(g.y(9_000_000));
    expect(g.yOf(0)).toBeNull();
    expect(g.yOf(1)).not.toBeNull();
  });

  it("chi không có tỷ giá trong cửa sổ thì không vẽ dữ liệu hay trục giả", () => {
    const g = buildGeom(pts, 0, 3, new Map(), 700, 160, { xau: new Map(), unit: "chi" });
    expect(g.hasData).toBe(false);
    expect(g.xauPath).toBeNull();
    expect(g.sjcPath).toBeNull();
    expect(g.yOf(1)).toBeNull();
  });

  it("mặc định oz giữ yOf bằng giá XAU gốc", () => {
    const g = buildGeom(pts, 0, 3, new Map());
    expect(g.unit).toBe("oz");
    expect(g.hasData).toBe(true);
    expect(g.yOf(1)).toBe(g.y(pts[1].price));
  });
```

- [ ] **Step 4: Implement unit conversion and formatting**

In `src/lib/price-chart.ts`, export unit type and add `CHI_GRAMS`:

```ts
export type PriceUnit = "oz" | "chi";

const TROY_OZ_GRAMS = 31.1034768;
const LUONG_GRAMS = 37.5;
const CHI_GRAMS = LUONG_GRAMS / 10;
```

Add after `sjcUsdMap`:

```ts
export function unitSeries(
  points: TimelinePoint[],
  rows: VnGoldEntry[],
  unit: PriceUnit
): { sjc: Map<string, number>; xau: Map<string, number> | null } {
  if (unit === "oz") return { sjc: sjcUsdMap(rows), xau: null };

  const prices = new Map(points.map((p) => [p.date, p.price]));
  const sjc = new Map<string, number>();
  const xau = new Map<string, number>();
  for (const row of rows) {
    if (row.usdVnd === null) continue;
    const price = prices.get(row.date);
    if (price !== undefined) xau.set(row.date, (price / TROY_OZ_GRAMS) * row.usdVnd * CHI_GRAMS);
    if (row.sjcSell !== null) sjc.set(row.date, row.sjcSell / 10);
  }
  return { sjc, xau };
}

export function fmtPrice(v: number, unit: PriceUnit): string {
  if (unit === "oz") return `$${Math.round(v).toLocaleString("vi-VN")}`;
  return `${(v / 1_000_000).toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} tr₫`;
}
```

- [ ] **Step 5: Generalize geometry with one shared sparse-series path**

Change `ChartGeom` to:

```ts
export interface ChartGeom {
  W: number;
  H: number;
  unit: PriceUnit;
  hasData: boolean;
  x(i: number): number;
  y(v: number): number;
  yOf(i: number): number | null;
  xauPath: string | null;
  xauTailPath: string | null;
  xauFrom: string | null;
  xauAsOf: string | null;
  xauMin: number;
  xauMax: number;
  sjcPath: string | null;
  sjcTailPath: string | null;
  sjcFrom: string | null;
  sjcAsOf: string | null;
  min: number;
  max: number;
}
```

Change signature:

```ts
export function buildGeom(
  points: TimelinePoint[],
  start: number,
  span: number,
  sjcValues: Map<string, number>,
  W = 700,
  H = 160,
  opts: { xau?: Map<string, number> | null; unit?: PriceUnit } = {}
): ChartGeom
```

Replace geometry body after `pad` with this shape (keep existing `x`, `collect`, `render` helpers):

```ts
  const unit = opts.unit ?? "oz";
  const xauMap = opts.xau ?? null;
  const xauSeries = xauMap === null ? null : collect(win, xauMap);
  const xauVals = xauSeries
    ? xauSeries.pts.map((o) => o.v).concat(xauSeries.last ? [xauSeries.last.v] : [])
    : win.map((q) => q.price);
  const sc = collect(win, sjcValues);
  const sjcVals = sc.pts.map((o) => o.v).concat(sc.last ? [sc.last.v] : []);
  const allVals = xauVals.concat(sjcVals);
  const hasData = allVals.length > 0;
  const min = hasData ? Math.min(...allVals) : 0;
  const max = hasData ? Math.max(...allVals) : 1;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - pad * 2) - pad;

  const rawXauPath = xauSeries
    ? null
    : win.map((q, j) => `${j === 0 ? "M" : "L"}${x(start + j).toFixed(1)},${y(q.price).toFixed(1)}`).join("");
  const xauR = xauSeries ? render(win, start, x, y, xauSeries) : null;
  const sjcR = render(win, start, x, y, sc);
  const yOf = (i: number) => {
    const point = points[i];
    if (!point) return null;
    const value = xauMap === null ? point.price : xauMap.get(point.date);
    return value === undefined ? null : y(value);
  };
```

Return every new field:

```ts
  return {
    W,
    H,
    unit,
    hasData,
    x,
    y,
    yOf,
    xauPath: xauR?.path ?? rawXauPath,
    xauTailPath: xauR?.tailPath ?? null,
    xauFrom: xauR?.from ?? null,
    xauAsOf: xauR?.asOf ?? null,
    xauMin: xauVals.length ? Math.min(...xauVals) : min,
    xauMax: xauVals.length ? Math.max(...xauVals) : max,
    sjcPath: sjcR.path,
    sjcTailPath: sjcR.tailPath,
    sjcFrom: sjcR.from,
    sjcAsOf: sjcR.asOf,
    min,
    max,
  };
```

- [ ] **Step 6: Run helper tests and typecheck**

Run:

```bash
npx vitest run src/lib/price-chart.test.ts
npm run typecheck
```

Expected: price-chart tests PASS. Typecheck may fail only in `PanZoomChart.tsx` because `xauPath` is now nullable; Task 2 fixes that consumer immediately. No other error accepted.

- [ ] **Step 7: Commit pure helper**

```bash
git add src/lib/price-chart.ts src/lib/price-chart.test.ts
git commit -m "feat(chart): add Ounce/Chỉ price geometry"
```

### Task 2: Chart toggle and shared renderer

**Files:**
- Modify: `src/components/PriceChart.tsx:3-149`
- Modify: `src/components/PanZoomChart.tsx:12-252`

**Interfaces:**
- Consumes from Task 1: `PriceUnit`, `unitSeries`, `fmtPrice`, `ChartGeom.unit/hasData/yOf/xauTailPath/xauFrom/xauAsOf`.
- Produces: Dashboard-only unit toggle; shared renderer remains backward-compatible for Time Machine and Bear Downside.

- [ ] **Step 1: Wire unit state and geometry in PriceChart**

Change import:

```ts
import {
  RANGES,
  MIN_SPAN,
  windowFor,
  unitSeries,
  buildGeom,
  type PriceUnit,
} from "@/lib/price-chart";
```

Add state after `expanded`:

```ts
const [unit, setUnit] = useState<PriceUnit>("oz");
```

Replace `sjcUsd`/`geom` memos:

```ts
const series = useMemo(() => unitSeries(points, vnRows, unit), [points, vnRows, unit]);
const geom = useMemo(
  () => buildGeom(points, start, span, series.sjc, 700, 160, { xau: series.xau, unit }),
  [points, start, span, series, unit]
);
```

- [ ] **Step 2: Add toggle and unit-specific legend**

Immediately before `.pc-legend`, add:

```tsx
<button
  className="iconbtn small-btn pc-toggle"
  onClick={() => setUnit((u) => (u === "oz" ? "chi" : "oz"))}
  aria-pressed={unit === "chi"}
  aria-label={unit === "oz" ? "Đổi biểu đồ sang đơn vị chỉ" : "Đổi biểu đồ sang đơn vị ounce"}
>
  {unit === "oz" ? "$/oz" : "₫/chỉ"}
</button>
```

Replace legend contents:

```tsx
<span className="pc-legend muted small">
  <i className="pc-line xau" /> {unit === "oz" ? "XAU/USD" : "XAU (quy đổi ₫/chỉ)"}
  <i className="pc-line sjc" /> {unit === "oz" ? "SJC (quy đổi $)" : "SJC (₫/chỉ)"}
</span>
```

- [ ] **Step 3: Extend source-staleness note without inventing historical FX**

Before `return`, derive first FX date:

```ts
const firstFxDate = vnRows.find((row) => row.usdVnd !== null)?.date;
```

In `.pc-note`, before existing SJC notes, add:

```tsx
{unit === "chi" && geom.xauPath === null && geom.xauTailPath === null && firstFxDate
  ? ` · XAU quy đổi: dữ liệu từ ${fmtDate(firstFxDate)}`
  : ""}
{unit === "chi" && geom.xauFrom ? ` · XAU quy đổi: từ ${fmtDate(geom.xauFrom)}` : ""}
{unit === "chi" && geom.xauAsOf
  ? ` · XAU quy đổi: giữ giá ngày ${fmtDate(geom.xauAsOf)} (tỷ giá chưa cập nhật)`
  : ""}
```

Keep SJC note branches unchanged.

- [ ] **Step 4: Make PanZoomChart render converted XAU paths and markers**

Import formatter:

```ts
import { MIN_SPAN, idxAtFrac, fmtPrice, type ChartGeom } from "@/lib/price-chart";
```

Delete local `fmtUsd`.

Change `dotStyle`:

```ts
const dotStyle = (i: number) => {
  const top = geom.yOf(i);
  return top === null
    ? null
    : {
        left: `${(geom.x(i) / geom.W) * 100}%`,
        top: `${(top / geom.H) * 100}%`,
      };
};
```

Render XAU paths conditionally, including stale tail:

```tsx
{geom.xauPath && <path d={geom.xauPath} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.85" />}
{geom.xauTailPath && (
  <path
    d={geom.xauTailPath}
    fill="none"
    stroke="#e6b84c"
    strokeWidth="1.5"
    strokeDasharray="3 3"
    opacity="0.5"
  />
)}
```

For each marker and cursor, render only when style exists:

```tsx
{markers.map((layer) =>
  layer.idxs.filter(inWin).map((i) => {
    const style = dotStyle(i);
    return style ? <span key={`${layer.key}${i}`} className={`tm-mk ${layer.className}`} style={style} /> : null;
  })
)}
{selectedIdx !== null && inWin(selectedIdx) && (() => {
  const style = dotStyle(selectedIdx);
  return style ? <span className="tm-mk cursor" style={style} /> : null;
})()}
```

Gate and format axis:

```tsx
{showAxis && geom.hasData && (
  <>
    <span className="pc-axis right top muted small">{fmtPrice(geom.max, geom.unit)}</span>
    <span className="pc-axis right bottom muted small">{fmtPrice(geom.min, geom.unit)}</span>
  </>
)}
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all tests PASS, TypeScript exits 0, Next static export exits 0.

- [ ] **Step 6: Manual app check**

Run app through project launcher (`/run`) and verify:

1. Default button says `$/oz`; axis shows `$...`; both lines match current chart.
2. Click once: button says `₫/chỉ`; axis shows `... tr₫`; legend names both `₫/chỉ` series.
3. On 1T range, SJC stays above world XAU by visible premium, not separate-axis scaling.
4. Choose `Tất cả` in `₫/chỉ`: chart is blank before first FX date, then both lines start together; note identifies source date.
5. Buy/bottom/cursor markers remain attached to gold XAU line after toggling.
6. Switch back to `$/oz`: paths, axis, markers restore without range reset.
7. Time Machine and Bear Downside still render in USD with no toggle or changed copy.

- [ ] **Step 7: Commit UI**

```bash
git add src/components/PriceChart.tsx src/components/PanZoomChart.tsx
git commit -m "feat(chart): toggle Ounce and Chỉ display"
```

### Task 3: Final review and delivery

**Files:**
- Review: all files changed since `2cc13eb`
- Modify only if verified review findings require a fix.

**Interfaces:**
- Consumes: completed feature from Tasks 1-2.
- Produces: reviewed branch, clean test/build results, pushed `main`.

- [ ] **Step 1: Review diff for correctness, reuse and scope**

Run `/code-review high` against current diff. Verify specifically:

- no raw `points[i].price` remains in marker y-position;
- `chi` never draws raw USD values;
- missing FX hides values instead of substituting current FX;
- default callers still use `oz`;
- no component outside requested chart gains toggle/copy changes.

- [ ] **Step 2: Apply only confirmed findings and rerun checks**

For each confirmed finding, add or tighten one focused test first where possible, apply smallest root-cause fix, then run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all exit 0. If review has no finding, change nothing.

- [ ] **Step 3: Inspect final repository state**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: clean working tree; design, plan, helper and UI commits present.

- [ ] **Step 4: Push**

```bash
git push origin main
```

Expected: push succeeds without force; remote `main` advances to local HEAD.
