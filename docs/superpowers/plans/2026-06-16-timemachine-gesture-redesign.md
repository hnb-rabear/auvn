# Máy thời gian — thao tác cử chỉ-first — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay điều khiển Máy thời gian bằng cử chỉ thẳng trên biểu đồ (pan/tap/pinch + wheel desktop), bỏ minimap brush riêng, sắp lại bố cục dọc cho dễ đọc trên mobile.

**Architecture:** Toán zoom là hàm thuần mới trong `src/lib/brush.ts` (test đơn vị, không DOM). `TimeMachine.tsx` viết lại render + nối pointer/wheel event → gọi hàm thuần → set state; mọi logic tính toán (composites, signalIdxs, histGuidance, verdictFor, marker) giữ nguyên. `TimelineBrush.tsx` bị xóa. CSS thêm class chart riêng `.tm-chart`, không đụng `.spark` dùng chung với `PremiumChart`.

**Tech Stack:** Next.js + TypeScript (static export), React pointer events, Vitest (node env, không jsdom — chỉ test hàm thuần), CSS thuần.

Spec nguồn: `docs/superpowers/specs/2026-06-16-timemachine-gesture-redesign-design.md`.

---

## File Structure

- `src/lib/brush.ts` — **Modify.** Thêm hàm thuần `zoomTo(anchorSpan, factor, centerIdx, total, minSpan)` cạnh `applyBrushDrag`/`centerWindow`. Trách nhiệm: toán cửa sổ thuần.
- `tests/brush.test.ts` — **Modify.** Thêm `describe("zoomTo", ...)`.
- `src/components/TimeMachine.tsx` — **Modify (rewrite render + handlers).** Bề mặt cử chỉ, bố cục dọc mới, FAB, ⚙ panel. Giữ logic tính toán.
- `src/components/TimelineBrush.tsx` — **Delete.**
- `src/app/globals.css` — **Modify.** Thêm `.tm-chart`, `.tm-fab`, `.tm-gear*`, `.tm-dateband`, `.tm-results`; bỏ `.tm-nav`, `.tm-brush*`. Giữ `.spark`/`.premium-spark`.

---

## Task 1: Hàm thuần `zoomTo` trong brush.ts

**Files:**
- Modify: `src/lib/brush.ts`
- Test: `tests/brush.test.ts`

Ngữ nghĩa: `factor` nhân vào span (factor < 1 = phóng to/zoom in = cửa sổ hẹp lại; factor > 1 = thu nhỏ/zoom out = cửa sổ rộng ra). Span mới kẹp `[minSpan, total]`, rồi căn tâm quanh `centerIdx` bằng `centerWindow` đã có. Dùng chung cho pinch (factor = startDist/curDist) và wheel (factor = 1.2 hoặc 1/1.2 mỗi nấc).

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `tests/brush.test.ts`:

```ts
import { applyBrushDrag, centerWindow, zoomTo } from "../src/lib/brush";
// (sửa dòng import 2 hiện có để thêm zoomTo)

describe("zoomTo", () => {
  it("factor < 1 = phóng to: span hẹp lại, căn tâm", () => {
    // anchorSpan 40, factor 0.5 -> span 20, center 50 -> start 40
    expect(zoomTo(40, 0.5, 50, TOTAL, MIN)).toEqual({ start: 40, span: 20 });
  });
  it("factor > 1 = thu nhỏ: span rộng ra", () => {
    expect(zoomTo(20, 2, 50, TOTAL, MIN)).toEqual({ start: 30, span: 40 });
  });
  it("kẹp span tại minSpan khi phóng quá sâu", () => {
    expect(zoomTo(20, 0.1, 50, TOTAL, MIN)).toEqual({ start: 43, span: 14 });
  });
  it("kẹp span tại total khi thu quá rộng", () => {
    expect(zoomTo(80, 5, 50, TOTAL, MIN)).toEqual({ start: 0, span: 100 });
  });
  it("căn tâm kẹp biên trái", () => {
    // span 20 quanh center 3 -> start kẹp 0
    expect(zoomTo(40, 0.5, 3, TOTAL, MIN)).toEqual({ start: 0, span: 20 });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/brush.test.ts -t zoomTo`
Expected: FAIL — "zoomTo is not a function" / không export.

- [ ] **Step 3: Cài đặt tối thiểu**

Thêm vào `src/lib/brush.ts` (sau `centerWindow`):

```ts
/**
 * Zoom cửa sổ: nhân span với factor (factor<1 = phóng to, >1 = thu nhỏ),
 * kẹp [minSpan, total], rồi căn tâm quanh centerIdx. Dùng cho pinch + wheel.
 */
export function zoomTo(
  anchorSpan: number,
  factor: number,
  centerIdx: number,
  total: number,
  minSpan: number
): { start: number; span: number } {
  const min = Math.min(minSpan, total);
  const span = clamp(Math.round(anchorSpan * factor), min, total);
  return { start: centerWindow(centerIdx, span, total), span };
}
```

(`clamp` đã có sẵn ở đầu file.)

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `npx vitest run tests/brush.test.ts -t zoomTo`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/brush.ts tests/brush.test.ts
git commit -m "feat(brush): zoomTo — toán zoom cửa sổ thuần cho pinch/wheel"
```

---

## Task 2: CSS — class chart riêng + FAB + bố cục mới

**Files:**
- Modify: `src/app/globals.css`

Thêm class mới, **không** sửa `.spark`/`.premium-spark`. Giữ `.tm-zoom`, `.tm-detail`, `.tm-scores`, `.tm-outcome*`, `.tm-zone*` đang dùng. Bỏ `.tm-nav`, `.tm-brush*` (component xóa ở Task 4).

- [ ] **Step 1: Thêm CSS chart + FAB + dải ngày + kết quả gọn**

Thêm vào `src/app/globals.css` (gần khối `.spark`):

```css
/* chart TimeMachine — class riêng, KHÔNG đụng .spark (dùng chung PremiumChart) */
.tm-chartwrap {
  position: relative;
}
.tm-chart {
  width: 100%;
  height: 200px;
  display: block;
  background: var(--card2);
  border-radius: 8px;
  margin-bottom: 6px;
  touch-action: none; /* pan/pinch không cuộn trang */
  user-select: none;
  cursor: crosshair;
}
/* nút nổi nhảy tín hiệu mua — 2 mép chart */
.tm-fab {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(21, 19, 15, 0.82);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.tm-fab.left { left: 6px; }
.tm-fab.right { right: 6px; }
.tm-fab:disabled { opacity: 0.3; cursor: default; }

/* dải ngày + zone dán ngay dưới chart */
.tm-dateband {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin: 2px 0 10px;
}
.tm-dateband .d { font-weight: 700; }

/* hàng kết quả 1T/3T/6T gọn 1 dải */
.tm-results {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 0.86rem;
  margin: 8px 0;
}
.tm-results .r b.buy { color: var(--buy); }
.tm-results .r b.sell { color: var(--sell); }
.tm-results .r.hl { font-weight: 700; }

/* panel ⚙ tùy chọn phụ */
.tm-gear {
  background: var(--card2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 2: Xác nhận build CSS không vỡ**

Run: `npm run build`
Expected: build PASS (chưa dùng class mới ⇒ chỉ kiểm CSS hợp lệ; TimeMachine vẫn bản cũ tới Task 3).

> Lưu ý: Task 2 chỉ THÊM class, chưa xóa `.tm-nav`/`.tm-brush*` (còn bản cũ tham chiếu). Xóa ở Task 5 sau khi component mới + xóa TimelineBrush xong.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style(tm): class chart riêng .tm-chart + FAB + dải ngày/kết quả mới"
```

---

## Task 3: TimeMachine — handler cử chỉ + bố cục mới

**Files:**
- Modify: `src/components/TimeMachine.tsx`

Viết lại phần render + thêm handler pointer/wheel. Giữ nguyên: imports logic (`composites`, `idxsAtOrAbove`, `idxsAtOrBelow`, `indexOnOrAfter`, `indexOnOrBefore`, `centerWindow`), `verdictFor`, `histGuidance`, `spark` (đổi class), `comps/signalIdxs/sellIdxs/expIdxs`, `prevSignal/nextSignal`, `applyZoom`, `goTo`, `centerOn`, `applyDateRange`. Thêm import `zoomTo` và `applyBrushDrag`.

Mô hình cử chỉ: gom mọi pointerdown trên SVG qua một handler. Đếm pointer đang nhấn: 1 = pan/tap, 2 = pinch. Ngưỡng tap = 6px.

- [ ] **Step 1: Cập nhật import + thêm refs/handler cử chỉ**

Sửa import từ `@/lib/brush` và `@/lib/timeline`:

```ts
import { centerWindow } from "@/lib/brush";
import { applyBrushDrag, zoomTo } from "@/lib/brush";
```

Gộp thành 1 dòng:

```ts
import { applyBrushDrag, centerWindow, zoomTo } from "@/lib/brush";
```

Xóa import `TimelineBrush`:

```ts
// XÓA dòng: import TimelineBrush from "./TimelineBrush";
```

Thêm refs gesture trong component (cạnh `svgRef`):

```ts
  // trạng thái cử chỉ 1 ngón (pan/tap) — px màn hình
  const drag = useRef<{
    pointerId: number;
    originX: number;
    anchorStart: number;
    moved: boolean;
  } | null>(null);
  // trạng thái pinch 2 ngón
  const pinch = useRef<{
    startDist: number;
    anchorSpan: number;
    centerIdx: number;
  } | null>(null);
  const pts = useRef<Map<number, number>>(new Map()); // pointerId -> clientX
```

Thêm helper đổi clientX → index timeline trong cửa sổ hiện tại:

```ts
  const xToIdx = useCallback(
    (clientX: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return idx;
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return start + Math.round(frac * (span - 1));
    },
    [idx, start, span]
  );
```

- [ ] **Step 2: Thêm các pointer handler**

Thêm vào component (thay `onChartClick` cũ):

```ts
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pts.current.set(e.pointerId, e.clientX);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (pts.current.size === 2) {
      // vào pinch: tính khoảng cách + tâm 2 ngón
      const xs = [...pts.current.values()];
      const dist = Math.abs(xs[0] - xs[1]) || 1;
      const centerX = (xs[0] + xs[1]) / 2;
      pinch.current = { startDist: dist, anchorSpan: span, centerIdx: xToIdx(centerX) };
      drag.current = null; // huỷ pan khi thành pinch
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
      const factor = pinch.current.startDist / dist; // ngón giãn ra ⇒ factor<1 ⇒ zoom in
      const next = zoomTo(pinch.current.anchorSpan, factor, pinch.current.centerIdx, points.length, MIN_SPAN);
      setViewStart(next.start);
      setViewSpan(next.span);
      setZoomMonths("custom");
      return;
    }

    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const dxPx = e.clientX - d.originX;
    if (!d.moved && Math.abs(dxPx) < 6) return; // dưới ngưỡng ⇒ vẫn là tap tiềm năng
    d.moved = true;
    const deltaIdx = -Math.round((dxPx / rect.width) * span); // kéo phải ⇒ xem quá khứ (start giảm)
    const next = applyBrushDrag("pan", d.anchorStart, span, deltaIdx, points.length, MIN_SPAN);
    setViewStart(next.start);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = drag.current?.pointerId === e.pointerId && drag.current?.moved === false;
    if (wasTap) setIdx(xToIdx(e.clientX)); // tap = chọn ngày
    pts.current.delete(e.pointerId);
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

```

Wheel zoom KHÔNG dùng React `onWheel` — React 19 gắn `wheel` ở root dạng **passive**, nên `e.preventDefault()` trong `onWheel` vô hiệu (chỉ log cảnh báo) và trang vẫn cuộn. Phải gắn listener gốc `{ passive: false }` qua `useEffect`:

```ts
  // wheel zoom — listener gốc non-passive để preventDefault chặn cuộn trang
  // (React onWheel là passive ⇒ preventDefault vô hiệu). Ref cập nhật để không
  // gắn/gỡ listener mỗi lần span/start đổi.
  const wheelState = useRef({ span, total: points.length });
  wheelState.current = { span, total: points.length };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const { span: sp, total } = wheelState.current;
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const centerIdx = startRef.current + Math.round(frac * (sp - 1));
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2; // cuộn xuống = thu nhỏ
      const next = zoomTo(sp, factor, centerIdx, total, MIN_SPAN);
      setViewStart(next.start);
      setViewSpan(next.span);
      setZoomMonths("custom");
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [points.length]);
```

Vì handler gốc đọc `start` qua closure cũ, thêm một ref bám `start` (đặt cạnh các ref khác):

```ts
  const startRef = useRef(start);
  startRef.current = start;
```

Và thêm `useEffect`, `useRef` vào import React đầu file nếu thiếu:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

> Lưu ý hướng pan: kéo ngón sang phải nên lộ dữ liệu **quá khứ** (cửa sổ lùi về trái) ⇒ `deltaIdx = -round(dxPx/width*span)`. Kiểm tra tay ở Step 6; nếu thấy ngược trực giác, đổi dấu.

- [ ] **Step 3: Đổi class chart + bọc FAB, thay `onChartClick`**

Thay khối `<svg className="spark tm-clickable" ... onClick={onChartClick}>` bằng:

```tsx
      {spark && (
        <div className="tm-chartwrap">
          <svg
            ref={svgRef}
            className="tm-chart"
            viewBox={`0 0 ${spark.W} ${spark.H}`}
            preserveAspectRatio="none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Biểu đồ giá XAU/USD — kéo để trượt, chạm để chọn ngày, chụm 2 ngón để zoom"
          >
            {/* GIỮ NGUYÊN nội dung bên trong: path, expMarkers, sellMarkers, markers, bottomMarkers, con trỏ */}
          </svg>
          <button
            className="tm-fab left"
            disabled={prevSignal === undefined}
            onClick={() => prevSignal !== undefined && goTo(prevSignal)}
            aria-label="Tín hiệu mua trước"
          >◀</button>
          <button
            className="tm-fab right"
            disabled={nextSignal === undefined}
            onClick={() => nextSignal !== undefined && goTo(nextSignal)}
            aria-label="Tín hiệu mua sau"
          >▶</button>
        </div>
      )}
```

> `spark.W`/`spark.H` không đổi (700×120 viewBox) — chiều cao hiển thị do CSS `.tm-chart{height:200px}` + `preserveAspectRatio="none"` quyết định. Marker/con trỏ vẫn vẽ đúng theo tỉ lệ viewBox.

- [ ] **Step 4: Xóa `TimelineBrush` + `tm-nav`, thêm dải ngày/kết quả/⚙**

Xóa khối `{points.length > MIN_SPAN && (<TimelineBrush ... />)}` và khối `<div className="tm-nav"> ... </div>`.

Di chuyển toggle "Hiện vùng bán" + "Ngưỡng thử nghiệm" + 2 ô ngày from/to vào panel ⚙ (mở bằng state mới `showGear`). Thêm state:

```ts
  const [showGear, setShowGear] = useState(false);
```

Trong hàng `.tm-zoom`, thêm nút ⚙ cuối hàng:

```tsx
        <button
          className="iconbtn small-btn"
          onClick={() => setShowGear((v) => !v)}
          aria-label="Tùy chọn"
          title="Tùy chọn: vùng bán, ngưỡng thử, khoảng ngày"
        >⚙</button>
```

Sau hàng `.tm-zoom`, thêm panel ⚙ (chuyển 2 toggle + 2 ô ngày + caption đếm ngày vào đây):

```tsx
      {showGear && (
        <div className="tm-gear">
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showSell} onChange={(e) => setShowSell(e.target.checked)} />
            Hiện vùng bán (chỉ tham khảo 1 tháng)
          </label>
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showExp} onChange={(e) => setShowExp(e.target.checked)} />
            Ngưỡng thử nghiệm
          </label>
          {spark && (
            <span className="tm-daterange muted small">
              <input
                type="date"
                value={points[start].date}
                min={dates[0]}
                max={points[end - 1].date}
                onChange={(e) => e.target.value && applyDateRange(indexOnOrAfter(dates, e.target.value), end - 1)}
              />
              <span aria-hidden>→</span>
              <input
                type="date"
                value={points[end - 1].date}
                min={points[start].date}
                max={dates[dates.length - 1]}
                onChange={(e) => e.target.value && applyDateRange(start, indexOnOrBefore(dates, e.target.value))}
              />
            </span>
          )}
          <span className="muted small">
            {signalIdxs.length} ngày tín hiệu mua
            {showSell ? ` · ${sellIdxs.length} ngày vùng bán` : ""} / {points.length} ngày — chế độ này
          </span>
        </div>
      )}
```

> Khối `showExp` slider (`.tm-exp`) GIỮ NGUYÊN vị trí hiện có (ngay sau `.tm-zoom`/⚙ panel) — nó chỉ hiện khi `showExp` bật.

- [ ] **Step 5: Sắp lại `.tm-detail` — dải ngày dưới chart + kết quả gọn + gập điểm số**

Ngay sau `</div>` của `tm-chartwrap` (trước `.tm-detail` cũ), thêm dải ngày + zone + Gợi ý + kết quả. Thay khối `.tm-detail` cũ bằng:

```tsx
      <div className="tm-dateband">
        <span className="d">
          {fmtDate(p.date)}{idx === points.length - 1 ? " (mới nhất)" : ""} · XAU ${fmtNum(p.price, 0)}
        </span>
        <span className={`tm-zone ${zoneClass(zone)}`}>
          {zone === "sell" || zone === "strong-sell"
            ? `${ZONE_LABELS[zone]} (tham khảo)`
            : preset && !isBuy
              ? "CHƯA CÓ TÍN HIỆU MUA"
              : ZONE_LABELS[zone]}
          <span className="muted small"> ({composite > 0 ? "+" : ""}{fmtNum(composite)})</span>
        </span>
      </div>

      <ActionGuidance guidance={histGuidance} />

      <div className="tm-results">
        {(["21", "63", "126"] as const).map((h) => {
          const ret = p.returns[h];
          const v = verdictFor(zone, ret, h);
          const isPresetHorizon = presetH === h;
          return (
            <span key={h} className={`r ${isPresetHorizon ? "hl" : ""}`}>
              Sau {HORIZON_LABELS[h]}{isPresetHorizon ? " (preset)" : ""}:{" "}
              <b className={ret === null ? "muted" : ret >= 0 ? "buy" : "sell"}>
                {ret === null ? "chưa có" : `${ret >= 0 ? "+" : ""}${fmtNum(ret)}%`}
              </b>
              {v === "right" && <span className="tm-verdict buy"> ✓</span>}
              {v === "wrong" && <span className="tm-verdict sell"> ✗</span>}
            </span>
          );
        })}
      </div>

      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Chi tiết điểm số</span>
            <span className="acc-sum-meta">4 nhóm tiêu chí · ghi chú lịch sử</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          <div className="tm-scores">
            {(Object.keys(p.scores) as CriterionKey[]).map((k) => (
              <span key={k} className="tm-score">
                {CRITERION_LABELS[k].split(" (")[0]}:{" "}
                <b className={p.scores[k]! > 0 ? "buy" : p.scores[k]! < 0 ? "sell" : "neutral"}>
                  {p.scores[k]! > 0 ? "+" : ""}{fmtNum(p.scores[k]!, 2)}
                </b>
              </span>
            ))}
          </div>
          <p className="muted small">
            Ở chế độ lịch sử: chỉ tín hiệu thế giới (điểm mua + nhóm điểm đáy past-only);
            chênh lệch VN không tham gia backtest. Tín hiệu cho hôm nay xem ở
            <b> Gợi ý hành động</b> đầu trang.
          </p>
        </div>
      </details>
```

> `.acc`/`.acc-sum`/`.acc-body`/`.acc-chev` đã có sẵn (Dashboard accordion) — tái dùng, không thêm CSS.

Rút đoạn intro dài (`<p className="muted small"> Bấm vào biểu đồ ... {timeline.note}`) thành 1 câu ngắn:

```tsx
      <p className="muted small">
        Kéo để trượt thời gian · chạm để chọn ngày · chụm 2 ngón (hoặc lăn chuột) để zoom. {timeline.note}
      </p>
```

- [ ] **Step 6: Build + kiểm tra tay**

Run: `npm run build`
Expected: build PASS, không lỗi type (đặc biệt: không còn tham chiếu `TimelineBrush`, `onChartClick`, `prices`).

> Nếu báo `prices` khai báo nhưng không dùng: xóa dòng `const prices = useMemo(...)` (chỉ TimelineBrush cũ dùng). Giữ `dates` (date inputs + bottomMarkers vẫn dùng).

Kiểm tra tay (`npm run dev`, mở Máy thời gian):
- Mobile/responsive ≤380px: kéo 1 ngón trượt thời gian; chạm chọn ngày (panel đổi); chụm 2 ngón zoom; thao tác chart KHÔNG cuộn trang; 2 FAB ◀▶ nhảy tín hiệu.
- Desktop: kéo chuột pan; lăn chuột zoom quanh con trỏ; click chọn ngày.
- Chip zoom 6T/1N/2N/5N/Tất cả đổi mức; sau pinch/wheel chip bỏ active (custom).
- ⚙ mở: bật vùng bán (chấm đỏ hiện), bật ngưỡng thử (slider + vòng xanh), đổi khoảng ngày.

- [ ] **Step 7: Commit**

```bash
git add src/components/TimeMachine.tsx
git commit -m "feat(tm): cử chỉ pan/tap/pinch+wheel trên chart, bố cục dọc mới, FAB tín hiệu"
```

---

## Task 4: Xóa TimelineBrush

**Files:**
- Delete: `src/components/TimelineBrush.tsx`

- [ ] **Step 1: Xác nhận không còn tham chiếu**

Run: `grep -rn "TimelineBrush" src/ tests/`
Expected: không kết quả (Task 3 đã xóa import).

- [ ] **Step 2: Xóa file**

```bash
git rm src/components/TimelineBrush.tsx
```

- [ ] **Step 3: Build + test toàn bộ**

Run: `npm run build && npm test`
Expected: build PASS; test PASS (gồm `zoomTo` mới + brush/timeline cũ).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(tm): xóa TimelineBrush — chart tự nhận cử chỉ"
```

---

## Task 5: Dọn CSS thừa

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Xóa khối CSS không còn dùng**

Xóa các khối: `.tm-brush`, `.tm-brush-dim`, `.tm-brush-win`, `.tm-brush-win:active`, `.tm-brush-grip`, `.tm-brush-handle`, `.tm-clickable`, `.tm-nav`, `.tm-nav .iconbtn:disabled`. (`.tm-toggle`, `.tm-daterange`, `.tm-exp`, `.tm-detail`, `.tm-row`, `.tm-scores`, `.tm-outcome*` — kiểm tra: `.tm-outcome*` và `.tm-row` không còn dùng sau Task 3 ⇒ xóa luôn; `.tm-toggle`/`.tm-daterange`/`.tm-exp`/`.tm-scores`/`.tm-zone*`/`.tm-verdict*` còn dùng ⇒ giữ.)

- [ ] **Step 2: Xác nhận không class nào bị xóa nhầm**

Run: `grep -rn "tm-row\|tm-outcome\|tm-detail" src/components/TimeMachine.tsx`
Expected: không kết quả (đã thay bằng `tm-dateband`/`tm-results`/`acc`). Nếu còn `tm-detail`/`tm-row`/`tm-outcome` thì GIỮ CSS tương ứng.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "style(tm): dọn CSS brush/nav/outcome không còn dùng"
```

---

## Self-Review notes (đã kiểm)

- **Spec coverage:** cử chỉ pan/tap/pinch/wheel (Task 1+3), 2 FAB (Task 3), chip zoom giữ (Task 3, `applyZoom` nguyên), ⚙ gom toggle/ngày (Task 3), chart 200px class riêng (Task 2), dải ngày dưới chart + Gợi ý đầy đủ + kết quả gọn + gập điểm số (Task 3), xóa TimelineBrush (Task 4), dọn CSS (Task 5). Marker giữ nguyên (Task 3 Step 3 "GIỮ NGUYÊN nội dung").
- **Không đụng:** engine/guidance/backtest/data — đúng spec.
- **Type consistency:** `zoomTo(anchorSpan, factor, centerIdx, total, minSpan)` đồng nhất giữa Task 1 và Task 3. `MIN_SPAN` (hằng có sẵn trong TimeMachine) dùng cho cả pan/pinch/wheel.
- **Test môi trường:** chỉ test hàm thuần `zoomTo` (vitest node env, không jsdom — không thêm lib, đúng YAGNI). Cử chỉ component verify bằng build + kiểm tra tay.
