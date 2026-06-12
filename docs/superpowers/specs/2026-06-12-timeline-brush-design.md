# Timeline Brush — minimap scrollbar cho biểu đồ máy thời gian

**Date:** 2026-06-12
**Status:** Approved design

## Problem

Thanh cuộn hiện tại của biểu đồ TimeMachine là `<input type="range">` native ([src/components/TimeMachine.tsx:257-268](../../../src/components/TimeMachine.tsx)): chỉ pan được cửa sổ thời gian, không co giãn được, và chỉ hiện khi đã zoom. Người dùng muốn một thanh brush kiểu TradingView:

- Kéo 2 đầu để mở rộng / thu hẹp khung thời gian.
- Kéo phần giữa để di chuyển khung thời gian.
- Nhìn thấy minimap toàn bộ lịch sử giá để biết cửa sổ đang ở đoạn nào.

## Decisions (đã chốt với user)

- **Minimap**: thanh brush vẽ thu nhỏ toàn bộ đường giá bên trong (không phải thanh trơn).
- **Giữ nút zoom** 6T/1N/2N/5N/Tất cả, dùng song song: nút = phím tắt đặt độ rộng cửa sổ; brush = tinh chỉnh tự do. Kéo brush thủ công thì nút bỏ trạng thái active.
- **Approach A**: component SVG hand-rolled + pointer events, không thêm dependency (khớp codebase — chart chính đã là SVG tự vẽ, không có chart lib).

## Architecture

UI-only change. Không đụng engine, data, scripts.

### 1. State refactor trong `TimeMachine.tsx`

Hiện tại cửa sổ = derived từ `(zoomMonths, viewStart)`. Resize tự do cần state trực tiếp:

- `viewStart: number` — chỉ số điểm đầu cửa sổ (giữ nguyên tên).
- `viewSpan: number` — số điểm trong cửa sổ (mới; thay cho span derived từ `zoomMonths`).
- `zoomMonths` đổi kiểu thành `number | null | "custom"` và chỉ còn vai trò highlight nút preset: `number` = nút tháng active, `null` = nút "Tất cả" active, `"custom"` = user đã kéo brush thủ công → không nút nào active. Mọi `onChange` từ brush set `"custom"`.
- Nút zoom giữ hành vi cũ: set `viewSpan = months × POINTS_PER_MONTH` (min 14), center quanh ngày đang chọn (`centerOn`). Nút "Tất cả" → `viewSpan = points.length`, `viewStart = 0`.
- Clamp bất biến: `14 ≤ viewSpan ≤ points.length`, `0 ≤ viewStart ≤ points.length − viewSpan`.
- Brush luôn hiển thị, kể cả chế độ "Tất cả" (handles nằm ở 2 mép, co vào để zoom). Slider native cũ bị xoá.

### 2. Component mới `src/components/TimelineBrush.tsx`

Props:

```ts
{
  prices: number[];        // giá từng điểm, toàn bộ lịch sử
  start: number;           // index đầu cửa sổ
  span: number;            // số điểm trong cửa sổ
  minSpan: number;         // = 14
  onChange(start: number, span: number): void;
}
```

Render: một `<svg>` cao ~34px, `viewBox 0 0 700 34`, `preserveAspectRatio="none"`:

- Path đường giá toàn lịch sử, memoized (chỉ phụ thuộc `prices`).
- Mask mờ phủ vùng ngoài cửa sổ (2 `<rect>` trái/phải).
- `<rect>` cửa sổ viền vàng (`var(--gold)`).
- 2 handle grip ở 2 cạnh cửa sổ, hit area ≥ 12px màn hình (rect trong suốt rộng hơn grip nhìn thấy).

Interaction (pointer events, `setPointerCapture`, CSS `touch-action: none` — mouse + touch cùng code path):

- Pointerdown trên **handle trái/phải** → drag resize cạnh đó (kéo ra = giãn khung thời gian, kéo vào = co).
- Pointerdown trên **thân cửa sổ** → drag pan (giữ span, dời start).
- Pointerdown **ngoài cửa sổ** → nhảy cửa sổ tới đó (center quanh điểm bấm, giữ span).
- Quy đổi clientX → fraction theo `getBoundingClientRect()` → index; mọi kết quả qua clamp bất biến ở trên rồi gọi `onChange`.

Keyboard a11y: svg `tabIndex=0`, `role="slider"`, `aria-label` tiếng Việt ("Chọn khung thời gian — kéo 2 đầu để co giãn, kéo giữa để di chuyển"); ←/→ pan một bước, Shift+←/→ co giãn cạnh phải một bước.

### 3. Pure helper cho logic drag

Tách toán drag thành hàm thuần (cùng file hoặc `src/lib/`), dạng:

```ts
applyBrushDrag(mode: "pan" | "left" | "right", anchorStart, anchorSpan, deltaIdx, total, minSpan)
  → { start, span }
```

Component chỉ giữ pointer state + gọi helper. Unit test trên helper.

### 4. CSS

`.tm-brush` thay `.tm-slider` trong `globals.css`: nền tối khớp `.spark`, đường giá vàng mờ, cửa sổ viền `var(--gold)`, handle grips rõ trên mobile. Cursor: `ew-resize` trên handle, `grab/grabbing` trên thân.

## Error handling / edge cases

- `points.length < minSpan` (lịch sử quá ngắn): brush ẩn, hiện toàn bộ — như hành vi hiện tại khi `maxStart = 0`.
- Drag resize quá min: kẹp tại `minSpan`, cạnh đối diện đứng yên.
- Drag ra ngoài svg: pointer capture giữ event, fraction clamp [0,1].
- `idx` (ngày đang chọn) nằm ngoài cửa sổ sau khi co: chấp nhận — chart chính đã xử lý (`spark.cx = null`), hành vi hiện tại khi pan cũng vậy.

## Testing

- Unit tests cho `applyBrushDrag`: pan clamp 2 biên, resize trái/phải, kẹp `minSpan`, kẹp `total`.
- Existing tests không đổi (không đụng engine/backtest).
- Manual: mouse + touch (DevTools device mode), keyboard, nút zoom ↔ brush qua lại, chế độ "Tất cả".

## Out of scope

- Không đổi `PremiumChart` (không có slider).
- Không thêm marker tín hiệu vào minimap (giữ nhẹ; có thể thêm sau nếu cần).
- Không đổi cách lấy mẫu timeline / data pipeline.
