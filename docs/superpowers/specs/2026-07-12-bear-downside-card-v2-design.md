# BearDownsideCard v2 — UI gọn, hết scroll ngang mobile, chọn ngày kiểu Máy Thời Gian

Ngày: 2026-07-12. Trạng thái: thiết kế đã duyệt (chat), chờ implement.

## Vấn đề

Card "Triển vọng 1/3/6 tháng tới" (`src/components/BearDownsideCard.tsx`) hiện có 2 vấn đề UX:

1. **Bảng 5 cột tràn ngang mobile** — `.bt-table` đặt `white-space: nowrap` trên mọi ô, 5 cột (Kỳ hạn / Đáy điển hình / Kết cục điển hình / Thực tế / Khả năng) buộc người dùng vuốt ngang mới đọc hết. Riêng cột "Thực tế" chiếm 1/5 bề ngang nhưng khi xem ngày mới nhất (đa số thời gian) chỉ hiện "chưa đáo hạn" ×3 dòng.
2. **Bộ chọn thời gian 3 cơ chế chồng nhau** — slider theo tháng + nút ◀▶ theo ngày + date picker, kèm dòng chú thích "kéo = tháng · ◀▶ = ngày · hoặc chọn:" để giải thích chính nó. Người dùng dùng tính năng xem-quá-khứ thường xuyên và muốn tương tác kiểu Máy Thời Gian (kéo/chạm trực tiếp trên biểu đồ giá).

## Quyết định đã chốt (hỏi đáp với chủ dự án)

- Tần suất dùng xem-quá-khứ: **thường xuyên** → bộ chọn thời gian luôn hiện, gộp về 1 cơ chế chính (sparkline), tham khảo Máy Thời Gian.
- Bố cục dữ liệu: **3 khối kỳ hạn xếp dọc** (phương án B) thay bảng — giữ được so sánh 3 kỳ hạn cùng lúc, hết scroll ngang triệt để.
- Mức "đậm" của sparkline: **tối giản** (phương án A) — chạm/kéo chọn thô + ◀▶ nhích phiên + date picker chính xác; KHÔNG pinch-zoom/pan (không nhân đôi code pointer của TimeMachine; nâng cấp sau nếu thiếu, khi đó tách hook dùng chung).

## Thiết kế

### 1. Cấu trúc card (trên xuống)

```
┌─ Triển vọng 1/3/6 tháng tới                    ⓘ ─┐
│ [sparkline giá ~64px — chạm/kéo chọn ngày]         │
│ ◀(FAB mép trái)                  (FAB mép phải)▶   │
│ 12/07/2026 (mới nhất) · $4.104 · −22,8% đỉnh [📅]  │
│ ┌ 1 tháng ────────────────────────┐               │
│ │ Đáy điển hình      Kết cục      │               │
│ │ ~$4,0k (−2%)       ~$4,0k→$4,3k │               │
│ │ Khả năng           (Thực tế)    │               │
│ │ ≈6/10↑ · 4/10↓     chỉ khi đã   │               │
│ │                    đáo hạn      │               │
│ └─────────────────────────────────┘               │
│ ┌ 3 tháng … ┐  ┌ 6 tháng … ┐                      │
│ ⚠ caveat (giữ nguyên)                              │
└────────────────────────────────────────────────────┘
```

### 2. Bộ chọn thời gian (thay slider-tháng + ◀▶ + chú thích)

- **Sparkline giá toàn lịch sử** (SVG `path` từ `timeline.points[*].price`, giống pattern Máy Thời Gian nhưng KHÔNG zoom/pan), cao ~64px, `preserveAspectRatio="none"`, vạch cursor dọc tại ngày đang chọn.
- **Chạm/kéo** trên sparkline = chọn ngày thô (pointerdown/pointermove map `clientX` → index; ~4.275 phiên trên ~350px ≈ 12 ngày/px nên đây là chọn THÔ có chủ đích).
- **2 nút ◀▶** dạng FAB nổi 2 mép biểu đồ (kiểu `.tm-fab` của Máy Thời Gian) = nhích từng phiên (disable ở 2 đầu).
- **Date picker** giữ lại, nằm cùng dòng thông tin ngày = nhảy chính xác (binary search date → index, giữ logic cũ).
- **Dòng ngày** dưới sparkline gộp: `{ngày} (mới nhất?) · ${giá} · −{dd}% dưới đỉnh [📅]` — thay thế dòng muted trùng lặp ở `card-head` hiện tại (card-head chỉ còn tiêu đề + ⓘ).
- **Sync `asOfIdx`** từ PriceChart giữ nguyên hành vi hiện tại (effect đè `idx` khi `asOfIdx != null`).

### 3. Khối kỳ hạn thay bảng

- 3 khối (1/3/6 tháng), mỗi khối: tiêu đề kỳ hạn + lưới 2 cột nhãn-trên-giá-dưới:
  - **Đáy điển hình** — `~$X,Xk (−N%)` (đỏ).
  - **Kết cục** — dải `~$X,Xk → ~$Y,Yk` + `−N%…+M%` nhỏ.
  - **Khả năng** — `≈t/10↑ · (10−t)/10↓`.
  - **Thực tế** — CHỈ render khi đã đáo hạn (`actualDip`/`actualTerm` non-null): `đáy ~$…k (−N%) · kết ~$…k (+M%)`. Ngày mới nhất: ô này không render, khối còn 3 ô.
- "Chưa đủ dữ liệu" (band null / `!enoughSamples`): khối thu thành 1 dòng mờ.
- **Responsive:** mobile xếp dọc; ≥720px xếp ngang `grid-template-columns: repeat(3, 1fr)`.
- **Không đổi format chống-ảo-giác:** `usdK` làm tròn `~$X,Xk`, dải p25→p75, `pUpTenths` bậc 1/10, caveat cuối card, banner ⓘ (định nghĩa cột + coverage đo được + đuôi p10 "hiếm gặp") — nội dung giữ, chỉ đổi khung trình bày.

### 4. Phạm vi kỹ thuật

- Sửa **duy nhất** `src/components/BearDownsideCard.tsx` + CSS mới trong `src/app/globals.css`.
- CSS class mới tiền tố `bdo-` (vd `.bdo-spark`, `.bdo-blocks`, `.bdo-block`, `.bdo-cell`); **KHÔNG đụng `.bt-table`** (backtest/preset đang dùng chung) và không đụng `.tm-*` của TimeMachine (chỉ mô phỏng pattern, có thể tái dùng class `.tm-fab`/`.tm-daterange` nếu khớp nguyên trạng — không sửa chúng).
- **Fallback legacy** (timeline.json cũ không có `bearAsOf`): cùng khối kỳ hạn (LegacyRow → LegacyBlock), KHÔNG sparkline — như hành vi cũ.
- Engine, `bear-downside-view.ts`, types, JSON: **không đổi**. Test hiện có (32) phải pass nguyên vẹn; repo không test React component nên không thêm.
- Kiểm chứng: `npm test` + `npm run build` + chạy dev, xem viewport mobile (~375px) xác nhận không còn scroll ngang, sparkline chọn ngày được, ◀▶ nhích phiên, date picker nhảy đúng, cột Thực tế xuất hiện khi lùi về quá khứ đủ xa.

## Ngoài phạm vi

- Pinch-zoom/pan trên sparkline (nâng cấp sau, tách hook chung với TimeMachine nếu cần).
- Mọi thay đổi số liệu/thống kê/nội dung caveat.
- Các card khác dùng `.bt-table`.
