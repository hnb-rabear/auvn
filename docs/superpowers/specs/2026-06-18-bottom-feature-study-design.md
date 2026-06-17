# Săn đáy precision-first — study feature lợi suất thực + vàng/bạc (Pha 1)

Ngày: 2026-06-18. Phạm vi: **nghiên cứu có kỷ luật**, KHÔNG build tính năng. Kiểm chứng xem 2 tín hiệu trực giao mới — **lợi suất thực (DFII10)** và **tỉ lệ Vàng/Bạc** — có cải thiện *precision* của gauge săn đáy vượt cấu hình hiện tại (`{rsi:.5, macro:.5}`) trên giai đoạn test hay không. Kết quả trung thực có thể là **no-go** (giữ cấu hình cũ), như đã loại GPR/VIX.

## Bối cảnh & động lực

Mục tiêu người dùng: "nhận biết đáy — báo sớm + tự tin hơn", ưu tiên **precision** (ít báo nhầm). Đo thực trên dữ liệu commit (`scripts/bottom-detection-compare.ts`, 4274 phiên, 83 đáy chu kỳ) cho thấy:

- **cycleBin=3 hiện tại đã mạnh:** win 6 tháng **76%**, trung vị **+12,1%** (nền 67% / +4,9%); precision-vùng 50% vs nền 37%.
- **Confluence 2 tầng = no-op (đo ra):** `cycle=3 VÀ swing=3` cho y hệt `cycle=3` — vì hai tầng dùng **chung điểm số** (cùng trọng số + bin edges), chỉ khác kỳ hạn dán nhãn. Bỏ.
- **Gating composite ≈ vô ích** (+1pt). Bỏ.
- **Tín hiệu hiện tại trùng đáy (lead=0), không dẫn trước.** Muốn "báo sớm" cần thông tin **dẫn trước giá** — chỗ duy nhất feature vĩ mô mới *có thể* thêm giá trị.

Kết luận: các chỉnh "rẻ" vô ích; đường duy nhất còn upside là **thông tin trực giao mới**, nhưng phải kiểm chứng nghiêm.

## Phân kỳ (study trước, không build mù)

- **Pha 1 (spec này):** thêm 2 feature ứng viên vào `bottomFeatures` (gated theo input — thiếu input ⇒ `na`, KHÔNG ảnh hưởng engine live), viết study tự fetch bạc + lợi suất thực, chạy grid + gate + precision, in **GO/NO-GO** + ghi `docs/bottom.md`. KHÔNG đụng `collect`/`run.ts`/`BOTTOM_CONFIG`/UI.
- **Pha 2 (spec riêng, CHỈ nếu Pha 1 GO):** wire fetch vào collect, nối input vào `runBottom`, đổi `BOTTOM_CONFIG`, cập nhật UI/docs.

## Feature ứng viên (scoring −2..+2)

Thêm vào `bottomFeatures` (`src/lib/bottom.ts`), mở rộng `BottomFeatureInputs` với 2 input optional. Mỗi feature thiếu input/lịch sử ⇒ `na(id, label)`.

### `ryield` — Lợi suất thực đảo chiều (input `realYieldCloses: number[] | null`)
Đáy vàng ≈ đỉnh lợi suất thực rồi quay xuống. Dùng **đổi 3 tháng (≈63 phiên)** của DFII10, song song cách `macro` xử lý 10y danh nghĩa nhưng trên lợi suất *thực*:

| Δ real yield (3 tháng) | score |
| --- | --- |
| ≤ −0,20đ | +2 |
| ≤ −0,05đ | +1 |
| (−0,05, +0,05) | 0 |
| ≥ +0,05đ | −1 |
| ≥ +0,20đ | −2 |

Cần ≥64 điểm `realYieldCloses` (đã filter ≤ ngày xét), nếu không ⇒ `na`. Giải thích VN: "Lợi suất thực Δ3 tháng = …đ → thuận/bất lợi đáy vàng."

### `gsr` — Tỉ lệ Vàng/Bạc cực đoan (input `silverCloses: number[] | null`)
Tỉ lệ = vàng/bạc; cao cực đoan = bạc bị bán tháo = capitulation nhóm metals = gần đáy. Dùng **percentile theo cửa sổ trượt 504 phiên (chỉ quá khứ, ≤ ngày xét — không look-ahead)** để tự thích nghi với trôi cấu trúc:

| percentile tỉ lệ (504 phiên) | score |
| --- | --- |
| ≥ 0,85 | +2 |
| ≥ 0,70 | +1 |
| (0,30, 0,70) | 0 |
| ≤ 0,30 | −1 |
| ≤ 0,15 | −2 |

`silverCloses` align theo ngày với `closes` (dùng giá trị ≤ ngày xét, như `dxyCloses`). Cần ≥504 điểm khớp, nếu không ⇒ `na`. Giải thích VN: "Vàng/Bạc = … (percentile … 2 năm) → bi quan nhóm kim loại quý."

**Chỉ 2 feature** (không thêm) để gate còn ý nghĩa thống kê — đây là 2 cái trực giao nhất với rsi+macro.

## Phương pháp study (`scripts/bottom-feature-study.ts`)

Mượn khung `bottom-study.ts`.

1. **Fetch:** xau, dxy, fed, yield10y (danh nghĩa) + **bạc** `fetchSilver()` (`fetchYahoo("SI=F")`) + **lợi suất thực** `fetchRealYield()` (`fetchFredSeries("DFII10")`). Fetch bạc/thực lỗi ⇒ in lỗi + **dừng** (không chạy lỗi câm). In **độ phủ dữ liệu** (số ngày có bạc/real-yield khớp lưới).
2. **Grid giới hạn:** giữ lõi `{rsi, macro}`, tìm trọng số trên **4 feature `{rsi, macro, ryield, gsr}`** (bước 0,25, tổng=1) × 3 bộ bin edges (`[-40,0,40]`, `[-40,0,30]`, `[-40,0,20]`). ≈ 35 hồ sơ × 3.
3. **Gate 2 giai đoạn:** train < 2019-01-01, test ≥ 2019-01-01; lưới thưa STEP=3, WARMUP=756. Qua cổng nếu bin-cao vượt base-rate vô điều kiện ở **CẢ HAI** giai đoạn.
4. **Hàm mục tiêu = precision bin-cao trên TEST** = P(near-bottom | bin cao), kèm **recall sàn** (n bin-cao test ≥ 40). Báo cáo precision/recall/n train+test.
5. **Quy tắc GO (nghiêm):** cấu hình `{rsi,macro,ryield,gsr}` tốt nhất chỉ THẮNG nếu ĐỒNG THỜI:
   - qua gate 2 giai đoạn;
   - precision TEST > mốc `{rsi:.5,macro:.5}` (chạy cùng harness) với **CI 95% block-bootstrap của precision mới KHÔNG chồng** điểm precision mốc;
   - feature mới có **trọng số > 0** trong cấu hình thắng (nếu grid tự đưa ryield/gsr về 0 ⇒ "không thêm gì" ⇒ NO-GO);
   - giữ recall sàn.
6. **Cross-check ML (sanity):** logistic walk-forward (như `bottom-ml-study.ts`) với 4 feature; hệ số ryield/gsr ≈ 0 hoặc Brier không cải thiện > 0,005 ⇒ củng cố NO-GO.
7. **Đầu ra:** bảng (mốc vs cấu hình mới: precision/recall/n/CI, train+test) + dòng **GO/NO-GO**. Ghi kết luận (kể cả null) vào `docs/bottom.md`.

## File (Pha 1)

- `src/lib/bottom.ts` — thêm `ryield`, `gsr` vào `bottomFeatures`; mở rộng `BottomFeatureInputs` (`realYieldCloses?`, `silverCloses?`). An toàn live (không truyền ⇒ `na`).
- `scripts/fetch.ts` — `fetchSilver()` + `fetchRealYield()` (mỏng, tái dùng `fetchYahoo`/`fetchFredSeries`).
- `scripts/bottom-feature-study.ts` — **mới**.
- `scripts/bottom-detection-compare.ts` — **giữ + commit** (công cụ mốc precision, read-only).
- `docs/bottom.md` — mục "Thử feature 2026-06 (ryield/gsr)".

**KHÔNG đụng:** `scripts/run.ts`/collect, `BOTTOM_CONFIG`, UI, `runBottom` signature.

## Test

- `tests/bottom.test.ts`:
  - **Regression khoá:** gọi `bottomFeatures` KHÔNG truyền `realYieldCloses`/`silverCloses` ⇒ driver `ryield`/`gsr` `available:false`; golden `runBottom` (94/78.7/95/100) **không đổi**.
  - `ryield`: real yield rơi (Δ3 tháng ≤ −0,2) ⇒ score > 0; tăng ⇒ score < 0.
  - `gsr`: chuỗi bạc khiến tỉ lệ percentile cao ⇒ score > 0; thấp ⇒ score < 0.
  - thiếu input/lịch sử ⇒ `na` (available:false).
- `npm run build` + `npm test` xanh.
- Study script chạy tay (`npx tsx scripts/bottom-feature-study.ts`) — verify in ra GO/NO-GO + bảng + độ phủ dữ liệu.

## YAGNI

- Không build live data/UI/config tới khi GO (Pha 2).
- Không feature thứ 3+; không grid 8-feature tự do.
- Không đổi gate ngoài đổi hàm mục tiêu sang precision.

## Rủi ro

- **Multiple-comparisons:** kiểm soát bằng grid nhỏ (4 feature) + CI-không-chồng + cross-check ML + gate 2 giai đoạn. Đọc kết quả là "ước lượng lạc quan".
- **Dữ liệu:** DFII10 từ ~2003 + FRED hay 504; bạc SI=F lịch sử Yahoo. Thiếu/lệch ⇒ feature `na` nhiều ngày ⇒ grid tự loại. Phải in độ phủ.
- **Look-ahead:** `gsr` percentile chỉ dùng cửa sổ trượt quá khứ (≤ ngày xét) — bắt buộc trong code, có test gián tiếp qua dấu.
- **Lịch sử lệch nhau:** XAU 20y nhưng DFII10 ~2003, bạc tùy nguồn — train (<2019) có thể mỏng cho ryield; báo cáo n từng giai đoạn để đánh giá độ tin.
