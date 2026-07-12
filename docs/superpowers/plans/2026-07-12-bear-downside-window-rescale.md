# BearDownsideCard Window Rescale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khung thời gian "Triển vọng 1/3/6 tháng" của `BearDownsideCard` tự co giãn trục Y theo đúng vùng đang cuộn tới (không theo toàn bộ lịch sử), hiển thị ngày đầu/cuối của vùng đang xem, và hỗ trợ kéo-thả bằng chuột để cuộn ngang (bên cạnh cuộn chạm gốc trình duyệt đã có).

**Architecture:** Tách phần tính toán thuần (dải chỉ số đang hiển thị từ vị trí cuộn, min/max cục bộ) thành file `src/lib/bdo-window.ts` để có test tự động; phần còn lại (state debounce, nhãn ngày, kéo chuột) sửa trực tiếp trong `src/components/BearDownsideCard.tsx` + CSS trong `src/app/globals.css`. Không đổi mật độ px/phiên, không thêm zoom, không đổi `src/lib/bear-downside*.ts`/`types.ts`/JSON. Spec: `docs/superpowers/specs/2026-07-12-bear-downside-window-rescale-design.md`.

**Tech Stack:** Next.js + TypeScript (static export), React client component, SVG + native `overflow-x: auto` scroll + Pointer Events, Vitest cho phần logic thuần. Không thêm dependency.

## Global Constraints

- KHÔNG zoom/pinch-zoom.
- Mật độ px/phiên giữ CỐ ĐỊNH: `WINDOW_SESSIONS = { "6T": 126, "1N": 252, "3N": 756 }`, `VIEWPORT_PX = 360`, `pxPerSession = VIEWPORT_PX / WINDOW_SESSIONS[winKey]` — không đổi công thức, không đổi giá trị.
- KHÔNG đổi `src/lib/bear-downside.ts`, `src/lib/bear-downside-view.ts`, `src/lib/types.ts`, dữ liệu JSON.
- KHÔNG đổi 3 nút `winKey` (6T/1N/3N) và 3 nơi gọi `scrollToIdx` lập trình hiện có (effect theo `winKey`, effect đồng bộ `asOfIdx`, `onChange` date picker) — `scrollToIdx` KHÔNG được gọi bên trong tap/click.
- Con trỏ chạm (touch/pen) PHẢI tiếp tục dùng cuộn ngang gốc trình duyệt (`touch-action: pan-x` trên `.bdo-sparkwrap`) KHÔNG đổi — code kéo chuột mới chỉ áp dụng khi `e.pointerType === "mouse"`.
- Repo không test React component — kiểm bằng `npm test` (toàn bộ suite hiện có phải pass, gồm test mới cho `bdo-window.ts`) + `npm run build`. Không có công cụ trình duyệt tự động trong môi trường thực thi — xác nhận hành vi UI bằng đọc code, không claim đã test tương tác thật trên thiết bị.
- Commit message tiếng Việt kiểu `feat:`/`fix:` như lịch sử repo.

---

### Task 1: Hàm thuần tính dải hiển thị + min/max cục bộ

**Files:**

- Create: `src/lib/bdo-window.ts`
- Test: `src/lib/bdo-window.test.ts`

**Interfaces:**

- Consumes: không phụ thuộc gì trong repo (hàm thuần, chỉ nhận số/mảng).
- Produces: `visibleRange(scrollLeft: number, clientWidth: number, pxPerSession: number, len: number): { start: number; end: number }` và `localMinMax(prices: number[], start: number, end: number): { min: number; max: number }` — Task 2 import cả hai từ `@/lib/bdo-window`.

- [ ] **Step 1: Viết test cho `visibleRange`**

Tạo `src/lib/bdo-window.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { visibleRange, localMinMax } from "./bdo-window";

describe("visibleRange", () => {
  it("cuộn về 0: dải bắt đầu từ 0, dài đúng 1 khung nhìn", () => {
    // pxPerSession = 360/126 ≈ 2.857 -> 1 khung nhìn (360px) phủ ceil(360/2.857)=126 phiên
    const r = visibleRange(0, 360, 360 / 126, 4000);
    expect(r.start).toBe(0);
    expect(r.end).toBe(126);
  });

  it("đã cuộn: dải dịch theo scrollLeft", () => {
    const pxPerSession = 360 / 126;
    const r = visibleRange(1000 * pxPerSession, 360, pxPerSession, 4000);
    expect(r.start).toBe(1000);
    expect(r.end).toBe(1126);
  });

  it("cuối lịch sử: dải bị cắt ở `len`, không vượt quá", () => {
    const pxPerSession = 360 / 126;
    const r = visibleRange(3950 * pxPerSession, 360, pxPerSession, 4000);
    expect(r.end).toBe(4000);
    expect(r.start).toBeLessThan(4000);
  });

  it("len quá nhỏ so với 1 khung nhìn: end kẹp về len, vẫn hợp lệ (end > start)", () => {
    const pxPerSession = 360 / 126;
    const r = visibleRange(0, 360, pxPerSession, 50);
    expect(r.start).toBe(0);
    expect(r.end).toBe(50);
  });
});

describe("localMinMax", () => {
  it("tính đúng min/max trên đúng dải [start, end)", () => {
    const prices = [10, 20, 5, 30, 1, 40];
    expect(localMinMax(prices, 1, 4)).toEqual({ min: 5, max: 30 });
  });

  it("dải quá hẹp (<2 phần tử): fallback về min/max toàn mảng", () => {
    const prices = [10, 20, 5, 30, 1, 40];
    expect(localMinMax(prices, 2, 2)).toEqual({ min: 1, max: 40 });
    expect(localMinMax(prices, 2, 3)).toEqual({ min: 1, max: 40 });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL vì module chưa tồn tại**

Run: `npm test -- bdo-window`
Expected: FAIL — `Cannot find module './bdo-window'` (hoặc tương đương).

- [ ] **Step 3: Viết `src/lib/bdo-window.ts`**

```ts
/**
 * Dải chỉ số phiên đang hiển thị trong khung cuộn, suy từ vị trí cuộn hiện tại.
 * scrollLeft/clientWidth: đơn vị px của phần tử cuộn; pxPerSession: mật độ cố định
 * (VIEWPORT_PX / WINDOW_SESSIONS[winKey]); len: tổng số phiên (prices.length).
 */
export function visibleRange(
  scrollLeft: number,
  clientWidth: number,
  pxPerSession: number,
  len: number
): { start: number; end: number } {
  if (len < 1 || pxPerSession <= 0) return { start: 0, end: Math.max(0, len) };
  const start = Math.max(0, Math.min(len - 1, Math.floor(scrollLeft / pxPerSession)));
  const end = Math.max(start + 1, Math.min(len, Math.ceil((scrollLeft + clientWidth) / pxPerSession)));
  return { start, end };
}

/**
 * min/max trên dải [start, end). Dải quá hẹp (<2 phần tử, ví dụ trước lần đo cuộn đầu tiên)
 * fallback về toàn mảng để tránh đường phẳng/giả.
 */
export function localMinMax(prices: number[], start: number, end: number): { min: number; max: number } {
  const slice = end - start >= 2 ? prices.slice(start, end) : prices;
  let min = Infinity, max = -Infinity;
  for (const v of slice) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npm test -- bdo-window`
Expected: PASS — 6 test đều xanh.

- [ ] **Step 5: Chạy toàn bộ suite (không phá test khác)**

Run: `npm test`
Expected: toàn bộ suite pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/bdo-window.ts src/lib/bdo-window.test.ts
git commit -m "feat: bdo-window — hàm thuần tính dải hiển thị + min/max cục bộ cho BearDownsideCard"
```

---

### Task 2: Trục Y co giãn theo vùng đang xem + nhãn ngày đầu/cuối

**Files:**

- Modify: `src/components/BearDownsideCard.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: `visibleRange`, `localMinMax` từ `@/lib/bdo-window` (Task 1); state/refs sẵn có: `wrapRef`, `pxPerSession`, `prices`, `points`, `fmtDate` (đã có ở đầu file).
- Produces: state `visRange: { start: number; end: number }` — Task 3 dùng để tránh xung đột sự kiện cuộn/kéo (không cần đọc trực tiếp giá trị, chỉ cần biết `wrapRef`/`pxPerSession` không đổi tên).

- [ ] **Step 1: Thêm import**

Trong `src/components/BearDownsideCard.tsx`, sửa dòng import đầu file:

```tsx
import { ddAsOfPct, actualWorstDipPct, pUpTenths, coverageStats } from "@/lib/bear-downside-view";
```

thành:

```tsx
import { ddAsOfPct, actualWorstDipPct, pUpTenths, coverageStats } from "@/lib/bear-downside-view";
import { visibleRange, localMinMax } from "@/lib/bdo-window";
```

- [ ] **Step 2: Thêm state `visRange` + effect debounce cuộn, sửa `spark` dùng min/max cục bộ**

Tìm khối (nguyên trạng hiện tại):

```tsx
  useEffect(() => { scrollToIdx(X); }, [winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalW = prices.length > 1 ? prices.length * pxPerSession : 0;
  const spark = useMemo(() => {
    if (prices.length < 2) return null;
    let min = Infinity, max = -Infinity;
    for (const v of prices) { if (v < min) min = v; if (v > max) max = v; }
    const span = max - min || 1;
    const yAt = (v: number) => SH - 4 - ((v - min) / span) * (SH - 8);
    let d = "";
    for (let i = 0; i < prices.length; i++) d += `${d ? "L" : "M"}${(i * pxPerSession).toFixed(1)} ${yAt(prices[i]).toFixed(1)}`;
    return { d };
  }, [prices, pxPerSession]);
  const pickAt = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.round((clientX - r.left) / pxPerSession);
    setIdx(Math.min(points.length - 1, Math.max(0, i)));
  };
```

thay bằng:

```tsx
  useEffect(() => { scrollToIdx(X); }, [winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalW = prices.length > 1 ? prices.length * pxPerSession : 0;

  // dải chỉ số đang hiển thị trong khung cuộn — cập nhật debounce sau khi cuộn dừng, để trục Y
  // co giãn theo đúng vùng đang xem (không theo toàn bộ lịch sử) mà không giật khi đang cuộn.
  const [visRange, setVisRange] = useState(() => visibleRange(0, VIEWPORT_PX, pxPerSession, prices.length));
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => setVisRange(visibleRange(el.scrollLeft, el.clientWidth, pxPerSession, prices.length));
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(update, 150);
    };
    update();
    el.addEventListener("scroll", onScroll);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, [pxPerSession, prices.length]);

  const spark = useMemo(() => {
    if (prices.length < 2) return null;
    const { min, max } = localMinMax(prices, visRange.start, visRange.end);
    const span = max - min || 1;
    const yAt = (v: number) => SH - 4 - ((v - min) / span) * (SH - 8);
    let d = "";
    for (let i = 0; i < prices.length; i++) d += `${d ? "L" : "M"}${(i * pxPerSession).toFixed(1)} ${yAt(prices[i]).toFixed(1)}`;
    return { d };
  }, [prices, pxPerSession, visRange]);
  const pickAt = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.round((clientX - r.left) / pxPerSession);
    setIdx(Math.min(points.length - 1, Math.max(0, i)));
  };
  const edgeFrom = points[Math.min(visRange.start, points.length - 1)]?.date;
  const edgeTo = points[Math.max(0, Math.min(visRange.end, points.length) - 1)]?.date;
```

- [ ] **Step 3: Thêm khung bọc + 2 nhãn ngày trong markup**

Tìm khối markup khung thời gian hiện tại:

```tsx
          <div className="bdo-sparkwrap" ref={wrapRef}>
            <svg
              ref={svgRef}
              className="bdo-spark"
              width={totalW}
              height={SH}
              onClick={(e) => pickAt(e.clientX)}
              aria-label="Biểu đồ giá — cuộn ngang xem lịch sử, chạm để chọn ngày"
            >
              <path d={spark.d} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
              <line x1={X * pxPerSession} y1="0" x2={X * pxPerSession} y2={SH} stroke="#ece5d8" strokeWidth="1" opacity="0.6" />
            </svg>
          </div>
```

thay bằng:

```tsx
          <div className="bdo-sparkbox">
            <div className="bdo-sparkwrap" ref={wrapRef}>
              <svg
                ref={svgRef}
                className="bdo-spark"
                width={totalW}
                height={SH}
                onClick={(e) => pickAt(e.clientX)}
                aria-label="Biểu đồ giá — cuộn ngang xem lịch sử, chạm để chọn ngày"
              >
                <path d={spark.d} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
                <line x1={X * pxPerSession} y1="0" x2={X * pxPerSession} y2={SH} stroke="#ece5d8" strokeWidth="1" opacity="0.6" />
              </svg>
            </div>
            {edgeFrom && <span className="bdo-edge from">{fmtDate(edgeFrom)}</span>}
            {edgeTo && <span className="bdo-edge to">{fmtDate(edgeTo)}</span>}
          </div>
```

- [ ] **Step 4: Thêm CSS `.bdo-sparkbox`/`.bdo-edge`**

Trong `src/app/globals.css`, tìm:

```css
.bdo-sparkwrap {
  margin: 0.2rem 0 0.3rem;
  overflow-x: auto;
  touch-action: pan-x;
  border-radius: 8px;
  background: var(--card2);
}
```

thay bằng:

```css
.bdo-sparkbox {
  position: relative;
}
.bdo-sparkwrap {
  margin: 0.2rem 0 0.3rem;
  overflow-x: auto;
  touch-action: pan-x;
  border-radius: 8px;
  background: var(--card2);
}
/* nhãn ngày đầu/cuối khung đang cuộn tới — giống .tm-edge, class riêng vì .bdo-sparkbox
   là chính khung cuộn ngang mật độ cố định (không nén viewBox như Máy Thời Gian) */
.bdo-edge {
  position: absolute;
  top: 6px;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  background: rgba(21, 19, 15, 0.7);
  padding: 1px 6px;
  border-radius: 5px;
  pointer-events: none;
  white-space: nowrap;
}
.bdo-edge.from { left: 6px; }
.bdo-edge.to { right: 6px; }
```

- [ ] **Step 5: Test + build**

Run: `npm test`
Expected: toàn bộ suite pass, gồm test mới `bdo-window.test.ts` từ Task 1.

Run: `npm run build`
Expected: build + static export thành công, không lỗi TypeScript.

- [ ] **Step 6: Đọc lại code xác nhận (không có công cụ trình duyệt trong môi trường này)**

Đọc `src/components/BearDownsideCard.tsx` phần vừa sửa, xác nhận: `spark` không còn quét toàn bộ `prices` để tính min/max (đã thay bằng `localMinMax(prices, visRange.start, visRange.end)`); `visRange` khởi tạo từ `scrollLeft=0` khớp vị trí cuộn ban đầu thật; `edgeFrom`/`edgeTo` lấy đúng từ `points[visRange.start]`/`points[visRange.end - 1]`; `.bdo-sparkbox` có `position: relative` để 2 `<span className="bdo-edge">` định vị đúng góc (không bị cuộn theo nội dung vì nằm NGOÀI `.bdo-sparkwrap` — phần tử cuộn).

- [ ] **Step 7: Commit**

```bash
git add src/components/BearDownsideCard.tsx src/app/globals.css
git commit -m "feat: BearDownsideCard — trục Y khung thời gian co giãn theo vùng đang xem, thêm nhãn ngày đầu/cuối"
```

---

### Task 3: Kéo chuột để cuộn ngang

**Files:**

- Modify: `src/components/BearDownsideCard.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: `wrapRef`, `pickAt` từ Task 2 (không đổi chữ ký).
- Produces: không có consumer sau — Task 4 chỉ xác minh.

- [ ] **Step 1: Thêm ref theo dõi kéo chuột**

Trong `src/components/BearDownsideCard.tsx`, tìm dòng:

```tsx
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
```

thay bằng:

```tsx
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const draggedRef = useRef(false);
```

- [ ] **Step 2: Thêm pointer handler kéo chuột trên `.bdo-sparkwrap`, chặn tap sau khi đã kéo**

Tìm khối (từ Task 2):

```tsx
            <div className="bdo-sparkwrap" ref={wrapRef}>
              <svg
                ref={svgRef}
                className="bdo-spark"
                width={totalW}
                height={SH}
                onClick={(e) => pickAt(e.clientX)}
                aria-label="Biểu đồ giá — cuộn ngang xem lịch sử, chạm để chọn ngày"
              >
```

thay bằng:

```tsx
            <div
              className="bdo-sparkwrap"
              ref={wrapRef}
              onPointerDown={(e) => {
                if (e.pointerType !== "mouse" || !wrapRef.current) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                dragRef.current = { startX: e.clientX, startScrollLeft: wrapRef.current.scrollLeft };
                draggedRef.current = false;
              }}
              onPointerMove={(e) => {
                if (e.pointerType !== "mouse" || !dragRef.current || !wrapRef.current) return;
                const dx = e.clientX - dragRef.current.startX;
                if (Math.abs(dx) > 5) draggedRef.current = true;
                wrapRef.current.scrollLeft = dragRef.current.startScrollLeft - dx;
              }}
              onPointerUp={(e) => {
                if (e.pointerType !== "mouse") return;
                e.currentTarget.releasePointerCapture(e.pointerId);
                dragRef.current = null;
              }}
              onPointerCancel={() => { dragRef.current = null; }}
            >
              <svg
                ref={svgRef}
                className="bdo-spark"
                width={totalW}
                height={SH}
                onClick={(e) => {
                  if (draggedRef.current) { draggedRef.current = false; return; }
                  pickAt(e.clientX);
                }}
                aria-label="Biểu đồ giá — cuộn ngang xem lịch sử, chạm để chọn ngày"
              >
```

- [ ] **Step 3: Cập nhật comment CSS + con trỏ chuột**

Trong `src/app/globals.css`, tìm:

```css
/* khung thời gian — cuộn ngang GỐC TRÌNH DUYỆT (KHÔNG code kéo tay); pan-x để trình duyệt nhận
   kéo ngang trên chính khung này, kéo dọc vẫn nổi lên cuộn trang bình thường. */
.bdo-winbtns {
```

thay bằng:

```css
/* khung thời gian — chạm: cuộn ngang gốc trình duyệt (pan-x, không code kéo tay riêng);
   chuột: kéo-thả để cuộn (xem .bdo-sparkwrap pointer handlers trong component) vì
   overflow-x:auto gốc không tự hỗ trợ kéo bằng chuột như chạm/trackpad. Kéo dọc vẫn
   nổi lên cuộn trang bình thường. */
.bdo-winbtns {
```

Tìm:

```css
.bdo-sparkwrap {
  margin: 0.2rem 0 0.3rem;
  overflow-x: auto;
  touch-action: pan-x;
  border-radius: 8px;
  background: var(--card2);
}
```

thay bằng:

```css
.bdo-sparkwrap {
  margin: 0.2rem 0 0.3rem;
  overflow-x: auto;
  touch-action: pan-x;
  border-radius: 8px;
  background: var(--card2);
  cursor: grab;
}
.bdo-sparkwrap:active {
  cursor: grabbing;
}
```

Tìm:

```css
.bdo-spark {
  display: block;
  user-select: none;
  cursor: pointer;
}
```

thay bằng:

```css
.bdo-spark {
  display: block;
  user-select: none;
  cursor: inherit;
}
```

- [ ] **Step 4: Test + build**

Run: `npm test`
Expected: toàn bộ suite pass (task này không đổi logic có test).

Run: `npm run build`
Expected: build + static export thành công, không lỗi TypeScript.

- [ ] **Step 5: Đọc lại code xác nhận (không có công cụ trình duyệt trong môi trường này)**

Đọc lại `src/components/BearDownsideCard.tsx`, xác nhận:
1. Mọi handler `onPointerDown`/`onPointerMove`/`onPointerUp` đều có early-return khi `e.pointerType !== "mouse"` — chạm/pen KHÔNG bị chặn cuộn native, KHÔNG bị set `scrollLeft` thủ công.
2. `draggedRef` chỉ set `true` khi lệch quá 5px, và `onClick` của svg reset nó về `false` sau khi dùng — tap thường (không kéo) vẫn gọi `pickAt` bình thường.
3. `scrollToIdx` vẫn chỉ được gọi ở đúng 3 nơi lập trình như Task 2 của v3 (effect theo `winKey`, effect đồng bộ `asOfIdx`, `onChange` date picker) — KHÔNG gọi trong pointer handler mới.
4. `.bdo-sparkwrap` có `touch-action: pan-x` KHÔNG đổi (`grep -n "touch-action" src/app/globals.css`).

- [ ] **Step 6: Commit**

```bash
git add src/components/BearDownsideCard.tsx src/app/globals.css
git commit -m "feat: BearDownsideCard — kéo chuột để cuộn ngang khung thời gian (chạm vẫn dùng cuộn gốc)"
```

---

### Task 4: Xác minh tổng theo spec

**Files:**

- Không sửa code (chỉ chạy kiểm; nếu phát hiện lỗi → sửa tại chỗ + commit `fix:`).

**Interfaces:**

- Consumes: toàn bộ deliverable Task 1–3.
- Produces: xác nhận checklist spec.

- [ ] **Step 1: Chạy suite + build sạch**

Run: `npm test` → tất cả pass (gồm `bdo-window.test.ts`).
Run: `npm run build` → export tĩnh OK.

- [ ] **Step 2: Đối chiếu spec bằng đọc code (không có công cụ trình duyệt trong môi trường này)**

Mở `docs/superpowers/specs/2026-07-12-bear-downside-window-rescale-design.md`, đối chiếu:

1. **Trục Y co giãn theo vùng đang xem:** `spark` dùng `localMinMax(prices, visRange.start, visRange.end)`, KHÔNG quét toàn `prices`; `visRange` cập nhật debounce ~150ms sau khi cuộn dừng (không phải mọi tick cuộn).
2. **Nhãn ngày:** `edgeFrom`/`edgeTo` hiển thị đúng ngày đầu/cuối `visRange`, nằm trong `.bdo-sparkbox` (không cuộn theo nội dung).
3. **Kéo chuột:** chỉ áp dụng `pointerType === "mouse"`; chạm/pen dùng nguyên cuộn gốc trình duyệt (`touch-action: pan-x` không đổi); tap thường không bị nuốt bởi ngưỡng kéo 5px.
4. **Không đổi:** `WINDOW_SESSIONS`/`VIEWPORT_PX`/công thức `pxPerSession`; 3 nút winKey; 3 nơi gọi `scrollToIdx` lập trình; `src/lib/bear-downside*.ts`/`types.ts`/JSON (`git diff --stat main -- src/lib` nếu có nhánh riêng, hoặc đọc lại các file này để xác nhận không có thay đổi ngoài dự kiến).

Sai lệch nào → sửa + commit `fix:`; khớp hết → xong.

- [ ] **Step 3: Ghi chú giới hạn xác minh**

Vì môi trường không có công cụ trình duyệt tự động, KHÔNG claim đã xác nhận: cảm giác kéo chuột mượt/đúng hướng trên trình duyệt thật, debounce 150ms có gây giật/trễ khó chịu khi cuộn nhanh hay không, hay nhãn ngày có bị che bởi phần tử khác ở màn hình cực hẹp. Ghi rõ những điểm này khi báo cáo cho chủ dự án, đề nghị họ tự kiểm tra trên thiết bị thật (đặc biệt: kéo chuột trên desktop, cuộn chạm trên di động, và tốc độ trục Y co giãn khi cuộn nhanh qua nhiều vùng giá khác nhau) trước khi coi là xong hẳn.
