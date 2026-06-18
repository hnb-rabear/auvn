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

## Xác suất as-of-ngày (walk-forward) — cho Time Machine

Gauge live hôm nay là base-rate near-bottom trên mọi ngày lịch sử có nhãn đã hoàn tất (`i+H < hiện tại`), cùng bin với hôm nay. `runBottom` tổng quát hoá thành chuỗi `bottomHistory` (lưới thưa STEP=3): với MỖI nút ngày D, base-rate chỉ tính trên các ngày `e` đã **đáo hạn nhãn trước D** (`e+H ≤ idx_D`) và cùng bin với D. `n<10` ⇒ "chưa đủ dữ liệu".

- **Bất biến:** điểm cuối chuỗi == prob/n của gauge live hiện tại (cùng tập ngày). Không đổi gauge hôm nay. Khoá bằng test `bottom.test.ts`.
- **Không look-ahead:** prob tại D chỉ phụ thuộc ngày đã đáo hạn trước D; thêm dữ liệu sau D không đổi prob_D.
- **Hiển thị:** Time Machine forward-fill nút thưa gần nhất ≤ ngày được chọn (lệch ≤2 phiên; ngày cuối luôn được ghim nên hôm nay chính xác). Gợi ý "Gom rải" lịch sử bật khi cycle prob ≥ 60 (đúng ngưỡng live; live gộp max(cycle,swing)).
- **Tam giác "đáy đã xác nhận"** (cần ±9 phiên tương lai) KHÔNG còn hiển thị trên Time Machine — chỉ giữ trong `confirmedBottoms` cho `scripts/bottom-vs-buy-study.ts`.

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

## Săn đáy vs Điểm mua — chúng bật ở HAI chế độ khác nhau (thực nghiệm)

Câu hỏi tự nhiên: "đáy xuất hiện trước hay điểm mua xuất hiện trước, và chúng có trùng nhau không?". Đo trên dữ liệu đã commit (`scripts/bottom-vs-buy-study.ts`, 2009–2026) cho kết quả **đảo ngược trực giác "rẻ thì composite báo mua"**:

| Quan sát | Số liệu |
| --- | --- |
| Zone composite **tại** 24 đáy chu kỳ | MUA 1 · **TRUNG TÍNH 22** · BÁN 1 |
| Composite trung bình tại đáy | **≈ −1** (gần giữa thang) |
| Tỷ lệ điểm-lưới ở vùng MUA (composite ≥ +40) | **46/1425 ≈ 3%** |
| 46 ngày MUA so với đáy gần nhất | SAU 22 · TRƯỚC 23 · offset median 0, trải −714..+715 ngày |
| Composite thế giới lịch sử | min −73 · median −10 · **max chỉ 55** |

**Kết luận:** săn đáy và điểm mua **không xếp hàng trước–sau**, mà bật ở **hai chế độ thị trường khác nhau**. Tại đáy giá nhọn (săn đáy sáng) composite ~trung tính, vì tín hiệu "rẻ" (percentile thấp) bị triệt tiêu bởi kỹ thuật xấu (giá dưới MA50/200) + động lượng âm. Vùng MUA của composite hiếm (3%), rải rác, **không bám đáy** — nó nghiêng về "kỹ thuật/xu hướng đang thuận" chứ không phải "đã chạm đáy". Hai lớp **bổ sung** đúng nghĩa: săn đáy bắt điểm rơi cạn, composite xác nhận xu hướng/định giá — hiếm khi cùng sáng.

**Giới hạn:** (1) composite trong `timeline.json` là composite **thế giới**, không gồm premium VN (chưa đủ lịch sử backtest) — so với săn đáy thuần XAU là cùng vũ trụ, công bằng, nhưng không phải composite *live* đầy đủ; (2) không tính lại được gauge săn đáy theo ngày offline (fetch XAU daily bị chặn), nên dùng `confirmedBottoms` làm đại diện cho "nơi gauge đạt đỉnh" — hợp lệ vì gauge được validate quanh chính các đáy đó.

## Tái lập kết quả

```bash
npm run collect                      # sinh dữ liệu thật cho study
npx tsx scripts/bottom-study.ts      # tuyển ε/H + trọng số (grid search, gate 2 giai đoạn)
npx tsx scripts/bottom-ml-study.ts   # cổng kiểm chứng ML (Brier vs rule-based)
npx tsx scripts/bottom-vs-buy-study.ts  # quan hệ thời điểm săn đáy vs điểm mua (dùng data đã commit)
```

`BOTTOM_CONFIG` khai báo tại `src/lib/types.ts` — số liệu evidence trong code phải khớp doc này (cùng quy ước presets.md ↔ PRESETS); đổi cấu hình thì cập nhật cả hai.

## Thử feature 2026-06: lợi suất thực (DFII10) + Vàng/Bạc — kết quả

`scripts/bottom-feature-study.ts` (grid {rsi,macro,ryield,gsr} bước .25 × 3 bộ bin, gate train<2019/test≥2019, tối ưu precision bin-cao chu kỳ H=126/ε3%, recall sàn n≥40, CI 95% block-bootstrap). Đối chiếu mốc `scripts/bottom-detection-compare.ts`: confluence 2 tầng = no-op (chung điểm số); cycle=3 hiện tại đã 76% win 6 tháng.

**Độ phủ:** ryield 1425/1425, gsr 1425/1425 ngày lưới (2009-06→2026-06).

| Cấu hình | train prec (n, base 33%) | test prec (n, base 52%) | CI test |
| --- | --- | --- | --- |
| Mốc {rsi:.5, macro:.5} | 40% (n=86) | 72% (n=57) | [54.4–89.5] |
| {rsi:.5, ryield:.25, gsr:.25} | **39%** (n=99) | **82%** (n=72) | [72.2–91.7] |
| {rsi:.25, macro:.25, ryield:.25, gsr:.25} | 38% (n=64) | 76% (n=101) | [66.3–84.2] |

**Phán quyết: NO-GO (GO theo chữ, nhưng overfit giai đoạn test).** Script in "GO" vì CI-lo test (72,2%) > mốc (72,0%) — nhưng biên chỉ **0,2 điểm**, và quan trọng hơn: cấu hình thắng **bỏ macro về 0** và có **train precision 39% — THẤP HƠN mốc (40%)** và sát base-rate train (33%). Tức 2 feature mới **không giúp gì ở giai đoạn train (2009–2018)**; toàn bộ "cải thiện" nằm ở test (2019–2026). Đây đúng dấu hiệu **overfit theo chế độ thị trường**: thắng test, thua train, vứt feature đã kiểm chứng (macro), vượt mốc 0,2đ.

→ **Giữ cấu hình hiện tại `{rsi:.5, macro:.5}`.** Không wire live ryield/gsr (Pha 2 hoãn). Theo chính tiêu chí spec, kết quả biên giới ⇒ cần ML cross-check + một held-out thật trước khi tin; bằng chứng hiện tại KHÔNG đủ để đổi config. Ghi nhận như đã loại GPR/VIX: feature hợp lý về lý thuyết nhưng không sống sót kiểm chứng 2 giai đoạn.
