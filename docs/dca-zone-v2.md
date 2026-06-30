# DCA Zone v2 — canh điểm vào 30-ngày-tới: phương pháp & bằng chứng NO-GO

Cập nhật: 2026-06-30. Sinh bởi `scripts/dca-zone-study-v2.ts` trên dữ liệu thật (XAU/USD daily).

**Kết luận: NO-GO.** Canh thời điểm mua *trong cửa sổ 30 ngày tới* của vàng (XAU/USD) **không** cho lợi thế bền vững so với "mua ngay". Không có luật nào vượt cả baseline mua-ngay lẫn placebo ở cả hai giai đoạn train/test. **Không ship UI** cho DCA Zone v2.

> Đây là kết quả trung thực theo nguyên tắc dự án "No prediction claims — decision support only" và "báo trung thực kể cả khi giết ý tưởng". Trước khi tái thử canh-điểm-vào, hãy đọc lại trang này.

## Mục tiêu (câu hỏi của người dùng)

"30 ngày tới, chờ hôm nào giá đẹp hơn để mua?" — bài toán canh thời điểm trong cửa sổ trượt 30 ngày (≈21 phiên giao dịch) với bắt-buộc-mua-cuối: nếu chưa gặp vùng đẹp tới phiên cuối cửa sổ → mua ngày cuối.

### Khác gì Module A cũ (`docs/dca-copilot.md`)?

Module A hỏi "canh ngày nào trong *tháng*?" và đo giá vốn (harmonic mean) trên ~15 năm (~241 tháng). Kết quả: chênh lệch ±1% bị bình quân hóa → NO-GO. Tuy nhiên thước đó bị phê bình là trộn toàn bộ chế độ thị trường.

DCA Zone v2 sửa hai vấn đề:
1. **Khung per-window:** đo chất lượng mua *từng cửa sổ 30-ngày riêng* (mỗi cửa sổ = 1 "neo") thay vì tích lũy 15 năm. Mỗi neo có rangePos riêng, so sánh cặp ghép (paired).
2. **Cạn TA cổ điển + cổng biến động:** thử đủ họ indicator (Bollinger, Stochastic, RSI, z-score, relative position, drawdown-from-window-high, pullback) kết hợp cổng biến-động (minVol) — thay vì chỉ relpos + monthdd như Module A.

## Thước đo: rangePos (vị trí tương đối trong biên độ cửa sổ)

```
rangePos = (giá_mua − min_30_ngày_tới) / (max_30_ngày_tới − min_30_ngày_tới)
```

- **0 = mua đúng đáy** cửa sổ 30 ngày tới; **1 = mua đúng đỉnh**.
- Thước này đo *chất lượng mua* trên từng cửa sổ, ghép cặp (paired) giữa luật và baseline. Tốt hơn giá vốn tích lũy vì không bị pha loãng bởi hàng trăm tháng.
- **Baseline mua-ngay:** mua phiên đầu cửa sổ (ngày 0). meanPos kỳ vọng ~0.5 nếu giá random, nhưng thực tế **~0.41** (xem insight bên dưới).

## Phương pháp

### Dữ liệu & split

- **XAU/USD daily**, ~2005–2026.
- **227 neo** (cửa sổ), neo mỗi 21 phiên để tránh pseudo-replication (cửa sổ liền kề trùng phần lớn ngày tương lai).
- **Train <2019:** 138 neo. **Test ≥2019:** 89 neo.

### Baselines

- **Mua-ngay (buy-now):** mua phiên đầu cửa sổ — baseline chính.
- **Placebo:** mua phiên ngẫu nhiên trong cửa sổ (seeded, tái lập) — loại luck.

### Họ luật ứng viên (past-only signals)

Mỗi luật chỉ dùng dữ liệu *trước* phiên hiện tại (no look-ahead). Khi luật kích hoạt → mua; nếu không kích hoạt suốt cửa sổ → buộc mua phiên cuối.

| Họ luật | Mô tả | Tham số |
| --- | --- | --- |
| `relpos` | Giá ≤ percentile p của W phiên gần nhất | W ∈ {10,21,42,63}, p ∈ {20,25,30,35} |
| `zscore` | z-score(close, W) ≤ −k | W ∈ {10,21,42,63}, k ∈ {1,1.5,2} |
| `stoch` | Stochastic %K(W) ≤ k | W ∈ {10,21,42,63}, k ∈ {15,20,25} |
| `bollinger` | %B(20,2σ) ≤ pctB (window=20, mult=2 CỐ ĐỊNH) | pctB ∈ {0,0.1,0.2} |
| `rsi` | RSI(14) ≤ thr (window=14 CỐ ĐỊNH) | thr ∈ {25,30,35} |
| `drawWin` | Giá ≤ đỉnh-toàn-cửa-sổ-tới-giờ × (1−x%) | x ∈ {2,3,4} |
| `pullback` | Giá giảm ≥ n% so với n phiên trước | n ∈ {2,3} |

### Cổng biến động (volatility gate)

Mỗi luật chạy lại với minVol ∈ {0, medVol}. medVol = 14.5 (trung vị ATR% toàn mẫu). Khi vol < minVol → luật bị tắt (mua buộc cuối cửa sổ).

### Gate GO/NO-GO

Luật phải thỏa **TẤT CẢ** ở **CẢ HAI** giai đoạn:

1. **meanDelta < 0** so với mua-ngay (rangePos thấp hơn = mua rẻ hơn).
2. **CI 95% không chứa 0** (block-bootstrap ghép cặp, blockSize = max(1, round(H/STEP))).
3. **Δ vs placebo < 0** (vượt mua-ngẫu-nhiên).
4. **meanPos ≤ 0.40** (edge thực chất, không chỉ tích cực nhẹ).

## Bằng chứng

### Kết quả tổng

```
DCA Zone v2 — 227 neo (train 138/test 89), H=21, neo mỗi 21 phiên.
Tham chiếu: mua-ngay & placebo rangePos kỳ vọng ~0.5. medVol=14.5.

✗ KHÔNG luật nào vượt mua-ngay + placebo (CI lệch khỏi 0)
  ở cả hai giai đoạn với size đáng kể.
```

### Ứng viên "gần đạt nhất" (chẩn đoán — KHÔNG đạt cổng)

`stoch(window=10, k=25)` minVol=0:

| Giai đoạn | meanPos | Δ vs mua-ngay | CI 95% (Δ) | Δ vs placebo | Win% | n |
| --- | --- | --- | --- | --- | --- | --- |
| Train <2019 | 0.459 | −0.014 | −0.079 .. 0.055 | −0.064 | 46% | 138 |
| Test ≥2019 | 0.400 | −0.007 | −0.077 .. 0.068 | −0.044 | 48% | 89 |

- Δ vs mua-ngay chỉ ~0.7–1.4 pp — nằm hoàn toàn trong nhiễu bootstrap.
- CI bao trùm 0 ở cả hai giai đoạn → **không có ý nghĩa thống kê**.
- Win rate 46–48% — luật có kích hoạt (không sập về mua-cuối), nhưng **không có edge**.

## Insight kinh tế: vì sao mua-ngay đã gần đáy cửa sổ

Mua-ngay có meanPos ~0.41 — **dưới** mức giữa 0.5 — tức mua ngày đầu cửa sổ đã thường xuyên gần đáy 30 ngày tới.

Lý do: **vàng có xu hướng dài hạn đi lên.** Trong một cửa sổ 30 ngày ở xu hướng tăng, đỉnh cửa sổ (max) bị kéo về phía cuối → ngày 0 (hôm nay) tự nhiên nằm gần đáy. Hệ quả:

- **Baseline mua-ngay đã rất khó đánh bại** — dư địa cải thiện ≤1 pp, nằm trong nhiễu.
- Các luật TA "chờ giá rẻ hơn" đôi khi bắt được đáy ngắn hạn nhưng cũng đôi khi trượt → mua buộc cuối cửa sổ ở giá cao hơn → bù trừ lẫn nhau.
- Đây là **true negative** đã được opus tái lập xác nhận — không phải bug, không phải thiếu indicator.

**Hệ quả thực tiễn cho người DCA:** khi vàng trending lên (phần lớn lịch sử), **đừng đợi/canh — cứ mua ngay là hợp lý** vì mua hôm nay đã gần đáy cửa sổ tới.

## Kết luận

**NO-GO:** canh điểm vào trong cửa sổ 30 ngày tới trên XAU/USD **không có lợi thế bền vững** — không luật TA cổ điển nào (relpos, z-score, Stochastic, Bollinger, RSI, drawdown-from-high, pullback) kết hợp cổng biến động vượt được mua-ngay + placebo ở cả train lẫn test.

So sánh với Module A cũ (`docs/dca-copilot.md`): **cùng kết luận**, lần này với khung per-window đúng hơn (không bị pha loãng bởi tích lũy 15 năm) và cạn toàn bộ TA cổ điển + điều kiện biến động + né-đỉnh — đóng nắp bài toán chắc hơn.

## Giới hạn

1. **Chỉ kiểm chứng trên XAU/USD** — SJC/ring gold VN (~6 tháng dữ liệu) chưa đủ mẫu để kiểm chứng riêng.
2. **H = 21 phiên (≈30 ngày)** — kết luận áp dụng cho cửa sổ ~1 tháng; cửa sổ khác (1 tuần, 3 tháng) chưa thử nhưng baseline-gần-đáy càng mạnh ở cửa sổ dài hơn.
3. **Luật chỉ dùng TA cổ điển + vol gate** — ML/deep learning chưa thử, nhưng với effect size ~0.7 pp và baseline đã gần đáy, khó kỳ vọng edge bền vững từ feature phức tạp hơn.

## Tái lập

```bash
npx tsx scripts/dca-zone-study-v2.ts   # chạy study, in kết quả
```

Script: `scripts/dca-zone-study-v2.ts`. Liên hệ Module A cũ: `scripts/dca-timing-study.ts`, `docs/dca-copilot.md`.

## Tested and REJECTED (đừng tái thêm nếu chưa chạy lại `scripts/dca-zone-study-v2.ts`)

Canh điểm vào trong cửa sổ 30 ngày tới (per-window, buộc-mua-cuối) theo: vị trí tương đối (relpos), z-score, Stochastic %K, Bollinger Band, RSI, drawdown-from-window-high, pullback — kết hợp cổng biến-động (minVol = 0 hoặc trung vị ATR%). Tất cả đều không vượt baseline mua-ngay + placebo trên rangePos ghép cặp ở cả train (<2019) lẫn test (≥2019) với CI 95% không chứa 0. Module A cũ (`docs/dca-copilot.md`) cũng NO-GO trên khung tháng + giá vốn tích lũy — lần này khung per-window đúng hơn, cạn TA cổ điển, cùng kết luận. Mua-ngay đã gần đáy cửa sổ (meanPos ~0.41) vì vàng trend lên dài hạn.
