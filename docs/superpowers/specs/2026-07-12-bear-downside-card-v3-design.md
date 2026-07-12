# BearDownsideCard v3 — bảng 3 dòng thay khối, khung thời gian cuộn theo cửa sổ

Ngày: 2026-07-12. Trạng thái: thiết kế đã duyệt (chat), chờ implement. Thay thế một phần quyết định v2 (`2026-07-12-bear-downside-card-v2-design.md`): người dùng dùng thử bản v2 và phản hồi 2 điểm dưới đây.

## Vấn đề (phản hồi sau khi dùng thử v2)

1. **Khối kỳ hạn khó xem hơn bảng cũ** — 3 khối xếp dọc (mobile) khó so sánh nhanh 3 kỳ hạn bằng bảng 3 dòng trước đây. Người dùng muốn quay lại bảng, chỉ cần sửa để hết tràn ngang mobile (vấn đề gốc mà v2 đã né bằng cách bỏ hẳn bảng).
2. **Sparkline chọn ngày quá thô** — v2 nén TOÀN BỘ lịch sử giá (~4,3k phiên) vào ~350px (~12 ngày/px), nên chạm/kéo khó trúng đúng vùng muốn xem. ◀▶ nhích từng phiên không bù được vì vấn đề là *tìm* đúng vùng, không phải *tinh chỉnh* trong vùng đã thấy.

## Quyết định đã chốt (hỏi đáp với chủ dự án)

- Bảng: quay lại đúng nội dung/cột bảng trước v2 (`Row`/`LegacyRow` ở commit `9fd6f5b^`), chỉ sửa CSS bằng class riêng để hết tràn ngang — không dùng chung `.bt-table` (Dashboard).
- Khung thời gian: bỏ sparkline-toàn-lịch-sử. Thay bằng khung có **độ rộng cố định theo phiên** (3 nút 6 tháng/1 năm/3 năm, mặc định 6 tháng — nhỏ nhất) hiển thị TOÀN BỘ lịch sử ở mật độ px/phiên không đổi, đặt trong khung cuộn ngang gốc trình duyệt (`overflow-x: auto`) — cuộn để xem vùng khác, tap để chọn ngày trong vùng đang thấy. Không pinch/wheel zoom. Bỏ 2 nút ◀▶ (dư thừa vì tap giờ đã đủ chính xác).

## Thiết kế

### A. Bảng 3 dòng thay khối kỳ hạn

Khôi phục `Row`/`LegacyRow` (5 cột: Kỳ hạn · Đáy điển hình · Kết cục điển hình · Thực tế · Khả năng; nội dung mỗi ô — `usdK`, dải p25→p75, gate `matured` cho "Thực tế", `pUpTenths` ↑/↓ — giữ **y hệt** bản trước v2, không đổi số liệu/format). Đổi tên cột đầu từ "1 tháng/3 tháng/6 tháng" sang rút gọn "1T/3T/6T" (đã dùng làm quy ước ở nơi khác trong file) để nhường chỗ cho 4 cột còn lại.

CSS mới, tiền tố `bdo-table` (KHÔNG đụng `.bt-table` — bảng backtest ở Dashboard.tsx dùng chung class đó):

```css
.bdo-table-wrap { overflow-x: auto; } /* lưới an toàn, không nên cần tới sau khi sửa */
.bdo-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 0.86rem; }
.bdo-table th, .bdo-table td { text-align: left; padding: 6px 6px; border-bottom: 1px solid var(--border); }
.bdo-table th:first-child, .bdo-table td:first-child { width: 12%; }
@media (max-width: 480px) { .bdo-table { font-size: 0.76rem; } .bdo-table th, .bdo-table td { padding: 4px 4px; } }
```

Điểm khác bản trước v2 (nguyên nhân tràn ngang cũ): **không có `white-space: nowrap`** và có `table-layout: fixed` — chữ trong ô/tiêu đề tự xuống dòng khi hẹp thay vì ép tràn. Không cần đổi nội dung ô (đã sẵn nhiều dòng `<div>` cho "Kết cục"/"Thực tế").

Dọn CSS chết: gỡ `.bdo-blocks`, `.bdo-block`, `.bdo-block.empty`, `.bdo-h`, `.bdo-grid`, `.bdo-label` (chỉ dùng bởi `Block`/`LegacyBlock`, sẽ xoá).

### B. Khung thời gian cuộn theo cửa sổ (thay sparkline toàn lịch sử)

```text
[ 6T ] [ 1N ] [ 3N ]                         ← 3 nút chọn độ rộng cửa sổ (6T active mặc định)
┌───────────────────────────────────────────┐
│  ...toàn bộ lịch sử vẽ ở mật độ cố định... │  ← overflow-x: auto, cuộn ngang xem vùng khác
│              │ vạch ngày đang chọn         │
└───────────────────────────────────────────┘
12/07/2026 (mới nhất) · $4.104 · −22,8% đỉnh [📅 date picker]
```

- Hằng số: `WINDOW_SESSIONS = { "6T": 126, "1N": 252, "3N": 756 }` (khớp quy ước phiên/tháng đã dùng cho `H` 21/63/126 phiên). `VIEWPORT_PX = 360` (xấp xỉ bề ngang màn hình mobile phổ biến). `pxPerSession = VIEWPORT_PX / WINDOW_SESSIONS[windowKey]`.
- SVG vẽ path qua **toàn bộ** `prices` (không decimate — vài nghìn điểm vẫn mượt), bề rộng thật `= prices.length * pxPerSession` (không dùng `viewBox`/`preserveAspectRatio` nén như v2), cao 64px cố định.
- SVG đặt trong `div.bdo-sparkwrap` có `overflow-x: auto; touch-action: pan-x;` — cuộn ngang do trình duyệt xử lý (mượt, có momentum trên mobile), không cần code kéo tay. `touch-action: pan-x` (khác `pan-y` ở v2) để trình duyệt nhận kéo ngang trên chính khung này còn kéo dọc vẫn nổi lên cuộn trang.
- **Chọn ngày:** `onClick` gắn trực tiếp trên SVG dài (không phải trên `div.bdo-sparkwrap` bọc ngoài) — không còn `onPointerDown/Move` + `setPointerCapture` — xung đột với cuộn ngang gốc trình duyệt. Tính `idx = round((e.clientX - svgRect.left) / pxPerSession)` với `svgRect = svgRef.current.getBoundingClientRect()`; vì SVG là phần tử con thật sự bị cuộn theo `div` cha, `getBoundingClientRect()` của nó đã tự phản ánh vị trí sau khi cuộn — **không** cộng thêm `scrollLeft` (cộng thêm sẽ tính sai vị trí, lệch kép). Clamp `[0, points.length-1]`. Trình duyệt tự phân biệt tap (bắn `click`) và kéo-cuộn (không bắn `click` nếu di chuyển đủ xa) nên không cần ngưỡng riêng.
- **Đổi ngày lập trình** (đổi nút 6T/1N/3N, đổi qua date picker, đồng bộ `asOfIdx` từ PriceChart) gọi thêm `container.scrollTo({ left: idx*pxPerSession - VIEWPORT_PX/2, behavior: "smooth" })` (clamp trong `[0, maxScroll]`) để đưa vạch chọn vào tầm nhìn. Tap chọn ngày trong vùng đang thấy thì **không** tự cuộn (tôn trọng vị trí cuộn người dùng đang xem).
- Mặc định mount: cửa sổ 6T, cuộn tới mép phải (hiện dữ liệu mới nhất) nếu không có `asOfIdx` từ PriceChart; nếu có thì cuộn để vạch nằm giữa khung.
- Bỏ hẳn 2 nút `.bdo-fab` ◀▶ và state `dragging`/`svgRef` kiểu pointer-capture cũ; gỡ CSS `.bdo-fab*`.
- Nút chọn cửa sổ tái dùng pattern `.iconbtn`/`.iconbtn.active` sẵn có (đã dùng cho preset buttons ở Dashboard) — không cần CSS riêng ngoài 1 wrapper `flex` gap nhỏ.
- Vạch chỉ thị (`<line>`) vẽ tại `x = idx * pxPerSession` trong cùng SVG dài, nên di chuyển đúng theo canvas khi cuộn — không cần tính lại theo viewport.

### C. Phạm vi kỹ thuật

- Sửa **duy nhất** `src/components/BearDownsideCard.tsx` + CSS trong `src/app/globals.css` (thêm `.bdo-table*`, `.bdo-winbtns`, sửa `.bdo-sparkwrap`/`.bdo-spark`; xoá `.bdo-blocks/.bdo-block*/.bdo-h/.bdo-grid/.bdo-label/.bdo-fab*`).
- **Không đụng** `.bt-table` (Dashboard) và `.tm-*` (TimeMachine).
- **Fallback legacy** (`timeline.json` cũ không có `bearAsOf`): dùng lại bảng (`LegacyRow`) trong `.bdo-table`, không có khung thời gian — như hành vi trước v2.
- Engine, `bear-downside-view.ts`, types, JSON: không đổi. `monthAnchors`/`monthPosOf` tiếp tục không dùng ở UI (giữ nguyên vì có test riêng — không xoá).
- Test hiện có (32) phải pass nguyên vẹn; không thêm test React component (quy ước hiện tại của repo).
- Kiểm chứng: `npm test` + `npm run build` + đọc code xác nhận (không có công cụ trình duyệt tự động trong môi trường này) — cấu trúc bảng không `nowrap`, khung thời gian cuộn ngang đúng `pxPerSession` theo 3 nút, tap tính đúng `idx`, gate `matured` cột Thực tế, đồng bộ `asOfIdx`.

## Ngoài phạm vi

- Pinch-zoom/wheel-zoom trên khung thời gian (đã từ chối rõ ràng theo yêu cầu).
- Mọi thay đổi số liệu/thống kê/nội dung caveat/anti-hallucination formatting.
- Các card khác dùng `.bt-table`/`.tm-*`.
