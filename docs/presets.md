# Bộ cấu hình (preset) theo kỳ hạn — phương pháp & bằng chứng test

Cập nhật: 2026-06-11. Sinh bởi `scripts/presets-study.ts` trên dữ liệu thật đến 11/06/2026.

## Câu hỏi cần trả lời

Với từng kỳ hạn nắm giữ (1 / 3 / 6 tháng), bộ trọng số tiêu chí + ngưỡng mua nào cho tín hiệu MUA **chính xác nhất một cách bền vững** — không phải chính xác nhất trên quá khứ rồi sụp đổ với dữ liệu mới (overfitting)?

## Phương pháp

1. **Dữ liệu:** timeline giả lập 1.425 ngày (2009–2026), mỗi ngày engine chấm điểm 3 tiêu chí thế giới (kỹ thuật, thống kê, vĩ mô) **chỉ bằng dữ liệu có đến ngày đó**, kèm lợi suất XAU thực tế sau 21/63/126 phiên.
2. **Chia đôi thời gian:** train 2009–2018, test 2019–2026. Hai giai đoạn có tính chất rất khác nhau (train chứa cả bear market vàng 2013–2015; test chủ yếu bull) — cấu hình sống được ở cả hai mới đáng tin.
3. **Grid search:** 66 tổ hợp trọng số (bước 10%) × 4 ngưỡng mua (+30/+40/+50/+60) = 264 cấu hình mỗi kỳ hạn.
4. **Điều kiện nhận:**
   - ≥ 25 tín hiệu mua ở **mỗi** giai đoạn (đủ mẫu);
   - tỉ lệ đúng **vượt baseline ở cả hai giai đoạn** (baseline = mua ngày bất kỳ, lãi sau kỳ hạn — vàng trôi tăng nên baseline đã cao sẵn, vượt được mới là lợi thế thật).
5. **Xếp hạng:** theo **lợi thế tệ nhất** trong 2 giai đoạn (min-excess) — ưu tiên ổn định, phạt cấu hình chỉ rực rỡ một thời kỳ.

"Đúng" nghĩa là: tín hiệu MUA bắn → giá XAU cao hơn sau đúng kỳ hạn đó.

## Kết quả — 3 preset được chọn

| Preset | Trọng số (KT / TK / VM) | Ngưỡng mua | Đúng 2009–2018 | Đúng 2019–2026 | Baseline (train/test) | Trung vị lãi (test) |
| --- | --- | --- | --- | --- | --- | --- |
| **Sóng 1 tháng** | 0 / 20% / 80% | +50 | **71,7%** (n=99) | **81,0%** (n=79) | 51,9% / 60,6% | +4,6% |
| **Sóng 3 tháng** | 10% / 0 / 90% | +60 | **75,9%** (n=79) | **82,7%** (n=75) | 55,7% / 69,7% | +6,5% |
| **Tích lũy 6 tháng** | 0 / 10% / 90% | +60 | **68,2%** (n=85) | **93,1%** (n=72) | 57,7% / 79,9% | +15,7% |

KT = kỹ thuật XAU, TK = thống kê lịch sử, VM = vĩ mô (DXY + hướng lãi suất Fed). Chênh lệch VN = 0% trong preset (lý do bên dưới).

Top 5 đầy đủ mỗi kỳ hạn: chạy `npx tsx scripts/presets-study.ts` (cần `npm run collect` trước).

### So sánh với cấu hình mặc định (35/25/20/20, ngưỡng +40)

| Kỳ hạn | Mặc định (train) | Preset (train) | Mặc định (test) | Preset (test) |
| --- | --- | --- | --- | --- |
| 1 tháng | 67,4% (n=46) | 71,7% (n=99) | n=1 (không đủ mẫu) | 81,0% (n=79) |
| 3 tháng | 60,9% (n=46) | 75,9% (n=79) | n=1 | 82,7% (n=75) |

Mặc định không tệ nhưng quá kén trong thị trường bull (2019–2026 chỉ bắn 1 tín hiệu). Preset bắn đều ở cả hai chế độ thị trường và chính xác hơn.

## Phát hiện chính

**Vĩ mô thống trị mọi kỳ hạn.** Tín hiệu "DXY yếu + Fed đang hạ lãi suất" là yếu tố dự báo mạnh và bền nhất cho vàng — đúng với cơ chế kinh tế (vàng không sinh lãi, hấp dẫn khi lãi suất thực giảm; định giá bằng USD, hưởng lợi khi USD yếu). Kỹ thuật giá (RSI, MA200) chỉ đóng vai phụ; ở kỳ hạn dài gần như vô dụng.

## Giới hạn — đọc kỹ trước khi tin con số

1. **Tín hiệu bắn chùm.** Điểm vĩ mô cao kéo dài cả giai đoạn Fed nới lỏng, các tín hiệu cách 3 phiên chồng lấn kỳ hạn lên nhau → mẫu hiệu dụng nhỏ hơn n ghi trên bảng đáng kể. 93,1% của preset 6 tháng nhìn lóa mắt nhưng về bản chất là "vài đợt Fed hạ lãi suất đều trúng".
2. **Chỉ 2 giai đoạn kiểm chứng.** Bộ lọc min-excess giảm rủi ro overfit nhưng không diệt được — việc chọn cấu hình có nhìn kết quả test (selection bias nhẹ). Con số % nên đọc là **ước lượng lạc quan**; kỳ vọng thực tế thấp hơn vài điểm.
3. **Backtest trên XAU/USD, bạn mua vàng VN.** Tương quan cao nhưng chênh lệch SJC co giãn — preset cố tình đặt tiêu chí chênh lệch VN = 0% vì mới có vài ngày lịch sử tự thu thập, **chưa thể kiểm chứng**. Khi đủ ≥ 6 tháng dữ liệu, chạy lại study để xét đưa premium vào preset.
4. **Tín hiệu BÁN không có preset.** Mọi nghiên cứu (xem horizon-study) cho thấy đoán đỉnh dài hạn với vàng sai 51–75% — không có cấu hình bán nào qua được bộ lọc. App giữ ngưỡng bán mặc định −40 chỉ để cảnh báo ngắn hạn.
5. Quá khứ không bảo đảm tương lai. Đây là công cụ xác suất, không phải lời hứa.

## Tái lập kết quả

```bash
npm run collect                      # sinh timeline.json từ dữ liệu thật
npx tsx scripts/presets-study.ts     # bảng tuyển chọn 3 kỳ hạn
npx tsx scripts/optimize-study.ts    # study gốc (1 kỳ hạn, HORIZON=21|63|126)
npx tsx scripts/horizon-study.ts     # hiệu quả tín hiệu mặc định theo 4 kỳ hạn
```

Preset khai báo tại `src/lib/types.ts` (`PRESETS`) — số liệu evidence trong code phải khớp bảng này; đổi preset thì cập nhật cả hai.
