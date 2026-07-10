# Tối ưu Vùng bán — thiết kế nghiên cứu (2026-07-10)

> KẾT QUẢ (cùng ngày): A NO-GO, B NO-GO, C GO-một-phần ("đừng bán ngay"), D giữ sơ bộ —
> bằng chứng đầy đủ tại `docs/sell-zone.md`.

## Bối cảnh

Trạng thái sell-side hiện tại (sau policy 2026-07-04):

- Composite ≤ −40 = trạng thái **gió ngược** (headwind, observe-only). Bằng chứng: sell side composite NGƯỢC ở kỳ hạn dài (126p: n=238 test, giá tăng 69%, med +15,2% sau "bán"); chỉ 1 tháng có headwind thật (med 0..−5%).
- **Premium-exit** (chênh SJC-thế giới ≥ p80 trailing 180d): validated SƠ BỘ trên 487 ngày (16 tháng) — gradient đơn điệu 3 kỳ hạn, banner "VÙNG BÁN VN theo chênh lệch" trên biểu đồ premium. Chưa có train/test + placebo + CI.
- Chưa từng chạy grid search TUYỂN CHỌN cho sell side (macro-decomp/presets-study đều buy-only). Chưa có "Top Hunter" đối xứng với Bottom Hunter.

Goal phiên này: nghiên cứu sâu + rộng mọi cách tìm Vùng bán; được đập đi làm lại nếu tìm ra trục tốt hơn.

## Mục tiêu người dùng

Người tích lũy vàng vật chất, thỉnh thoảng cần BÁN (chốt lời / cơ cấu). Tín hiệu bán tốt =
ngày bán mà sau đó giá KHÔNG cao hơn đáng kể — đo bằng 3 metric:

1. **fav-down** = P(lợi suất sau H phiên < 0) — so baseline + placebo cùng-n.
2. **Excess trung vị** = median return sau tín hiệu thấp hơn baseline (càng âm càng tốt).
3. **rangePos bán** = vị trí giá hôm nay trong range cửa sổ 30/63 phiên TỚI (1.0 = bán đúng đỉnh cửa sổ). Vì vàng trend tăng, sell-now baseline dự kiến ~0.55–0.6 (đối xứng buy-now 0.41) ⇒ khác buy-timing, sell-timing CÓ headroom lý thuyết.

## Cổng nghiệm thu (giữ nguyên kỷ luật 2-phase toàn dự án)

- Train < 2019-01-01, test ≥ 2019 (XAU 15 năm). Premium: chia đôi 23 tháng theo thời gian.
- n ≥ 25 mỗi era (grid STEP=3 chống pseudo-replication khi tính stats).
- Thắng baseline CẢ HAI era, thắng placebo cùng-n (ngày ngẫu nhiên / xáo trộn ngưỡng).
- Block-bootstrap CI loại 0 ở era test (khi đủ lực).
- Mọi số hiển thị = bằng chứng đo được; thiếu dữ liệu ⇒ "chưa đủ dữ liệu kiểm chứng".

## 4 họ nghiên cứu (rộng)

### A. Sell-preset grid (`scripts/sell-preset-study.ts`)

Mirror macro-decomp 6D: trọng số KT/TK/MOM/DXY/FED/YLD (bước thô), ngưỡng bán −30/−40/−50/−60, H ∈ {21, 63, 126}. Objective fav-down. Kỳ vọng thấp (đã biết inverted) nhưng chưa từng TUYỂN cho sell — có thể tồn tại góc momentum-nặng.

### B. Top Hunter (`scripts/top-hunter-study.ts`)

Đối xứng Bottom Hunter: nhãn "gần đỉnh" = giá trong ε% của MAX cửa sổ H phiên tới (hoặc ±H). Features: RSI quá mua daily/weekly, khoảng cách đỉnh 52w, run-up 63p, macro đảo chiều (DXY/yield tăng), z-score. Grid trọng số + ngưỡng, walk-forward, placebo cùng-n.

### C. Sell-timing rangePos (`scripts/sell-timing-study.ts`)

Framework dca-zone-v2 đảo chiều: rule TA quá-mua (%B cao, %K cao, RSI cao, z-score cao, run-up mạnh) → "bán hôm nay" vs "bán ngày 0", đo rangePos trong cửa sổ 30 phiên tới, paired CI + placebo. Trả lời: "muốn bán trong tháng tới thì chờ tín hiệu gì?"

### D. Premium-exit v2 (`scripts/premium-exit-v2-study.ts`)

Nâng cấp bằng chứng sơ bộ: ~23 tháng dữ liệu, grid percentile {70,80,90} × trailing {120,180} × H {21,42,63}, chia đôi era + placebo cùng-n + block CI. Đối tượng: giá SJC (đúng tài sản người dùng bán).

## Quyết định ship

- Bất kỳ họ nào qua đủ cổng ⇒ ship: engine chấm tại collect-time, JSON precomputed, card/badge seller-side tiếng Việt (giữ nguyên kiến trúc Approach A). Được phép thay trục "gió ngược" hiện tại nếu trục mới mạnh hơn có bằng chứng.
- Tất cả NO-GO ⇒ cập nhật docs (bảng bằng chứng đầy đủ), giữ policy hiện tại, ghi rõ họ nào đóng hẳn / họ nào chờ thêm dữ liệu.

## Không làm

- Không dùng dữ liệu trả phí / intraday (không có).
- Không đụng buy-side composite, Bottom Hunter, Bear DCA, Bear Downside.
- Không claim dự đoán — chỉ decision support có backtest.
