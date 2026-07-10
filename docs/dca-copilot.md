# DCA Co-pilot — Module A: Canh điểm vào trong tháng

**Kết luận: NO-GO.** Canh thời điểm mua *trong tháng* của vàng (XAU/USD) **không** cho lợi thế giá-vốn bền vững so với "mua ngày 1 mỗi tháng". Không có luật nào vượt cả baseline lẫn placebo ở cả hai giai đoạn train/test. **Không ship UI** cho Module A; giữ nguyên Bottom Hunter. Mã study được giữ làm bằng chứng tái lập (`scripts/dca-timing-study.ts`, `src/lib/dca-sim.ts`, `src/lib/dca-zone.ts`). Câu hỏi bù "ngày CỐ ĐỊNH nào trong tháng tốt nhất" được đo riêng 2026-07-06 (mục cuối trang): **phiên đầu tháng** — mua muộn hơn đo được là đắt hơn, đáy tháng dồn về 5 phiên đầu (~40-44% số tháng).

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

## Ngày CỐ ĐỊNH trong tháng — "điểm mua tốt nhất" (monthday-study, 2026-07-06)

Các study trên test luật ĐỘNG (chờ tín hiệu). Câu hỏi còn lại chưa từng đo: **ngày cố định
thứ k của tháng dương lịch** — seasonality thuần lịch, không cần tín hiệu. `scripts/monthday-study.ts`,
239 tháng đủ ≥15 phiên (train 149 <2019 / test 90 ≥2019), rangePos so min/max THÁNG ĐÓ
(0=đáy tháng, 1=đỉnh), delta ghép cặp theo tháng + CI95 block-bootstrap.

**Kết quả — câu trả lời có bằng chứng cho "điểm mua tốt nhất trong tháng":**

| Phép đo | train | test |
| --- | --- | --- |
| meanPos phiên 1 | 0.476 | **0.404** |
| meanPos phiên 10 | 0.514 | 0.486 |
| meanPos phiên 15 | 0.517 | 0.553 |
| Δ(phiên 12..21 vs phiên 1), test | — | +0.110..+0.149, **CI95 loại trừ 0** ở k=12,13,15,17,21 |
| Phiên-1 vs placebo (ngày ngẫu nhiên) | −0.010 CI[−0.081,0.059] | −0.060 CI[−0.147,0.027] |
| Đáy tháng rơi vào 5 phiên đầu | **40.3%** số tháng | **44.4%** (đều ≈24%) |
| Day-of-week (T2..T6) | 0.491..0.506 | 0.470..0.496 — phẳng, không mẫu hình |
| Chia 4 đợt (phiên 1,6,11,16) vs 1 lần phiên 1 | Δ=+0.012 CI chứa 0 | Δ=+0.058 CI[−0.007,0.122] |

- **Không phiên cố định nào RẺ HƠN phiên 1** bền vững (phiên rẻ nhất train k=11, test k=1 —
  không trùng = nhiễu). Nhưng chiều ngược lại CÓ ý nghĩa: từ giữa tháng trở đi ĐẮT hơn phiên 1
  rõ rệt ở test-era (uptrend đẩy giá lên dần trong tháng).
- **Đáy tháng KHÔNG dự đoán được ngày cụ thể**, nhưng phân phối lệch hẳn về đầu tháng:
  ~40–44% số tháng đáy nằm trong 5 phiên đầu (gần gấp đôi mức đều ~24%) — nhất quán cả 2
  giai đoạn. Cơ chế trùng khớp finding của `docs/dca-zone-v2.md`: vàng trend tăng ⇒ ngày càng
  muộn càng đắt ⇒ mua sớm nhất chính là "gần đáy tháng nhất" về kỳ vọng.
- Phiên-1 vs placebo đúng hướng cả 2 giai đoạn nhưng CI chứa 0 — claim "phiên 1 tốt hơn ngày
  ngẫu nhiên" chỉ ở mức xu hướng; claim chắc là "mua MUỘN thì tệ hơn mua phiên 1".
- Chia 4 đợt trong tháng cho giá vốn hơi ĐẮT hơn mua 1 lần đầu tháng (đúng logic uptrend),
  không có ý nghĩa thống kê — chọn theo khẩu vị phương sai, không phải theo giá vốn.

**⇒ PHÁN QUYẾT: điểm mua tốt nhất trong tháng = phiên ĐẦU tháng (mua sớm nhất có thể).**
Không phải vì ngày 1 có phép màu, mà vì mọi cách trì hoãn (chờ ngày cố định muộn hơn, chờ
tín hiệu — các study trên, chia nhỏ ra cuối tháng) đều đo được là ngang hoặc tệ hơn. Đây là
câu trả lời dạng "đóng bài toán": KHÔNG ship UI mới (không có gì để canh), khuyến nghị hành
vi = DCA ngay đầu tháng + điều tiết khối lượng bằng Bear DCA Advisor như hiện tại.

**Tái lập:** `npx tsx scripts/monthday-study.ts` (fetch XAU, ~15-20 năm).

### Phản biện "trong bear thì mua đầu tháng đắt" — kiểm chứng (monthday-bear-study, 2026-07-06)

Phản biện đúng cho **tháng-giảm-đã-biết** (look-ahead): trong các tháng đóng cửa thấp hơn mở
cửa, phiên 1 nằm rất cao (meanPos 0.761 train / 0.723 test) và chờ rẻ hơn tới −0.42..−0.51
(CI loại trừ 0, mọi k, cả 2 giai đoạn) — đó là TRẦN lý thuyết, biết SAU khi hết tháng, không
hành động được. Câu hỏi hành động được: cờ bear **quan sát được TẠI đầu tháng** (past-only)
có tái tạo được lợi thế đó không? `scripts/monthday-bear-study.ts`, 230 tháng:

| Cờ tại đầu tháng | n tr/te | Δ(chờ k vs phiên 1) train | test |
| --- | --- | --- | --- |
| `close<MA200` | 55/17 | +0.06..+0.07, CI chứa 0 | k=15/21 **+0.28, CI loại trừ 0 — ĐẮT hơn** |
| `tháng trước giảm` | 70/41 | k=10 +0.12 CI loại trừ 0 (đắt hơn) | +0.03..+0.07, CI chứa 0 |
| `drawdown≥10% ATH` | 90/42 | +0.03..+0.05, CI chứa 0 | k=10/15/21 **+0.16..+0.22, CI loại trừ 0 — ĐẮT hơn** |
| `downMonth` (LOOK-AHEAD) | 70/42 | −0.13..−0.51 ✓ rẻ hơn mọi k | −0.19..−0.42 ✓ rẻ hơn mọi k |

**⇒ KHÔNG cờ bear past-only nào đảo được lời khuyên "mua phiên 1"** — cả 3 cờ cho chờ-mua
trung tính đến ĐẮT HƠN có ý nghĩa thống kê ở test-era. Cơ chế đo được: cờ bear đầu tháng
không dự đoán tháng đó giảm tiếp (vàng hay bật lại sau drawdown — phiên 1 của các tháng
bear-cờ nằm THẤP bất thường: meanPos 0.36–0.47, vì tháng đó thường hồi). Cùng bài học với
sell-zone display policy trong `CLAUDE.md`: **regime không biết trước được** — "bear" chỉ
định nghĩa được hồi tố. Khuyến nghị "mua phiên đầu tháng" GIỮ NGUYÊN kể cả khi thị trường
đang dưới MA200 / sau tháng giảm / trong drawdown.

**Tái lập:** `npx tsx scripts/monthday-bear-study.ts` (fetch XAU).

### "Chờ tín hiệu Bottom Hunter trong chu kỳ bear thay vì DCA đều?" — kiểm chứng (bottom-wait-study, 2026-07-06)

Câu hỏi nối tiếp: thay vì DCA mù, tháng nào có cờ bear thì găm ngân sách chờ Bottom Hunter
(prob/bin as-of walk-forward trong `timeline.json` — không look-ahead), có tín hiệu mua ngay,
hết hạn chờ mua ép. Đây là lần đầu vùng "between-months skip" được đo. `scripts/bottom-wait-study.ts`,
167 tháng sau warmup (train 77 <2019 / test 90 ≥2019), giá vốn realized (Σtiền/Σoz) vs DCA
phiên-đầu-tháng, CI95 block-bootstrap theo tháng (block=6), placebo = cùng cấu trúc chờ nhưng
mua ép tại ngày ngẫu nhiên seeded (200 seed, phải vượt p90):

- **Chiến lược:** S1 = chờ TRONG tháng (không tín hiệu ⇒ mua ép cuối tháng); S2 = găm QUA
  tháng, cap 3 tháng. **Cờ bear** (past-only tại đầu tháng): `phase` (Bear DCA acute/grind),
  `dd10` (≤90% ATH). **Tín hiệu:** maxProb(cycle,swing)≥{55,60,65} (pha acute dùng probUw,
  đúng chính sách hiển thị), hoặc bin=3 (union).
- **Kết quả: 0/16 cấu hình qua cổng** (impr>0 + CI>0 + >p90 placebo, cả 2 giai đoạn).
  - S1×dd10: **ĐẮT hơn có ý nghĩa ở test** — impr −0.70..−0.71%, CI95 [−1.26, −0.12] loại
    trừ 0 sai hướng (chờ trong tháng bear rồi mua ép cuối tháng = dính đúng cái bẫy
    monthday-study đã đo: mua muộn đắt hơn trong uptrend-sau-drawdown).
  - S1×phase: −0.33..−0.25% test, CI chứa 0 — không lợi.
  - S2 (găm qua tháng): improvement dao động −2.6..+1.7% không nhất quán chiều giữa 2 giai
    đoạn, CI95 rộng ±8..11% (giải ngân cục = phương sai nổ) — thuần nhiễu.
  - Tháng-bear thực sự có tín hiệu Bottom Hunter rất thưa: test chỉ 0–13/90 tháng tùy cấu
    hình (prob≥65 × phase: **0 tháng** test có tín hiệu — chờ suông).
- **Vì sao thua:** ba lý do đo được cộng dồn. (1) Cờ bear đầu tháng không dự đoán tháng giảm
  tiếp (monthday-bear-study) ⇒ chờ là đắt sẵn. (2) Tín hiệu Bottom Hunter hiếm trong đúng
  những kỳ chờ đó ⇒ phần lớn kỳ chờ kết thúc bằng mua-ép muộn (chính là cái đã đo là tệ).
  (3) Bottom Hunter là ước lượng XÁC SUẤT gần đáy để tham khảo — trigger nhị phân từ nó đã
  NO-GO ở `scripts/gomrai-study.ts` (0/528) và làm input Bear DCA cũng đã bị loại
  (`docs/bear-dca.md`); kết quả này nhất quán với cả hai.

**⇒ PHÁN QUYẾT: NO-GO.** Giữ khuyến nghị: DCA phiên đầu tháng, khối lượng theo Bear DCA
Advisor; Bottom Hunter dùng làm ngữ cảnh (%), không phải cò súng mua.

**Tái lập:** `npx tsx scripts/bottom-wait-study.ts` (~10s, data đã commit, không cần fetch).

### Lệnh limit / mua-khi-rơi — họ cơ chế cuối cùng (limit-study, 2026-07-06)

Họ cơ chế khớp-lệnh chưa từng test: treo lệnh mua dưới mốc neo, khớp thì chắc chắn rẻ hơn
mốc, miss thì mua ép cuối tháng. `scripts/limit-study.ts`, 239 tháng, cùng khung
rangePos/CI/2-giai-đoạn của monthday-study; 16 cấu hình:

- **L(x)**: 100% treo limit `giá phiên-1 × (1−x%)`, x∈{0.5..5} — anchor CỐ ĐỊNH.
- **H(x)**: 50% mua ngay phiên 1 + 50% treo limit (giảm rủi ro miss).
- **D(r)**: mua phiên đầu tiên có return 1-ngày ≤ −r%, r∈{0.5..2} — anchor TRƯỢT.

**Kết quả: 0/16 qua cổng.** Giá vốn dài hạn ÂM ở test cho mọi cấu hình (−0.09%..−0.97%);
D(1.5%)/D(2%) và L(1.5%) ĐẮT hơn phiên-1 có ý nghĩa thống kê ở test (CI95 loại trừ 0 sai
hướng). **Phân rã L(2%) chỉ ra cơ chế thua — giải thích cả họ:** tháng khớp lệnh mua rất rẻ
(meanPos 0.273/0.279) nhưng tháng miss bị ép mua cuối tháng rất đắt (0.659/0.664), và
test-era (uptrend mạnh) làm fill-rate rụng từ 56% xuống 42% — kỳ vọng ròng âm. Mọi kiểu
"chờ giá rơi rồi mua" đều là cùng phép đánh đổi này; up-drift của vàng làm vế miss thắng.

**Kiểm kê toàn bộ không gian đã đo (13 study, ~940 cấu hình, 5 họ cơ chế):** ngày cố định
(monthday), indicator-zone TA 7 rule + vol gate (dca-zone-v2), chế độ vol (volsqueeze),
liên thị trường (divergence), premium/usdVnd/joint VN, điều kiện bear (monthday-bear),
chờ Bottom Hunter trong/qua tháng (bottom-wait), limit cố định/trượt/chia đôi (limit) —
tất cả NO-GO hoặc khẳng định phiên-1. Nhánh CÒN LẠI chưa đo được (chặn data, không phải
đã bác): intraday (chỉ có daily bar), ring-vs-bar (7 dòng quote), event-based (lịch FOMC —
cần nguồn data mới). **Cảnh báo multiple-testing:** sau ~940 cấu hình, một "pass" sát nút
ở lần thử tiếp theo PHẢI được validate lại trên dữ liệu tương lai chưa dùng — không được
ship thẳng.

**Tái lập:** `npx tsx scripts/limit-study.ts` (fetch XAU).
