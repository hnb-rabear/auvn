# Lớp "ngưỡng thử nghiệm" trong máy thời gian — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Checkbox + slider trong máy thời gian để highlight (vòng tròn rỗng xanh dương) mọi ngày có composite ≥ ngưỡng người dùng chọn — thuần UI khám phá, không đụng `buyThreshold`/engine/backtest.

**Architecture:** Tách `pointComposite` từ `TimeMachine.tsx` ra module thuần `src/lib/timeline.ts` (theo tiền lệ `src/lib/brush.ts`), thêm hàm `thresholdIdxs` lọc index theo ngưỡng, test bằng vitest. UI dùng lại pattern toggle "Hiện vùng bán" + marker trong khối `spark` sẵn có.

**Tech Stack:** Next.js + TypeScript, vitest. Spec: `docs/superpowers/specs/2026-06-12-experimental-threshold-highlight-design.md`.

---

### Task 1: Module thuần `src/lib/timeline.ts` (TDD)

**Files:**
- Create: `src/lib/timeline.ts`
- Test: `tests/timeline.test.ts`

- [ ] **Step 1: Viết test fail**

Tạo `tests/timeline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pointComposite, thresholdIdxs } from "../src/lib/timeline";
import type { CriterionKey, TimelinePoint } from "../src/lib/types";

// chỉ technical có trọng số -> composite = score * 50
const W: Record<CriterionKey, number> = {
  technical: 1,
  premium: 0,
  macro: 0,
  stats: 0,
  momentum: 0,
};

const pt = (score: number): TimelinePoint => ({
  date: "2020-01-01",
  price: 1500,
  composite: 0,
  zone: "neutral",
  scores: { technical: score },
  returns: { "21": null, "63": null, "126": null },
});

describe("pointComposite", () => {
  it("chuẩn hoá điểm -2..+2 về -100..+100", () => {
    expect(pointComposite(pt(2), W)).toBe(100);
    expect(pointComposite(pt(-2), W)).toBe(-100);
    expect(pointComposite(pt(1), W)).toBe(50);
  });
  it("tổng trọng số 0 -> 0", () => {
    expect(pointComposite(pt(2), { ...W, technical: 0 })).toBe(0);
  });
  it("tiêu chí không có trong scores không kéo composite", () => {
    // macro có trọng số nhưng điểm chỉ có technical -> chia theo trọng số có mặt
    expect(pointComposite(pt(2), { ...W, macro: 1 })).toBe(100);
  });
});

describe("thresholdIdxs", () => {
  // composite lần lượt: 100, 25, 50, -50
  const points = [pt(2), pt(0.5), pt(1), pt(-1)];
  it("ngưỡng 0: mọi điểm không âm đạt", () => {
    expect(thresholdIdxs(points, W, 0)).toEqual([0, 1, 2]);
  });
  it("ngưỡng 50: biên >= tính cả điểm bằng đúng ngưỡng", () => {
    expect(thresholdIdxs(points, W, 50)).toEqual([0, 2]);
  });
  it("ngưỡng 100: chỉ điểm tối đa", () => {
    expect(thresholdIdxs(points, W, 100)).toEqual([0]);
  });
  it("mảng rỗng -> rỗng", () => {
    expect(thresholdIdxs([], W, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run tests/timeline.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/timeline'` (hoặc tương đương).

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/timeline.ts`:

```ts
/** Toán composite cho điểm timeline — thuần, không React. */

import type { CriterionKey, TimelinePoint } from "./types";

/** Composite từ điểm tiêu chí của một ngày timeline, theo trọng số đang chọn. */
export function pointComposite(
  p: TimelinePoint,
  weights: Record<CriterionKey, number>
): number {
  let s = 0;
  let tw = 0;
  for (const [k, score] of Object.entries(p.scores)) {
    const w = weights[k as CriterionKey] ?? 0;
    s += (score as number) * w;
    tw += w;
  }
  return tw === 0 ? 0 : Math.round((s / tw) * 50 * 10) / 10;
}

/** Index các điểm có composite >= ngưỡng (dùng cho marker tín hiệu/ngưỡng thử). */
export function thresholdIdxs(
  points: TimelinePoint[],
  weights: Record<CriterionKey, number>,
  threshold: number
): number[] {
  return points.reduce<number[]>((acc, p, i) => {
    if (pointComposite(p, weights) >= threshold) acc.push(i);
    return acc;
  }, []);
}
```

Lưu ý: thân hàm `pointComposite` copy nguyên văn từ `src/components/TimeMachine.tsx:41-50` — không đổi hành vi.

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx vitest run tests/timeline.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline.ts tests/timeline.test.ts
git commit -m "feat: tách pointComposite + thresholdIdxs ra lib thuần, có test"
```

---

### Task 2: TimeMachine dùng lib mới (refactor, không đổi hành vi)

**Files:**
- Modify: `src/components/TimeMachine.tsx`

- [ ] **Step 1: Thay định nghĩa cục bộ bằng import**

Trong `src/components/TimeMachine.tsx`:

1. Thêm import (cạnh `import { centerWindow } from "@/lib/brush";`):

```ts
import { pointComposite, thresholdIdxs } from "@/lib/timeline";
```

2. Xoá toàn bộ hàm cục bộ `pointComposite` (khối comment + hàm, hiện ở dòng 40–50).

3. Thay `signalIdxs` (hiện ở dòng 94–101) bằng:

```ts
const signalIdxs = useMemo(
  () => thresholdIdxs(points, weights, buyThr),
  [points, weights, buyThr]
);
```

`sellIdxs` giữ nguyên (nó lọc `<= -40`, vẫn gọi `pointComposite` — giờ là bản import).

- [ ] **Step 2: Chạy toàn bộ test + build**

Run: `npm test`
Expected: PASS toàn bộ (refactor không đổi hành vi).

Run: `npm run build`
Expected: build xanh, không lỗi type.

- [ ] **Step 3: Commit**

```bash
git add src/components/TimeMachine.tsx
git commit -m "refactor: TimeMachine dùng pointComposite/thresholdIdxs từ lib"
```

---

### Task 3: UI lớp ngưỡng thử nghiệm

**Files:**
- Modify: `src/components/TimeMachine.tsx`

- [ ] **Step 1: Thêm state + danh sách index ngưỡng thử**

Trong `TimeMachine`, cạnh `const [showSell, setShowSell] = useState(false);` thêm:

```ts
/** lớp khám phá: highlight ngày có composite >= ngưỡng người dùng tự chọn */
const [showExp, setShowExp] = useState(false);
const [expThr, setExpThr] = useState(40);
```

Sau khối `sellIdxs` thêm:

```ts
const expIdxs = useMemo(
  () => (showExp ? thresholdIdxs(points, weights, expThr) : []),
  [showExp, points, weights, expThr]
);
```

- [ ] **Step 2: Thêm marker rỗng vào khối `spark`**

Trong `useMemo` của `spark`, cạnh `sellMarkers` thêm:

```ts
const expMarkers = showExp
  ? expIdxs
      .filter((i) => i >= start && i < end)
      .map((i) => ({ cx: x(i), cy: y(points[i].price) }))
  : [];
```

Thêm `expMarkers` vào object return của `spark`, và thêm `expIdxs`, `showExp` vào mảng dependency của `useMemo` (showExp đã gián tiếp qua expIdxs nhưng khai báo tường minh cho rõ):

```ts
}, [points, idx, p, signalIdxs, sellIdxs, expIdxs, showSell, showExp, start, end]);
```

Trong SVG, render expMarkers **trước** `sellMarkers` (lớp dưới — vòng rỗng to hơn chấm đặc một chút để ngày trùng thành "chấm đặc có viền"):

```tsx
{spark.expMarkers.map((m, i) => (
  <circle
    key={`x${i}`}
    cx={m.cx}
    cy={m.cy}
    r={span > 24 * POINTS_PER_MONTH ? 3 : 4.5}
    fill="none"
    stroke="#5ca8e0"
    strokeWidth="1.3"
    opacity="0.8"
  />
))}
```

- [ ] **Step 3: Checkbox + slider + dòng đếm**

Trong `div.tm-zoom`, ngay sau label "Hiện vùng bán", thêm checkbox (bật lên thì khởi tạo ngưỡng thử = ngưỡng chuẩn của chế độ đang chọn):

```tsx
<label
  className="tm-toggle muted small"
  title="Highlight mọi ngày có điểm ≥ ngưỡng bạn chọn — chỉ để khám phá, không phải tín hiệu kiểm chứng."
>
  <input
    type="checkbox"
    checked={showExp}
    onChange={(e) => {
      setShowExp(e.target.checked);
      if (e.target.checked) setExpThr(buyThr);
    }}
  />
  Ngưỡng thử nghiệm
</label>
```

Ngay sau `div.tm-zoom` (trước SVG), thêm hàng slider chỉ hiện khi bật:

```tsx
{showExp && (
  <label className="slider-row">
    <span>
      Ngưỡng thử +{expThr} — <b>{expIdxs.length}</b> ngày đạt / {points.length} ngày
      <span className="muted small">
        {" "}
        · chỉ để khám phá — % kiểm chứng chỉ áp dụng cho ngưỡng chuẩn (+{buyThr})
      </span>
    </span>
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={expThr}
      onChange={(e) => setExpThr(Number(e.target.value))}
    />
  </label>
)}
```

(Dùng lại class `slider-row` của khối trọng số Dashboard — không cần CSS mới. Không lưu localStorage: phiên khám phá tạm thời, đúng spec.)

- [ ] **Step 4: Chạy test + build**

Run: `npm test`
Expected: PASS toàn bộ.

Run: `npm run build`
Expected: build xanh.

- [ ] **Step 5: Commit**

```bash
git add src/components/TimeMachine.tsx
git commit -m "feat: lớp ngưỡng thử nghiệm trong máy thời gian — highlight ngày đạt điểm tự chọn"
```

---

### Task 4: Kiểm tra trực quan

- [ ] **Step 1: Chạy app và kiểm tra bằng mắt**

Run: `npm run dev`

Checklist trong card "Xét lại lịch sử — máy thời gian":
1. Mặc định không có gì mới ngoài checkbox "Ngưỡng thử nghiệm" (tắt).
2. Bật checkbox → slider hiện, giá trị khởi tạo = ngưỡng chuẩn (+40 toàn cảnh, +50 preset 3/6 tháng) → vòng rỗng xanh dương trùng vị trí chấm xanh lá đặc (thành chấm đặc có viền).
3. Kéo slider lên cao → số vòng giảm, dòng đếm cập nhật; kéo xuống thấp → vòng dày lên.
4. Chấm xanh lá đặc + nút ◀▶ + dòng đếm tín hiệu chuẩn KHÔNG đổi khi kéo slider thử.
5. Tắt checkbox → vòng rỗng và slider biến mất; bật lại → ngưỡng quay về ngưỡng chuẩn.

- [ ] **Step 2: Cập nhật checkbox trong plan này rồi commit nốt nếu có sửa nhỏ**

```bash
git add -A
git commit -m "chore: hoàn tất lớp ngưỡng thử nghiệm"
```

(Bỏ qua commit nếu không có thay đổi.)
