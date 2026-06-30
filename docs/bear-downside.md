# Bear Downside — phân phối rủi ro mức-rơi-thêm: phương pháp & bằng chứng

Cập nhật: 2026-06-29. Sinh bởi `scripts/bear-downside-study.ts` trên dữ liệu thật (XAU/USD daily).

Đây là một **lớp độc lập**, KHÔNG đụng tới điểm tổng hợp mua/bán, Bottom Hunter, hay Bear DCA Advisor. Lớp này trả lời: **"nếu giá còn rơi, tệ nhất về sau có thể bao nhiêu?"** — một phân phối lịch sử kèm CI, không bao giờ là dự đoán.

## Mục tiêu

Cung cấp phân phối lịch sử **mức rơi thêm** (worst future drawdown) + **kết cục tại mốc** ở 3 tầm nhìn (21/63/126 phiên ≈ 1/3/6 tháng), để người dùng DCA vàng hiểu rủi ro & triển vọng trước khi quyết mua thêm. Card UI tên **"Triển vọng 1/3/6 tháng tới"** (đổi từ "Nếu giá còn rơi" vì giờ hai chiều). Bỏ tầm 12 tháng (252 phiên): chỉ ~20 cửa sổ độc lập + nhiễm thiên lệch bull mạnh nhất.

## Metric

```
mức rơi thêm = min(close[t+1 .. t+H]) / close[t] − 1
```

- Luôn ≤ 0 (hoặc = 0 nếu giá không rơi thêm).
- **P(đáy phía sau)** = tỉ lệ mẫu có mức rơi thêm ≥ 0 (tức giá không bao giờ xuống thêm trong H phiên tới).

**Mặt kết cục (hai chiều — thêm 2026-06-30 để card không một chiều/bi quan):** ngoài mức-rơi-thêm (rủi ro giữa kỳ), engine còn tính **lợi suất TẠI MỐC** `close[t+H]/close[t] − 1` → `endMedian` (trung vị kết cục) + `pUp` (% lần giá kết CAO hơn hôm nay, kèm CI). Card hiển thị cả hai cạnh nhau theo mức giá USD: trái = đáy điển hình giữa kỳ (rủi ro chịu đựng), phải = kết cục điển hình + cơ hội tăng. Mặt kết cục cũng vô-điều-kiện và **phụ thuộc chế độ thị trường** (bull cao hơn) — ghi caveat trên card, không phải dự đoán.

## Phương pháp

1. **Dữ liệu:** XAU/USD daily, ~2005–2026.
2. **Drawdown từ ATH:** `dd[t] = 1 − close[t]/ATH[t]`. Chia 4 bucket:
   - 0–10% (nhẹ), 10–20%, 20–30%, 30+% (sâu).
3. **Horizon:** 21 / 63 / 126 phiên giao dịch (~1/3/6 tháng). (Bỏ 252/12T: ~20 cửa sổ độc lập + thiên lệch bull mạnh nhất ⇒ kém tin.)
4. **Lưới thưa STEP=3:** lấy mẫu mỗi 3 phiên để tránh pseudo-replication (các ngày kế tiếp có cửa sổ tương lai trùng nhau → thổi phồng n và siết CI giả tạo).
5. **CI:** block-bootstrap (`blockBootstrapCi`) cho P(đáy phía sau); `blockBootstrapPercentileCi` cho trung vị mức rơi thêm. `blockSize = max(1, round(H/STEP))`.
6. **Split train/test:** train `<2019`, test `≥2019`.

### Câu hỏi kiểm chứng

Điều kiện hóa theo độ sâu drawdown có thêm thông tin bền vững không? 3 điều kiện (phải đạt CẢ 3 ở CẢ hai giai đoạn):

1. **Đơn điệu:** bucket sâu hơn → P(đáy phía sau) cao hơn (monotonically).
2. **Tách bạch:** CI(P) của bucket sâu nhất đủ mẫu KHÔNG trùm CI vô-điều-kiện.
3. **Ổn định 2 giai đoạn:** (1) + (2) giữ ở cả train lẫn test.

## Bằng chứng (horizon 63 phiên)

### TRAIN <2019

| Bucket | P(đáy phía sau) | CI 95% | Trung vị rơi thêm | n |
| --- | --- | --- | --- | --- |
| **Vô-điều-kiện** | **8.7%** | **6–11.5%** | **−3.9%** | **1049** |
| 0–10% | 11.3% | 5.8–17.3% | −3.5% | 400 |
| 10–20% | 7.8% | 3.2–12.3% | −4.7% | 154 |
| 20–30% | 2.1% | 0–6.3% | −7.6% | 95 |
| 30+% | 8.0% | 5–11.5% | −3.3% | 400 |

- Đơn điệu P theo độ sâu: **KHÔNG** (0-10% có P=11.3%, 20-30% chỉ 2.1%, 30+% quay lại 8.0%)
- CI bucket sâu nhất tách khỏi vô-điều-kiện: **KHÔNG**

### TEST ≥2019

| Bucket | P(đáy phía sau) | CI 95% | Trung vị rơi thêm | n |
| --- | --- | --- | --- | --- |
| **Vô-điều-kiện** | **12.7%** | **8.6–17.3%** | **−2.6%** | **607** |
| 0–10% | 13.4% | 8–19.4% | −2.9% | 350 |
| 10–20% | 7.5% | 2.9–12.1% | −3.1% | 174 |
| 20–30% | 29.4% | 11.8–47.1% | −0.8% | 51 |
| 30+% | 6.3% | 0–12.5% | −1.4% | 32 |

- Đơn điệu P theo độ sâu: **KHÔNG** (10-20% thấp nhất 7.5%, 20-30% nhảy lên 29.4%, 30+% rơi về 6.3%)
- CI bucket sâu nhất tách khỏi vô-điều-kiện: **KHÔNG**

### Tổng hợp

| Giai đoạn | Đơn điệu | Tách bạch |
| --- | --- | --- |
| TRAIN <2019 | KHÔNG | KHÔNG |
| TEST ≥2019 | KHÔNG | KHÔNG |

**Cả 4 kiểm tra đều KHÔNG** → điều kiện (3) "ổn định 2 giai đoạn" cũng KHÔNG.

## Kết luận

**`conditioningWorks = false`** — điều kiện hóa theo độ sâu drawdown **KHÔNG** thêm thông tin bền vững.

Cụ thể:

- **Không đơn điệu:** drawdown sâu hơn không hệ thống tăng P(đáy phía sau). Ví dụ: bucket 20–30% có P chỉ 2.1% ở train nhưng nhảy lên 29.4% ở test — bất ổn định hoàn toàn.
- **CI trùm nhau:** CI bucket sâu nhất đủ mẫu luôn trùm CI vô-điều-kiện — không tách bạch.
- **Vàng hiếm rơi sâu >30%:** bucket sâu có n rất nhỏ (95 train, 32 test ở horizon 63), dẫn tới CI rộng và nhiễu cao, không đáng tin.

→ **UI hiện phân phối vô-điều-kiện** (pooled toàn bộ lịch sử, không chia bucket). Phân phối này vẫn hữu ích: *"sau bất kỳ ngày nào, đáy tệ nhất 3 tháng trung vị ~−3%, khoảng 90% số lần giá còn chớm xuống thêm"* — thông tin thực dụng cho người DCA, dù không phân biệt theo mức drawdown hiện tại.

## Tái lập

```bash
npx tsx scripts/bear-downside-study.ts   # chạy study, in 3 điều kiện
```

`BEAR_DOWNSIDE_CONFIG` khai báo tại `src/lib/types.ts`. Script study: `scripts/bear-downside-study.ts`. Engine: `src/lib/bear-downside.ts`.

## Giới hạn

1. **Chỉ kiểm chứng trên XAU/USD** — không caveat VND (đây là phân phối lợi suất XAU, không phải giá vốn VND).
2. **Bucket sâu (20–30%, 30+%) thưa mẫu** — vàng ít rơi sâu hơn cổ phiếu, nên thống kê bucket sâu luôn nhiễu.
3. **Phân phối vô-điều-kiện phụ thuộc chế độ thị trường** — trung vị và P thay đổi theo giai đoạn (train vs test), đừng đọc như hằng số.

## Tested and REJECTED (đừng tái thêm nếu chưa chạy lại study)

Điều kiện hóa phân phối mức-rơi-thêm theo độ sâu drawdown (bucket 0-10/10-20/20-30/30+%) — cả 4 kiểm tra (đơn điệu × tách bạch × 2 giai đoạn) đều KHÔNG đạt. Bucket sâu bất ổn định nghiêm trọng giữa train và test (P=2.1% vs 29.4% ở 20-30%). `conditioningWorks=false`, chỉ ship phân phối vô-điều-kiện.
