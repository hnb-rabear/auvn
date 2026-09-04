# Đánh Giá Toàn Diện Hệ Thống & Đề Xuất Nâng Cấp — AUVN (Gold Zone Advisor)

**Ngày đánh giá:** 04/09/2026  
**Người thực hiện:** Bé Homi (Hermes Agent)  
**Phạm vi:** Toàn bộ kiến trúc dữ liệu, thuật toán định lượng (Presets v4/v4.1, Bottom Hunter, Bear DCA), tính thực tế tại thị trường vàng Việt Nam và hạ tầng triển khai.

---

## I. Tổng Quan & Điểm Sáng Dự Án (Strengths)

1. **Kỷ luật định lượng hiếm thấy ở dự án cá nhân:**
   - Phân chia nghiêm ngặt Out-of-Sample (Train 2009–2018 / Test 2019–2026).
   - Có kiểm định Placebo cùng cỡ mẫu (Same-n placebo, Contiguous-block placebo) để loại bỏ ảo tưởng thống kê.
   - Sẵn sàng loại bỏ các biến tưởng như "thần thánh" nhưng gây nhiễu thực tế (GPR, VIX, M2, Breakeven Inflation, COT positioning).
2. **Kiến trúc Zero-Cost thông minh:**
   - Dùng Git repository làm cơ sở dữ liệu thời gian thực.
   - GitHub Actions chạy tính toán trước (Precomputed static data), Client chỉ tải JSON tĩnh, loại bỏ hoàn toàn chi phí máy chủ và tránh lỗi CORS.
3. **Ý thức cao về tính trung thực thống kê:**
   - Dùng `STEP = 3` để giảm hiện tượng Pseudo-replication (tự tương quan chuỗi).
   - Tách bạch giữa tín hiệu sóng ngắn (Presets) và chiến lược tích sản (Bear DCA).

---

## II. Các Vấn Đề Kỹ Thuật & Hạn Chế Cốt Lõi (Critical Flaws & Edge Cases)

### 1. Sự Phi Thực Tế của Sóng 1 Tháng do Chênh Lệch Mua – Bán (Bid-Ask Spread Drag)
- **Hiện trạng:** Preset 1 tháng báo tỷ lệ đúng 89.1%, trung vị lợi nhuận test là `+4.1%` (tính trên giá thế giới XAU/USD).
- **Vấn đề:** Tại thị trường Việt Nam, spread Mua – Bán của SJC và Vàng Nhẫn thường neo ở mức `1.5% – 3%` (thậm chí lên tới 4% khi thị trường biến động mạnh).
- **Hệ quả:** Sau khi trừ phí spread tiệm vàng ăn đứt, lợi nhuận thực tế (Net Return) của sóng 1 tháng gần như về 0 hoặc âm. Việc khuyến nghị lướt sóng 1 tháng cho vàng vật chất tại VN là thiếu khả thi.

### 2. Dữ Liệu Vàng Nhẫn Bị Trượt (Fall-Through Bug)
- **Hiện trạng:** Giao diện hiển thị `Nhẫn mua / bán: — / —`.
- **Nguyên nhân:** Trong `fetch.ts`, khi các nguồn BTMC và SJC bị chặn IP/WAF, hệ thống tự động fallback sang `cafef.vn`. Mã nguồn CafeF scraper được định nghĩa chỉ cào SJC, gán cứng `ringBuy: null, ringSell: null`.
- **Hệ quả:** Mất hoàn toàn dữ liệu Vàng Nhẫn 9999 — loại tài sản được người dân gom tích sản nhiều nhất hiện nay.

### 3. Nguy Cơ Overfitting Ở Preset v4.1 (Tách Sub-signal Vĩ Mô)
- **Hiện trạng:** Nhận thấy năm 2023 bị "câm" (0 tín hiệu mua trong một năm tăng giá mạnh), tác giả ép `FED = 0` ở các preset 3m và 6m để mở khóa tín hiệu (được 16 tín hiệu mua).
- **Hạn chế:** Việc thay đổi trọng số để giải quyết một năm cụ thể trong quá khứ là dấu hiệu điển hình của Overfitting (khớp quá mức vào dữ liệu lịch sử). Trong tương lai khi chu kỳ Fed đảo chiều phức tạp, bộ trọng số này có thể mất tính tổng quát.

### 4. Bất Đối Xứng Giữa Lợi Suất Thực (Real Yield) và Lợi Suất Danh Nghĩa (`^TNX`)
- **Hiện trạng:** Thuật toán dùng lợi suất danh nghĩa Mỹ 10 năm (`^TNX`) làm trọng số vĩ mô lớn (20% – 40%).
- **Hạn chế:** Giá vàng toàn cầu phản ứng trực tiếp với **Lợi suất thực (Real Yield = Nominal Yield − Expected Inflation)**. Giai đoạn 2024–2026, lạm phát neo cao khiến lợi suất thực giảm dù lợi suất danh nghĩa tăng, dẫn đến vàng bứt phá đỉnh lịch sử. Việc dùng `^TNX` danh nghĩa khiến hệ thống đánh giá vĩ mô bị "lệch pha" với dòng tiền thông minh.

### 5. Rủi Ro Thanh Khoản Thực Tế & Can Thiệp Hành Chính Tại VN
- **Hiện trạng:** Thuật toán giả định rằng khi có tín hiệu mua là nhà đầu tư có thể mua được vàng theo giá niêm yết.
- **Thực tế:** Thị trường VN thường xuyên xảy ra tình trạng "cháy hàng", giới hạn mua 1–2 chỉ/người, phải bốc số online, hoặc tiệm ngừng giao dịch. Khi NHNN can thiệp thị trường (bán vàng miếng trực tiếp, siết hóa đơn), chênh lệch SJC-TG biến động dị biệt, bẻ gãy mọi tương quan kỹ thuật của XAU/USD.

### 6. Điểm Mù Cuối Tuần (Weekend Desync)
- **Hiện trạng:** XAU/USD đóng cửa từ đêm thứ 6 đến rạng sáng thứ 2.
- **Thực tế:** Các tiệm vàng VN vẫn mở cửa giao dịch vào thứ 7 và Chủ Nhật. Nếu có biến cố địa chính trị nổ ra cuối tuần, giá vàng VN nhảy múa tự do trong khi hệ thống AUVN bị "đóng băng" dữ liệu thế giới.

### 7. Hiệu Ứng Vía Thần Tài Gây Bẫy Đu Đỉnh Ngắn Hạn
- **Hiện trạng:** Tiêu chí Thống kê (Historical stats) chấm điểm cộng mùa vụ cho tháng 1 - tháng 2 âm lịch (hiệu ứng Tết & Thần Tài).
- **Thực tế:** Giá thế giới không có chu kỳ này. Tại VN, sát ngày Thần Tài giá bị đẩy lên đỉnh và spread bị kéo giãn tối đa, sau ngày Thần Tài giá tụt ngay lập tức. Nếu hệ thống báo "VÙNG MUA" vào sát ngày Thần Tài sẽ tạo bẫy tâm lý cho người dùng.

---

## III. Lộ Trình Nâng Cấp Đề Xuất (Actionable Roadmap)

### Giai đoạn 1: Sửa Lỗi Dữ Liệu & Hạ Tầng (Cần Làm Ngay)
1. **Khắc phục triệt để lấy giá Vàng Nhẫn:**
   - Thêm nguồn fallback thứ 2 có đầy đủ vàng nhẫn (DOJI API, Webgia hoặc Giavang.net).
   - Tách riêng fetcher SJC và fetcher Vàng Nhẫn, không để lỗi một bên làm rỗng bên còn lại.
2. **Giải quyết vấn đề Stale FRED Data:**
   - Bổ sung cache dự phòng dài hạn và kiểm tra endpoint FRED trực tiếp qua proxy/residential IP thay vì chỉ dựa vào runner GitHub Actions.

### Giai đoạn 2: Tinh Chỉnh Mô Hình & Trải Nghiệm Thực Tế
1. **Bổ sung cột "Lợi Nhuận Thực Tế" (Net Return Engine):**
   - Trừ sẵn spread bình quân (2% cho SJC, 1.5% cho Nhẫn) vào bảng backtest để người dùng thấy con số thực nhận, không ảo tưởng về preset 1 tháng.
2. **Cập nhật Lợi Suất Thực (TIPS / DFII10):**
   - Thử nghiệm lại việc thay thế `^TNX` bằng `DFII10` làm biến vĩ mô chính thức để bắt kịp chu kỳ lạm phát hiện đại.
3. **Cờ Cảnh Báo Cuối Tuần & Rủi Ro Hành Chính:**
   - Thêm badge `[THỊ TRƯỜNG TG ĐÓNG CỬA]` vào thứ 7/Chủ Nhật.
   - Thêm cảnh báo khi chênh lệch Mua – Bán giãn nở bất thường (Spread > 2.5 triệu/lượng báo hiệu thị trường khan hiếm hoặc biến động sốc).

### Giai đoạn 3: Chiến Lược Bán & Chốt Lời (Exit Strategy)
1. **Hiện thực hóa Trailing Stop & Bán Từng Phần:**
   - Tận dụng nghiên cứu `premium-exit-study.ts` để đưa ra khuyến nghị bán thực tế khi chênh lệch VN vượt percentile 80–90 và giá thế giới suy yếu.
