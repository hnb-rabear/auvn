# Bottom Hunter — săn vùng gần đáy XAU/USD: phương pháp & bằng chứng test

Cập nhật: 2026-06-13. Sinh bởi `scripts/bottom-study.ts` + `scripts/bottom-ml-study.ts` + `scripts/monitor-bottom.ts` trên dữ liệu thật.

Đây là một **lớp độc lập**, KHÔNG đụng tới điểm tổng hợp mua/bán. Composite trả lời "vùng này nên gom hay không"; Bottom Hunter trả lời một câu khác hẹp hơn: **"hôm nay xác suất gần đáy là bao nhiêu?"** — một xác suất kèm khoảng tin cậy, không bao giờ là lời khẳng định "đây là đáy".

## Câu hỏi cần trả lời

Với từng tầm nhìn (chu kỳ dài / sóng ngắn), tổ hợp tín hiệu nào nhận diện được những ngày mà **giá sắp không còn rơi sâu thêm** — một cách bền vững qua các chế độ thị trường khác nhau, không phải khớp đẹp quá khứ rồi sụp với dữ liệu mới?

## Định nghĩa nhãn "gần đáy"

Một ngày `t` được gắn nhãn **near-bottom** nếu:

```
min(close[t+1 .. t+H]) >= close[t] * (1 - ε/100)
```

Tức là trong `H` phiên tới, giá sẽ **không rơi quá ε%** dưới mức đóng cửa hôm nay. Đây là nhãn **nhìn về tương lai** — chỉ dùng để gán nhãn khi backtest/tuyển chọn. Khi chạy live, engine **chỉ dùng dữ liệu quá khứ** (RSI, vĩ mô đến hôm nay) để chấm điểm, không hề biết tương lai.

## Phương pháp tuyển chọn (`scripts/bottom-study.ts`)

1. **Grid search:** 126 hồ sơ trọng số × 3 bộ ranh giới bin của bottomScore.
2. **Gate 2 giai đoạn nghiêm:** train < 2019, test ≥ 2019. Cấu hình chỉ được nhận nếu **vượt baseline (base-rate vô điều kiện) ở CẢ HAI giai đoạn**.
3. **Xếp hạng theo min-excess** — lợi thế tệ nhất trong 2 giai đoạn — ưu tiên ổn định, phạt cấu hình chỉ rực rỡ một thời kỳ (cùng triết lý preset trong `docs/presets.md`).

"Đúng" ở đây nghĩa là: ngày rơi vào bin điểm cao (gần đáy) → nhãn near-bottom thực sự bật.

## Cấu hình được chốt

| Tầng | H (phiên) | ε | binEdges | Trọng số | Lift train | Lift test | Baseline (train/test) | min-excess |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Chu kỳ (cycle)** | 126 | 3% | [-40, 0, 40] | {rsi: 0.5, macro: 0.5} | +19,5pt (n=81) | +26,5pt (n=57) | 32,3% / 52,4% | **+19,5pt** |
| **Sóng (swing)** | 30 | 2% | [-40, 0, 40] | {rsi: 0.5, macro: 0.5} | +13,9pt (n=81) | +12,5pt (n=63) | 40,4% / 51,0% | **+12,5pt** |

**Phát hiện chính:** lưới tìm kiếm đã **đưa về 0** các feature drawdown / tốc độ rơi / MACD / momentum. Tín hiệu đáy gần như nằm trọn ở **RSI quá bán + vĩ mô đảo chiều** (USD yếu / lợi suất 10 năm rơi / Fed nới). Cả 6 feature vẫn được tính (và hiển thị làm driver để giải thích), nhưng chỉ rsi + macro mang trọng số trong cấu hình đã kiểm chứng.

Điều đáng chú ý: **cả hai tầng, độc lập nhau, đều hội tụ về cùng tổ hợp rsi+macro** dù H và ε khác hẳn — đây là tín hiệu robust, không phải may rủi của một lần chạy.

## Cổng kiểm chứng ML (`scripts/bottom-ml-study.ts`)

Để chắc rule-based không bỏ lỡ tín hiệu, chạy hồi quy logistic walk-forward, so Brier score trên test (thấp hơn = tốt hơn), ngưỡng cải thiện đáng kể đặt ở 0,005:

| Tầng | Brier rule-based | Brier ML | Kết luận |
| --- | --- | --- | --- |
| Chu kỳ | 0,2876 | 0,2827 | ML **không** vượt ngưỡng 0,005 → giữ rule-based |
| Sóng | 0,2620 | 0,2567 | ML hơn 0,0053 — vừa qua ngưỡng nhưng trong nhiễu của một lần chia; hệ số ML phân bổ trọng số lộn xộn (tốc độ rơi vượt cả rsi/macro), không sạch hơn về kinh tế |

**Quyết định: GIỮ rule-based** — đơn giản, giải thích được. Việc dùng ML hoãn lại cho tới khi có một thắng lợi bền vững, tái lập được.

## Giám sát thoái hóa (`scripts/monitor-bottom.ts` → `bottom-health.json`)

Mỗi cron chạy lại cấu hình trên ~2 năm gần nhất, so bin điểm cao với baseline cùng kỳ:

| Tầng | Bin cao | Baseline | n | Trạng thái |
| --- | --- | --- | --- | --- |
| Chu kỳ | 100% | 78,6% | 15 | ok |
| Sóng | 71,4% | 60,8% | 21 | ok |

## Giới hạn — đọc kỹ trước khi tin con số

1. **Tổ hợp rsi+macro đúng cho cả hai tầm nhìn một cách độc lập** — đây là dấu hiệu bền (robustness), không phải cherry-pick một cấu hình đẹp.
2. **Baseline giai đoạn test cao (52% / 51%)** vì XAU tăng suốt 2019–2026; lift được đo so với baseline cao đó (so sánh đúng), nên **xác suất tuyệt đối phụ thuộc chế độ thị trường** — đừng đọc con số như hằng số.
3. **Mẫu bin cao chỉ vài chục (57–81)** nên khoảng tin cậy rộng; chân test của tầng sóng (+12,5pt tại n=63) là **mỏng nhất** (~2σ) — thật và qua được cổng, nhưng kém chắc chắn nhất. Tầng chu kỳ vững hơn nhiều.
4. **Chỉ kiểm chứng trên XAU/USD**; chiều chênh lệch VN KHÔNG nằm trong mô hình này — đây là **đáy XAU, không phải đáy SJC**. Premium vẫn là tín hiệu riêng (xem `docs/presets.md`).
5. **Đầu ra là xác suất kèm CI, không bao giờ là "đây là đáy".** Quá khứ không bảo đảm tương lai.

## Tái lập kết quả

```bash
npm run collect                      # sinh dữ liệu thật cho study
npx tsx scripts/bottom-study.ts      # tuyển ε/H + trọng số (grid search, gate 2 giai đoạn)
npx tsx scripts/bottom-ml-study.ts   # cổng kiểm chứng ML (Brier vs rule-based)
```

`BOTTOM_CONFIG` khai báo tại `src/lib/types.ts` — số liệu evidence trong code phải khớp doc này (cùng quy ước presets.md ↔ PRESETS); đổi cấu hình thì cập nhật cả hai.
