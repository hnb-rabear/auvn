# Study "thị trường êm" làm tín hiệu Săn đáy (spec B)

Ngày: 2026-09-25. Trạng thái: chủ dự án chọn hướng C (A trước, rồi B).

## Câu hỏi

Khảo sát sơ bộ OHLCV (dữ liệu Yahoo `GC=F` có sẵn high/low/volume 20 năm, engine chưa từng
dùng) cho một ứng viên: **biên độ phiên hẹp** — `rangeExp5` = trung bình (high−low)/close 5
phiên gần nhất chia trung vị 60 phiên trước đó. Nhóm ≤p20 train: +3,3pt train (19 đợt),
+21,2pt test (13 đợt), trực giao với cổng dd42 và gần như không trùng bin 3 (11 ngày).

Nghi vấn chính: nó chỉ là **chỉ báo thị trường tăng đều** (tăng giá ít biến động), không phải
tín hiệu đáy — đúng bẫy đã giết vol-squeeze (`docs/bottom.md` "Gom rải v3"). Train yếu
(+3,3pt), test mạnh ⇒ mẫu hình regime-bull quen thuộc.

## Phương pháp (pre-registered — không đổi sau khi thấy kết quả)

`scripts/calm-bottom-study.ts`, dữ liệu `GC=F` period1 cố định 2006-09-25.

- Nhãn: đúng nhãn Bottom Hunter chu kỳ (H=126, ε=3%) và sóng (H=30, ε=2%).
- Lưới thưa STEP=3 phiên từ WARMUP=756; split train <2019-01-01 / test ≥2019.
- Ngưỡng tính CHỈ trên train; lưới nhỏ: percentile {10, 20, 30} × cửa sổ ngắn {5, 10} = 6 cấu
  hình, × 2 tầng = 12 ô.
- Cụm độc lập = khối H phiên cố định; CI = `clusterBootstrapCiWeighted` (trọng số đều).

**Cổng GO (phải qua CẢ BỐN, ở ≥1 cấu hình, cho tầng đó):**

1. **Hai giai đoạn:** lift so nền > 0 ở CẢ train và test, và CI95 theo cụm của tỉ lệ đúng
   nằm hoàn toàn trên nền ở CẢ HAI giai đoạn.
2. **Placebo cùng số mẫu:** lift phải vượt p95 của 200 lần chọn ngẫu nhiên cùng số ngày
   theo **khối liền kề** (giữ cấu trúc cụm) — ở cả hai giai đoạn.
3. **Không phải chỉ báo bull:** trong nhóm ngày có momentum 12 tháng > 0 (thị trường đang
   tăng), "êm" vẫn phải có lift > 0 so với nền CỦA NHÓM ĐÓ ở cả hai giai đoạn. Đây là phép
   thử tách "êm" khỏi "đang tăng".
4. **Đủ đợt:** ≥ 8 đợt độc lập mỗi giai đoạn.

Đa kiểm định: 12 ô ⇒ báo cáo cả số ô qua cổng; một ô lẻ loi qua cổng trong khi các ô lân cận
(percentile/cửa sổ kế bên) không qua ⇒ coi là nhiễu, NO-GO.

## Kết quả

- **GO:** thêm `rangeExp` làm feature thứ 7 của `bottomFeatures`, chạy lại
  `scripts/bottom-study.ts` để tuyển trọng số qua cổng sẵn có, rồi mới ship. (Không ship thẳng
  từ study này.)
- **NO-GO:** ghi vào `docs/bottom.md` và danh sách "Tested and REJECTED" của CLAUDE.md, kèm
  bảng số. Không đổi code sản phẩm.
