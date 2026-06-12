# Timeline Brush Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native pan-only range slider under the TimeMachine chart with a minimap brush: drag either edge to grow/shrink the time window, drag the middle to pan it.

**Architecture:** Pure drag math in `src/lib/brush.ts` (unit-tested), thin SVG component `src/components/TimelineBrush.tsx` using pointer events (mouse + touch via one code path), state refactor in `TimeMachine.tsx` from `(zoomMonths, viewStart)`-derived window to direct `(viewStart, viewSpan)` state. UI-only — no engine/data changes.

**Tech Stack:** Next.js 15 + React 19 + TypeScript, hand-rolled SVG (no chart lib), vitest. Tests live in `tests/` and import via relative paths (`../src/lib/...`). No jsdom/RTL installed — component logic stays in the pure helper; the component itself is verified manually.

**Spec:** `docs/superpowers/specs/2026-06-12-timeline-brush-design.md`

---

## File map

| File | Action | Responsibility |
| --- | --- | --- |
| `src/lib/brush.ts` | Create | Pure window math: `applyBrushDrag`, `centerWindow` |
| `tests/brush.test.ts` | Create | Unit tests for the math |
| `src/components/TimelineBrush.tsx` | Create | SVG minimap + pointer/keyboard interaction; calls `onChange(start, span)` |
| `src/components/TimeMachine.tsx` | Modify | State refactor (`viewSpan`, `zoomMonths: number \| null \| "custom"`), swap native slider for brush |
| `src/app/globals.css` | Modify | Replace `.tm-slider` block (lines 371–375) with `.tm-brush*` styles |

---

### Task 1: Pure brush math (`src/lib/brush.ts`)

**Files:**
- Create: `src/lib/brush.ts`
- Test: `tests/brush.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/brush.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyBrushDrag, centerWindow } from "../src/lib/brush";

// total = 100 điểm, minSpan = 14, cửa sổ neo: start 40, span 20
const TOTAL = 100;
const MIN = 14;

describe("applyBrushDrag — pan", () => {
  it("dời start theo delta, giữ span", () => {
    expect(applyBrushDrag("pan", 40, 20, 10, TOTAL, MIN)).toEqual({ start: 50, span: 20 });
    expect(applyBrushDrag("pan", 40, 20, -10, TOTAL, MIN)).toEqual({ start: 30, span: 20 });
  });
  it("kẹp biên trái 0", () => {
    expect(applyBrushDrag("pan", 40, 20, -100, TOTAL, MIN)).toEqual({ start: 0, span: 20 });
  });
  it("kẹp biên phải total - span", () => {
    expect(applyBrushDrag("pan", 40, 20, 100, TOTAL, MIN)).toEqual({ start: 80, span: 20 });
  });
});

describe("applyBrushDrag — left (mép phải đứng yên)", () => {
  it("kéo ra trái = giãn", () => {
    expect(applyBrushDrag("left", 40, 20, -10, TOTAL, MIN)).toEqual({ start: 30, span: 30 });
  });
  it("kéo vào phải = co", () => {
    expect(applyBrushDrag("left", 40, 20, 5, TOTAL, MIN)).toEqual({ start: 45, span: 15 });
  });
  it("co quá minSpan thì kẹp tại minSpan, mép phải đứng yên", () => {
    // end = 60 cố định -> start tối đa 60 - 14 = 46
    expect(applyBrushDrag("left", 40, 20, 50, TOTAL, MIN)).toEqual({ start: 46, span: 14 });
  });
  it("giãn quá biên trái thì kẹp tại 0", () => {
    expect(applyBrushDrag("left", 40, 20, -100, TOTAL, MIN)).toEqual({ start: 0, span: 60 });
  });
});

describe("applyBrushDrag — right (mép trái đứng yên)", () => {
  it("kéo ra phải = giãn", () => {
    expect(applyBrushDrag("right", 40, 20, 15, TOTAL, MIN)).toEqual({ start: 40, span: 35 });
  });
  it("kéo vào trái = co", () => {
    expect(applyBrushDrag("right", 40, 20, -4, TOTAL, MIN)).toEqual({ start: 40, span: 16 });
  });
  it("co quá minSpan thì kẹp tại minSpan", () => {
    expect(applyBrushDrag("right", 40, 20, -50, TOTAL, MIN)).toEqual({ start: 40, span: 14 });
  });
  it("giãn quá biên phải thì kẹp tại total - start", () => {
    expect(applyBrushDrag("right", 40, 20, 100, TOTAL, MIN)).toEqual({ start: 40, span: 60 });
  });
});

describe("applyBrushDrag — minSpan lớn hơn total", () => {
  it("dùng total làm min hiệu dụng, không nổ", () => {
    expect(applyBrushDrag("right", 0, 10, -100, 10, MIN)).toEqual({ start: 0, span: 10 });
  });
});

describe("centerWindow", () => {
  it("căn giữa quanh center", () => {
    expect(centerWindow(50, 20, TOTAL)).toBe(40);
  });
  it("kẹp biên trái", () => {
    expect(centerWindow(3, 20, TOTAL)).toBe(0);
  });
  it("kẹp biên phải", () => {
    expect(centerWindow(99, 20, TOTAL)).toBe(80);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/brush.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/brush'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/lib/brush.ts`:

```ts
/** Toán cửa sổ brush (minimap) — thuần, không React. Đơn vị: index điểm timeline. */

export type BrushDragMode = "pan" | "left" | "right";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Áp dụng kéo brush từ vị trí neo (lúc pointerdown) + độ dời deltaIdx.
 * - pan: giữ span, dời start
 * - left: mép phải đứng yên, dời mép trái (kéo ra = giãn, kéo vào = co)
 * - right: mép trái đứng yên, dời mép phải
 */
export function applyBrushDrag(
  mode: BrushDragMode,
  anchorStart: number,
  anchorSpan: number,
  deltaIdx: number,
  total: number,
  minSpan: number
): { start: number; span: number } {
  const min = Math.min(minSpan, total);
  if (mode === "pan") {
    return { start: clamp(anchorStart + deltaIdx, 0, total - anchorSpan), span: anchorSpan };
  }
  if (mode === "left") {
    const end = anchorStart + anchorSpan;
    const start = clamp(anchorStart + deltaIdx, 0, end - min);
    return { start, span: end - start };
  }
  return { start: anchorStart, span: clamp(anchorSpan + deltaIdx, min, total - anchorStart) };
}

/** start của cửa sổ span điểm căn giữa quanh centerIdx, kẹp trong [0, total - span]. */
export function centerWindow(centerIdx: number, span: number, total: number): number {
  return Math.max(0, Math.min(centerIdx - Math.floor(span / 2), total - span));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/brush.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (existing `tests/engine.test.ts` untouched).

- [ ] **Step 6: Commit**

```bash
git add src/lib/brush.ts tests/brush.test.ts
git commit -m "feat: toán kéo brush cho minimap timeline (pan/resize, kẹp biên)"
```

---

### Task 2: `TimelineBrush` component + CSS

**Files:**
- Create: `src/components/TimelineBrush.tsx`
- Modify: `src/app/globals.css` (replace `.tm-slider` block, lines 371–375)

No unit test (no jsdom/RTL in project; all window math already tested in Task 1). Verified manually in Task 4.

- [ ] **Step 1: Create the component**

Create `src/components/TimelineBrush.tsx`:

```tsx
"use client";

import { useMemo, useRef } from "react";
import { applyBrushDrag, centerWindow, type BrushDragMode } from "@/lib/brush";

const W = 700;
const H = 34;
/** bề rộng vùng bắt handle theo viewBox (~14px khi render 700px) */
const HANDLE_HIT = 14;

/**
 * Minimap brush: vẽ thu nhỏ toàn bộ lịch sử giá; kéo 2 đầu để co giãn
 * cửa sổ thời gian, kéo giữa để pan, bấm ngoài cửa sổ để nhảy tới đó.
 */
export default function TimelineBrush({
  prices,
  start,
  span,
  minSpan,
  onChange,
}: {
  prices: number[];
  start: number;
  span: number;
  minSpan: number;
  onChange: (start: number, span: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{
    mode: BrushDragMode;
    anchorStart: number;
    anchorSpan: number;
    originX: number;
  } | null>(null);
  const total = prices.length;

  const path = useMemo(() => {
    if (prices.length < 2) return "";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const x = (i: number) => (i / (prices.length - 1)) * W;
    const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 6) - 3;
    return prices
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join("");
  }, [prices]);

  if (total < 2) return null;

  // cửa sổ phủ [start, start + span) trên total điểm
  const winX = (start / total) * W;
  const winW = (span / total) * W;
  // thu hẹp vùng bắt handle khi cửa sổ rất hẹp (min zoom) để thân vẫn pan được
  const hit = Math.min(HANDLE_HIT, Math.max(4, winW / 2));

  const beginDrag = (mode: BrushDragMode) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, anchorStart: start, anchorSpan: span, originX: e.clientX };
  };

  /** bấm ngoài cửa sổ: nhảy cửa sổ tới điểm bấm rồi tiếp tục như pan */
  const onJump = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const s = centerWindow(Math.round(frac * total), span, total);
    onChange(s, span);
    drag.current = { mode: "pan", anchorStart: s, anchorSpan: span, originX: e.clientX };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!d || !rect || rect.width === 0) return;
    const deltaIdx = Math.round(((e.clientX - d.originX) / rect.width) * total);
    const next = applyBrushDrag(d.mode, d.anchorStart, d.anchorSpan, deltaIdx, total, minSpan);
    onChange(next.start, next.span);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    svgRef.current?.releasePointerCapture(e.pointerId);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = (e.key === "ArrowLeft" ? -1 : 1) * Math.max(1, Math.round(span * 0.1));
    const next = e.shiftKey
      ? applyBrushDrag("right", start, span, step, total, minSpan)
      : applyBrushDrag("pan", start, span, step, total, minSpan);
    onChange(next.start, next.span);
  };

  return (
    <svg
      ref={svgRef}
      className="tm-brush"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      tabIndex={0}
      role="slider"
      aria-label="Chọn khung thời gian — kéo 2 đầu để co giãn, kéo giữa để di chuyển"
      aria-valuemin={0}
      aria-valuemax={total - span}
      aria-valuenow={start}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <path d={path} fill="none" stroke="#e6b84c" strokeWidth="1" opacity="0.45" />
      {/* vùng mờ ngoài cửa sổ — bấm để nhảy */}
      <rect className="tm-brush-dim" x="0" y="0" width={winX} height={H} onPointerDown={onJump} />
      <rect
        className="tm-brush-dim"
        x={winX + winW}
        y="0"
        width={Math.max(0, W - winX - winW)}
        height={H}
        onPointerDown={onJump}
      />
      {/* thân cửa sổ — kéo để pan */}
      <rect
        className="tm-brush-win"
        x={winX}
        y="0"
        width={winW}
        height={H}
        onPointerDown={beginDrag("pan")}
      />
      {/* tay nắm trái/phải — kéo để co giãn (grip nhìn thấy + hit area rộng) */}
      <rect className="tm-brush-grip" x={winX - 2} y={H / 2 - 8} width="4" height="16" rx="2" />
      <rect
        className="tm-brush-grip"
        x={winX + winW - 2}
        y={H / 2 - 8}
        width="4"
        height="16"
        rx="2"
      />
      <rect
        className="tm-brush-handle"
        x={winX - hit / 2}
        y="0"
        width={hit}
        height={H}
        onPointerDown={beginDrag("left")}
      />
      <rect
        className="tm-brush-handle"
        x={winX + winW - hit / 2}
        y="0"
        width={hit}
        height={H}
        onPointerDown={beginDrag("right")}
      />
    </svg>
  );
}
```

- [ ] **Step 2: Replace the slider CSS**

In `src/app/globals.css`, replace the `.tm-slider` block:

```css
.tm-slider {
  width: 100%;
  accent-color: var(--gold);
  margin-bottom: 12px;
}
```

with:

```css
.tm-brush {
  width: 100%;
  height: 34px;
  display: block;
  background: var(--card2);
  border-radius: 6px;
  margin-bottom: 12px;
  touch-action: none;
  user-select: none;
  outline-color: var(--gold);
}

.tm-brush-dim {
  fill: rgba(0, 0, 0, 0.45);
  cursor: pointer;
}

.tm-brush-win {
  fill: rgba(230, 184, 76, 0.12);
  stroke: var(--gold);
  stroke-width: 1;
  cursor: grab;
}

.tm-brush-win:active {
  cursor: grabbing;
}

.tm-brush-grip {
  fill: var(--gold);
  pointer-events: none;
}

.tm-brush-handle {
  fill: transparent;
  cursor: ew-resize;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (`TimelineBrush` not wired in yet — unused component is fine.)

- [ ] **Step 4: Commit**

```bash
git add src/components/TimelineBrush.tsx src/app/globals.css
git commit -m "feat: component TimelineBrush — minimap kéo co giãn/pan cửa sổ thời gian"
```

---

### Task 3: Wire into `TimeMachine` (state refactor)

**Files:**
- Modify: `src/components/TimeMachine.tsx`

Window state goes from derived-from-`zoomMonths` to direct `(viewStart, viewSpan)`. `zoomMonths` only highlights preset buttons; brush drags set it to `"custom"` (no button active).

- [ ] **Step 1: Add import**

After the existing imports in `src/components/TimeMachine.tsx` (below the `@/lib/types` import block ending line 13):

```tsx
import TimelineBrush from "./TimelineBrush";
```

- [ ] **Step 2: Replace the state + window derivation block**

Replace (currently lines 74–90):

```tsx
  const points = timeline.points;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));
  /** cửa sổ zoom tính theo tháng; null = toàn bộ lịch sử */
  const [zoomMonths, setZoomMonths] = useState<number | null>(null);
  const [viewStart, setViewStart] = useState(0);
  /** hiện vùng bán (tham khảo) trên dòng thời gian */
  const [showSell, setShowSell] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const p = points[idx];

  const span =
    zoomMonths === null
      ? points.length
      : Math.min(points.length, Math.max(14, zoomMonths * POINTS_PER_MONTH));
  const maxStart = points.length - span;
  const start = zoomMonths === null ? 0 : Math.max(0, Math.min(viewStart, maxStart));
  const end = start + span;
```

with:

```tsx
  const points = timeline.points;
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));
  /** nút preset đang active: số tháng | null = "Tất cả" | "custom" = đã kéo brush */
  const [zoomMonths, setZoomMonths] = useState<number | null | "custom">(null);
  const [viewStart, setViewStart] = useState(0);
  const [viewSpan, setViewSpan] = useState(points.length);
  /** hiện vùng bán (tham khảo) trên dòng thời gian */
  const [showSell, setShowSell] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const p = points[idx];

  const span = Math.min(points.length, Math.max(Math.min(MIN_SPAN, points.length), viewSpan));
  const start = Math.max(0, Math.min(viewStart, points.length - span));
  const end = start + span;
```

and add the constant next to `POINTS_PER_MONTH` (line 63):

```tsx
// timeline lấy mẫu mỗi 3 phiên -> ~7 điểm/tháng
const POINTS_PER_MONTH = 7;
/** cửa sổ nhỏ nhất của brush/zoom (~2 tuần) */
const MIN_SPAN = 14;
```

- [ ] **Step 3: Replace `centerOn` / `applyZoom`, add `onBrush`**

Replace (currently lines 112–129):

```tsx
  const centerOn = useCallback(
    (i: number, m: number | null = zoomMonths) => {
      if (m === null) return;
      const s = Math.min(points.length, Math.max(14, m * POINTS_PER_MONTH));
      setViewStart(Math.max(0, Math.min(i - Math.floor(s / 2), points.length - s)));
    },
    [zoomMonths, points.length]
  );

  const goTo = (i: number) => {
    setIdx(i);
    if (i < start || i >= end) centerOn(i);
  };

  const applyZoom = (m: number | null) => {
    setZoomMonths(m);
    centerOn(idx, m);
  };
```

with:

```tsx
  const centerOn = useCallback(
    (i: number, s: number = span) => {
      const sp = Math.min(points.length, Math.max(MIN_SPAN, s));
      setViewStart(centerWindow(i, sp, points.length));
    },
    [span, points.length]
  );

  const goTo = (i: number) => {
    setIdx(i);
    if (i < start || i >= end) centerOn(i);
  };

  const applyZoom = (m: number | null) => {
    setZoomMonths(m);
    const s =
      m === null
        ? points.length
        : Math.min(points.length, Math.max(MIN_SPAN, m * POINTS_PER_MONTH));
    setViewSpan(s);
    if (m === null) setViewStart(0);
    else centerOn(idx, s);
  };

  const onBrush = useCallback((s: number, sp: number) => {
    setViewStart(s);
    setViewSpan(sp);
    setZoomMonths("custom");
  }, []);
```

and add `centerWindow` to the imports:

```tsx
import { centerWindow } from "@/lib/brush";
```

- [ ] **Step 4: Marker radius no longer keyed on `zoomMonths`**

`zoomMonths` can now be `"custom"` with any span, so size dots by window width instead. In the main chart `<svg>` (currently lines 243 and 246), replace both:

```tsx
r={zoomMonths === null ? 2 : 3.5}
```

with:

```tsx
r={span > 24 * POINTS_PER_MONTH ? 2 : 3.5}
```

(small dots when the window shows more than ~2 years, same visual intent as before).

- [ ] **Step 5: Replace the native slider with the brush**

Replace (currently lines 257–268):

```tsx
      {zoomMonths !== null && maxStart > 0 && (
        <input
          className="tm-slider"
          type="range"
          min={0}
          max={maxStart}
          value={start}
          onChange={(e) => setViewStart(Number(e.target.value))}
          aria-label="Cuộn cửa sổ thời gian"
          title="Cuộn trái/phải"
        />
      )}
```

with:

```tsx
      {points.length > MIN_SPAN && (
        <TimelineBrush
          prices={prices}
          start={start}
          span={span}
          minSpan={MIN_SPAN}
          onChange={onBrush}
        />
      )}
```

and add the `prices` memo next to the other memos (after `sellIdxs`, currently line 108):

```tsx
  const prices = useMemo(() => points.map((q) => q.price), [points]);
```

Note: `maxStart` has no remaining users after this — remove any leftover reference (it was only defined in the old state block already replaced in Step 2).

- [ ] **Step 6: Type-check + full test suite**

Run: `npx tsc --noEmit && npm test`
Expected: both clean. The zoom-button `active` class still works: `zoomMonths === m` is false for every button when `"custom"`.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: static export succeeds, no warnings about TimeMachine.

- [ ] **Step 8: Commit**

```bash
git add src/components/TimeMachine.tsx
git commit -m "feat: thay slider native bằng TimelineBrush — co giãn 2 đầu + pan cửa sổ thời gian"
```

---

### Task 4: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (background), open `http://localhost:3000`.

- [ ] **Step 2: Verify each behavior**

In the "Xét lại lịch sử — máy thời gian" card:

1. Brush visible by default ("Tất cả"): window covers full bar, handles at both edges.
2. Drag right handle left → window shrinks, chart zooms into recent data; date label updates.
3. Drag left handle → other edge stays fixed; cannot shrink below ~2 weeks.
   At min width: both handles still grabbable AND window body still pannable (handle hit shrinks).
4. Drag window body → pans; clamps at both ends.
5. Click outside window → window jumps there, centered.
6. Drag brush → no zoom button shows `active`; click "1 năm" → window = 12×7 points centered on selected day, button active again.
7. Keyboard: focus brush (Tab), ←/→ pans, Shift+←/→ resizes right edge.
8. Touch: DevTools device mode — handles and pan draggable with touch.
9. Chart click / "Tín hiệu mua trước/sau" navigation still works; selecting a day outside the window recenters it.

- [ ] **Step 3: Fix anything broken, re-run `npm test`, commit fixes**

---

## Self-review notes

- Spec coverage: minimap path (Task 2), resize both edges + pan + jump (Tasks 1–2), buttons coexist + `"custom"` sentinel (Task 3), min span 14 (Tasks 1, 3), brush always visible incl. "Tất cả" (Task 3 Step 5), native slider + `.tm-slider` removed (Task 3 Step 5 / Task 2 Step 2), keyboard a11y (Task 2), edge cases `minSpan > total` (Task 1 test), short history hides brush (`points.length > MIN_SPAN`), unit tests on pure helper only (no jsdom dep — YAGNI).
- Type consistency: `applyBrushDrag(mode, anchorStart, anchorSpan, deltaIdx, total, minSpan)` and `centerWindow(centerIdx, span, total)` used identically in Tasks 1–3; `onChange(start, span)` matches `onBrush(s, sp)`.
