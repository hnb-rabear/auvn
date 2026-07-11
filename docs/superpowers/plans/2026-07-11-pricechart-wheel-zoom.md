# PriceChart Wheel + Pinch Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mouse-wheel zoom and 2-finger pinch zoom to `PriceChart`, porting the exact gesture mechanism already shipped in `TimeMachine.tsx`.

**Architecture:** Single-file change to `src/components/PriceChart.tsx`. Reuses the pure helper `zoomTo` from `src/lib/brush.ts` (already used by TimeMachine). Both gestures resolve to the component's existing `setWin({start, span})` Custom-mode state — the range chip flips to "Tùy chỉnh" automatically, same as pan does today.

**Tech Stack:** Next.js (static export) + TypeScript + React pointer events + native non-passive `wheel` listener. Tests: vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-11-pricechart-wheel-zoom-design.md` — follow exactly.
- **Do NOT run `git commit` or `git push`** — the repo owner's standing rule overrides this skill's commit steps. Stage with `git add` only and report ready-to-commit.
- Only `src/components/PriceChart.tsx` may change. No changes to `src/lib/brush.ts`, `src/lib/price-chart.ts`, `TimeMachine.tsx`, or any other file.
- No new unit tests (spec decision — gesture wiring matches TimeMachine's already-shipped untested convention). Existing tests must keep passing.
- UI strings and code comments in Vietnamese, matching existing file style.
- Zoom factor per wheel tick: `e.deltaY > 0 ? 1.2 : 1 / 1.2` (identical to TimeMachine).
- `xToIdx` in PriceChart returns `number | null` — pinch init must fall back to `start + Math.floor(span / 2)` on null.

---

### Task 1: Port TimeMachine gesture mechanism into PriceChart

**Files:**
- Modify: `src/components/PriceChart.tsx` (imports at 3–7, refs at ~40–41, handlers at ~68–97, `<svg>` aria-label at ~188)

**Interfaces:**
- Consumes: `zoomTo(anchorSpan: number, factor: number, centerIdx: number, total: number, minSpan: number): { start: number; span: number }` from `@/lib/brush` (exists; TimeMachine uses it).
- Produces: nothing new — internal component behavior only.

- [ ] **Step 1: Update imports**

In `src/components/PriceChart.tsx`, change:

```tsx
import { useMemo, useRef, useState } from "react";
```

to:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```

and change:

```tsx
import { applyBrushDrag } from "@/lib/brush";
```

to:

```tsx
import { applyBrushDrag, zoomTo } from "@/lib/brush";
```

- [ ] **Step 2: Add gesture refs**

The file currently has (after `const svgRef = ...`):

```tsx
  const drag = useRef<{ pointerId: number; originX: number; anchorStart: number; moved: boolean } | null>(null);
```

Keep it, and add directly below:

```tsx
  // trạng thái pinch 2 ngón (giống TimeMachine)
  const pinch = useRef<{ startDist: number; anchorSpan: number; centerIdx: number } | null>(null);
  const pts = useRef<Map<number, number>>(new Map()); // pointerId -> clientX
```

Then, AFTER the existing lines that compute `span`/`start`/`end` (`const def = windowFor(...)` … `const end = start + span;`), add:

```tsx
  // cửa sổ mới nhất cho listener wheel gắn 1 lần (tránh closure cũ) —
  // TimeMachine tách startRef + wheelState vì lý do lịch sử; 1 ref là đủ.
  const view = useRef({ start, span, total: points.length });
  view.current = { start, span, total: points.length };
```

- [ ] **Step 3: Replace the pointer handlers**

Replace this entire block (comment + 4 handlers):

```tsx
  // 1 ngón: tap = chọn ngày, kéo ngang = pan (KHÔNG pinch/wheel — range bằng nút, spec)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, originX: e.clientX, anchorStart: start, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const dxPx = e.clientX - d.originX;
    if (!d.moved && Math.abs(dxPx) < TAP_PX) return;
    d.moved = true;
    const deltaIdx = -Math.round((dxPx / rect.width) * span);
    const next = applyBrushDrag("pan", d.anchorStart, span, deltaIdx, points.length, MIN_SPAN);
    setWin({ start: next.start, span }); // pan ⇒ Custom tự động là nhãn đang chọn
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = drag.current?.pointerId === e.pointerId && drag.current?.moved === false;
    if (wasTap) {
      const i = xToIdx(e.clientX);
      if (i !== null) onSelect(i);
    }
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };
  const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };
```

with:

```tsx
  // 1 ngón: tap = chọn ngày, kéo ngang = pan; 2 ngón: pinch zoom — cùng cơ chế TimeMachine
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pts.current.set(e.pointerId, e.clientX);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (pts.current.size >= 2) {
      // chỉ khởi tạo pinch khi vừa chạm ngón thứ 2; ngón thứ 3+ bỏ qua, không đụng drag
      if (pts.current.size === 2) {
        const xs = [...pts.current.values()];
        const dist = Math.abs(xs[0] - xs[1]) || 1;
        const centerX = (xs[0] + xs[1]) / 2;
        pinch.current = {
          startDist: dist,
          anchorSpan: span,
          // xToIdx trả null khi rect chưa đo được — neo tâm giữa cửa sổ
          centerIdx: xToIdx(centerX) ?? start + Math.floor(span / 2),
        };
      }
      drag.current = null;
      return;
    }
    drag.current = { pointerId: e.pointerId, originX: e.clientX, anchorStart: start, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, e.clientX);

    if (pinch.current && pts.current.size >= 2) {
      const xs = [...pts.current.values()];
      const dist = Math.abs(xs[0] - xs[1]) || 1;
      const factor = pinch.current.startDist / dist;
      const next = zoomTo(pinch.current.anchorSpan, factor, pinch.current.centerIdx, points.length, MIN_SPAN);
      setWin({ start: next.start, span: next.span });
      return;
    }

    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const dxPx = e.clientX - d.originX;
    if (!d.moved && Math.abs(dxPx) < TAP_PX) return;
    d.moved = true;
    const deltaIdx = -Math.round((dxPx / rect.width) * span);
    const next = applyBrushDrag("pan", d.anchorStart, span, deltaIdx, points.length, MIN_SPAN);
    setWin({ start: next.start, span }); // pan ⇒ Custom tự động là nhãn đang chọn
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = drag.current?.pointerId === e.pointerId && drag.current?.moved === false;
    if (wasTap) {
      const i = xToIdx(e.clientX);
      if (i !== null) onSelect(i);
    }
    pts.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    if (pts.current.size < 2) {
      pinch.current = null;
      // còn đúng 1 ngón sau khi nhả khỏi pinch ⇒ tiếp tục cho phép pan bằng ngón đó
      if (pts.current.size === 1) {
        const [pid, clientX] = [...pts.current.entries()][0];
        drag.current = { pointerId: pid, originX: clientX, anchorStart: view.current.start, moved: false };
      }
    }
  };
  const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    pts.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
    if (pts.current.size < 2) pinch.current = null;
  };
```

- [ ] **Step 4: Add the wheel-zoom effect**

Directly after `onPointerCancel` (before `const inWin = ...`), add:

```tsx
  // wheel zoom — listener gốc non-passive để preventDefault chặn cuộn trang
  // (React onWheel là passive ⇒ preventDefault vô hiệu). view ref cập nhật mỗi
  // render để không gắn/gỡ listener mỗi lần span/start đổi.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const { start: st, span: sp, total } = view.current;
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const centerIdx = st + Math.round(frac * (sp - 1));
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const next = zoomTo(sp, factor, centerIdx, total, MIN_SPAN);
      setWin({ start: next.start, span: next.span });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [points.length]);
```

- [ ] **Step 5: Update the aria-label**

In the `<svg>` element, change:

```tsx
          aria-label="Biểu đồ giá — chạm để chọn ngày, kéo để trượt thời gian"
```

to:

```tsx
          aria-label="Biểu đồ giá — chạm để chọn ngày, kéo để trượt, chụm 2 ngón hoặc lăn chuột để zoom"
```

- [ ] **Step 6: Typecheck + run existing tests**

Run:

```bash
npx tsc --noEmit
npm test
```

Expected: tsc clean; test suite same as before this change — 298 passing, 1 pre-existing unrelated failure in `fusion.evidence.test.ts` ("placebo đồng-n train"). `src/lib/price-chart.test.ts` all 11 pass.

- [ ] **Step 7: Stage (do NOT commit)**

```bash
git add src/components/PriceChart.tsx
```

Report status DONE with note "staged, awaiting owner's commit request" — the repo owner's global rule forbids committing without an explicit ask.
