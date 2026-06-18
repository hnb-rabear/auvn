# Lọc đáy percentile tương đối + bộ chọn cửa sổ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay logic lọc band "Ngưỡng đáy thử nghiệm" từ ngưỡng tuyệt đối (`cycleProb≥X%`, vô dụng) sang percentile tương đối trong cửa sổ trượt + bộ chọn cửa sổ 6T/1N/2N/3N.

**Architecture:** Hàm thuần `bottomPercentileRank` xếp percentile `cycleProb` mỗi ngày trong cửa sổ trượt past-only; `maskRuns` gom dải; `bottomBandRuns` cũ bị xóa. TimeMachine đổi state sang `bottomPctl`/`bottomWindow`, thêm hàng nút cửa sổ, slider thành "top X%". Band SVG rect giữ nguyên.

**Tech Stack:** TypeScript, React, Vitest (node-env), SVG, CSS (tái dùng).

## Global Constraints

- UI tiếng Việt. Chỉ đụng `src/lib/timeline.ts` + `tests/timeline.test.ts` + `src/components/TimeMachine.tsx`. KHÔNG đụng engine/backtest/`runBottom`/`BOTTOM_CONFIG`/dữ liệu/CSS mới.
- Percentile của `cycleProb` (đã có trên `TimelinePoint`); KHÔNG thêm dữ liệu thô.
- Walk-forward: cửa sổ chỉ gồm ngày `≤` ngày xét (gồm chính nó).
- Mặc định: cửa sổ 504 (2 năm), percentile cutoff 85 (top 15%). minSamples = 60.
- Nhãn phải ghi rõ "tương đối, KHÔNG khẳng định là đáy thật".

Spec: `docs/superpowers/specs/2026-06-18-bottom-percentile-band-design.md`.

---

## File Structure

- `src/lib/timeline.ts` — **Modify.** Thêm `bottomPercentileRank` + `maskRuns`; xóa `bottomBandRuns`.
- `tests/timeline.test.ts` — **Modify.** Xóa test `bottomBandRuns`; thêm test 2 hàm mới.
- `src/components/TimeMachine.tsx` — **Modify.** State + memo + UI (nút cửa sổ + slider percentile).

---

## Task 1: Hàm thuần percentile + maskRuns (thay bottomBandRuns)

**Files:**
- Modify: `src/lib/timeline.ts`
- Test: `tests/timeline.test.ts`

**Interfaces:**
- Consumes: `TimelinePoint` (đã import, có `cycleProb?: number | null`).
- Produces:
  - `export function bottomPercentileRank(points: TimelinePoint[], windowSessions: number, minSamples?: number): number[]` — percentile 0..100 của `cycleProb[i]` trong cửa sổ `[i-W+1 .. i]` (chỉ non-null); `NaN` nếu `cycleProb[i]==null` hoặc cửa sổ < `minSamples` mẫu non-null. `minSamples` mặc định 60.
  - `export function maskRuns(mask: boolean[]): { start: number; end: number }[]` — gom dải `true` liên tiếp.
- Removes: `bottomBandRuns` (không còn dùng).

- [ ] **Step 1: Viết test thất bại + xóa test cũ**

Trong `tests/timeline.test.ts`: XÓA dòng `import { bottomBandRuns } from "../src/lib/timeline";` và toàn bộ `describe("bottomBandRuns", () => { ... });`. Thêm vào cuối file:

```ts
import { bottomPercentileRank, maskRuns } from "../src/lib/timeline";

describe("bottomPercentileRank", () => {
  const mk = (cycleProb: number | null): any => ({
    date: "x", price: 1, composite: 0, zone: "neutral", scores: {},
    returns: { "21": null, "63": null, "126": null }, cycleProb,
  });
  it("percentile cycleProb trong cửa sổ trượt past-only", () => {
    const pts = [50, 10, 30, 90, 20].map(mk);
    expect(bottomPercentileRank(pts, 5, 1)).toEqual([100, 50, 66.7, 100, 40]);
  });
  it("cycleProb null ⇒ NaN tại ngày đó, và bị loại khỏi cửa sổ ngày khác", () => {
    const r = bottomPercentileRank([10, null, 30].map(mk), 5, 1);
    expect(Number.isNaN(r[1])).toBe(true);
    expect(r[0]).toBe(100); // [10] → 100
    expect(r[2]).toBe(100); // window {10,30}, 30 cao nhất → 100
  });
  it("cửa sổ < minSamples ⇒ NaN", () => {
    const r = bottomPercentileRank([10, 20].map(mk), 5, 5);
    expect(r.every((x) => Number.isNaN(x))).toBe(true);
  });
});

describe("maskRuns", () => {
  it("gom dải true liên tiếp", () => {
    expect(maskRuns([false, true, true, false, true])).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 4 },
    ]);
  });
  it("toàn false / rỗng ⇒ []", () => {
    expect(maskRuns([false, false])).toEqual([]);
    expect(maskRuns([])).toEqual([]);
  });
  it("dải chạm cuối được đóng", () => {
    expect(maskRuns([false, true, true])).toEqual([{ start: 1, end: 2 }]);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/timeline.test.ts -t "bottomPercentileRank|maskRuns"`
Expected: FAIL — hai hàm chưa export.

- [ ] **Step 3: Cài đặt + xóa `bottomBandRuns`**

Trong `src/lib/timeline.ts`: XÓA toàn bộ hàm `bottomBandRuns` (khối `/** Các dải index LIÊN TIẾP ... */ export function bottomBandRuns(...) { ... }`). Thêm:

```ts
/** Percentile (0..100) của cycleProb mỗi ngày trong cửa sổ trượt windowSessions phiên
 *  (gồm ngày đó, chỉ quá khứ). NaN nếu cycleProb[i]==null hoặc cửa sổ < minSamples mẫu. */
export function bottomPercentileRank(
  points: TimelinePoint[],
  windowSessions: number,
  minSamples = 60
): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const cur = points[i].cycleProb;
    if (cur == null) {
      out.push(NaN);
      continue;
    }
    const lo = Math.max(0, i - windowSessions + 1);
    let le = 0;
    let n = 0;
    for (let j = lo; j <= i; j++) {
      const v = points[j].cycleProb;
      if (v == null) continue;
      n++;
      if (v <= cur) le++;
    }
    out.push(n < minSamples ? NaN : Math.round((le / n) * 1000) / 10);
  }
  return out;
}

/** Gom các dải index có mask[i]===true liên tiếp. */
export function maskRuns(mask: boolean[]): { start: number; end: number }[] {
  const runs: { start: number; end: number }[] = [];
  let s = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && s === -1) s = i;
    else if (!mask[i] && s !== -1) {
      runs.push({ start: s, end: i - 1 });
      s = -1;
    }
  }
  if (s !== -1) runs.push({ start: s, end: mask.length - 1 });
  return runs;
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx vitest run tests/timeline.test.ts`
Expected: PASS (test mới xanh; không còn tham chiếu `bottomBandRuns`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline.ts tests/timeline.test.ts
git commit -m "feat(timeline): bottomPercentileRank + maskRuns; xóa bottomBandRuns tuyệt đối"
```

---

## Task 2: UI percentile + bộ chọn cửa sổ trong TimeMachine

**Files:**
- Modify: `src/components/TimeMachine.tsx`

**Interfaces:**
- Consumes: `bottomPercentileRank`, `maskRuns` từ `@/lib/timeline` (Task 1); `spark` memo tiêu thụ `bottomRuns` (`{start,end}[]`) — giữ nguyên.

> UI — verify bằng `npm run build` + `npm test` (không golden đổi) + kiểm tra tay. Không unit test riêng cho component.

- [ ] **Step 1: Import + hằng cửa sổ**

(a) Trong import từ `@/lib/timeline`, đổi dòng `  bottomBandRuns,` thành:
```ts
  bottomPercentileRank,
  maskRuns,
```

(b) Cạnh các hằng module đầu file (vd sau `const MIN_SPAN = ...` hoặc `POINTS_PER_MONTH`), thêm:
```ts
const BOTTOM_WINDOWS: [number, string][] = [[126, "6T"], [252, "1N"], [504, "2N"], [756, "3N"]];
const WINDOW_LABEL: Record<number, string> = { 126: "6 tháng", 252: "1 năm", 504: "2 năm", 756: "3 năm" };
```

- [ ] **Step 2: State**

Thay dòng `const [bottomThr, setBottomThr] = useState(60);` bằng:
```ts
  const [bottomPctl, setBottomPctl] = useState(85);
  const [bottomWindow, setBottomWindow] = useState(504);
```

- [ ] **Step 3: Memo**

Thay khối memo cũ (`const bottomRuns = useMemo(... bottomBandRuns ...)` + `bottomDataCount` + `bottomHitCount`) bằng:
```ts
  const bottomRank = useMemo(
    () => (showBottomExp ? bottomPercentileRank(points, bottomWindow) : []),
    [showBottomExp, bottomWindow, points]
  );
  const bottomRuns = useMemo(
    () => maskRuns(bottomRank.map((r) => !Number.isNaN(r) && r >= bottomPctl)),
    [bottomRank, bottomPctl]
  );
  const bottomHitCount = useMemo(
    () => bottomRank.filter((r) => !Number.isNaN(r) && r >= bottomPctl).length,
    [bottomRank, bottomPctl]
  );
```

(`bottomRuns` vẫn là `{start,end}[]` → `spark` memo + band render KHÔNG đổi.)

- [ ] **Step 4: UI — thay khối slider cũ**

Thay toàn bộ khối `{showBottomExp && ( <label className="slider-row tm-exp"> … </label> )}` bằng:
```tsx
      {showBottomExp && (
        <div className="tm-exp">
          <div className="tm-zoom">
            {BOTTOM_WINDOWS.map(([w, label]) => (
              <button
                key={w}
                className={`iconbtn small-btn ${bottomWindow === w ? "active" : ""}`}
                onClick={() => setBottomWindow(w)}
              >
                {label}
              </button>
            ))}
            <span className="muted small">cửa sổ so sánh</span>
          </div>
          <span>
            Top {100 - bottomPctl}% giống đáy nhất · cửa sổ {WINDOW_LABEL[bottomWindow]} — <b>{bottomHitCount}</b> ngày
            <span className="muted small">
              {" "}
              · tương đối trong cửa sổ, KHÔNG khẳng định là đáy thật (walk-forward)
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={bottomPctl}
            onChange={(e) => setBottomPctl(Number(e.target.value))}
          />
        </div>
      )}
```

- [ ] **Step 5: Build + test + kiểm tra tay**

Run: `npm run build` → Expected: PASS, không lỗi type (không còn `bottomThr`/`bottomBandRuns`/`bottomDataCount`).
Run: `npm test` → Expected: PASS (golden không đổi).

Kiểm tra tay (`npm run dev`, mở Máy thời gian → ⚙ → bật "Ngưỡng đáy thử nghiệm"):
- Band hổ phách rải **đều mọi năm** (2014/2018/2020/2024…), KHÔNG còn dồn 2009–2013.
- Bấm nút cửa sổ 6T/1N/2N/3N → mật độ band đổi; nút active đổi viền.
- Kéo slider → "Top X%" + số ngày đổi, band co/giãn.
- Vùng warmup đầu (chưa đủ cửa sổ / cycleProb null) không tô.
- Tắt toggle → hết band.

- [ ] **Step 6: Commit**

```bash
git add src/components/TimeMachine.tsx
git commit -m "feat(tm): band lọc đáy theo percentile + bộ chọn cửa sổ (thay ngưỡng tuyệt đối)"
```

---

## Self-Review notes (đã kiểm)

- **Spec coverage:** `bottomPercentileRank` + `maskRuns` (Task 1) khớp mô hình spec (cửa sổ gồm ngày i, non-null, minSamples=60, NaN gate, round 1 lẻ); xóa `bottomBandRuns`. State `bottomPctl`(85)/`bottomWindow`(504) + nút cửa sổ + slider top-X% + nhãn "tương đối không phải đáy thật" (Task 2). Band SVG giữ nguyên. Không đụng engine.
- **Type consistency:** `bottomPercentileRank(points, windowSessions, minSamples?) → number[]`, `maskRuns(boolean[]) → {start,end}[]` dùng đúng ở Task 2 memos. `bottomRuns` vẫn `{start,end}[]` cho `spark.bands` (không đổi render).
- **Percentile test math** (verify tay): `[50,10,30,90,20]` w5 m1 → `[100,50,66.7,100,40]` đúng.
- **No look-ahead:** cửa sổ `j` từ `lo=max(0,i-W+1)` tới `i` (≤ i). Không thêm dữ liệu.
- **Placeholder:** không.
- **Edge:** `cycleProb==null`→NaN→không tô; cửa sổ thiếu mẫu→NaN; `maskRuns` đóng dải cuối mảng.
