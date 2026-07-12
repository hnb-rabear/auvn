# BearDownsideCard: window-relative rescale + date labels + mouse drag-pan

## Problem

v3's time-window chart (SH=200, native `overflow-x:auto`, 6T/1N/3N buttons) computes its Y-axis from the ENTIRE price history (`spark` useMemo in `src/components/BearDownsideCard.tsx:128-137` scans all of `prices`), not the window currently in view. Scrolling to look at "6T" still scales the line against 15 years of range, so recent volatility reads as nearly flat — increasing `SH` (two prior tweaks, 64→96→200) could not fix this because the problem is the Y-domain, not the pixel height.

Two further gaps vs `TimeMachine.tsx`: no first/last date labels for the visible window, and no way to pan with a mouse on desktop (native `overflow-x:auto` only responds to the visible scrollbar or Shift+wheel — touch swipe already works via `touch-action: pan-x`).

## Non-goals (carried over from the v3 design, unchanged)

- No zoom / pinch-zoom.
- No change to fixed px/session density (`VIEWPORT_PX / WINDOW_SESSIONS[winKey]`) — this is what keeps tap targets large enough on mobile; the v2 compress-to-viewBox approach was rejected for exactly this reason and must not return.
- No change to `src/lib/bear-downside*.ts`, `types.ts`, or JSON shape.
- No change to the 6T/1N/3N window-size buttons or `scrollToIdx`'s 3 call sites.

## Approach

Reuse TimeMachine's two ideas (window-relative min/max, corner date labels) without reusing its viewBox-compression mechanism. Keep the existing giant fixed-density SVG + native horizontal scroll; layer three additions on top:

**1. Window-relative Y rescale.** Track the currently-visible index range as React state (`visStart`/`visEnd`), derived from `wrapRef.current.scrollLeft`/`clientWidth`/`pxPerSession`. Update it from a `scroll` listener on `wrapRef`, debounced ~150ms so the path only redraws once scrolling settles (not every scroll tick — avoids jank and repeated recompute of a multi-thousand-point path). `spark`'s min/max computation changes from scanning all of `prices` to scanning `prices.slice(visStart, visEnd)`; the x-mapping (`i * pxPerSession`) is untouched, so only the line's vertical scale changes, not its horizontal layout. Initialize `visStart`/`visEnd` from the initial scroll position (index 0 or `asOfIdx`, matching current `scrollToIdx` targets) so the first paint is already correctly scaled.

**2. Date edge labels.** Two small absolutely-positioned spans over `.bdo-sparkwrap` (same idea as TimeMachine's `tm-edge from`/`tm-edge to`), showing `fmtDate(points[visStart].date)` and `fmtDate(points[visEnd - 1].date)`. Driven by the same debounced `visStart`/`visEnd` state as the rescale, so both update together.

**3. Mouse drag-to-pan.** Add `onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel` handlers on `wrapRef`, filtered to `e.pointerType === "mouse"` only — touch/pen pointers are left alone so the existing native `touch-action: pan-x` swipe keeps working untouched. On mouse-down, record `startX` and `el.scrollLeft`; on mouse-move while the button is held, set `el.scrollLeft = startScrollLeft - (clientX - startX)` and mark a `draggedRef` flag once movement exceeds a small threshold (~5px); on click, if `draggedRef` was set, skip `pickAt` (suppress the date-pick tap) and reset the flag. `cursor: grab` on `.bdo-sparkwrap`, `cursor: grabbing` while dragging (CSS, via a class toggle).

## Data flow

```
scroll event (native, from either drag-scrollbar, touch swipe, or new mouse-drag)
  -> debounced handler reads wrapRef.scrollLeft/clientWidth
  -> computes visStart/visEnd via pxPerSession
  -> setState triggers re-render
  -> spark useMemo recomputes min/max from prices.slice(visStart, visEnd) only
  -> path `d` and date-edge labels redraw
```

`pickAt` (tap-to-select-date) and `scrollToIdx` (programmatic scroll on asOfIdx sync / winKey change / date-picker) are unchanged.

## Error handling / edge cases

- `visEnd - visStart < 2`: fall back to the full-history min/max (existing behavior) to avoid a degenerate/flat line when the visible slice is emptied.
- `wrapRef.current` null (not yet mounted): scroll listener attached in the existing `useEffect` pattern already used for `scrollToIdx`; no new null-check patterns needed beyond guarding on ref presence, consistent with existing code (`scrollToIdx` already guards `if (!el) return`).
- Mouse-drag threshold (~5px) prevents an ordinary click (date-pick tap) from being swallowed as a drag.

## Testing

- Existing test suite (`npm test`) must still pass unchanged — no engine/lib files touched.
- Manual/device verification (this environment has no browser tool, same limitation noted in the v3 task-3 brief): drag-to-pan feel, scroll-debounce smoothness, and date-label correctness on a real desktop + touch device should be confirmed by the project owner before considering this fully done — call this out explicitly in the final report, same as the v3 verification caveat.
