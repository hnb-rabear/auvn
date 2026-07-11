# PriceChart wheel + pinch zoom — design

## Goal

Add mouse-wheel zoom and 2-finger pinch zoom to `PriceChart` (Dashboard chart), matching the exact gesture mechanism already shipped in `TimeMachine.tsx` ("Máy Thời Gian"). Currently `PriceChart` only supports single-finger tap (select day) and drag (pan); range changes require tapping the 1T/3T/6T/1N/3N/Tất cả buttons.

## Architecture

Port TimeMachine's gesture state machine into `PriceChart.tsx`, reusing the existing pure helper `zoomTo` from `src/lib/brush.ts` (already used by TimeMachine; not yet imported by PriceChart — `applyBrushDrag` is the only one imported today). No changes to `src/lib/brush.ts`, `src/lib/price-chart.ts`, or any other file — this is a single-file, event-wiring-only change.

`PriceChart` keeps its own window model (`win: {start, span} | null`, where `null` means "derive from the active range button via `windowFor`"). Both new gestures resolve to `setWin({start, span})`, the same call already used by the existing pan handler — this automatically flips the range chip to "Tùy chỉnh", identical to today's pan behavior. This differs from TimeMachine only in plumbing (TimeMachine has separate `viewStart`/`viewSpan` state + a `zoomMonths` tri-state); the zoom math and gesture detection are otherwise identical.

## State/refs to add

Mirroring `TimeMachine.tsx` (lines ~79-100 for refs, ~288-311 for the wheel effect):

- `pts` ref — `Map<pointerId, clientX>`, replaces treating `drag` as the only pointer state. Tracks every active pointer.
- `pinch` ref — `{ startDist: number; anchorSpan: number; centerIdx: number } | null`. Set when a 2nd pointer touches down, cleared when fewer than 2 pointers remain.
- `view` ref — synced every render to `{ start, span, total: points.length }`. Needed because the wheel listener is attached once via `useEffect` and must not read stale closure values. (TimeMachine splits this into `startRef` + `wheelState` for historical reasons; one ref suffices here.)

`drag` ref (existing) is kept for the single-finger pan/tap path, unchanged.

## Pointer handlers

Extend the existing `onPointerDown` / `onPointerMove` / `onPointerUp` / `onPointerCancel` to branch on pointer count, matching TimeMachine's logic exactly:

- **onPointerDown**: record pointer in `pts`. If this is the 2nd pointer (`pts.size === 2`), compute the distance and midpoint between the two touches, init `pinch = { startDist, anchorSpan: span, centerIdx: xToIdx(centerX) ?? start + Math.floor(span / 2) }`, and clear `drag` (a 3rd+ pointer is ignored, per TimeMachine). Note: unlike TimeMachine's `xToIdx`, PriceChart's returns `number | null` (null when the SVG rect is unmeasurable) — fall back to the window center. Otherwise (1st pointer), behave exactly as today — start `drag` for pan/tap.
- **onPointerMove**: if `pinch` is set and `pts.size >= 2`, recompute distance → `factor = pinch.startDist / dist` → `zoomTo(pinch.anchorSpan, factor, pinch.centerIdx, points.length, MIN_SPAN)` → `setWin({start: next.start, span: next.span})`. Otherwise fall through to the existing single-finger pan logic unchanged.
- **onPointerUp**: existing tap/pan-end logic unchanged for the single-finger case. Additionally: remove the pointer from `pts`; if fewer than 2 pointers remain, clear `pinch`; if exactly 1 pointer remains (lifted out of a pinch back to one finger), start a fresh `drag` anchored at that finger's current position (matches TimeMachine — lets the user glide from pinch straight into a pan without lifting).
- **onPointerCancel**: remove pointer from `pts`; clear `pinch` if fewer than 2 remain (matches TimeMachine).

## Wheel zoom

A `useEffect` that attaches a **non-passive** native `wheel` listener directly on `svgRef.current` (not React's `onWheel`, which is passive and cannot call `preventDefault` — needed to stop the page from scrolling while the user zooms the chart). Effect re-runs only when `points.length` changes (mirrors TimeMachine).

Handler:

1. `e.preventDefault()`.
2. Read `rect = el.getBoundingClientRect()`; bail if `rect.width === 0`.
3. `frac = clamp((e.clientX - rect.left) / rect.width, 0, 1)`.
4. `centerIdx = view.current.start + Math.round(frac * (view.current.span - 1))`.
5. `factor = e.deltaY > 0 ? 1.2 : 1 / 1.2`.
6. `next = zoomTo(view.current.span, factor, centerIdx, view.current.total, MIN_SPAN)`.
7. `setWin({start: next.start, span: next.span})`.

## Cleanup

- Remove/replace the now-inaccurate comment `"KHÔNG pinch/wheel — range bằng nút, spec"` above the pointer handlers.
- Update the chart `<svg>`'s `aria-label` to mention zoom, matching TimeMachine's phrasing style (e.g. append "· chụm 2 ngón hoặc lăn chuột để zoom").

## Testing

No new unit tests. Rationale: the ported logic is UI event wiring identical in shape to TimeMachine's already-shipped, already-untested gesture handlers — only the underlying pure functions (`zoomTo`, `applyBrushDrag` in `src/lib/brush.ts`) would be unit-testable, and those already exist (used by TimeMachine) without dedicated tests today. `src/lib/price-chart.ts`'s geometry functions are unchanged and keep their existing 11 passing tests. Manual verification: run dev server, confirm wheel-zoom and pinch-zoom (or trackpad pinch/ctrl+wheel emulation) both narrow/widen the visible window centered on the cursor/touch point, and that the range chip switches to "Tùy chỉnh" as expected.

## Out of scope

- No changes to `TimeMachine.tsx` itself.
- No changes to range-button behavior, custom date-range inputs, or the SJC/XAU geometry.
- No dot-density thinning at wide zoom (TimeMachine's `denseDots` behavior) — not requested, PriceChart's marker rendering is unchanged.
