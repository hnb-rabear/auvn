# Bear Downside "Triển vọng 1/3/6 tháng" — làm chính xác/hữu ích hơn (design + kết quả)

Ngày: 2026-07-03. Trạng thái: **đã thực thi & ship**. Nguyên tắc: evidence-first (train/test + placebo + CI), báo trung thực kể cả khi giết ý tưởng, mọi nghiên cứu lưu thành script + doc.

## Vấn đề

Người dùng: khi xem lại lịch sử, trung vị Triển vọng ("Điển hình") "lệch xa" giá thực. Hỏi: ghép với Composite (đang thấy chính xác) được không?

## Chẩn đoán (đo, không đoán)

Thước đo "chính xác" = **MAE của trung vị** walk-forward (trung vị tối thiểu hóa MAE nên là phép so đúng bản chất) + **bias** (sai số có dấu) + **coverage** dải. Nguồn: `public/data/timeline.json` (composite/zone/price/returns walk-forward past-only — production-faithful).

- **Bias là bệnh chính, không phải variance.** Baseline vô-điều-kiện có bias term CÓ ý nghĩa thống kê và ĐẢO DẤU: overshoot trong bear-2013 (train, 126p −5.57%), undershoot trong bull (test, 126p +7.10%). Đây đúng là "lệch xa" user thấy.
- Variance (spread) lớn tới mức MAE 126p ~11% → **không estimator nào làm trung vị = giá thực từng lần**. Mục tiêu khả thi = giảm bias hệ thống.

## Phương án đã thử & kết quả

| Hướng | Script | Kết quả |
| --- | --- | --- |
| Điều kiện hóa composite/zone/MA200/momentum/zone×trend | `bear-downside-conditioning-study.ts` | **BÁC** — không giảm MAE; MA200/zone×trend làm tệ. Ghép Composite không giúp. |
| Điều kiện hóa drawdown-bucket | `bear-downside-study.ts` (cũ) | **BÁC** (đã có từ trước). |
| Recency-weighting (hl 252/504/756) | `bear-downside-calibration-study.ts` | **NHẬN (504)** — giảm |bias| cả 2 chiều/2 chế độ; footgun-drawdown không xảy ra. |
| Trailing-window 5y | cùng script | Kém recency, bỏ. |

## Quyết định ship

1. **Conditioning: BÁC** (giữ `conditioningWorks=false`; thêm bằng chứng composite/zone/trend).
2. **Recency-weighting `recencyHalflife=504`**: phân phối tính theo `0.5^(tuổi/halflife)`, ưu tiên ~2 năm gần → bám chế độ hiện tại, sửa regime-drift bias. Áp cho cả bảng hiện tại (`runBearDownside`) lẫn máy thời gian as-of (`runBearDownsideHistory`) qua `computeHorizonStat(..., {ages, termAges, halflife})`.
3. **Chọn 504 (không phải 252 khử-bias sạch hơn):** 252/504 không phân biệt được thống kê (CI bias chồng nhau); artifact là decision-support cho người chịu rủi ro → chọn cái tiết chế đọc số cực đoan hậu-parabolic (126p 504→+13.5%/83.5% vs 252→+18%/91%).

## Trung thực (giới hạn — không giấu)

- Cải thiện **MAE KHÔNG có ý nghĩa thống kê** (variance chi phối); recency là hiệu chỉnh **BIAS/chế-độ**, KHÔNG phải dự đoán.
- Recency hạ trọng số chế độ xa (kiểu bear 2013) → kém bền nếu kịch bản đó lặp lại. Đối trọng: mặt ĐÁY (worst-dip) hiển thị cạnh bên + caveat trên card.
- Chỉ kiểm trên XAU/USD ~20 năm, chủ yếu bull.

## UI

- Bỏ ✓/✗ (khó hiểu), thêm cột **Thực tế** (đáy + kết cục thực tế) — đã làm trước.
- Caveat card: "phân phối theo trọng số hồi quy (ưu tiên ~2 năm gần) để bám chế độ hiện tại; cột đáy là đối trọng rủi ro; không phải dự đoán".

## Bất biến kỹ thuật giữ nguyên

- Golden: dải as-of ngày cuối === `runBearDownside(bars).unconditional` (cả hai cùng recency → vẫn bằng).
- `computeHorizonStat` không truyền ages ⇒ vô trọng số (unit test cũ + tương thích ngược).
- Lưới thưa STEP=3 chống pseudo-replication.

## Tái lập

```bash
npx tsx scripts/bear-downside-conditioning-study.ts   # conditioning BÁC
npx tsx scripts/bear-downside-calibration-study.ts    # bias/calibration → recency
npm test                                              # 27 bear-downside tests + golden
```
