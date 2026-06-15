# UI/UX redesign — mobile-first, 3-giây-biết-nên-làm-gì

Ngày: 2026-06-15. Phạm vi: chỉ tổ chức lại trình bày của `Dashboard.tsx` + CSS. **Không** đụng scoring engine, guidance logic, data, hay component con (`TimeMachine`, `PremiumChart`, `BottomGauges`, `ActionGuidance`) ngoài việc bọc chúng vào accordion.

## Mục tiêu

1. **Giảm tải nhận thức (A)** — mở app ≤3 giây biết nên mua/bán/chờ mà không cuộn.
2. **Mobile-first (D)** — tối ưu màn nhỏ + thao tác chạm.

Hiện tại là một trang dài dày đặc: verdict to + gợi ý + 6 ô giá + cài đặt bung giữa trang + 4 thẻ tiêu chí + bảng backtest + biểu đồ chênh + gauge săn đáy + máy thời gian — tất cả luôn hiển thị.

## Quyết định (đã chốt qua brainstorming)

- **Câu chốt 3 giây = Gợi ý hành động** (đã trộn zone + săn đáy + chênh lệch). Đây là thứ duy nhất nổi bật ở đỉnh.
- **Hero gộp verdict + guidance** thành một thẻ: câu hành động to nhất, dưới là 1 dòng cô đọng `zone · điểm · xác suất gần đáy`. Gauge **không** ở hero (gập xuống).
- **Mở sẵn khi vào app:** Hero + bảng giá. Mọi thứ khác gập.
- **Phân tích sâu = accordion gập sẵn** (chạm mới mở), không tab, không trang riêng.
- **Preset** (chọn chế độ) lên gần đầu, ngay dưới giá. **Slider trọng số** (ít đụng) giấu trong panel ⚙.

## Bố cục mới (trên → dưới)

1. **Header** — `Vùng​Vàng` + nút ⚙ (mở panel cài đặt trọng số).
2. **Banners** — stale / warnings / preset degraded (giữ nguyên logic).
3. **Hero** (gộp verdict + ActionGuidance):
   - Tag cấp độ (GOM / GOM RẢI / QUAN SÁT / CHỜ CHÊNH HẠ / BỚT MUA) — từ `guidance.level`.
   - `guidance.when` — dòng to nhất (~1.5rem, đậm, màu theo tone).
   - `guidance.how` — câu lý do ngắn.
   - `guidance.reasons` — giữ dạng list nhỏ (· …) bên dưới how.
   - Dòng cô đọng cuối: `{zoneLabel} · điểm {composite} · xác suất gần đáy {lvl}`. Thay cho khối verdict-score + verdict-bt + gauge cũ ở đỉnh.
   - Border-left màu theo tone (như `.guidance` hiện có).
   - **verdict-note** (cảnh báo bán / preset-chưa-tín-hiệu) giữ trong hero khi áp dụng — đây là cảnh báo an toàn, không được giấu.
4. **Bảng giá** — rút gọn **4 ô, lưới 2 cột** trên mobile: SJC, Nhẫn, Thế giới quy đổi, Chênh VN−TG. Hai ô XAU/USD + USD/VND chuyển xuống accordion "Vĩ mô / Chi tiết điểm số" (hoặc nhóm tiêu chí vĩ mô). `auto-fit minmax` để desktop vẫn trải rộng.
5. **Hàng preset** — các nút chế độ (Toàn cảnh + presets), giữ nguyên hành vi `applyPreset`, badge ⚠ khi degraded, title tooltip evidence.
6. **Accordion gập sẵn** (mỗi cái `<details>`):
   - **Chi tiết điểm số** — gauge (track + needle + scale) + dòng kiểm chứng backtest của zone hiện tại (verdict-bt cũ) + freshness.
   - **4 nhóm tiêu chí** — 4 thẻ criterion hiện có (mỗi thẻ giữ card-head + signals list). Có thể là 1 accordion chứa cả 4, hoặc mỗi tiêu chí 1 accordion — **chọn: 1 accordion "4 nhóm tiêu chí" chứa cả 4 thẻ** để đỡ rườm rà; tiêu đề phụ liệt kê tên 4 nhóm.
   - **Kiểm chứng lịch sử** — bảng backtest (`bt-table`).
   - **Chênh lệch VN−Thế giới** — `<PremiumChart />`.
   - **Săn đáy** — `<BottomGauges />`.
   - **Máy thời gian** — `<TimeMachine />`.
7. **Footer disclaimer** — giữ nguyên.

### Trạng thái mở mặc định
- Hero, giá, preset: luôn hiển thị (không accordion).
- 6 accordion: tất cả **đóng** mặc định.
  - Ngoại lệ: nếu zone là buy/sell (có khuyến nghị rõ), accordion "Chi tiết điểm số" có thể mở sẵn để người dùng thấy gauge xác nhận. **Chốt: luôn đóng hết** cho nhất quán + gọn nhất; người dùng chạm khi muốn. (Đơn giản, đúng mục tiêu 3-giây.)

## Cơ chế accordion

Dùng `<details>`/`<summary>` HTML thuần — không cần state React, không JS, accessible, hoạt động cả khi JS lỗi. Style `summary` thành hàng card (tiêu đề + meta phụ + chevron xoay khi mở qua `details[open]`). Lý do: app là static PWA, càng ít JS state càng tốt; `<details>` là chuẩn web cho disclosure.

Mỗi summary: tiêu đề chính + dòng meta phụ mô tả nội dung (vd "gauge · zone · kiểm chứng"). Chevron `▸`→`▾` qua CSS `details[open] .chev`.

## Panel cài đặt (⚙)

- Nút ⚙ ở header mở/đóng `showSettings` (giữ state hiện có).
- Nội dung panel: **chỉ còn slider trọng số** + đoạn giải thích "Chọn chế độ / Trọng số". Preset row đã chuyển ra ngoài (mục 5).
- Panel render ngay dưới header (như hiện tại), không cần overlay.

## CSS / mobile

- Giá: `grid-template-columns: repeat(2, 1fr)` mặc định; desktop `repeat(auto-fit, minmax(150px,1fr))` qua media query ≥520px.
- Hero: dùng lại biến màu + class tone (buy/sell/neutral) hiện có.
- Accordion summary: `cursor:pointer; list-style:none; ::-webkit-details-marker{display:none}`; layout flex.
- Giữ toàn bộ CSS custom properties + class con (`.gauge`, `.bt-table`, `.signals`, `.tm-*`, `.bottom-*`, `.premium-spark`) — chỉ thêm wrapper accordion, không sửa nội bộ.
- Vùng chạm: summary tối thiểu ~44px cao.

## Cái KHÔNG làm (YAGNI)

- Không tab, không trang riêng, không router.
- Không đổi màu/typography toàn cục (đây là A+D, không phải C đánh bóng) — chỉ thay đổi do tổ chức lại layout.
- Không animation phức ngoài chevron + details mở.
- Không đụng logic guidance/scoring/backtest/data.
- Không thêm thư viện.

## Test / kiểm chứng

- `npm run build` pass (static export).
- `npm test` pass — không component test cho Dashboard hiện tại; nếu có snapshot sẽ cập nhật.
- Kiểm tra tay: mobile viewport (≤380px) — hero + giá vừa 1 màn không cuộn ngang; accordion mở/đóng chạm được; preset đổi chế độ; ⚙ mở slider; desktop ≥760px vẫn ổn.
- Regression: mọi dữ liệu cũ (thiếu sourceTimes, preset, customized weights, stale) vẫn render đúng trong bố cục mới.

## Rủi ro

- Gộp verdict vào hero có thể làm mất thông tin nếu bỏ sót verdict-note (cảnh báo bán). → Giữ verdict-note trong hero.
- `<details>` đóng = `display:none` con; nội dung nặng (PremiumChart, TimeMachine SVG) vẫn trong DOM. **Đã xác nhận an toàn:** SVG dùng `viewBox` để render (không cần đo JS lúc mount); `getBoundingClientRect` chỉ gọi trong pointer handler của `TimeMachine`/`TimelineBrush` (click/drag), chỉ chạy sau khi accordion đã mở. Không cần lazy-render.
