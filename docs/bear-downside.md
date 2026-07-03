# Bear Downside — phân phối rủi ro mức-rơi-thêm: phương pháp & bằng chứng

Cập nhật: 2026-06-29. Sinh bởi `scripts/bear-downside-study.ts` trên dữ liệu thật (XAU/USD daily).

Đây là một **lớp độc lập**, KHÔNG đụng tới điểm tổng hợp mua/bán, Bottom Hunter, hay Bear DCA Advisor. Lớp này trả lời: **"nếu giá còn rơi, tệ nhất về sau có thể bao nhiêu?"** — một phân phối lịch sử kèm CI, không bao giờ là dự đoán.

## Mục tiêu

Cung cấp phân phối lịch sử **mức rơi thêm** (worst future drawdown) + **kết cục tại mốc** ở 3 tầm nhìn (21/63/126 phiên ≈ 1/3/6 tháng), để người dùng DCA vàng hiểu rủi ro & triển vọng trước khi quyết mua thêm. Card UI tên **"Triển vọng 1/3/6 tháng tới"** (đổi từ "Nếu giá còn rơi" vì giờ hai chiều). Bỏ tầm 12 tháng (252 phiên): chỉ ~20 cửa sổ độc lập + nhiễm thiên lệch bull mạnh nhất.

## Metric

```text
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
5. **CI:** block-bootstrap (`blockBootstrapCi`) cho P(đáy phía sau); `blockBootstrapPercentileCi` cho trung vị mức rơi thêm. `blockSize = max(1, round(H/STEP))`. (Từ 2026-07-03: khi recency-weighting bật, CI dùng `weightedBlockBootstrapCi` CÙNG hệ trọng số với điểm ước lượng — xem mục "Vá tin cậy" bên dưới.)
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

## Cải thiện độ chính xác trung vị (2026-07-03) — recency-weighting ĐƯỢC NHẬN, conditioning BỊ BÁC

Người dùng phản ánh trung vị "lệch xa" giá thực khi xem lại lịch sử. Hai study mới chẩn đoán & thử sửa (đọc `public/data/timeline.json` — composite/zone/price/returns walk-forward past-only, production-faithful).

### Study 1 — điều kiện hóa (`scripts/bear-downside-conditioning-study.ts`)

Thử làm trung vị bám hơn bằng cách điều kiện hóa phân phối theo **composite/zone** (câu hỏi user: "ghép Composite được không?"), **composite-bins**, **MA200**, **momentum126**, **zone×MA200**. Thước đo = MAE trung vị walk-forward, tách train(<2019)/test(≥2019), CI block-bootstrap trên ΔMAE, placebo xáo nhãn.

**Kết quả: KHÔNG ứng viên nào đạt** (không cell nào có CIΔ loại 0). MA200 & zone×MA200 **làm TỆ đi** đáng kể (mẫu con thưa → overfit). Zone ≈ baseline. → **Ghép Composite/zone/trend KHÔNG giúp** trung vị bám hơn. Lý do: composite là tín hiệu value/contrarian, nằm yên ở neutral suốt bull nên không sửa được undershoot; zone cực lệch (buy=141, strong-buy=0, và test-era gần như không có ngày buy) → không kiểm chứng được out-of-sample.

### Study 2 — bias & calibration (`scripts/bear-downside-calibration-study.ts`)

Chẩn đoán: bệnh chính là **BIAS do trôi chế độ**, không phải variance. Baseline vô-điều-kiện có bias term **CÓ ý nghĩa thống kê**, ĐẢO DẤU giữa giai đoạn:

| Horizon | TRAIN <2019 (bear 2013) | TEST ≥2019 (bull) |
| --- | --- | --- |
| 63p | −2.48% (overshoot, sig) | +3.07% (undershoot, sig) |
| 126p | −5.57% (overshoot, sig) | **+7.10%** (undershoot, sig) |

Ở 126p term test, dải [p10,p90] chỉ phủ **61%** (kỳ vọng 80) — dải quá hẹp/lệch tâm trong bull.

**Recency-weighting** (trọng số `0.5^(tuổi/halflife)`) sửa đúng bệnh: giảm |bias| ở **cả hai chiều, cả hai chế độ** (126p: train −5.57→−3.13, test +7.10→+5.69 ở hl=504), cải thiện MAE nhẹ. Kiểm định drawdown-state: ngày dd>10% recency **không** overshoot (footgun đảo chiều KHÔNG xảy ra trong lịch sử) — vẫn undershoot nhẹ như baseline.

### Study 3 — calibration "Cơ hội tăng" (pUp) (`scripts/bear-downside-pup-study.ts`)

Phản hồi tiếp: "pUp luôn >50%, 6T >70% — có ảo giác lạc quan không?" pUp là XÁC SUẤT nên thước đo đúng = **Brier score** (proper scoring rule) + reliability, không phải MAE. Backtest walk-forward, train/test.

Tần suất tăng THỰC TẾ phụ thuộc chế độ rất mạnh: TRAIN 2009–2018 (có bear 2013) chỉ **49,9/52,1/51,2%** (1/3/6T); TEST 2019–2026 (bull) **60,1/69,1/79,6%**.

| pUp (126p) | Brier train | predBias train | Brier test | predBias test |
| --- | --- | --- | --- | --- |
| unconditional | 0.3122 | **+18.5%** (quá lạc quan trong bear) | 0.1978 | **−18.2%** (quá bi quan trong bull) |
| **recency-504 (đang chạy)** | 0.3002 | +10.9% | 0.1877 | −12.3% |
| recency-252 | 0.2960 | +7.4% | 0.1861 | −8.1% |
| shrink→unc/50 | tệ hơn | thiên lệch hơn | tệ hơn | thiên lệch hơn |

**Kết luận: pUp KHÔNG quá lạc quan.** Cái "luôn ~65-70% cố định" là bản VÔ-ĐIỀU-KIỆN — nó mới quá lạc quan trong bear (predBias +18.5% ở 2013). Recency **sửa hai chiều** (hạ trong bear, nâng trong bull), Brier tốt hơn ở cả hai giai đoạn. Kéo pUp xuống (shrink về 50%/unconditional) làm Brier TỆ hơn → tạo *ảo giác bi quan*. Reliability recency-504: bin "80-90%" thực tế tăng 88% → nếu lệch là hơi dè dặt. **Giữ recency-504, KHÔNG đổi.** (252 Brier nhỉnh hơn chút ở 126p nhưng chọn 504 cho bền mặt median — chênh lệch Brier không đáng kể.)

### Quyết định: `recencyHalflife = 504` (~2 năm)

- 252 khử-bias sạch nhất (xóa significance) nhưng đọc số cực đoan ở đỉnh/hậu-parabolic (126p +18%/pUp 91% khi đang −22% dưới đỉnh). 252 vs 504 **không phân biệt được thống kê** (CI bias chồng nhau) → theo nguyên tắc "artifact decision-support cho người chịu rủi ro thì chọn bảo thủ", ship **504** (126p +13.5%/83.5%).
- **Trung thực:** cải thiện MAE **KHÔNG** significant (variance chi phối) — đây là hiệu chỉnh **BIAS/chế-độ**, KHÔNG phải dự đoán, KHÔNG làm trung vị = giá thực từng lần. Rủi ro còn lại: hạ trọng số chế độ xa (kiểu bear 2013) nên kém bền nếu lặp lại kịch bản đó — mặt ĐÁY hiển thị cạnh bên là đối trọng rủi ro, và card ghi caveat.
- Áp cho cả `runBearDownside` (bảng hiện tại) lẫn `runBearDownsideHistory` (máy thời gian as-of) qua cùng `computeHorizonStat(..., {ages, termAges, halflife})` → golden test (as-of ngày cuối === unconditional) tự giữ vì cả hai path cùng trọng số. `computeHorizonStat` không truyền ages ⇒ vô trọng số (giữ unit test cũ).

## Vá tin cậy (2026-07-03, sau review) — CI weighted, hiển thị bậc 1/10, ngưỡng mẫu độc lập, coverage đo được

Review độ tin cậy tìm ra lỗ hổng: **CI trong JSON tính trên mảng KHÔNG trọng số trong khi điểm ước lượng CÓ trọng số** — data live từng có pUp 126p = 83.5 nằm NGOÀI pUpCi [57, 79.1] của chính nó (CI vô nghĩa). Kèm theo: ESS sau recency-504 ≈ 485 mẫu chồng lấn ≈ **~12 cửa sổ 6T độc lập** → SE pUp ±~10pp, nên "83.5%" là giả-chính-xác ở tầng xác suất (cùng loại ảo giác mà `~$X,Xk` đã chặn ở tầng giá). Bốn vá:

1. **CI cùng hệ trọng số** — `weightedBlockBootstrapCi` (resample khối liên tiếp, mỗi mẫu mang trọng số recency của nó) cho pCi/medianCi/pUpCi khi weighted; path unweighted giữ nguyên. Trên data thật CI mới: pUp 126p 83.5 ∈ [68.7, 92.2] (rộng ±12pp — trung thực). Test khóa: "điểm ước lượng nằm TRONG CI của chính nó" cả weighted lẫn unweighted.
2. **Hiển thị "Khả năng" bậc 1/10** — `pUpTenths` (làm tròn /10, clamp 1..9): "≈8/10↑ · 2/10↓" thay "83.5%↑". Không bao giờ tuyên bố 0/10 hay 10/10.
3. **Ngưỡng mẫu theo cửa sổ độc lập** — `enoughSamples(n,H)`: n≥30 VÀ n·STEP/H ≥ 10 (H=21 cần n≥70, 63→210, 126→420). 30 mẫu raw ở 6T chỉ ≈0.7 cửa sổ độc lập — hiện số từ đó là tự tin giả. Dải 126p đầu lịch sử (2009–2011) chuyển thành "chưa đủ dữ liệu".
4. **Coverage đo được trên card** — `coverageStats` (bear-downside-view): đối chiếu dải as-of với thực tế trên toàn lịch sử đã đáo hạn, hiện trong info banner. Số hiện tại: kết cục thực nằm trong dải p25–p75 = **53/48/46%** (1/3/6T, kỳ vọng ~50); đáy thủng p10 = **8/8/9%** (kỳ vọng ~10). Biến caveat "không phải dự đoán" thành số kiểm được.

## Tested and REJECTED (đừng tái thêm nếu chưa chạy lại study)

1. **Điều kiện hóa theo độ sâu drawdown** (bucket 0-10/10-20/20-30/30+%) — cả 4 kiểm tra (đơn điệu × tách bạch × 2 giai đoạn) đều KHÔNG đạt. Bucket sâu bất ổn định nghiêm trọng train vs test (P=2.1% vs 29.4% ở 20-30%). `conditioningWorks=false`.
2. **Điều kiện hóa theo composite/zone/MA200/momentum/zone×trend** (2026-07-03, Study 1 trên) — không cải thiện MAE trung vị; MA200/zone×MA200 làm tệ đi. Ghép Composite KHÔNG giúp. Chỉ ship phân phối vô-điều-kiện + recency-weighting.
3. **Cột đáy dùng unweighted / min(weighted, unweighted)** (2026-07-03, `scripts/bear-downside-dipside-study.ts`) — đề xuất "đối trọng bảo thủ" cho phía rủi ro sau bull dài. Walk-forward bác: exceed% (đáy thực thủng p10, mục tiêu ~10) của weighted-504 = 8.8/8.5/6.0 train, 12.2/8.4/7.2 test — bám mục tiêu cả hai thời kỳ; unweighted/min sập còn 7.7/4.6/**2.9%** ở test = đáy hiển thị sâu hơn thực tế một cách hệ thống (quá bảo thủ), MAE không cải thiện. Giữ weighted cho CẢ hai cột.

## Trình bày chống ảo giác (2026-07-03)

Số đúng nhưng dễ đọc sai. Bốn ảo giác được chặn ở lớp TRÌNH BÀY (không đụng engine/pUp — đã kiểm chứng):

1. **Trung vị-như-dự-đoán** → cột **Kết cục** hiện **DẢI p25→p75** (`endP25`/`endP75`, thêm vào `BearHorizonStat`+`BearAsOfBand`), không phải một số.
2. **Giả-chính-xác** → làm tròn `~$X,Xk` (~$100) + tiền tố `~`, % số nguyên.
3. **Không thấy nghiêng bull** → nhãn chế độ hiện LUÔN dưới bảng: "nghiêng ~2 năm gần · khoảng rộng = bất định · KHÔNG phải dự đoán".
4. **Neo pUp, quên rủi ro** → dải kết HAI CHIỀU (đầu thấp p25 âm ở 1–3T); cột "Cơ hội tăng" → **"Khả năng" ↑/↓** (hiện cả hai chiều; từ vá tin cậy cùng ngày hiển thị bậc thô "≈8/10↑ · 2/10↓" thay % lẻ — xem mục "Vá tin cậy").

`endP25/endP75` tính trong `computeHorizonStat` (weighted+unweighted), khóa bởi test `endP25≤endMedian≤endP75` + golden as-of (thêm 2 trường). Không đổi recency-504/pUp. Thiết kế: `docs/superpowers/specs/2026-07-03-bear-downside-anti-illusion-design.md`.

## Máy thời gian as-of (card Triển Vọng)

Card có thanh trượt riêng: cuộn về ngày X bất kỳ và xem **dải card LÚC ĐÓ nói** cạnh **thứ THỰC TẾ xảy ra** từ X.

- **Dải as-of** — `runBearDownsideHistory(bars)` (`src/lib/bear-downside.ts`) tính walk-forward: tại ngày X, phân phối vô-điều-kiện trên mẫu lưới thưa STEP=3 đã đáo hạn (`j+H ≤ X`). Cùng mảng `bars` với engine live ⇒ tái hiện chính xác; golden test khóa: dải ngày cuối === `runBearDownside(bars).unconditional`. Forward-fill lên `timeline.points[*].bearAsOf` (mirror `forwardFillBottomHistory`).
- **Thực tế** — cột riêng hiển thị đáy tệ nhất thực tế `min(price[X+1..X+H])/price[X]-1` + kết cục thực tế `returns[H]`, tính client-side từ giá điểm. Chỉ hiện khi đã đáo hạn (`X+H` trong dữ liệu), ngược lại "chưa đáo hạn".
- Trước đây đối chiếu bằng ✓/✗ (đáy thực vs p10, kết cục thực vs endMedian) nhưng bị bỏ vì khó hiểu (2026-07-02) — thay bằng cột "Thực tế" hiển thị thẳng giá đã xảy ra để người dùng tự so.
- Không look-ahead; conditioning theo bucket vẫn bị bác; không sync với Time Machine. Reaction/đối chiếu, KHÔNG dự đoán.
