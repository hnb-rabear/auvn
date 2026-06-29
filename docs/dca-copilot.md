# DCA Co-pilot — Module A: Canh điểm vào trong tháng

**Kết luận: NO-GO.** Canh thời điểm mua *trong tháng* của vàng (XAU/USD) **không** cho lợi thế giá-vốn bền vững so với "mua ngày 1 mỗi tháng". Không có luật nào vượt cả baseline lẫn placebo ở cả hai giai đoạn train/test. **Không ship UI** cho Module A; giữ nguyên Bottom Hunter. Mã study được giữ làm bằng chứng tái lập (`scripts/dca-timing-study.ts`, `src/lib/dca-sim.ts`, `src/lib/dca-zone.ts`).

> Đây là kết quả trung thực theo nguyên tắc dự án "No prediction claims — decision support only" và "báo trung thực kể cả khi giết ý tưởng". Trước khi tái thử canh-thời-điểm-trong-tháng, hãy đọc lại trang này.

## Mục tiêu (câu hỏi của người dùng)

"Tháng này vùng nào giá đẹp để vào DCA, thay vì mua mù ngày 1?" — bài toán canh thời điểm trong cửa sổ có hạn chót (mỗi tháng buộc mua một lần).

## Thước đo

Giá vốn dài hạn (ngân sách cố định/tháng):

```
giá vốn = tổng tiền ÷ tổng chỉ = nMonths / Σ(1 / price_mua)
```

Đây là trung bình điều hòa (harmonic mean) của các giá mua — chính là chi phí thực mỗi chỉ khi DCA tiền cố định. Luật "tốt hơn" = giá vốn THẤP HƠN.

## Phương pháp

- **Dữ liệu:** XAU/USD daily, 2006-06 → 2026-06 = **241 tháng**. Train `<2019` (151 tháng) / test `≥2019` (90 tháng).
- **Baselines:** B0 = mua ngày giao dịch đầu tháng; B1 = mua ngày giữa tháng; **placebo** = mua ngày ngẫu nhiên (seeded, tái lập).
- **Luật ứng viên (past-only):**
  - `relpos` — giá ≤ percentile p của W phiên gần nhất (W ∈ {21,42,63}, p ∈ {20,25,30,35}).
  - `signal` — relpos ∧ RSI(14) < 35 (xác nhận quá bán; **không** dùng MACD vì O(n²)/lần → O(n³) trong study).
  - `monthdd` — giá ≤ x% dưới đỉnh-trong-tháng (x ∈ {2,3,4,5}).
  - *Bỏ `zscore`* (trùng ý `relpos` mà kém vững — giả định phân phối chuẩn).
- **Cơ chế buộc mua:** chưa gặp vùng đẹp tới ngày cuối tháng → mua ngày cuối.
- **Gate:** luật phải cho giá vốn rẻ hơn B0 (improvement > 0) **và** vượt placebo, ở **CẢ HAI** giai đoạn; xếp theo min-improvement.
- Mã: `src/lib/dca-sim.ts` (mô phỏng + giá vốn), `src/lib/dca-zone.ts` (luật), `scripts/dca-timing-study.ts` (đua + gate). Chạy: `npx tsx scripts/dca-timing-study.ts`.

## Bằng chứng

| | train (<2019) | test (≥2019) |
| --- | --- | --- |
| B0 giá vốn (USD) | 1101.08 | 1991.20 |
| B1 (giữa tháng) vs B0 | +0.08% | −0.67% |
| Placebo (ngẫu nhiên) vs B0 | −0.16% | −0.25% |
| Ứng viên tốt nhất `monthdd x=2` vs B0 | +0.017% | **−0.95%** |
| Mọi luật khác — improvement test | — | −0.18% … −0.95% |

- Các luật **có** kích hoạt (relpos bắn 48–83% số tháng, 61–199/241), **không** bị sập về mua-ngày-cuối — đã kiểm chứng bằng đo tần suất.
- Mọi luật đều âm ở test; ứng viên duy nhất dương ở train (`monthdd x=2`, +0.017%) thất bại vì test −0.95%. **Không luật nào qua gate.**
- Biên độ chênh tất cả ~±1% — đặc trưng của DCA hàng trăm tháng: chênh lệch một ngày bị bình quân hóa. Đây là tín hiệu "không có edge", không phải lỗi.

## Vì sao đây là kết quả thật, không phải bug

Study được review độc lập (opus) bằng cách **tái lập** và đo: split hợp lệ (241 tháng), gate đúng chiều (improvement dương = rẻ hơn, phải vượt placebo cả hai giai đoạn), thứ tự tham số `improvementPct(rule, base)` đúng, luật thật sự kích hoạt. Kết luận: NO-GO là **true negative**.

## Hệ quả & hướng đi

- **Thực hành DCA:** cứ mua đều mỗi tháng; đừng tốn công canh ngày trong tháng. Việc điều tiết khối lượng theo chu kỳ giá đã do lớp **Bear DCA Advisor** (`docs/bear-dca.md`) đảm nhiệm.
- **Module B** (chờ tháng sau theo chế độ) và **Module C** (phân phối rủi ro bear có điều kiện) là bài toán *khác* (giữa các tháng / phân phối downside), chưa bị kết quả này phủ định — sẽ nghiên cứu ở plan riêng nếu theo đuổi.
- Spec gốc: `docs/superpowers/specs/2026-06-29-dca-copilot-design.md`. Plan: `docs/superpowers/plans/2026-06-29-dca-copilot-module-a.md`.

## Tested and REJECTED (đừng tái thêm nếu chưa chạy lại study)

Canh thời điểm mua trong-tháng theo: vị trí tương đối (relpos), quá bán RSI (signal), rơi từ đỉnh tháng (monthdd) — tất cả đều không vượt baseline mua-ngày-1 + placebo trên giá vốn. MACD bị loại vì chi phí O(n³). zscore bị loại vì trùng relpos.
