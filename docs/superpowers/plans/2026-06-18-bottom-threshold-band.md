# Thanh trượt lọc đáy + dải nền Time Machine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm lớp khám phá trong Time Machine: toggle + slider đặt ngưỡng xác suất đáy chu kỳ walk-forward (`cycleProb`), tô dải nền hổ phách các khoảng ngày đạt ngưỡng.

**Architecture:** Một hàm thuần `bottomBandRuns(points, threshold)` gom các dải index liên tiếp có `cycleProb ≥ threshold`. `TimeMachine` thêm state `showBottomExp`/`bottomThr`, toggle + slider (mượn style `.tm-exp`), và vẽ `<rect>` band trong SVG (trước `<path>`, dưới đường giá). Không đụng engine/backtest/marker khác.

**Tech Stack:** TypeScript, React, Vitest (node-env), SVG, CSS.

## Global Constraints

- UI tiếng Việt. Chỉ thêm lớp hiển thị — KHÔNG đụng scoring/backtest/`runBottom`/`BOTTOM_CONFIG`/dữ liệu.
- Lọc theo `cycleProb` (đáy chu kỳ), walk-forward as-of-ngày, đã có sẵn trên `TimelinePoint`.
- Ngày `cycleProb == null` không bao giờ đạt ngưỡng.
- Mặc định ngưỡng = 60. Mẫu số đếm = số ngày **có dữ liệu** (`cycleProb != null`), không phải tổng ngày.
- Lớp này độc lập lớp "Ngưỡng thử nghiệm" composite (`showExp`) — không thay nó.

Spec: `docs/superpowers/specs/2026-06-18-bottom-threshold-band-design.md`.

---

## File Structure

- `src/lib/timeline.ts` — **Modify.** Thêm hàm thuần `bottomBandRuns`.
- `tests/timeline.test.ts` — **Modify.** Test `bottomBandRuns`.
- `src/components/TimeMachine.tsx` — **Modify.** State + toggle + slider + band rects.
- `src/app/globals.css` — **Modify.** `.tm-band`.

---

## Task 1: Hàm thuần `bottomBandRuns`

**Files:**
- Modify: `src/lib/timeline.ts`
- Test: `tests/timeline.test.ts`

**Interfaces:**
- Consumes: type `TimelinePoint` (đã import trong timeline.ts) với field `cycleProb?: number | null`.
- Produces: `export function bottomBandRuns(points: TimelinePoint[], threshold: number): { start: number; end: number }[]` — các dải index liên tiếp (đầu–cuối inclusive) có `cycleProb != null && cycleProb >= threshold`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào CUỐI `tests/timeline.test.ts`:

```ts
import { bottomBandRuns } from "../src/lib/timeline";

describe("bottomBandRuns", () => {
  const mk = (cycleProb: number | null): any => ({
    date: "x", price: 1, composite: 0, zone: "neutral", scores: {},
    returns: { "21": null, "63": null, "126": null }, cycleProb,
  });
  it("gom dải liên tiếp cycleProb>=ngưỡng; null & dưới-ngưỡng cắt dải", () => {
    const pts = [null, 70, 71, 50, 80, null, 90].map(mk);
    expect(bottomBandRuns(pts, 60)).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 4 },
      { start: 6, end: 6 },
    ]);
  });
  it("biên: >= chứ không >", () => {
    expect(bottomBandRuns([60, 59].map(mk), 60)).toEqual([{ start: 0, end: 0 }]);
  });
  it("dải chạm cuối mảng được đóng", () => {
    expect(bottomBandRuns([10, 80, 90].map(mk), 60)).toEqual([{ start: 1, end: 2 }]);
  });
  it("rỗng khi không ngày nào đạt", () => {
    expect(bottomBandRuns([null, 10, 20].map(mk), 60)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/timeline.test.ts -t bottomBandRuns`
Expected: FAIL — `bottomBandRuns` chưa export.

- [ ] **Step 3: Cài đặt**

Thêm vào cuối `src/lib/timeline.ts` (file đã `import type { ... TimelinePoint ... } from "./types";`):

```ts
/** Các dải index LIÊN TIẾP có cycleProb != null && >= threshold (lớp lọc đáy walk-forward). */
export function bottomBandRuns(
  points: TimelinePoint[],
  threshold: number
): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let s = -1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i].cycleProb;
    const hit = p != null && p >= threshold;
    if (hit && s === -1) s = i;
    else if (!hit && s !== -1) {
      runs.push({ start: s, end: i - 1 });
      s = -1;
    }
  }
  if (s !== -1) runs.push({ start: s, end: points.length - 1 });
  return runs;
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx vitest run tests/timeline.test.ts`
Expected: tất cả PASS (gồm 4 test mới).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline.ts tests/timeline.test.ts
git commit -m "feat(timeline): bottomBandRuns — gom dải ngày cycleProb>=ngưỡng"
```

---

## Task 2: UI lọc đáy trong TimeMachine (toggle + slider + dải nền)

**Files:**
- Modify: `src/components/TimeMachine.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `bottomBandRuns` từ `@/lib/timeline` (Task 1); `spark` memo có `W`, `H`, hàm `x(i)`, `win`, `start`, `end`.

> Đây là UI — verify bằng `npm run build` + `npm test` (không golden đổi) + kiểm tra tay. Không unit test riêng cho component (theo lệ repo).

- [ ] **Step 1: Import + state + memo đếm + memo runs**

Trong `src/components/TimeMachine.tsx`:

(a) Thêm `bottomBandRuns` vào import từ `@/lib/timeline` (khối import có `idxsAtOrAbove`, `idxsAtOrBelow`, `indexOnOrAfter`, `indexOnOrBefore`):
```ts
  idxsAtOrAbove,
  idxsAtOrBelow,
  indexOnOrAfter,
  indexOnOrBefore,
  bottomBandRuns,
```

(b) Cạnh các `useState` khác (sau `const [expThr, setExpThr] = useState<number | null>(null);`), thêm:
```ts
  const [showBottomExp, setShowBottomExp] = useState(false);
  const [bottomThr, setBottomThr] = useState(60);
```

(c) Cạnh các memo khác (sau `expIdxs` memo), thêm:
```ts
  const bottomRuns = useMemo(
    () => (showBottomExp ? bottomBandRuns(points, bottomThr) : []),
    [showBottomExp, bottomThr, points]
  );
  const bottomDataCount = useMemo(() => points.filter((q) => q.cycleProb != null).length, [points]);
  const bottomHitCount = useMemo(
    () => points.filter((q) => q.cycleProb != null && q.cycleProb >= bottomThr).length,
    [points, bottomThr]
  );
```

- [ ] **Step 2: Thêm `bands` vào `spark` memo**

Trong `spark` useMemo, NGAY TRƯỚC `const inWindow = idx >= start && idx < end;`, thêm:
```ts
    const step = W / (win.length - 1);
    const bands = bottomRuns
      .map((r) => ({ s: Math.max(r.start, start), e: Math.min(r.end, end - 1) }))
      .filter((r) => r.s <= r.e)
      .map((r) => {
        const left = x(r.s);
        const right = Math.min(x(r.e) + step, W); // +step để dải 1 ngày vẫn hiện; kẹp W
        return { x: left, w: right - left };
      });
```

Thêm `bands,` vào object `return` của spark (cạnh `markers,`).

Thêm `bottomRuns` vào dependency array của spark memo (đổi `[points, idx, p, signalIdxs, sellIdxs, expIdxs, showSell, start, end]` → thêm `, bottomRuns`):
```ts
  }, [points, idx, p, signalIdxs, sellIdxs, expIdxs, showSell, start, end, bottomRuns]);
```

- [ ] **Step 3: Render band rects trong SVG (trước `<path>`)**

Trong JSX `<svg ...>`, NGAY TRƯỚC dòng `<path d={spark.path} ...>`, thêm:
```tsx
          {spark.bands.map((b, i) => (
            <rect key={`bd${i}`} className="tm-band" x={b.x} y={0} width={b.w} height={spark.H} />
          ))}
```

- [ ] **Step 4: Toggle trong panel ⚙**

NGAY SAU khối `<label className="tm-toggle muted small">…Ngưỡng thử nghiệm</label>` (đóng ở dòng có `Ngưỡng thử nghiệm`), thêm:
```tsx
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showBottomExp} onChange={(e) => setShowBottomExp(e.target.checked)} />
            Ngưỡng đáy thử nghiệm
          </label>
```

- [ ] **Step 5: Slider lọc đáy**

NGAY SAU khối `{showExp && ( <label className="slider-row tm-exp"> … </label> )}` (kết thúc của slider composite), thêm:
```tsx
      {showBottomExp && (
        <label className="slider-row tm-exp">
          <span>
            Ngưỡng đáy ≥ {bottomThr}% — <b>{bottomHitCount}</b> ngày đạt / {bottomDataCount} ngày có dữ liệu
            <span className="muted small">
              {" "}
              · vùng tool báo gần-đáy real-time (walk-forward) — chỉ để khám phá
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={bottomThr}
            onChange={(e) => setBottomThr(Number(e.target.value))}
          />
        </label>
      )}
```

- [ ] **Step 6: CSS `.tm-band`**

Trong `src/app/globals.css`, sau rule `.tm-markers` (hoặc cạnh các `.tm-mk`), thêm:
```css
.tm-band { fill: rgba(230, 184, 76, 0.14); }
```

- [ ] **Step 7: Build + test + kiểm tra tay**

Run: `npm run build` → Expected: PASS, không lỗi type.
Run: `npm test` → Expected: PASS (không golden đổi; Task 1 test xanh).

Kiểm tra tay (`npm run dev`, mở Máy thời gian, ⚙):
- Bật "Ngưỡng đáy thử nghiệm" → slider hiện (mặc định 60), dải hổ phách mờ hiện **dưới** đường giá tại vùng `cycleProb≥60`.
- Kéo slider xuống/lên → dải vẽ lại tức thì; số "N ngày đạt / M ngày có dữ liệu" đổi theo.
- Zoom (6T/1N/…) + kéo pan → dải co đúng khung, không tràn mép.
- Vùng đầu lịch sử (cycleProb null) không tô.
- Tắt toggle → hết dải. Slider composite vẫn hoạt động độc lập.

- [ ] **Step 8: Commit**

```bash
git add src/components/TimeMachine.tsx src/app/globals.css
git commit -m "feat(tm): lớp lọc đáy — toggle + slider ngưỡng cycleProb + dải nền"
```

---

## Self-Review notes (đã kiểm)

- **Spec coverage:** `bottomBandRuns` pure (Task 1) khớp spec; toggle độc lập `showBottomExp` + slider mặc định 60 + đếm N/M-ngày-có-dữ-liệu (Task 2 Steps 1,4,5); band SVG rect dưới path với `+step` & kẹp W (Task 2 Steps 2,3); CSS `.tm-band` (Step 6); chỉ cycle, chỉ band, không đụng engine (Global Constraints).
- **Type consistency:** `bottomBandRuns(points, threshold) → {start,end}[]` (Task 1) dùng đúng ở Task 2 memo. `cycleProb` đọc `!= null && >= thr` đồng nhất ở runs, đếm, và helper. `spark.bands` = `{x,w}` khớp render `<rect x w>`.
- **No look-ahead / no data change:** chỉ đọc `cycleProb` đã có; không tính lại gì.
- **Placeholder:** không có.
- **Edge:** dải 1 ngày hiện nhờ `+step`; band kẹp `W` không tràn; `win.length<2` đã được spark return null trước đó nên `step` không chia 0.
