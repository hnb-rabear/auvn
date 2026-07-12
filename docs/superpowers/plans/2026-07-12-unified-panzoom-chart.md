# Unified PanZoomChart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một component lõi `<PanZoomChart>` cho cả 3 biểu đồ (PriceChart, TimeMachine, BearDownsideCard) + toggle đường SJC ở Máy Thời gian.

**Architecture:** Controlled component — cha giữ state cửa sổ `{start, span}` + `selectedIdx`, tính `geom` qua `buildGeom` (memo); lõi sở hữu SVG, cử chỉ pan/tap/pinch/wheel, marker overlay, nhãn ngày/trục. Spec: `docs/superpowers/specs/2026-07-12-unified-panzoom-chart-design.md`.

**Tech Stack:** Next.js + TypeScript client components, SVG thuần, vitest.

## Global Constraints

- UI tiếng Việt; comment tiếng Việt theo phong cách repo.
- Không thêm dependency mới.
- `buildGeom`/`brush.ts` giữ nguyên hành vi (test hiện có phải pass nguyên).
- BearDownsideCard: giữ nhánh fallback timeline cũ (không `bearAsOf`) nguyên trạng.

---

### Task 1: `idxAtFrac` (lib thuần + test)

**Files:**
- Modify: `src/lib/price-chart.ts`
- Test: `src/lib/price-chart.test.ts`

**Interfaces:**
- Produces: `idxAtFrac(start: number, span: number, frac: number): number` — index tại vị trí ngang tương đối `frac∈[0,1]` của cửa sổ; kẹp frac, span=1 trả `start`.

- [ ] **Step 1: test fail** — thêm vào `src/lib/price-chart.test.ts`:

```ts
describe("idxAtFrac", () => {
  it("map frac 0/0.5/1 vào cửa sổ", () => {
    expect(idxAtFrac(10, 21, 0)).toBe(10);
    expect(idxAtFrac(10, 21, 0.5)).toBe(20);
    expect(idxAtFrac(10, 21, 1)).toBe(30);
  });
  it("kẹp frac ngoài [0,1]", () => {
    expect(idxAtFrac(5, 10, -0.5)).toBe(5);
    expect(idxAtFrac(5, 10, 1.5)).toBe(14);
  });
  it("span 1 luôn trả start", () => {
    expect(idxAtFrac(7, 1, 0.9)).toBe(7);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/price-chart.test.ts` — FAIL (idxAtFrac not exported).
- [ ] **Step 3: implement** — thêm vào `src/lib/price-chart.ts`:

```ts
/** Index tại vị trí ngang tương đối frac∈[0,1] của cửa sổ [start, start+span) — kẹp frac. */
export function idxAtFrac(start: number, span: number, frac: number): number {
  const f = Math.max(0, Math.min(1, frac));
  return start + Math.round(f * (span - 1));
}
```

- [ ] **Step 4:** vitest run — PASS.
- [ ] **Step 5:** commit `feat: idxAtFrac — map px→index dùng chung cho PanZoomChart`.

### Task 2: Component lõi `PanZoomChart` + CSS

**Files:**
- Create: `src/components/PanZoomChart.tsx`
- Modify: `src/app/globals.css` (thêm `.pzc-wrap`, `.pzc-chart`)

**Interfaces:**
- Consumes: `buildGeom`, `ChartGeom`, `MIN_SPAN`, `idxAtFrac` (`@/lib/price-chart`); `applyBrushDrag`, `zoomTo` (`@/lib/brush`).
- Produces: default export `PanZoomChart(props)` với props như spec (points, geom, window, onWindowChange(next, "pan"|"zoom"), onSelect?, selectedIdx?, markers?: {key,className,idxs}[], height, denseDots?, showAxis?, ariaLabel, children?). Export `interface MarkerLayer`.

- [ ] **Step 1:** viết component — toàn bộ handler pointer/pinch/wheel bê từ PriceChart hiện tại, thay `setWin` bằng `onWindowChange(next, gesture)`, thay `onSelect` tap. Render: svg (xauPath + sjcPath + sjcTailPath + vạch cursor), overlay `.tm-markers` (mỗi MarkerLayer theo thứ tự mảng, rồi chấm cursor), nhãn `.tm-edge from/to`, `.pc-axis` khi `showAxis`, `children` cuối wrapper (FAB). Wheel listener gốc non-passive, đọc state qua ref `view` + `onWindowChangeRef`.
- [ ] **Step 2:** CSS thêm:

```css
/* biểu đồ pan/zoom dùng chung (PriceChart · TimeMachine · BearDownsideCard) */
.pzc-wrap { position: relative; margin-bottom: 6px; }
.pzc-chart {
  width: 100%;
  display: block;
  background: var(--card2);
  border-radius: 8px;
  touch-action: none;
  user-select: none;
  cursor: crosshair;
}
```

- [ ] **Step 3:** `npx tsc --noEmit` (hoặc build) sạch. Commit `feat: PanZoomChart — lõi biểu đồ pan/tap/pinch/wheel dùng chung`.

### Task 3: Migrate PriceChart

**Files:**
- Modify: `src/components/PriceChart.tsx`

Giữ: state `months`/`win`/`expanded`, `applyCustomRange`, chip/nút range, date inputs, legend, note SJC, `sjcUsd` + `geom` memo. Xóa: toàn bộ refs/handlers/wheel-effect/dotStyle/svg/overlay/axis/edge — thay bằng:

```tsx
<PanZoomChart
  points={points}
  geom={geom}
  window={{ start, span }}
  onWindowChange={(next) => setWin(next)}
  onSelect={onSelect}
  selectedIdx={selectedIdx}
  markers={[
    { key: "b", className: "buy", idxs: buyDots },
    { key: "s", className: "start", idxs: bottomDots },
  ]}
  height={160}
  showAxis
  ariaLabel="Biểu đồ giá — chạm để chọn ngày, kéo để trượt, chụm 2 ngón hoặc lăn chuột để zoom"
/>
```

- [ ] Hành vi giữ nguyên (mọi cử chỉ → Custom). Build sạch, kiểm tra tay. Commit `refactor: PriceChart dùng PanZoomChart (xóa handler copy)`.

### Task 4: Migrate TimeMachine + toggle SJC + Dashboard vnRows

**Files:**
- Modify: `src/components/TimeMachine.tsx`, `src/components/Dashboard.tsx` (truyền `vnRows`)

- [ ] Prop mới `vnRows: VnGoldEntry[]`; gear thêm toggle `showSjc` (mặc định false) nhãn "Hiện đường SJC (quy đổi $, đường xanh — chỉ vùng có dữ liệu VN)".
- [ ] Xóa `spark` useMemo + handlers + wheel effect + hằng local `MIN_SPAN`/`POINTS_PER_MONTH` (import từ `@/lib/price-chart`). `sjcUsd = useMemo(() => (showSjc ? sjcUsdMap(vnRows) : EMPTY_SJC), …)`; `geom = useMemo(() => buildGeom(points, start, span, sjcUsd, 700, 200), …)`.
- [ ] Render:

```tsx
<PanZoomChart
  points={points} geom={geom} window={{ start, span }}
  onWindowChange={(next, g) => {
    setViewStart(next.start); setViewSpan(next.span);
    if (g === "zoom") setZoomMonths("custom");   // pan giữ nhãn nút — hành vi cũ
  }}
  onSelect={setIdx} selectedIdx={idx}
  markers={[
    { key: "x", className: "exp", idxs: expIdxs },
    { key: "s", className: "sell", idxs: showSell ? sellIdxs : [] },
    { key: "b", className: "buy", idxs: signalIdxs },
    { key: "st", className: "start", idxs: bottomStarts },
  ]}
  height={200} denseDots={span > 24 * POINTS_PER_MONTH}
  ariaLabel="Biểu đồ giá XAU/USD — kéo để trượt, chạm để chọn ngày, chụm 2 ngón để zoom"
>
  <button className="tm-fab left" …>◀</button>
  <button className="tm-fab right" …>▶</button>
</PanZoomChart>
```

- [ ] Guard `points.length >= 2` thay `spark &&`. Build + kiểm tra tay. Commit `feat: Máy Thời gian — toggle đường SJC + dùng PanZoomChart`.

### Task 5: Migrate BearDownsideCard, xóa bdo-window

**Files:**
- Modify: `src/components/BearDownsideCard.tsx`
- Delete: `src/lib/bdo-window.ts`, `src/lib/bdo-window.test.ts`

- [ ] Thay cơ chế cuộn native + px cố định bằng PanZoomChart H=200: state `view {start,span}` (init 6T neo cuối), `winKey` (6T/1N/3N/all/null). Nút = đặt span (`Tất cả` = toàn bộ) + `centerWindow` quanh ngày đang chọn. Gesture: set view; zoom → `winKey=null`. Date input / `asOfIdx` → `setIdx` + căn giữa nếu ngoài cửa sổ. `geom = buildGeom(points, start, span, EMPTY_SJC, 700, 200)`. Markers: rỗng (chỉ cursor qua `selectedIdx`).
- [ ] Xóa import + dùng `visibleRange`/`localMinMax`/`scrollToIdx`/drag-scroll/spark cũ; xóa 2 file bdo-window.
- [ ] `npx vitest run` + build. Commit `refactor: BearDownsideCard sang PanZoomChart (pan/zoom thay cuộn native — thay spec v3)`.

### Task 6: CSS cleanup + verify tổng

**Files:**
- Modify: `src/app/globals.css`

- [ ] Xóa `.tm-chartwrap`, `.tm-chart`, `.pc-chartwrap`, `.pc-chart`, `.bdo-sparkbox`, `.bdo-sparkwrap`, `.bdo-edge` (3 rule), `.bdo-spark`. Grep xác nhận không còn nơi dùng.
- [ ] `npm test` toàn bộ PASS, `npm run build` sạch, `npx tsx scripts/check-modes.ts` không liên quan (bỏ qua).
- [ ] Kiểm tra tay 3 chart (dev server): cử chỉ đồng nhất, SJC toggle, đồng bộ ngày BDO.
- [ ] Commit `chore: dọn CSS chart cũ sau khi thống nhất PanZoomChart`.
