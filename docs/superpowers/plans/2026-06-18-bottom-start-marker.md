# Marker "khởi đầu vùng đáy" (cạnh lên cycleBin==3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay band percentile (đã chứng minh kém) bằng marker "điểm bắt đầu vùng đáy" = ngày `cycleBin` vừa vào bin cao nhất (oversold+vĩ mô), walk-forward tham-số-0.

**Architecture:** Hàm thuần `bottomStartIdxs` thay `bottomPercentileRank`/`maskRuns`. TimeMachine: bỏ toàn bộ cơ chế percentile (state/memo/window/slider/band), thêm toggle + marker thoi hổ phách + dòng "Điểm BẮT ĐẦU" trong panel ngày. **Một task** (lib + UI cùng commit) để build không vỡ giữa chừng.

**Tech Stack:** TypeScript, React, Vitest (node-env), HTML-overlay marker, CSS.

## Global Constraints

- UI tiếng Việt. Chỉ `src/lib/timeline.ts` + `tests/timeline.test.ts` + `src/components/TimeMachine.tsx` + `src/app/globals.css`. KHÔNG đụng engine/backtest/`runBottom`/`BOTTOM_CONFIG`/dữ liệu.
- Tín hiệu: `cycleBin[i]===3 && cycleBin[i-1]!==3` (walk-forward, không look-ahead, không tham số).
- Marker = hình thoi hổ phách overlay HTML (khác chấm tròn). Nhãn trung thực "dò đáy sớm, không phải đáy chắc, mạnh hơn trong xu hướng tăng".
- Golden engine/backtest tests không đổi.

Spec: `docs/superpowers/specs/2026-06-18-bottom-start-marker-design.md`.

---

## File Structure

- `src/lib/timeline.ts` — thêm `bottomStartIdxs`; xóa `bottomPercentileRank` + `maskRuns`.
- `tests/timeline.test.ts` — xóa test percentile/maskRuns; thêm test `bottomStartIdxs`.
- `src/components/TimeMachine.tsx` — bỏ cơ chế percentile; thêm marker + day-note + toggle.
- `src/app/globals.css` — xóa `.tm-band`; thêm `.tm-mk.start`.

---

## Task 1: Thay percentile bằng marker khởi-đầu-đáy (lib + UI, một commit)

**Files:**
- Modify: `src/lib/timeline.ts`, `tests/timeline.test.ts`, `src/components/TimeMachine.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: `export function bottomStartIdxs(points: TimelinePoint[]): number[]` — index các ngày `cycleBin===3 && previous cycleBin !==3`.
- Removes: `bottomPercentileRank`, `maskRuns` (và mọi tiêu thụ trong TimeMachine).

### Step 1: Test hàm thuần (đỏ)

Trong `tests/timeline.test.ts`: XÓA `import { bottomPercentileRank, maskRuns } ...` và 2 describe `bottomPercentileRank` + `maskRuns`. Thêm:

```ts
import { bottomStartIdxs } from "../src/lib/timeline";

describe("bottomStartIdxs", () => {
  const mk = (cycleBin: number | undefined): any => ({
    date: "x", price: 1, composite: 0, zone: "neutral", scores: {},
    returns: { "21": null, "63": null, "126": null }, cycleBin,
  });
  it("cạnh lên bin==3 (vừa vào, hôm trước chưa)", () => {
    expect(bottomStartIdxs([1, 3, 3, 2, 3, undefined, 3, 3].map(mk))).toEqual([1, 4, 6]);
  });
  it("bin==3 ngay đầu mảng cũng là cạnh", () => {
    expect(bottomStartIdxs([3, 3, 1].map(mk))).toEqual([0]);
  });
  it("không có bin==3 ⇒ []", () => {
    expect(bottomStartIdxs([1, 2, 2, 0].map(mk))).toEqual([]);
  });
});
```

Run: `npx vitest run tests/timeline.test.ts -t bottomStartIdxs` → FAIL (chưa export).

### Step 2: Implement + xóa percentile helpers

Trong `src/lib/timeline.ts`: XÓA hai hàm `bottomPercentileRank` và `maskRuns`. Thêm:

```ts
/** Các ngày "bắt đầu vùng đáy" = cạnh lên bin đáy cao nhất:
 *  cycleBin[i]===3 && cycleBin[i-1]!==3 (oversold+vĩ mô vừa bật). Walk-forward. */
export function bottomStartIdxs(points: TimelinePoint[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (points[i].cycleBin === 3 && points[i - 1]?.cycleBin !== 3) out.push(i);
  }
  return out;
}
```

Run: `npx vitest run tests/timeline.test.ts` → PASS.

### Step 3: TimeMachine — gỡ percentile

Trong `src/components/TimeMachine.tsx`:

(a) Import từ `@/lib/timeline`: bỏ `bottomPercentileRank,` và `maskRuns,`; thêm `bottomStartIdxs,`.

(b) XÓA 2 hằng module:
```ts
const BOTTOM_WINDOWS: [number, string][] = [[126, "6T"], [252, "1N"], [504, "2N"], [756, "3N"]];
const WINDOW_LABEL: Record<number, string> = { 126: "6 tháng", 252: "1 năm", 504: "2 năm", 756: "3 năm" };
```

(c) State: thay 3 dòng
```ts
  const [showBottomExp, setShowBottomExp] = useState(false);
  const [bottomPctl, setBottomPctl] = useState(85);
  const [bottomWindow, setBottomWindow] = useState(504);
```
bằng:
```ts
  const [showBottomStart, setShowBottomStart] = useState(false);
```

(d) Memo: thay khối `bottomRank`/`bottomRuns`/`bottomHitCount` (3 useMemo) bằng:
```ts
  const bottomStarts = useMemo(
    () => (showBottomStart ? bottomStartIdxs(points) : []),
    [showBottomStart, points]
  );
```

### Step 4: TimeMachine — spark memo

Trong `spark` useMemo: XÓA khối
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
Thêm (cạnh `expMarkers`):
```ts
    const startMarkers = toMarkers(bottomStarts);
```
Trong object `return`: bỏ dòng `bands,`; thêm `startMarkers,`.
Dependency array: đổi `bottomRuns` → `bottomStarts` (dòng `}, [points, idx, p, signalIdxs, sellIdxs, expIdxs, showSell, start, end, bottomRuns]);` → `... end, bottomStarts]);`).

### Step 5: TimeMachine — render marker + bỏ band rect

Trong `<svg>`: XÓA khối
```tsx
          {spark.bands.map((b, i) => (
            <rect key={`bd${i}`} className="tm-band" x={b.x} y={0} width={b.w} height={spark.H} />
          ))}
```
Trong overlay `<div className={`tm-markers ...`}>`, thêm (sau khối `spark.markers.map` (buy), trước cursor):
```tsx
            {spark.startMarkers.map((m, i) => (
              <span key={`st${i}`} className="tm-mk start"
                style={{ left: `${(m.cx / spark.W) * 100}%`, top: `${(m.cy / spark.H) * 100}%` }} />
            ))}
```

### Step 6: TimeMachine — toggle + day-note

(a) Toggle: thay khối
```tsx
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showBottomExp} onChange={(e) => setShowBottomExp(e.target.checked)} />
            Ngưỡng đáy thử nghiệm
          </label>
```
bằng:
```tsx
          <label className="tm-toggle muted small">
            <input type="checkbox" checked={showBottomStart} onChange={(e) => setShowBottomStart(e.target.checked)} />
            Đánh dấu khởi đầu vùng đáy
          </label>
```

(b) XÓA toàn bộ khối slider percentile `{showBottomExp && ( <div className="tm-exp"> … </div> )}` (hàng nút cửa sổ + slider). Thay bằng dòng nhãn trung thực:
```tsx
      {showBottomStart && (
        <div className="tm-exp muted small">
          ◆ Ngày oversold + vĩ mô lần đầu bật — điểm dò đáy sớm (walk-forward). Mạnh hơn trong xu hướng tăng; KHÔNG khẳng định là đáy.
        </div>
      )}
```

(c) Day-note: NGAY SAU khối `<div className="tm-dateband"> … </div>` (đóng trước `<ActionGuidance>`), thêm:
```tsx
      {showBottomStart && bottomStarts.includes(idx) && (
        <div className="muted small">
          ◆ Điểm BẮT ĐẦU vùng đáy — oversold + vĩ mô vừa bật (dò đáy sớm, không phải đáy chắc)
        </div>
      )}
```

### Step 7: CSS

Trong `src/app/globals.css`: XÓA rule `.tm-band { ... }`. Thêm:
```css
.tm-mk.start {
  width: 9px;
  height: 9px;
  background: var(--gold);
  transform: translate(-50%, -50%) rotate(45deg);
}
```

### Step 8: Build + test + tay

Run: `npx tsc --noEmit` → CLEAN (không còn `bottomPercentileRank`/`maskRuns`/`bottomPctl`/`bottomWindow`/`bands`/`BOTTOM_WINDOWS`).
Run: `npm run build` → PASS. `npm test` → PASS (golden không đổi).

Tay (`npm run dev`, Máy thời gian → ⚙ → bật "Đánh dấu khởi đầu vùng đáy"):
- Thoi hổ phách tại các ngày oversold+vĩ mô vừa bật, rải mọi năm, thưa.
- Chọn đúng ngày thoi → panel hiện "◆ Điểm BẮT ĐẦU vùng đáy".
- Zoom/pan: marker co đúng. Tắt toggle: hết thoi + hết dòng panel + hết nhãn.

### Step 9: Commit

```bash
git add src/lib/timeline.ts tests/timeline.test.ts src/components/TimeMachine.tsx src/app/globals.css
git commit -m "feat(tm): marker khởi đầu vùng đáy (cạnh lên cycleBin==3); bỏ band percentile"
```

---

## Self-Review notes (đã kiểm)

- **Spec coverage:** `bottomStartIdxs` (Step 1-2) khớp định nghĩa cạnh-lên; xóa percentile helpers + toàn bộ UI percentile (Steps 3-6); marker thoi gold (Step 5,7); day-note khi `idx ∈ bottomStarts` (Step 6c); nhãn trung thực (Step 6b); chỉ cycle; walk-forward. Không đụng engine.
- **Type consistency:** `bottomStartIdxs(points) → number[]` dùng ở `bottomStarts` memo; `toMarkers(bottomStarts)` (toMarkers nhận `number[]`); `startMarkers` = `{cx,cy}[]` khớp render `<span>`. `bottomStarts.includes(idx)` cho day-note.
- **Build-an-toàn:** lib + UI cùng một commit → `tsc` không vỡ giữa chừng (không tách 2 task).
- **bottomStartIdxs test** (verify tay): `[1,3,3,2,3,undefined,3,3]`→`[1,4,6]`; `[3,3,1]`→`[0]`; `[1,2,2,0]`→`[]`. Đúng.
- **Edge i=0:** `points[-1]?.cycleBin` = undefined ≠ 3 → ngày đầu nếu bin3 vẫn là cạnh.
- **Placeholder:** không.
