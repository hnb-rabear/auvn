# Bộ cấu hình (preset) theo kỳ hạn — phương pháp & bằng chứng test

Cập nhật: 2026-06-12 (v3 — sau khi thêm tín hiệu động lượng 12 tháng cho preset 1m). Sinh bởi `scripts/presets-study.ts` + `scripts/factor-study.ts` + `scripts/factor-study-momentum-offline.ts` trên dữ liệu thật đến 12/06/2026.

## Câu hỏi cần trả lời

Với từng kỳ hạn nắm giữ (1 / 3 / 6 tháng), bộ trọng số tiêu chí + ngưỡng mua nào cho tín hiệu MUA **chính xác nhất một cách bền vững** — không phải chính xác nhất trên quá khứ rồi sụp đổ với dữ liệu mới (overfitting)?

## Phương pháp

1. **Dữ liệu:** timeline giả lập 1.425 ngày (2009–2026), mỗi ngày engine chấm điểm 3 tiêu chí thế giới (kỹ thuật, thống kê, vĩ mô) **chỉ bằng dữ liệu có đến ngày đó**, kèm lợi suất XAU thực tế sau 21/63/126 phiên.
2. **Chia đôi thời gian:** train 2009–2018, test 2019–2026. Hai giai đoạn tính chất rất khác nhau (train chứa bear market vàng 2013–2015; test chủ yếu bull) — cấu hình sống được ở cả hai mới đáng tin.
3. **Grid search:** 66 tổ hợp trọng số (bước 10%) × 4 ngưỡng mua (+30/+40/+50/+60) = 264 cấu hình mỗi kỳ hạn.
4. **Điều kiện nhận:**
   - ≥ 25 tín hiệu mua ở **mỗi** giai đoạn (đủ mẫu);
   - tỉ lệ đúng **vượt baseline ở cả hai giai đoạn** (baseline = mua ngày bất kỳ, lãi sau kỳ hạn — vàng trôi tăng nên baseline đã cao sẵn, vượt được mới là lợi thế thật).
5. **Xếp hạng:** theo **lợi thế tệ nhất** trong 2 giai đoạn (min-excess) — ưu tiên ổn định, phạt cấu hình chỉ rực rỡ một thời kỳ.

"Đúng" nghĩa là: tín hiệu MUA bắn → giá XAU cao hơn sau đúng kỳ hạn đó.

## Nghiên cứu yếu tố mới (ablation, v3 — động lượng 12 tháng)

Thêm tín hiệu **động lượng 12 tháng** (XAU/USD so sánh 252 phiên trước, score -2..+2) như tiêu chí thứ 5. Chạy bằng `scripts/factor-study-momentum-offline.ts` trên `timeline.json` thật (offline, không cần fetch). Grid search 4 chiều (technical/stats/macro/momentum) thay vì 3D như v2.

| Biến thể | 1 tháng | 3 tháng | 6 tháng | Kết luận |
| --- | --- | --- | --- | --- |
| Base (3 tiêu chí, có yield) | +16,7pt | +26,0pt | +20,1pt | — |
| +Động lượng 12 tháng | **+22,2pt** | +26,0pt | +20,1pt | **GIỮ 1m** — momentum=0 là tối ưu ở 3m/6m |

Preset 1m mới (v3): technical=0.1 / stats=0.1 / macro=0.6 / momentum=0.2 / threshold=40
- train 75,7% (n=37) vs baseline 51,9% → +23,8pt
- test 82,9% (n=70, trung vị +4,6%) vs baseline 60,6% → +22,3pt → **min-excess +22,2pt**

So với preset 1m v2 (technical=0 / stats=0.1 / macro=0.9): accuracy 77,4%→82,9% (+5,5pp), nhưng n giảm 106→70 (momentum lọc bớt tín hiệu false positive). Đây là nâng cấp chất lượng, không phải số lượng.

**Cơ chế:** khi macro thuận (DXY yếu + Fed nới) NHƯNG XAU chưa lên (momentum âm) → tín hiệu mua thường sai (đón đầu quá sớm). Momentum lọc ra các trường hợp macro đúng nhưng trend chưa xác nhận. Đã tích hợp vào engine: `scripts/backtest.ts` (extras.momentum12m=true trong run.ts) và `src/lib/criteria.ts` (momentumCriterion).

**Lưu ý:** Study offline dùng `timeline.json` đã tính sẵn; n=37 train tương đối nhỏ. Cần re-verify sau lần chạy `npm run collect && npx tsx scripts/presets-study.ts` tiếp theo.

## Nghiên cứu yếu tố mới (ablation, v2)

Ba ứng viên được test bằng cách bật/tắt từng tín hiệu rồi chạy lại toàn bộ tuyển chọn, so min-excess của cấu hình tốt nhất:

| Biến thể | 1 tháng | 3 tháng | 6 tháng | Kết luận |
| --- | --- | --- | --- | --- |
| Gốc (DXY + Fed) | +19,8pt | +13,0pt | +10,6pt | — |
| + Lợi suất Mỹ 10 năm (^TNX) | +16,7pt | **+26,0pt** | **+20,1pt** | **GIỮ** — cải thiện vượt trội 3–6 tháng |
| + VIX | +19,4pt | +16,1pt | +10,9pt | LOẠI — thua "+lợi suất"; thêm vào cùng lợi suất không cải thiện gì (26,1/20,1 ≈ 26,0/20,1) |
| + GPR (rủi ro địa chính trị) | +14,4pt | +12,0pt | +6,5pt | LOẠI — **làm giảm** độ chính xác ở mọi kỳ hạn |
| Tất cả | +13,3pt | +14,2pt | +20,1pt | LOẠI — GPR kéo tụt |

**Bài học từ GPR:** vàng nhảy vọt *khi* chiến tranh/khủng hoảng nổ ra, nhưng chỉ số rủi ro địa chính trị cao **không dự báo** được lợi suất 1–6 tháng *sau đó* — thị trường đã price-in ngay khi tin ra. Tin tức/địa chính trị là lý do giải thích quá khứ, không phải tín hiệu giao dịch tương lai.

Tín hiệu lợi suất dùng **^TNX danh nghĩa** (Yahoo) vì toàn bộ bằng chứng được kiểm trên nó; DFII10 (lợi suất thực, mạnh hơn về lý thuyết) chỉ làm dự phòng vì FRED hay lỗi 504 với series ngày. Mapping: thay đổi 63 phiên ≤ −0,4 điểm → +2 … ≥ +0,4 điểm → −2.

## Kết quả — 3 preset ĐANG PHÁT HÀNH (v4/v4.1, 2026-07-05)

1 tháng tuyển bởi `scripts/macro-decomp-study.ts` (tách sub-signal vĩ mô — phương pháp + toàn bộ kiểm chứng ở section "Tách sub-signal vĩ mô" bên dưới), **luật chọn** trong nhóm ≤1pt của best min-excess: ưu tiên cấu hình bắn được 2023 (mục tiêu tuyển chọn — năm câm có sóng thật); không cấu hình nào bắn 2023 → lấy phủ-max theo n train → rơi vào họ **FED=0, YLD-nặng**.

3/6 tháng = **v4.1 phủ-max (reopen 2026-07-05)**: v4 (FED=0 ép cứng) làm rớt hẳn số ngày "Gom" so với v3 trên toàn bộ preset (Fed=0 bỏ mất ảnh hưởng làm dịu lịch sử của Fed, để DXY+YLD — vốn tương quan, cùng phản ánh chế độ "USD mạnh/lãi suất thực cao" — dễ chạm cực đoan hơn). Reopen chọn lại candidate phủ-max cùng min-excess (Fed nhỏ >0 thay vì ép 0) đã có sẵn trong lưới grid-search gốc nhưng bị bỏ qua lúc ship v4.

| Preset | Trọng số (KT / TK / MOM / DXY / FED / YLD) | Ngưỡng mua | Đúng 2009–2018 | Đúng 2019–2026 | Baseline (train/test) | Trung vị lãi (test) |
| --- | --- | --- | --- | --- | --- | --- |
| **Sóng 1 tháng** (v4) | 20% / 10% / 30% / 10% / 0 / 30% | +50 | **82,1%** (n=106) | **89,1%** (n=64) | 51,7% / 59,6% | +4,1% |
| **Sóng 3 tháng** (v4.1) | 10% / 20% / 20% / 20% / 10% / 20% | +40 | **88,5%** (n=131) | **99%** (n=104) | 55,6% / 69,0% | +7,1% |
| **Tích lũy 6 tháng** (v4.1) | 10% / 10% / 0 / 20% / 20% / 40% | +30 | **77,3%** (n=304) | **100%** (n=311) | 56,8% / 79,6% | +12,7% |

So v4 (đã ship rồi rút lại cho 3m/6m): test n 90→104 (3m), 130→311 (6m) — gần gấp 2.4x số tín hiệu ở 6m, mở lại các năm 2017/2023 vốn câm hẳn dưới FED=0; accuracy KHÔNG pha loãng (test 99%/100%, train vẫn cách baseline xa: +32,9pt/+20,5pt). Đánh đổi: train-margin 6m mỏng hơn (77,3% vs baseline 56,8% = +20,5pt, so +24,1pt của v4 cũ) và composite hiện tại (2026-07-05) KHÔNG chuyển sang mua ở cả 3m/6m dưới v4.1 (dry spell không phải bug — xem phần "Gom" reopen ở dưới).

FED = hướng lãi suất Fed **bằng 0 ở preset 1 tháng (v4)**, **>0 nhỏ ở 3/6 tháng (v4.1)**; vẫn nằm trong tiêu chí vĩ mô hiển thị (radar/chế độ tùy chỉnh) ở cả 3 preset dù có/không tham gia macroSub. Premium = 0 như v3 (chưa đủ 2 giai đoạn). Số trong bảng = tính lại bằng `presetComposite` trên timeline lúc ship (khớp `PRESETS`, đối chiếu bằng `npx tsx scripts/verify-preset-evidence.ts` — có thể chênh ≤0,5pt so đầu ra study gốc do làm tròn 0,1 tại biên ngưỡng + timeline thêm phiên mới).

Kỹ thuật: preset khai báo `macroSub` trong `PRESETS` (`src/lib/types.ts`); mọi nơi chấm preset dùng MỘT hàm `presetComposite` (UI live, Time Machine, monitor, fusion, evidence test — chart ≡ card). Timeline ghi thêm điểm sub-signal (`scores.dxy/fed/yield10y`, trọng số 0 với mọi composite cũ); dữ liệu cũ thiếu key phụ → trọng số sub tự dồn về điểm macro tổng, không bao giờ âm thầm mất tín hiệu vĩ mô (bài học FRED 504). Fusion "MUA độ tin cao" 3m re-validated trên preset v4.1 (docs/fusion.md section v4.1).

## Kết quả — 3 preset v3 (lịch sử, thay bởi v4 ở trên)

| Preset | Trọng số (KT / TK / VM / MOM) | Ngưỡng mua | Đúng 2009–2018 | Đúng 2019–2026 | Baseline (train/test) | Trung vị lãi (test) |
| --- | --- | --- | --- | --- | --- | --- |
| **Sóng 1 tháng** | 10% / 10% / 60% / **20%** | +40 | **75,7%** (n=37) | **82,9%** (n=70) | 51,9% / 60,6% | +4,6% |
| **Sóng 3 tháng** | 10% / 0 / 90% / 0% | +50 | **82,2%** (n=45) | **95,7%** (n=69) | 55,7% / 69,7% | +7,4% |
| **Tích lũy 6 tháng** | 0 / 10% / 90% / 0% | +50 | **89,4%** (n=47) | **100,0%** (n=66) | 57,7% / 79,9% | +14,3% |

KT = kỹ thuật XAU, TK = thống kê lịch sử, VM = vĩ mô (DXY + hướng Fed + lợi suất 10 năm), MOM = động lượng XAU 12 tháng. Chênh lệch VN = 0% trong preset (lý do bên dưới). Khi nhiều cấu hình đồng hạng min-excess, chọn bản có đa dạng tiêu chí hơn.

Top 5 đầy đủ mỗi kỳ hạn: `npx tsx scripts/presets-study.ts` (cần `npm run collect` trước). Ablation: `npx tsx scripts/factor-study.ts`.

### So sánh với cấu hình mặc định (35/25/20/20, ngưỡng +40)

| Kỳ hạn | Mặc định (train) | Preset v3 (train) | Mặc định (test) | Preset v3 (test) |
| --- | --- | --- | --- | --- |
| 1 tháng | 67,4% (n=46) | 75,7% (n=37) | n=1 (không đủ mẫu) | 82,9% (n=70) |
| 3 tháng | 60,9% (n=46) | 82,2% (n=45) | n=1 | 95,7% (n=69) |

Mặc định không tệ nhưng quá kén trong thị trường bull (2019–2026 chỉ bắn 1 tín hiệu). Preset bắn đều ở cả hai chế độ thị trường và chính xác hơn.

## Phát hiện chính

**Vĩ mô thống trị mọi kỳ hạn.** Tổ hợp "DXY yếu + Fed hạ lãi suất + lợi suất 10 năm đang rơi" là yếu tố dự báo mạnh và bền nhất cho vàng — đúng cơ chế kinh tế: vàng không sinh lãi nên hấp dẫn khi lợi suất giảm, định giá bằng USD nên hưởng lợi khi USD yếu. Kỹ thuật giá (RSI, MA200) chỉ đóng vai phụ.

**Động lượng 12 tháng cải thiện tín hiệu 1m đáng kể (+5,5pt min-excess).** Khi macro thuận lợi nhưng XAU chưa trending lên (mom12m ≤ 0), tín hiệu mua thường đến sớm — trend confirmation giúp lọc false positive. Không cải thiện 3m/6m: macro đủ mạnh ở kỳ hạn dài, momentum trở nên redundant.

## Giới hạn — đọc kỹ trước khi tin con số

1. **Tín hiệu bắn chùm.** Điểm vĩ mô cao kéo dài cả giai đoạn Fed nới lỏng, các tín hiệu cách 3 phiên chồng lấn kỳ hạn lên nhau → mẫu hiệu dụng nhỏ hơn n trên bảng đáng kể. Con số **100%** của preset 6 tháng (n=66) về bản chất là "vài đợt nới lỏng tiền tệ 2019–2026 đều trúng" — không phải 66 lần cá cược độc lập. Đừng đọc nó là "chắc chắn thắng".
2. **Chỉ 2 giai đoạn kiểm chứng.** Bộ lọc min-excess giảm rủi ro overfit nhưng không diệt được — việc chọn cấu hình có nhìn kết quả test (selection bias nhẹ). Con số % nên đọc là **ước lượng lạc quan**; kỳ vọng thực tế thấp hơn vài điểm.
3. **Backtest trên XAU/USD, bạn mua vàng VN.** Tương quan cao nhưng chênh lệch SJC co giãn. Lịch sử SJC đã backfill 487 ngày từ CafeF (02/2025→nay, `scripts/backfill-vn.ts`) — đủ để tiêu chí chênh lệch chạy **percentile thật** trong phân tích live (phân phối: p20=11%, trung vị 14%, p80=16,6%), nhưng vẫn chỉ phủ giai đoạn test nên **chưa đủ điều kiện 2 giai đoạn để vào preset**. Premium giữ 0% trong preset cho tới khi dữ liệu phủ nhiều chế độ thị trường hơn (≥ vài năm).
4. **Tín hiệu BÁN composite gần như vô giá trị — và NGƯỢC ở kỳ hạn dài.** Tỉ lệ bán đúng: 49% (1 tháng), 43% (3 tháng), 32% (6 tháng), 25% (12 tháng). Tệ hơn: trung vị lợi suất *sau* tín hiệu bán ở 6 tháng là **+9,5%** — cao hơn cả ngày trung lập (+4,6%), vì vùng bán nổ lúc quá mua giữa sóng tăng có quán tính. UI vì vậy chỉ chấm đúng/sai tín hiệu bán ở 1 tháng; 3–6 tháng ghi "không chấm".

   **Tín hiệu bán thay thế cho vàng VN — chênh lệch cao (validated sơ bộ, `scripts/premium-exit-study.ts`):** trên 487 ngày SJC thật, lợi suất giá SJC sau 42 ngày theo percentile chênh (trailing 180 ngày):

   | Chênh lệch | n | % tăng | Trung vị |
   | --- | --- | --- | --- |
   | Cao (≥ p80) | 117 | 57% | **+1,5%** |
   | Giữa | 209 | 74% | +3,3% |
   | Thấp (≤ p20) | 59 | 90% | **+10,4%** |

   Gradient đơn điệu ở cả 3 kỳ hạn 21/42/63 ngày — chênh cao thì kết quả kém, đúng cơ chế hồi quy của premium. Hạn chế: 16 tháng dữ liệu, một chế độ thị trường, cửa sổ chồng lấn — đọc là bằng chứng sơ bộ mạnh, không phải kết luận cuối. App hiển thị banner "VÙNG BÁN VN theo chênh lệch" trên biểu đồ premium khi percentile ≥ 80.
5. **Yếu tố chưa/không đưa vào:** GPR, VIX và COT positioning đã test và bị loại (bảng trên + section COT 2026-07-05 bên dưới). NHTW mua vàng (dữ liệu quý, trễ), chính sách NHNN (không có feed máy đọc) — ứng viên cho vòng sau.

   **Premium gating (bằng chứng sơ bộ, 2026-06):** `premium-buy-study.ts` trên 488 ngày SJC cho thấy gradient rõ ở 21 ngày: tín hiệu mua + premium thấp (≤p20) → trung vị +7,6%; premium cao (≥p80) → +1,8%. Gradient yếu dần ở 42–63 ngày (bull trend lấn át). Tuy nhiên, chỉ n=7 tín hiệu premium cao, và dữ liệu 488 ngày chỉ phủ một chế độ thị trường — chưa đủ 2 giai đoạn độc lập để vào preset. Premium vẫn giữ trọng số 0% trong preset cho đến khi có thêm dữ liệu đa chế độ.
6. Quá khứ không bảo đảm tương lai. Công cụ xác suất, không phải lời hứa.

## Giám sát thoái hóa & khoảng tin cậy (v3)

Preset không được tin vô thời hạn:

- **Mỗi cron**, `scripts/monitor-presets.ts` chạy lại đúng cấu hình preset trên timeline mới nhất → `preset-health.json`: min-excess hiện tại, hiệu quả 2 năm gần nhất vs baseline cùng kỳ, và **CI 95% block-bootstrap** cho % đúng giai đoạn test (block = kỳ hạn/3 phiên, tôn trọng tín hiệu bắn chùm — CI hẹp ảo nếu resample từng điểm).
- **degraded** khi min-excess < 5pt hoặc 2 năm gần nhất thua baseline > 5pt (hòa baseline trong bull market không tính — vô hại). App hiện ⚠ trên nút preset + banner; Telegram báo khi chuyển trạng thái.
- CI hiển thị cạnh evidence trên verdict card — ví dụ preset 1 tháng: điểm 77,4% nhưng CI 62–91%. Con số đơn lẻ luôn lạc quan hơn sự thật.

**Cạm bẫy đã gặp & vá (2026-06):** preset đặt macro = 90%, nên nếu timeline backtest *thiếu* điểm macro thì composite sụp về đúng đuôi 10% kỹ thuật/thống kê — vốn âm sâu ở vùng đỉnh giá. Hậu quả: 0 tín hiệu mua suốt uptrend 2025 và cảnh báo "degraded" giả. Nguyên nhân gốc: `backtest.ts` từng đòi *cả* DXY *và* Fed mới tính macro (`if (dxy && fed)`), nên một lần FRED 504 xóa macro khỏi **toàn bộ** lịch sử. Đã vá: backtest tính macro khi có DXY (Fed/lợi suất tùy chọn, giống đường live), và `run.ts` cache chuỗi Fed (`history/fed-funds.json`) làm dự phòng. Sau vá: macro có ở 1425/1425 điểm, cả 3 preset `ok` (min-excess 16,7–26,0pt), tín hiệu mua 2025 = 24/14/14.

## Chế độ "Toàn cảnh" = đồng thuận preset (2026-07-05)

Sinh bởi `scripts/consensus-study.ts` trên `timeline.json` đã commit (4.275 điểm, 2009-07 → 2026-07, lưới dày step=1, split 2019-01-01).

### Vì sao bỏ composite mặc định làm trục hành động (số đo, không phải cảm nhận)

Cấu hình mặc định cũ 35/25/20/20 ngưỡng ±40 là ước lượng ban đầu, **chưa từng qua tuyển chọn**. Đo thẳng trên timeline:

| Phía | Train 2009–2018 | Test 2019–2026 |
| --- | --- | --- |
| MUA ≥ +40 | n=141, đúng 60–70% (ex +8,5..+14,7pt) | **n=0 — câm suốt 8 năm bull** (tín hiệu mua cuối: 2018) |
| BÁN ≤ −40 @126p | n=122, giá vẫn TĂNG 71% (med +8,8%) | n=238, giá tăng 69% (med **+15,2%**) — ngược chiều |

Kỹ thuật-nặng (35%) là mean-reversion nên chống trend có hệ thống; premium 25% không tồn tại trong backtest (timeline world-only) nên evidence hiển thị không đo cấu hình live. → **Composite mặc định bị hạ khỏi trục verdict**, chỉ còn 2 vai đã có bằng chứng: điểm radar ngữ cảnh + gió ngược ≤ −40 (headwind 1 tháng, xem CLAUDE.md sell-zone policy).

### Ngưỡng +10 (composite mặc định) — kiểm tra theo yêu cầu, KHÔNG có biên thật

`scripts/toancanh-threshold10-study.ts` (trọng số mặc định 35/20/20, premium bỏ vì không có trong timeline lịch sử): hạ ngưỡng mua từ +40 xuống +10 làm tín hiệu nổ nhiều hơn hẳn (n train 925 vs 141), khiến nhìn "bắt nhiều đáy" — nhưng so với baseline (mua ngày bất kỳ) trên **train** (2009–2018, đa chu kỳ) thì +10 hầu như KHÔNG có biên: 21p train fav 53,0% vs baseline 51,7% (+1,3pt, nhiễu); 63p 54,6% vs 55,5% (**thua** baseline); 126p 51,2% vs 56,7% (**thua** baseline rõ). Biên dương chỉ hiện ở **test** (2019–2026, bull xuyên suốt: baseline đã tự 59,6–79,6% fav) — cùng mẫu hình với +40: ngưỡng thấp chỉ ăn theo regime bull chứ không phải tín hiệu trực giao. Kết luận: ngưỡng +10 cùng họ với +40, không mang bằng chứng train-xác nhận nào mới → KHÔNG dùng làm trục verdict; giữ nguyên chính sách hiện tại (đồng thuận k/3 preset là trục đã kiểm chứng, composite mặc định chỉ ngữ cảnh).

**Thử giới hạn chỉ dùng khi Bear (loại ngày bull) — vẫn NO-GO.** Lọc theo pha `classifyPhase`/`bearPhases` (`src/lib/bear-dca.ts`, dd từ ATH ≥15%): so baseline **cùng-regime** (mua bất kỳ ngày bear) với thr+10 trong bear, biên train chỉ +1,4..+3,5pt ở cả 3 kỳ hạn (48,2→51,7% @21p; 51,6→53,1% @63p; 48,9→50,3% @126p) — dưới hẳn ngưỡng ý nghĩa dự án hay dùng (≥+8pt, vd macro-decomp). Biên test có vẻ lớn hơn (64,9→78,6% @21p) nhưng n=98/29, và cùng mẫu hình regime-luck: test 2019–2026 baseline-trong-bear đã tự 65–99% (mọi cú sập đều hồi). Đo trực tiếp "bắt đáy" (tín hiệu có nằm trong 2% đáy 21 phiên tới không): train bear thr+10=47,3% vs baseline bear=47,7% — **thua/bằng ngẫu nhiên**, không phải kỹ năng bắt đáy thật; test chỉ +3,3pt (68,4% vs 65,1%) khi so đúng baseline-trong-bear (so ẩu với baseline-toàn-kỳ ALL-test thổi phồng thành +12,4pt). Cùng họ NO-GO với [Bear Downside conditioning](bear-downside-conditioning-nogo.md) — điều kiện hóa theo regime không tạo tín hiệu trực giao mới ở composite mặc định.

### 3 nguồn dữ liệu mới (breakeven lạm phát / M2 / dầu WTI) — cả 3 NO-GO (2026-07-06)

Rà lại toàn bộ nguồn free chưa khai thác cho tín hiệu mua: 3 nguồn khả thi qua kiểm tra (FRED `T10YIE` kỳ vọng lạm phát hòa vốn 10 năm từ 2003, FRED `WM2NS` cung tiền M2 tuần từ 1981, Yahoo `CL=F` dầu WTI) — thêm fetcher `fetchBreakeven`/`fetchM2`/`fetchWti` (`scripts/fetch.ts`). GLD/SPDR ETF holdings CSV cũ đã 404 (site đổi sang Next.js, chưa tìm endpoint thay thế); VN-Index (VNDirect, Yahoo `^VNI`) và Google Trends không có API free/ổn định đáng tin cho cron 2×/ngày (VNDirect không kết nối được, Yahoo không có mã VN-Index chuẩn, Google Trends là API không chính thức cần token 2 bước + rate-limit) — bỏ qua, không phải NO-GO có bằng chứng mà là infeasible.

`scripts/new-factors-study.ts`: mỗi nguồn ĐỨNG MỘT MÌNH, chấm điểm -2..+2 theo đúng khuôn MA50 + đổi %1-tháng của `macroCriterion` (một giả thuyết hướng duy nhất, không dò dấu — breakeven/M2/WTI tăng & vượt MA50 = tốt cho vàng), quét ngưỡng [25,40,50,75] × kỳ hạn [21,63,126], cổng train(<2019)/test(≥2019) như single-factor-study. Kết quả: **min-excess ÂM ở mọi ô cho cả 3 nguồn, mọi kỳ hạn** — breakeven -3.5..-2.4pt, M2 -2.0..-0.2pt, WTI -8.6..-2.3pt (không ngưỡng nào của bất kỳ nguồn nào thắng baseline ở cả train lẫn test). Kết luận: cả 3 REJECTED, không thêm vào macroCriterion hay bất kỳ tiêu chí nào. Không re-mở nếu không có ablation mới.

### Hướng "tối ưu lại trọng số một-composite" — ĐÓNG HỒ SƠ

Grid search 4D × 4 ngưỡng đòi MỘT cấu hình thắng baseline ở **cả 3 kỳ hạn × 2 giai đoạn** (6 ô, ≥25 tín hiệu/ô): 395 cấu hình qua cổng, top đều **macro-nặng (VM 0,5–0,7, KT=0)** — hội tụ về đúng họ preset 3m/6m đã có. Không tồn tại "toàn cảnh tối ưu" mang thông tin khác preset; làm preset thứ 4 chỉ là trùng lặp. KHÔNG re-mở nếu không có tiêu chí mới qua ablation.

### Trục mới: "k/3 preset kỳ hạn đang báo MUA" — và điều KHÔNG được claim

Đồng thuận ≥k/3 thắng baseline ở cả 6 ô (dải min-excess theo kỳ hạn/k: +14,1..+31,0pt), NHƯNG **placebo đồng-n** (top-n ngày theo composite của preset đúng kỳ hạn — tương đương chỉ nới/siết ngưỡng preset gốc cho cùng cỡ mẫu) cho thấy đồng thuận **không thêm thông tin trực giao**: chênh vs placebo dao động −7,2..+15,6pt không nhất quán, đa số ≈0 (3 preset đều macro-nặng nên tương quan cao — đúng nghi vấn đặt trước khi chạy).

**Luật hiển thị (không được nói quá):**

1. "k/3 preset báo MUA" chỉ là **phép đếm hiển thị** của 3 tín hiệu đã kiểm chứng riêng lẻ. Mọi con số evidence đi kèm phải là evidence CỦA TỪNG preset (bảng v3 ở trên + CI từ preset-health).
2. KHÔNG claim "nhiều preset cùng báo → chính xác hơn" — chưa vượt placebo.
3. Sức khỏe đồng thuận = sức khỏe preset thành viên (monitor-presets sẵn có); bất kỳ preset degraded → banner ở chế độ Toàn cảnh. Không có monitor riêng vì không có claim riêng.
4. Gió ngược (radar ≤ −40) và Gợi ý hành động giữ nguyên chính sách 2026-07-04; Time Machine chấm chế độ Toàn cảnh theo cùng trục đồng thuận (luật "chart ≡ card").

Code: `src/lib/consensus.ts` (+ test), Dashboard/TimeMachine/SettingsSheet đọc qua đó. Tái lập: `npx tsx scripts/consensus-study.ts`.

### Câu hỏi tiếp theo: "vì sao có năm câm tín hiệu?" → thử COT positioning — LOẠI (2026-07-05)

Tín hiệu bắn theo cụm vì cả 3 preset đều macro-nặng — bản chất là máy phát hiện *chế độ nới lỏng tiền tệ*. Phần lớn khoảng lặng là ĐÚNG (2021 vàng −3,5%, 2022 −0,4%), nhưng 2 năm bị bỏ lỡ thật: **2017 (+13,6%, 0 tín hiệu)** và **2023 (+13,3%, chỉ 9 ngày)** — yếu tố ngoài tầm nhìn 3 preset (khả năng: NHTW mua vàng, positioning). Nới ngưỡng (thr=30) đã thử: KHÔNG lấp được năm câm (0 ngày thêm ở 2017/2021/2022/2023), chỉ làm dày rìa cụm sẵn có với chất lượng kém hơn baseline → cần yếu tố TRỰC GIAO mới, không phải nới ngưỡng.

Ứng viên đầu tiên: **COT positioning** (CFTC legacy futures, `GOLD - COMMODITY EXCHANGE INC.`, tuần, free). `scripts/cot-study.ts`: 1.069 tuần (2006-01 → 2026-06), tín hiệu = percentile `net/OI` trên trailing 156 tuần **đã công bố** (chống look-ahead: mỗi tuần chỉ khả dụng từ asOf + 4 ngày, cần ≥52 tuần); 2 hướng contrarian (net thấp = mua) và trend (đối chứng); grid 5D KT/TK/VM/MOM/COT × ngưỡng {30,40,50,60}, cổng ≥25 tín hiệu + thắng baseline cả 2 giai đoạn, xếp min-excess — đúng khung ablation momentum.

| Biến thể | 1 tháng | 3 tháng | 6 tháng | Kết luận |
| --- | --- | --- | --- | --- |
| Gốc 4D (KT/TK/VM/MOM) | +21,1pt | +31,0pt | +20,4pt | — |
| + COT contrarian | +24,4pt | +31,0pt | +20,4pt | LOẠI — chỉ cải thiện 1/3 kỳ hạn, và cấu hình thắng H21 (KT 0,3 / MOM 0,3 / COT 0,4, **bỏ hẳn macro**) chỉ còn n=25 test (so 150 của gốc) — đánh đổi độ phủ lấy +3,3pt trên mẫu mỏng |
| + COT trend | +21,1pt | +31,0pt | +20,4pt | LOẠI — không cải thiện kỳ hạn nào (như GPR/VIX) |

**Câu hỏi gốc — năm câm — cũng KHÔNG được giải:** cấu hình tốt nhất có COT cho 2017: 0 tín hiệu, 2021: 0, 2023: ≤4 ngày ở mọi kỳ hạn. COT contrarian khá trực giao với macro (corr = −0,34) nhưng trực giao không đồng nghĩa hữu ích. Cửa ablation này giờ đã loại GPR, VIX, COT — nhất quán bài học GPR: thị trường price-in nhanh, "ứng viên trực giác" hiếm khi qua cổng 2 giai đoạn. 2017/2023 tạm chấp nhận là giới hạn đã biết của họ preset macro; ứng viên còn lại (NHTW mua vàng — dữ liệu quý, trễ) kỳ vọng thấp. Tái lập: tải `deacotYYYY.zip` từ `cftc.gov/files/dea/history/` (2006–nay), giải nén `.txt` vào một thư mục rồi `COT_DIR=<thư mục> npx tsx scripts/cot-study.ts`.

### Tách sub-signal vĩ mô (DXY / Fed / lợi suất tự do trọng số) — CÓ TÍN HIỆU TỐT (2026-07-05, engine CHƯA đổi)

Sau khi COT rớt, đổi hướng: thay vì thêm yếu tố mới, **bỏ ràng buộc trung bình cộng** giữa 3 sub-signal bên trong tiêu chí vĩ mô. Nghi vấn cụ thể: 2017 DXY sập ~10% (tín hiệu mua) nhưng Fed tăng lãi 3 lần (tín hiệu bán) — hai sub-signal triệt tiêu nhau trong điểm macro; 2023 tương tự (Fed tăng đến 7/2023 đè điểm macro trong khi lợi suất có 2 cửa sổ rơi mạnh — SVB 3/2023 và cuối 2023 — đều là sóng vàng). Không cần feed mới — chỉ tách dữ liệu sẵn có.

`scripts/macro-decomp-study.ts`: tái tạo 3 sub-score past-only đúng mapping `macroCriterion` (golden check: khớp điểm macro đã lưu trong timeline ở **4.275/4.275 điểm**), rồi grid 6D KT/TK/MOM/DXY/FED/YLD bước 10% × ngưỡng {30,40,50,60}, cùng cổng 2 giai đoạn + min-excess như mọi study. **Lưu ý trần:** ở 3-6 tháng, cấu hình tốt đạt test 100% nên excess test bị chặn tại 100 − baseline (31,0/20,4pt) — min-excess không phân biệt được nữa; so thêm theo độ phủ (chọn theo n TRAIN trong các ứng viên cách best ≤1pt — không nhìn test).

| Kỳ hạn | Best 4D (gốc) | Best 6D (tách) | Δ min-excess | Độ phủ tại trần (test n, base → decomp) | Cụm độc lập (gap>21 phiên) |
| --- | --- | --- | --- | --- | --- |
| 1 tháng | +21,1pt | **+29,9pt** | **+8,8pt** | 200 → 62 (đổi phủ lấy chất lượng) | 15 → 12 |
| 3 tháng | +31,0pt (trần) | +31,0pt (trần) | 0 (trần) | 72 → **128** | 15 → **18** |
| 6 tháng | +20,4pt (trần) | +20,4pt (trần) | 0 (trần) | 114 → **316** | 16 → **29** |

**Cấu trúc thắng nhất quán: YLD-nặng (0,3–0,6), FED nhẹ hoặc 0, DXY 0,1–0,3.** Kiểm chứng thêm, tất cả đạt:

- **Năm câm 2023 được mở khóa** bởi các cấu hình FED=0: n=16 tín hiệu @100% đúng, trung vị +6,4% (3 tháng) / +11,8% (6 tháng). Đúng cơ chế nghi vấn: bỏ án phạt Fed-đang-tăng thì 2 cửa sổ lợi suất rơi của 2023 hiện ra. **2017 vẫn KHÔNG giải được** (≤4 ngày mọi cấu hình — yếu tố ngoài tầm vẫn thiếu); 2021/2022 tiếp tục câm ĐÚNG.
- **Tách đôi giai đoạn test** (2019–2022 / 2023–2026): cấu hình đề cử thắng baseline ở **cả 2 nửa, cả 3 kỳ hạn** (ví dụ 6 tháng phủ-max: 100% n=184 vs bl 70% | 100% n=127 vs bl 93%).
- **Lân cận trọng số** (dịch 0,1 mọi cặp khóa): 19/25 → 25/25 lân cận vẫn qua cổng 2 giai đoạn — không phải đỉnh nhọn overfit.
- **YLD-đơn không đủ** (trừ 6 tháng gần đủ: +18,5pt): cần tổ hợp, không phải "thay macro bằng yield".
- **Phủ rộng không pha loãng độ chính xác:** chấm RIÊNG các ngày decomp bắn mà base không bắn (chẩn đoán g): test 3 tháng n=58 thêm đúng 100% (med +6,9%), test 6 tháng n=130–311 thêm đúng 100% (med +12,7..+15,4% — cao hơn cả cấu hình cũ). Đánh đổi thật nằm ở train: phần thêm 77–87% so ~90% của lõi (vẫn vượt xa baseline 52–57%). Riêng 1 tháng chiều ngược lại: ÍT tín hiệu hơn nhưng chính xác hơn (80,7% → 88,7–91,9%).

**Đọc số cho đúng:** grid 6D bao gần trọn không gian 4D nên best 6D ≥ 4D là tất yếu trên train — giá trị nằm ở chỗ qua cổng test + cấu trúc nhất quán + độ phủ tại trần + tách đôi test đều thắng. n ngày vẫn là tín hiệu bắn chùm (xem Giới hạn #1); số cụm độc lập (12/18/29) mới là cỡ mẫu hiệu dụng.

**Trạng thái: ĐÃ SHIP thành preset v4 (1 tháng) / v4.1 phủ-max (3/6 tháng, reopen cùng ngày 2026-07-05, được chủ app duyệt)** — bảng phát hành + chi tiết kỹ thuật ở section "Kết quả — 3 preset ĐANG PHÁT HÀNH (v4/v4.1)" phía trên. Tái lập study: `npx tsx scripts/macro-decomp-study.ts` (tự fetch DXY Yahoo, cache tạm; cần mạng lần đầu).

## Tái lập kết quả

```bash
npm run collect                                    # sinh timeline.json từ dữ liệu thật (đã gồm yield + momentum)
npx tsx scripts/presets-study.ts                   # bảng tuyển chọn 3 kỳ hạn (4D search khi momentum có trong timeline)
npx tsx scripts/factor-study.ts                    # ablation: bật/tắt lợi suất / VIX / GPR
npx tsx scripts/factor-study-momentum-offline.ts   # ablation momentum: 3D vs 4D, dùng timeline.json có sẵn
npx tsx scripts/premium-buy-study.ts               # gradient premium cho tín hiệu mua (488 ngày SJC)
npx tsx scripts/optimize-study.ts                  # study gốc v1 (1 kỳ hạn, HORIZON=21|63|126)
npx tsx scripts/horizon-study.ts                   # hiệu quả cấu hình mặc định theo 4 kỳ hạn
npx tsx scripts/consensus-study.ts                 # hiện trạng Toàn cảnh + grid đa kỳ hạn + đồng thuận k/3 (placebo đồng-n)
COT_DIR=<thư mục .txt> npx tsx scripts/cot-study.ts # ablation COT positioning (cần tải deacotYYYY.zip từ cftc.gov trước)
npx tsx scripts/macro-decomp-study.ts              # tách sub-signal vĩ mô DXY/FED/YLD, grid 6D (tự fetch DXY Yahoo lần đầu) — study tuyển v4
npx tsx scripts/verify-preset-evidence.ts          # đối chiếu PRESETS[].evidence với tính lại trên timeline hiện tại
```

Preset khai báo tại `src/lib/types.ts` (`PRESETS`) — số liệu evidence trong code phải khớp bảng "3 preset ĐANG PHÁT HÀNH (v4/v4.1)"; đổi preset thì cập nhật cả hai.
