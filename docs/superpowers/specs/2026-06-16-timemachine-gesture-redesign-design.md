# Máy thời gian — thiết kế lại thao tác (cử chỉ-first)

Ngày: 2026-06-16. Phạm vi: viết lại tương tác + bố cục của `TimeMachine.tsx` + CSS `.tm-*`, thêm helper toán cử chỉ thuần vào `brush.ts`, **xóa** `TimelineBrush.tsx`. **Không** đụng scoring engine, guidance logic, backtest, data, hay các component con khác.

## Mục tiêu

Điều khiển Máy thời gian hiện rất khó dùng, nhất là trên **mobile**: hàng điều khiển chen chúc (5 nút zoom + 2 ô ngày + 2 checkbox), minimap brush nhỏ khó kéo bằng ngón tay, nút "◀ Tín hiệu mua trước/sau" dạng chữ dài. Mục tiêu: **thao tác bằng cử chỉ thẳng trên biểu đồ** (vuốt/kéo/co), bỏ phụ thuộc vào thanh công cụ trên mobile.

Cách dùng thực tế của user (đã xác nhận qua brainstorming): zoom khoảng thời gian, lướt theo thời gian, xem 1 ngày cụ thể, nhảy tới tín hiệu mua, quan tâm kỳ hạn 1 tháng + 3 tháng. Mọi thao tác đều cần giữ — không bỏ chức năng nào.

## Quyết định (đã chốt qua brainstorming)

- **Bề mặt cử chỉ duy nhất = biểu đồ.** Bỏ component `TimelineBrush` (minimap riêng). Chart vừa hiển thị vừa nhận pan/tap/pinch/wheel.
- **Mobile = cử chỉ thuần, không thanh công cụ.** Toolbar trên mobile khó bấm — thay bằng ngón tay điều khiển trực tiếp.
- **Cử chỉ nhất quán mobile + desktop** (không tách 2 layout). Desktop dùng chuột thay pinch.
- **Nhảy tín hiệu mua = 2 nút nổi (FAB) tròn nhỏ** ở 2 mép chart, không chen vào hàng điều khiển.
- **Giữ chip zoom nhanh** (6T/1N/2N/5N/Tất cả) — tiện nhảy nhanh mức zoom, một hàng phía trên chart.
- **Thẻ "Gợi ý hành động" đầy đủ luôn hiện dưới chart** — kéo tới đâu thấy gợi ý tới đó, không phải bấm mở.

## Mô hình tương tác (lõi)

Chart là bề mặt cử chỉ duy nhất, dùng chung mobile + desktop:

| Cử chỉ | Mobile | Desktop | Hành động |
| --- | --- | --- | --- |
| Kéo 1 ngón / kéo chuột | ✓ | ✓ | **Pan** — trượt cửa sổ thời gian trái/phải |
| Tap / click | ✓ | ✓ | **Chọn ngày** — đặt vạch con trỏ, cập nhật panel |
| Chụm 2 ngón (pinch) | ✓ | — | **Zoom** quanh trung điểm 2 ngón |
| Lăn chuột (wheel) | — | ✓ | **Zoom** quanh con trỏ |
| Chip zoom (6T/1N/2N/5N/Tất cả) | ✓ | ✓ | nhảy nhanh mức zoom |
| 2 FAB ◀▶ | ✓ | ✓ | nhảy tín hiệu mua trước/sau |

### Phân biệt tap vs pan vs pinch (trên cùng bề mặt)

1. **pointerdown 1 ngón** → ghi vị trí gốc `originX`. Khi pointermove:
   - tổng dời < ~6px tới khi pointerup → **tap** = chọn ngày tại điểm bấm (`setIdx`).
   - tổng dời ≥ 6px → **pan**: dùng `applyBrushDrag("pan", anchorStart, span, deltaIdx, total, MIN_SPAN)`, cập nhật `viewStart` realtime.
2. **pointerdown ngón thứ 2** (touch) → vào chế độ **pinch**: theo dõi khoảng cách 2 ngón. Tỉ lệ khoảng cách hiện tại / lúc bắt đầu → `viewSpan` mới; căn tâm quanh trung điểm 2 ngón qua `centerWindow`. Kẹp `[MIN_SPAN, points.length]`.
3. **wheel** (desktop) → zoom quanh con trỏ; `preventDefault` chặn cuộn trang khi trỏ trên chart.
4. **2 FAB ◀▶** → dùng `prevSignal`/`nextSignal` đã có; `goTo()` căn giữa ngày tới.

**Đồng bộ chip zoom**: chạm chip = đặt `viewSpan` theo mốc tháng. Khi pinch/wheel làm span lệch khỏi mốc chuẩn → `zoomMonths = "custom"` (không chip nào active), giống hành vi brush hiện tại.

**An toàn cảm ứng**: vùng SVG chart đặt `touch-action: none` (như `.tm-brush` hiện tại) để pan/pinch không cuộn trang. FAB đặt lớp riêng, không nuốt cử chỉ pan của chart.

### Tái dùng

- `applyBrushDrag(mode="pan")` — pan cửa sổ (đã có trong `src/lib/brush.ts`).
- `centerWindow` — căn tâm khi zoom/pinch (đã có).
- Logic phân biệt tap/drag theo px màn hình + `setPointerCapture` — đã có trong `TimelineBrush`/`TimeMachine`, chuyển vào TimeMachine.

## Bố cục dọc mới (trên → dưới)

```
Xét lại lịch sử — máy thời gian        (tiêu đề + dòng phụ "chấm theo: preset …")
[6T][1N][2N][5N][Tất cả]        ⚙       (chip zoom + nút ⚙ tùy chọn phụ)
┌─────────────────────────────────────┐
│   BIỂU ĐỒ (cao ~200px)               │ (◀▶ = 2 FAB tròn nổi 2 mép)
│ ◀  ╱╲__╱╲___ ●vạch ngày        ▶     │ (pan/tap/pinch ngay trên đây)
└─────────────────────────────────────┘
11/06/2026 · XAU $4.090      [GOM RẢI]  (dải ngày + zone ngay dưới chart)
Gợi ý hành động (thẻ đầy đủ — when/how/reasons)
Sau 1T +2,1%  ·  Sau 3T +5,4% ✓  ·  Sau 6T … (hàng kết quả gọn, preset highlight)
▸ Chi tiết điểm số                       (gập: 4 điểm tiêu chí + ghi chú lịch sử)
```

Thứ tự: `chart → dải ngày+zone → Gợi ý hành động (đầy đủ) → hàng kết quả 1T/3T/6T → ▸ 4 điểm số (gập)`.

Thay đổi so với hiện tại:
1. **Chart cao ~200px** (thay 120px) — dễ đọc + dễ chạm, marker bớt chồng.
2. **Dải ngày + zone dán ngay dưới chart** (đang ở `tm-row` xa phía dưới) — chạm/kéo tới đâu thấy ngay.
3. **Hàng kết quả 1T/3T/6T rút thành 1 dải gọn** thay 3 ô to; vẫn highlight kỳ hạn của preset, giữ verdict ✓/✗ theo `verdictFor`.
4. **Gập phần nặng** vào 1 `<details>` "Chi tiết điểm số": 4 điểm số tiêu chí (`tm-scores`) + đoạn ghi chú "ở chế độ lịch sử…". Mở app thấy ngay chart + ngày + Gợi ý + kết quả.
5. **Nút ⚙** gom 3 tùy chọn ít dùng: *Hiện vùng bán*, *Ngưỡng thử nghiệm* (+ slider), *chọn khoảng ngày from/to*. Caption "N ngày tín hiệu / tổng ngày" cũng đặt ở đây hoặc làm caption nhỏ dưới chart.
6. **Bỏ đoạn intro dài** đầu card — thu 1 câu phụ ngắn (hoặc nút ⓘ bung).
7. **Bỏ hàng `tm-nav`** (nút chữ "◀ Tín hiệu mua trước") — thay bằng 2 FAB.

## Marker trên chart

Giữ 4 nhóm marker, ý nghĩa không đổi (chart cao hơn giúp bớt chồng):
- 🟢 Chấm xanh = tín hiệu mua (composite ≥ ngưỡng). To hơn để tap nhảy tới.
- 🔴 Chấm đỏ = vùng bán (chỉ khi bật toggle trong ⚙).
- 🔺 Tam giác = đáy đã xác nhận (`confirmedBottoms`).
- 🔵 Vòng xanh dương = ngưỡng thử nghiệm (chỉ khi bật).
- ⚪ Vạch dọc + chấm trắng = ngày đang chọn.

## Tách đơn vị (isolation)

- **Toán cử chỉ = hàm thuần trong `src/lib/brush.ts`** — thêm helper pinch zoom: từ (tỉ lệ chụm, tâm, span/start neo, total, minSpan) → `{start, span}` mới đã kẹp + căn tâm. Không phụ thuộc DOM ⇒ test đơn vị thẳng.
- **`TimeMachine.tsx` mỏng**: chỉ nối pointer/wheel event → gọi hàm thuần → set state. Mọi logic tính toán (`composites`, `signalIdxs`, `histGuidance`, `verdictFor`, marker) giữ nguyên.

## File đụng tới

- `src/components/TimeMachine.tsx` — viết lại render + thêm handler pan/tap/pinch/wheel; bố cục dọc mới; FAB; ⚙ panel gom tùy chọn phụ. Giữ nguyên toàn bộ logic tính toán.
- `src/lib/brush.ts` — thêm helper pinch zoom thuần (+ export).
- `src/app/globals.css` — `.tm-*`: chart cao 200px, `touch-action:none`, style FAB, dải ngày dưới chart, hàng kết quả gọn, ⚙ panel; bỏ `.tm-nav`, `.tm-brush*` (sau khi xóa component).
- `src/components/TimelineBrush.tsx` — **xóa**. `applyBrushDrag` trong `brush.ts` vẫn giữ (pan tái dùng).

## Test / kiểm chứng

- `npm test` — thêm test đơn vị cho helper pinch (tỉ lệ chụm → span đúng; kẹp `[MIN_SPAN, total]`; căn tâm đúng quanh trung điểm). Giữ các test timeline hiện có; cập nhật/xóa test phụ thuộc `TimelineBrush` nếu có.
- `npm run build` pass (static export).
- Kiểm tra tay mobile ≤380px: pan/tap/pinch mượt; thao tác chart **không** cuộn trang; FAB chạm được; chip zoom đổi mức; ⚙ mở tùy chọn phụ.
- Kiểm tra tay desktop: kéo chuột pan, wheel zoom quanh con trỏ, click chọn ngày; FAB nhảy tín hiệu.
- Regression: dữ liệu thiếu (sourceTimes/preset/customized weights/stale), confirmedBottoms rỗng, vẫn render đúng.

## Cái KHÔNG làm (YAGNI)

- Không đụng scoring engine / guidance / backtest / data.
- Không thêm thư viện chart hay gesture — tự xử pointer event như brush hiện tại.
- Không momentum/inertia scrolling — pan thẳng là đủ.
- Không animation phức (chỉ transition nhẹ FAB/chevron details).
- Không đổi nhóm marker hay ý nghĩa.
- Không tách 2 layout mobile/desktop riêng — một mô hình cử chỉ dùng chung.

## Rủi ro

- **Đụng độ tap/pan/pinch trên cùng bề mặt** → ngưỡng 6px phân biệt tap-vs-pan + đếm số pointer cho pinch; có kiểm tra tay. Giảm rủi ro bằng cách giữ toán trong hàm thuần test được.
- **`touch-action:none`** phải khu trú đúng vùng SVG chart, không chặn cuộn cả trang.
- Xóa `TimelineBrush` có thể vỡ import/test khác → kiểm tra tham chiếu trước khi xóa.
