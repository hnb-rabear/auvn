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

## Mùa vụ theo tháng — de-trend NO-GO, giữ nguyên (2026-09-04)

Câu hỏi: tín hiệu `season` (lợi suất 63 phiên trung bình theo tháng dương lịch, `criteria.ts:570`)
dùng ngưỡng **tuyệt đối** `avg ≥ 2 ? +1 : avg ≤ −2 ? −1 : 0`. Với tài sản xu-hướng-tăng, mọi
tháng đã ~+2% ⇒ phía âm chết hẳn (bug **#8** trong `docs/audit-and-improvement-proposals-2026.md`).
Bỏ look-ahead (#10, đã ship cùng ngày) **không** sửa việc này — hai bug độc lập. De-trend
(trừ trung bình chéo-tháng) hoặc xếp hạng sẽ mở lại phía âm, nhưng đó là **đổi tín hiệu** ⇒
phải qua cổng.

**Vòng 1 — 9 biến thể × 3 kỳ hạn = 27 ô** (`scripts/seasonality-detrend-study.ts`; 4 cổng viết
trước: n≥25 hai giai đoạn · excess>0 hai giai đoạn · CI95 block-bootstrap không trùm baseline ·
vượt placebo p95 chọn ngẫu nhiên **cùng số tháng**, giữ nguyên cấu trúc khối lịch):

| Biến thể | Phân bố −1/0/+1 | 21 phiên | 63 phiên | 126 phiên |
| --- | --- | --- | --- | --- |
| `abs2` **ĐANG PHÁT HÀNH** | 0,0 / 38,0 / 62,0 | −1,8pt / +4,9pt | +0,6pt / +3,2pt | +1,1pt / −0,0pt |
| `abs3` | 0,0 / 58,9 / 41,1 | −0,5pt / +8,2pt | −0,0pt / +9,7pt | −0,9pt / +0,7pt |
| `demean1` | 37,1 / 29,7 / 33,2 | −2,0pt / +7,8pt | −0,5pt / +7,5pt | −2,3pt / −1,5pt |
| `demean2` | 23,4 / 54,2 / 22,4 | +4,3pt / +10,7pt | +4,9pt / +15,5pt | +1,0pt / +5,4pt |
| `rank3` | 24,9 / 49,5 / 25,6 | +5,8pt / +11,4pt | +0,5pt / +8,2pt | −1,1pt / −1,5pt |

(ô = excess train / excess test; đầy đủ 9 biến thể trong output script)

**0/27 ô qua cổng.** De-trend/rank ĐÚNG là mở lại phía âm như probe dự đoán (`demean1` cân
37/30/33), và excess của `demean2`/`rank3` nhìn hấp dẫn (+15,5pt test @63) — nhưng **CI95 trùm
baseline ở mọi ô** (vd `demean2` @63: train [43–75] quanh baseline 54,6) và **không ô nào vượt
placebo p95**. Nghĩa là: chọn 2–3 tháng bất kỳ trong 12 cũng cho excess tương đương. Đây là
**tháng lịch không mang thông tin**, không phải "chưa tìm đúng ngưỡng".

Phát hiện đi kèm quan trọng hơn câu hỏi gốc: **`abs2` đang phát hành cũng không qua cổng nào**
(gate `ne-p` tốt nhất, @63 — thiếu CI). Phía mua của nó không hơn placebo.

**Vòng 2 — ablation giữ vs bỏ** (`scripts/seasonality-ablation.ts`, đo trên trục UI thật là
`presetComposite`, không phải composite mặc định; `stats` bản "bỏ season" = trung bình 3 tín hiệu
con còn lại, khớp `finish()`; assert bản "giữ" tái tạo đúng điểm engine):

| Preset | Giai đoạn | GIỮ season | BỎ season | Δfav | Δn |
| --- | --- | --- | --- | --- | --- |
| 1m | train | 78,1% (n=32) [53–97] | 76,9% (n=26) [46–100] | −1,2pt | −6 |
| 1m | test | 95,7% (n=23) [87–100] | 93,8% (n=16) [81–100] | −1,9pt | −7 |
| 3m | train | 88,9% (n=45) [80–98] | 90,0% (n=20) [90–90] | +1,1pt | −25 |
| 3m | test | 100% (n=35) | 100% (n=23) | 0,0pt | −12 |
| 6m | train | 78,1% (n=96) [54–100] | 76,9% (n=91) [53–100] | −1,2pt | −5 |
| 6m | test | 100% (n=102) | 100% (n=94) | 0,0pt | −8 |

**Phán quyết: GIỮ NGUYÊN `abs2`** — không phải vì nó tốt, mà vì cả hai hướng thay đổi đều
không có bằng chứng. Cụ thể, trung thực:

- **Không nâng cấp được:** 0/27 biến thể qua cổng, mọi excess nằm trong nhiễu placebo.
- **Không bỏ được:** bỏ season làm fav tệ hơn 1,2–1,9pt ở 3/6 ô và **giảm n ở cả 6 ô** (mạnh
  nhất 3m train −25 tín hiệu) — nhưng phải nói rõ Δ đó **cũng là nhiễu**: n=16–32 với CI
  [46–100] thì 1,2pt không có nghĩa thống kê. Đây là kết quả **không kết luận được**, không
  phải bằng chứng season hữu ích.
- Cái đo được chắc chắn: season chỉ đóng 1/4 tiêu chí `stats`, mà `stats` chỉ nắm 0,1–0,2
  trọng số preset ⇒ ảnh hưởng thực tế nhỏ ở mọi hướng. Ưu tiên **không đổi engine không có
  bằng chứng** hơn là dọn cho đẹp.
- **Bug #8 vì vậy KHÔNG đóng bằng cách sửa ngưỡng** — nó là mô tả đúng về signal, và signal đó
  yếu ở mọi biến thể. Đóng bằng "đã đo, không có hướng nào thắng cổng".

Tái lập: `npx tsx scripts/seasonality-detrend-study.ts` và `npx tsx scripts/seasonality-ablation.ts`.
Đừng mở lại họ này bằng thêm ngưỡng — placebo cùng-số-tháng đã trả lời chung cho cả họ. Hướng
còn sống (chưa đo): mùa vụ **VN** theo lịch Tết/Thần Tài trên giá SJC (chờ ≥3 mùa Tết dữ liệu,
xem `docs/sell-zone.md` "Còn lại chưa đo").

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

| Preset | Trọng số (KT / TK / MOM / DXY / FED / YLD) | Ngưỡng mua | Đúng 2009–2018 | Đúng 2019–2026 | Baseline (train/test) | Trung vị lãi (test) | Cụm độc lập (train/test) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Sóng 1 tháng** (v4) | 20% / 10% / 30% / 10% / 0 / 30% | +50 | **80,8%** (n=104) | **91,9%** (n=62) | 50,9% / 59,3% | +3,9% | **15 / 10** |
| **Sóng 3 tháng** (v4.1) | 10% / 20% / 20% / 20% / 10% / 20% | +40 | **89,0%** (n=136) | **99,1%** (n=107) | 54,4% / 67,7% | +7,3% | **12 / 12** |
| **Tích lũy 6 tháng** (v4.1) | 10% / 10% / 0 / 20% / 20% / 40% | +30 | **65,5%** (n=322) | **98,3%** (n=293) | 55,7% / 77,3% | +13,4% | **15 / 12** |

> **Cập nhật 2026-09-25 — Yahoo sửa lịch sử GC=F + khóa mốc đầu chuỗi.** Ngày 2026-09-15 Yahoo đổi quy ước roll hợp đồng: 1510 bar từ 2020-05 dịch ≤0,85% (ví dụ 29/05/2020: 1736,9 → 1751,7). Bảng trên tính lại trên chuỗi mới bằng `verify-preset-evidence.ts`; mọi ô lệch ≤1,1pt và cả 3 preset vẫn vượt cổng (`monitor-presets`: min-excess 29,8 / 31,3 / 9,8pt, cả ba `status=ok`). Cùng lúc `fetchYahoo` chuyển từ `range=20y` (cửa sổ TRƯỢT, bar 0 tiến mỗi ngày ⇒ lưới thưa 3 phiên đổi pha, mùa vụ + percentile biến động của ngày quá khứ đổi theo — đo được: bỏ 2 bar đầu làm prob săn đáy live nhảy 57,3 → 61,0) sang `period1` CỐ ĐỊNH 2006-09-25. Từ nay chuỗi chỉ dài thêm về cuối. KHÔNG tuyển lại trọng số theo số mới.
>
> Bảng trên cũng là số **sau khi sửa look-ahead FEDFUNDS (2026-09-14)** — xem section riêng bên dưới. Cột cuối là số **cụm độc lập** (hai tín hiệu cách nhau < H phiên = cùng một cụm): đây mới là n dùng để đọc độ tin cậy, KHÔNG phải n ngày. n ngày chồng lấn cửa sổ tương lai nên mọi CI tính theo ngày đều hẹp giả.

**Cập nhật 2026-09-04 — bỏ look-ahead mùa vụ (bug #10).** `scripts/backtest.ts` từng tính `seasonalityTable` MỘT LẦN trên toàn chuỗi rồi truyền cho mọi điểm lịch sử; điểm `stats` quá khứ vì thế đổi mỗi lần Yahoo cuốn cửa sổ 20 năm và không tái lập được (bằng chứng: `HIGH_CONF_3M_EVIDENCE.orthogonalTrainPt` trôi 1,7 → 3,3; trung bình mùa vụ T5 1,96 → 1,49 và T8 1,12 → 2,51 chỉ trong vài ngày). Đã sửa thành walk-forward (khóa bằng test `walk-forward: cắt bớt bar tương lai KHÔNG đổi điểm quá khứ`), timeline regenerate, bảng trên tính lại bằng `verify-preset-evidence.ts`. Mọi ô lệch ≤1,2pt, **cả 3 preset vẫn vượt cổng** với biên train +30,1/+33,4/+20,8pt và test +29,4/+31,2/+22,4pt (khớp `monitor-presets`: cả 3 `status=ok`) ⇒ không preset nào bị hạ khỏi phát hành. Bug chỉ đổi thứ tự xếp hạng trong cụm điểm sát nhau, không đổi tín hiệu. Bài học: mọi số dẫn xuất từ timeline phải có script tái lập được, chạy lại sau MỌI lần sửa engine.

So v4 (đã ship rồi rút lại cho 3m/6m): test n 90→104 (3m), 130→311 (6m) — gần gấp 2.4x số tín hiệu ở 6m, mở lại các năm 2017/2023 vốn câm hẳn dưới FED=0; accuracy KHÔNG pha loãng (test 99%/100%, train vẫn cách baseline xa: +33,4pt/+20,8pt). Đánh đổi: train-margin 6m mỏng hơn (76,8% vs baseline 56,0% = +20,8pt, so +24,1pt của v4 cũ) và composite hiện tại (2026-07-05) KHÔNG chuyển sang mua ở cả 3m/6m dưới v4.1 (dry spell không phải bug — xem phần "Gom" reopen ở dưới).

FED = hướng lãi suất Fed **bằng 0 ở preset 1 tháng (v4)**, **>0 nhỏ ở 3/6 tháng (v4.1)**; vẫn nằm trong tiêu chí vĩ mô hiển thị (radar/chế độ tùy chỉnh) ở cả 3 preset dù có/không tham gia macroSub. Premium = 0 như v3 (chưa đủ 2 giai đoạn). Số trong bảng = tính lại bằng `presetComposite` trên timeline lúc ship (khớp `PRESETS`, đối chiếu bằng `npx tsx scripts/verify-preset-evidence.ts` — có thể chênh ≤0,5pt so đầu ra study gốc do làm tròn 0,1 tại biên ngưỡng + timeline thêm phiên mới).

### Sửa look-ahead FEDFUNDS (2026-09-14) — số trong bảng ĐÃ trừ phần nhìn trước

**Bug.** FRED gắn nhãn chuỗi `FEDFUNDS` bằng ngày **quan sát** (đầu tháng: `2026-08-01`) nhưng giá trị là **trung bình các ngày trong tháng đó** — chỉ tồn tại sau khi tháng kết thúc, công bố khoảng ngày 1 tháng sau. Mọi nơi tiêu thụ đều lọc `f.date <= ngày đang xét` (`scripts/backtest.ts:83`, `src/lib/bottom.ts:345`, và 13 script study khác), nên ngày 2026-08-02 đã đọc được trung bình cả tháng 8. **Rò tối đa ~1 tháng, trên TOÀN BỘ lịch sử** — không phải chỉ vài ngày đầu tháng.

**Sửa.** Dời nhãn sang **ngày khả dụng** tại đúng một chỗ — `fetchFedFunds` (`scripts/fetch.ts`) — nên 15 consumer đang lọc `date <=` tự đúng, không phải sửa từng file. Cache `public/data/history/fed-funds.json` migrate một lần bằng `scripts/migrate-fed-availability.ts`. Khóa bằng `tests/fed-availability.test.ts` (gồm cọc chống chạy migrate hai lần).

**Tác động đo được** (`scripts/fed-lookahead-impact.ts` — tính lại điểm `fed` theo cả hai quy ước nhãn trên cùng timeline, không cần chạy lại backtest):

| Preset | FED weight | Biên train cũ → mới | Biên test cũ → mới |
| --- | --- | --- | --- |
| 1 tháng | 0 | +29,7 → **+29,7pt** (không đổi) | +29,4 → **+29,4pt** |
| 3 tháng | 0,1 | +32,4 → **+34,3pt** | +31,2 → **+31,2pt** |
| 6 tháng | 0,2 | +20,8 → **+10,7pt** | +22,4 → **+20,9pt** |

34,2% điểm timeline (1463/4273) đổi điểm Fed. Preset 1 tháng miễn nhiễm vì `fed: 0`. **Preset 6 tháng mất hơn nửa biên train** (+20,8 → +10,7pt) vì nó mang trọng số Fed nặng nhất — vẫn vượt cổng nhưng giờ **sát nút**, và đây là con số trung thực đầu tiên của nó.

**Không tuyển lại trọng số để bù.** Làm vậy là chạy grid lần nữa trên test đã khai thác nhiều lần — chính xác cái mà "Giới hạn #2" bên dưới cảnh báo. Sửa look-ahead là sửa tính tái lập, không phụ thuộc việc số có đẹp hơn hay không.

**Lưu ý nhân quả.** Look-ahead làm Fed trông TỐT hơn thực tế, mà grid tuyển chọn vẫn dìm Fed về 0–0,2. Nên nó **không** giải thích được vì sao winner luôn yield-nặng/Fed-nhẹ; nếu có tác dụng gì thì là củng cố kết luận đó.

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

**Nhưng bản thân QUY TRÌNH tuyển chọn không tổng quát hóa qua chế độ thị trường (2026-09-14).** `scripts/preset-walkforward-study.ts` cho thấy cấu hình thắng ổn định suốt nhiều năm rồi **nhảy hẳn sang họ khác** đúng lúc chế độ đổi — 1m: `FED:0.6` suốt 2013–2019 → `KT:0.4 MOM:0.4 YLD:0.2` từ 2020; 6m: YLD-nặng 2014–15 → thêm MOM 2016–2020 → `FED:0.4 YLD:0.4` từ 2021. Nghĩa là hai phát hiện ở trên mô tả đúng chế độ ĐÃ QUA, không bảo đảm cho chế độ tới. Chi tiết + bảng số ở Giới hạn #2.

## Giới hạn — đọc kỹ trước khi tin con số

1. **Tín hiệu bắn chùm — đã ĐO, không còn là cảnh báo định tính (2026-09-14).** Số **đợt độc lập** = số khối H phiên KHÔNG chồng lấn có ít nhất một tín hiệu (`countClusters`/`clusterRanges`): **1m 15/10, 3m 11/12, 6m 15/12** (train/test). So với n NGÀY trên bảng (104/64, 135/108, 332/292) thì cỡ mẫu thật nhỏ hơn **6–25 lần**. Con số 98,3% của preset 6 tháng về bản chất là "**12 đợt** vĩ mô thuận 2019–2026 hầu hết trúng" — không phải 292 lần cá cược độc lập.

   Con số 12/18/29 lưu hành trước đây sai ở hai chỗ: gộp cả hai giai đoạn thành một số, và dùng một ngưỡng gap>21 phiên cho MỌI kỳ hạn (ở H=126, hai tín hiệu cách 22 phiên vẫn chia nhau 82% cửa sổ tương lai — không hề độc lập).

   **Cảnh báo phương pháp (đo được, đừng lặp lại).** Bản đầu của `countClusters` dùng luật "gộp các tín hiệu cách nhau < H" — luật đó có **hiệu ứng dây chuyền**: một chuỗi rải đều, mỗi tín hiệu cách nhau H−1 phiên, nối thành MỘT cụm duy nhất dù trải nhiều năm (bin 2 của tầng cycle: 1982 ngày trải 17 năm → 1 cụm, trong khi lưới khối cho 34). Vì vậy dùng **lưới khối cố định** (mốc 0 = tín hiệu đầu tiên), không gộp-theo-gap.

   `monitor-presets.ts` nay ghi `trainClusters`/`testClusters` vào `preset-health.json`, UI hiển thị "n đợt độc lập" cạnh %, và **CI đã sửa**: bootstrap theo CỤM (`clusterBootstrapCiWeighted`) thay vì theo mảng đã lọc. Bản cũ truyền `hit(test)` — chỉ gồm các ngày trúng, nên khoảng cách lịch giữa chúng biến mất: hai ngày trúng cách nhau 3 năm bị coi là liền kề, còn một chùm 40 ngày liên tiếp được đếm thành 40 quan sát độc lập. CI vì thế hẹp giả đúng ở chỗ nó phải phản ánh, trong khi UI lại ghi "đã tính tín hiệu bắn chùm".

   Tác động lên CI95 test (cũ → mới): **1m 75–98,4% → 63,9–98,2%**, 3m 97,2–100% → 95,8–100%, 6m 95,2–100% → 93,7–100%. Bottom Hunter dùng cùng hàm (bản có trọng số recency): cycle 33,2–66,6% → 38,8–65,8%, swing 39,2–62,8% → 39,4–63,1%.

   Khóa bằng `tests/calendar-bootstrap.test.ts`: chuỗi tổng hợp bắn chùm trái dấu (bản mới cho CI rộng hơn bản cũ), chuỗi rải đều (CI hẹp, gần như không đổi), chuỗi chỉ 2 cụm (bản cũ vẫn in ra một khoảng tự tin, bản mới trả `null` = "không đo được"), và test chống hiệu ứng dây chuyền.
2. **Selection bias — ĐÃ ĐO 2026-09-14, và nó LỚN, không "nhẹ" như ghi trước đây.** Bộ lọc min-excess giảm rủi ro overfit nhưng không diệt được: cấu hình v4/v4.1 được chọn bằng grid chạy trên TOÀN BỘ lịch sử, với luật chọn ghi thẳng trong `types.ts` là "ưu tiên cấu hình bắn được 2023" — tức có nhìn kết quả test lúc chọn. `scripts/preset-walkforward-study.ts` mô phỏng việc tuyển chọn TRUNG THỰC (mỗi năm Y: chọn cấu hình tốt nhất trên dữ liệu ≤ Y, nhãn đã purge chống rò, rồi chấm trên năm Y+1 chưa từng thấy) — kết quả gộp qua mọi fold:

   | Preset | Walk-forward (tuyển past-only) | PRESETS đang ship | Placebo (cấu hình ngẫu nhiên) |
   | --- | --- | --- | --- |
   | 1m | **+11,3pt** (17 đợt độc lập) | +26,2pt | +5,5pt |
   | 3m | **−7,0pt** (7 đợt) | +33,8pt | −0,6pt |
   | 6m | **−8,0pt** (8 đợt) | +18,1pt | +8,8pt |

   Đọc cho đúng: **con số đang công bố (+26/+34/+18pt) là ước lượng LẠC QUAN của một quy trình tuyển chọn có nhìn test.** Khi tuyển chọn trung thực, chỉ 1 tháng còn giữ được lợi thế (+11,3pt, gấp đôi placebo); 3 và 6 tháng ra ÂM và **thua cả placebo** — nghĩa là ở hai kỳ hạn đó, "chạy grid trên quá khứ rồi dùng cho năm sau" không tạo được giá trị nào.

   Nguyên nhân nhìn thấy ngay trong cột cấu hình-thắng-mỗi-fold: winner ổn định suốt một giai đoạn dài rồi **nhảy hẳn sang họ khác** khi chế độ thị trường đổi (1m: `KT:0.2 MOM:0.2 FED:0.6` suốt 2013–2019 → `KT:0.4 MOM:0.4 YLD:0.2` từ 2020; 3m: YLD-nặng → FED-nặng sau 2022). Grid-search bám chế độ vừa qua và không tổng quát sang chế độ kế — cùng bài học "chế độ không biết trước" đã gặp ở sell-zone và ở day-1 DCA trong bear.

   **KHÔNG đổi engine vì kết quả này**, vì chính việc "tuyển lại cho đẹp" là thứ tạo ra bias: mọi vòng grid mới đều chạy trên cùng dữ liệu đã khai thác nhiều lần. Việc phải làm là **hạ mức tin vào con số**, không phải thay số. Số fold cũng không phải số mẫu độc lập (7–17 đợt/preset) nên bảng trên đọc theo HƯỚNG và ĐỘ LỚN, không phải một ước lượng điểm.

   Đã ship kèm: Dashboard in thêm một dòng cảnh báo ngay cạnh mọi % preset ("cấu hình này được chọn sau khi đã nhìn toàn bộ lịch sử… lợi thế thật đo được là +11pt ở 1 tháng và âm ở 3/6 tháng"). Tái lập: `npx tsx scripts/preset-walkforward-study.ts` (offline, chỉ đọc `timeline.json`; lưới bước 0,2 thay 0,1 để chạy được 16 fold — bước thô hơn lưới tuyển chọn gốc, nên bảng này là cận TRÊN lạc quan của walk-forward, không phải cận dưới).
3. **Backtest trên XAU/USD, bạn mua vàng VN.** Tương quan cao nhưng chênh lệch SJC co giãn. Lịch sử SJC đã backfill 487 ngày từ CafeF (02/2025→nay, `scripts/backfill-vn.ts`) — đủ để tiêu chí chênh lệch chạy **percentile thật** trong phân tích live (phân phối: p20=11%, trung vị 14%, p80=16,6%), nhưng vẫn chỉ phủ giai đoạn test nên **chưa đủ điều kiện 2 giai đoạn để vào preset**. Premium giữ 0% trong preset cho tới khi dữ liệu phủ nhiều chế độ thị trường hơn (≥ vài năm).
4. **Tín hiệu BÁN composite gần như vô giá trị — và NGƯỢC ở kỳ hạn dài.** Tỉ lệ bán đúng: 49% (1 tháng), 43% (3 tháng), 32% (6 tháng), 25% (12 tháng). Tệ hơn: trung vị lợi suất *sau* tín hiệu bán ở 6 tháng là **+9,5%** — cao hơn cả ngày trung lập (+4,6%), vì vùng bán nổ lúc quá mua giữa sóng tăng có quán tính. UI vì vậy chỉ chấm đúng/sai tín hiệu bán ở 1 tháng; 3–6 tháng ghi "không chấm".

   **Tín hiệu bán thay thế cho vàng VN — chênh lệch cao (validated sơ bộ, `scripts/premium-exit-study.ts`):** trên 487 ngày SJC thật, lợi suất giá SJC sau 42 ngày theo percentile chênh (trailing 180 ngày):

   | Chênh lệch | n | % tăng | Trung vị |
   | --- | --- | --- | --- |
   | Cao (≥ p80) | 117 | 57% | **+1,5%** |
   | Giữa | 209 | 74% | +3,3% |
   | Thấp (≤ p20) | 59 | 90% | **+10,4%** |

   Gradient đơn điệu ở cả 3 kỳ hạn 21/42/63 ngày — chênh cao thì kết quả kém, đúng cơ chế hồi quy của premium. Hạn chế: 16 tháng dữ liệu, một chế độ thị trường, cửa sổ chồng lấn — đọc là bằng chứng sơ bộ mạnh, không phải kết luận cuối. App hiển thị banner "VÙNG BÁN VN theo chênh lệch" trên biểu đồ premium khi percentile ≥ 80. **v2 (2026-07-10, `scripts/premium-exit-v2-study.ts`):** gradient lặp lại ở cả 2 nửa era + thắng placebo cùng-n, nhưng CI trung thực cho thấy nửa sau chỉ có ≈1-2 cửa sổ độc lập H63 ⇒ vẫn SƠ BỘ, re-run khi ≥36 tháng dữ liệu. Toàn bộ nghiên cứu Vùng bán 2026-07-10 (grid sell-preset NO-GO, Top Hunter NO-GO, sell-timing "đừng bán ngay" GO): `docs/sell-zone.md`.
5. **Yếu tố chưa/không đưa vào:** GPR, VIX và COT positioning đã test và bị loại (bảng trên + section COT 2026-07-05 bên dưới). NHTW mua vàng (dữ liệu quý, trễ), chính sách NHNN (không có feed máy đọc) — ứng viên cho vòng sau.

   **Premium gating (bằng chứng sơ bộ, 2026-06 — ĐÃ BỊ BÁC 2026-09-15, xem mục dưới):** `premium-buy-study.ts` trên 488 ngày SJC cho thấy gradient rõ ở 21 ngày: tín hiệu mua + premium thấp (≤p20) → trung vị +7,6%; premium cao (≥p80) → +1,8%. Gradient yếu dần ở 42–63 ngày (bull trend lấn át). Tuy nhiên, chỉ n=7 tín hiệu premium cao, và dữ liệu 488 ngày chỉ phủ một chế độ thị trường — chưa đủ 2 giai đoạn độc lập để vào preset. Premium vẫn giữ trọng số 0% trong preset cho đến khi có thêm dữ liệu đa chế độ.

### Cổng premium ≥p80 — HẠ CẤP xuống ghi chú chi phí (2026-09-15)

Tái lập: `npx tsx scripts/premium-gate-study.ts`

Gradient n=7 ở trên từng được ship thành một **cổng chặn**: `guidance.ts` trả level `premium-wait` ("đợi chênh lệch hạ về vùng thấp hơn"), `return` SỚM trước cả ma trận điểm-mua × săn-đáy, UI hiện chip "CHỜ CHÊNH HẠ". Nó đè cả tín hiệu preset lẫn tín hiệu đáy.

Đo lại ở **đúng kỳ hạn quyết định của cổng** — người mua hoãn vài phiên, không phải 126 phiên — trên 583 phiên VN (p80 = 16,23%), đếm cụm độc lập bằng lưới khối cố định:

| H (phiên) | cụm độc lập | P(giá SJC rẻ hơn sau H) | baseline | chênh |
| --- | --- | --- | --- | --- |
| **5** | **40** | 34,7% | 40,0% | **−5,2pt (SAI DẤU)** |
| 10 | 26 | 36,4% | 35,8% | +0,7pt |
| 21 | 16 | 42,4% | 33,5% | +8,9pt |
| 63 | 7 | 35,0% | 32,1% | +2,9pt |

H=5 là ô có công suất cao nhất (40 cụm — nhiều hơn mọi preset) và nó nói **ngược** lời khuyên: đợi khi chênh cao thì giá rẻ hơn ÍT hơn bình thường. Các ô còn lại đúng dấu nhưng +8,9pt / +2,9pt đều chìm dưới MDE (±25..37pt ở 7–16 cụm).

Phạm vi cổng đã chặn: **118/583 ngày = 20,2%**, trong đó **8/45 = 18% số ngày preset báo mua** (tất cả 6m, gom thành **2 cụm**: 22–30/04/2025 và 08–10/09/2025).

**Trung thực về giới hạn:** kết cục 8 ngày bị đè là H21 4/8 tăng trung vị +0,4%, H63 3/8 trung vị 0,0% — 2 cụm thì **không chứng minh được cổng gây hại**. Lý do hạ cấp là **thiếu bằng chứng chống lưng** (n=7, một chế độ, và ô công suất cao nhất sai dấu), KHÔNG phải đã đo được thiệt hại. Hai điều khác nhau.

Đã đổi: bỏ `return` sớm — chênh cao nối vào `how` của ô thật thành ghi chú chi phí, giữ nguyên level/tone đã kiểm chứng; `criteria.ts` đổi "vùng bán tốt, tránh mua" → "chi phí mua vàng VN đang đắt so với thế giới"; `summary.json` lên 1.4 (`blocksBuying` → `expensiveVsWorld`); chip UI "CHỜ CHÊNH HẠ" → "QUAN SÁT". `premium-wait` giữ trong union type nhưng không còn bắn. Engine, `zoneOf`, trọng số preset: KHÔNG đụng.

**Nguyên tắc rút ra — cổng đã ship phải chịu đúng cổng đang áp cho cái mới.** Yêu cầu bằng chứng để THÊM mà miễn trừ cái đã có = thiên lệch tích tụ: mọi thứ lọt vào trước khi siết kỷ luật được miễn vĩnh viễn. Hạ về mức mô tả là trạng thái mặc định an toàn, không cần bằng chứng mới.

### Thêm premium/tỉ giá vào vùng mua và Bottom Hunter — NO-GO (2026-09-15)

Phản biện chéo 3 model, kết luận đồng thuận. Lý do là **công suất**, không phải cơ chế.

Cụm độc lập của đuôi thấp (≤p20 = 7,99%) trên 583 phiên, lưới khối cố định:

| H | ngày ≤p20 | cụm (train/test) |
| --- | --- | --- |
| 21 | 96 | **7** (4/3) |
| 63 | 69 | **3** (2/1) |
| 126 | 65 | **1** (1/0) |

`clusterBootstrapCiWeighted` trả `null` dưới 3 cụm ⇒ H=126 không đo được, H=63 test chỉ 1 cụm. 583 dòng là ảo giác; đơn vị mẫu thật là 1–7.

Thêm ba lý do độc lập:

1. **Đếm trùng.** Giá SJC ≈ XAU × USD/VND × hệ số × (1+premium) — USD/VND nằm ngay trong mẫu số của premium, không phải tín hiệu thứ hai.
2. **Không phải 2 chế độ.** Premium theo quý: 3,7 (Q1-25) → 14,4 → 15,4 → 15,1 → 14,2 → 12,8 → 5,9 (Q3-26); Spearman(premium, thời gian) = −0,089; ACF1 0,943 vs 0,931 và sd 4,59 vs 5,20 giữa hai nửa. Đây là **một plateau 14–15% kéo 5 quý kẹp giữa hai đuôi thấp ngắn** — n_độc_lập ≈ 2, đúng họ lỗi `sell-preset-deep-study`.
3. **Đa kiểm định đã tiêu.** ~180 cấu hình qua 4 study premium trên cùng 583 dòng ⇒ bất kỳ "pass" tương lai nào trên tập này không phải bằng chứng.

**Bottom Hunter có lý do cứng hơn:** `backfill-vn` **vá lùi** các dòng VN ⇒ đầu vào ngày cũ đổi hồi tố ⇒ `prob` tại nút cũ đổi ⇒ **vỡ bất biến walk-forward** (`tests/bottom.test.ts`). Kèm theo: lịch sử dán nhãn co từ 15 năm xuống 457 dòng, lưới thưa STEP=3 còn ~152 hàng, chia 4 bin ≈ 38 hàng/bin ⇒ CI thành `null` ⇒ UI in % không có CI. Recency-504 cũng vô hiệu (mọi tuổi < 504).

**Mốc mở lại:** H=21 cần ≥5 cụm/nhánh ≈ 37 tháng dữ liệu → ~2028-03. H=63 ≈ 48 tháng → ~2029-02. H=126 và Bottom Hunter 6–9 năm → thực tế đóng. `premium-brake-study` là ứng viên duy nhất đáng chạy lại (NO-GO cỡ mẫu, không phải NO-GO tín hiệu) — **đúng một lần**, cấu hình đăng ký trước, không lưới.
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

### Lợi suất THỰC (FRED DFII10) làm sub-signal vĩ mô thứ tư — NO-GO (2026-09-05, P1-3)

Ô trống hợp lệ cuối của đề xuất "thay ^TNX bằng DFII10": hai lần loại trước đều là thay-thế
1-đổi-1 trong tiêu chí vĩ mô trung bình cộng; sau v4 (`macroSub`) mới hỏi được câu khác —
**cho grid tự chọn trọng số** cho lợi suất thực cạnh 3 sub-signal kia. `scripts/dfii10-decomp-study.ts`:
lưới 7D (6D + RDX, bước 10%, 8.008 bộ × 4 ngưỡng), cùng mapping `yieldScore` cho cả hai chuỗi
(so bản chất CHUỖI thực-vs-danh-nghĩa, không so hai cách chấm điểm), cùng cổng 2 giai đoạn
`n≥25` + `excess>0` ở cả train `<2019` và test `≥2019`, thêm placebo xáo-khối-63-phiên riêng
cho DFII10 (200 lượt, giữ tự tương quan).

| Kỳ hạn | Best 6D (v4, đang phát hành) | Best 7D (+RDX) | Δ min-excess | Placebo (train / test) |
| --- | --- | --- | --- | --- |
| 1 tháng | +30,8pt | +30,8pt | +0,0pt | không vượt / không vượt |
| 3 tháng | +32,2pt (trần) | +32,2pt (trần) | +0,0pt (trần) | không vượt / không vượt |
| 6 tháng | +22,4pt (trần) | +22,4pt (trần) | +0,0pt (trần) | **vượt** (82,7 vs p95 74,8) / **vượt** (100 vs 98,4) |

Δ=0,0pt ở 3/6 tháng KHÔNG tự nó là bằng chứng loại (test đã ở trần 100% ⇒ `exTe` đóng băng —
đúng bệnh trần v4 gặp), nên chạy tiếp đúng 3 chẩn đoán v4 đã dùng. **Chúng nói ngược v4:**

- **RDX CẮT tín hiệu, không mở.** 6 tháng: 295 ngày (7D) vs 371 (6D), **cụm độc lập 14 = 14**,
  năm câm 2023 co lại 9→5 ngày. 3 tháng: 69 vs 87 ngày, cụm 10 vs **12** (giảm). v4 pass được
  vì làm điều ngược lại (cụm 15→18, 16→29, mở khóa 2023).
- **Ngày MẤT vẫn đúng 96,0% (6 tháng) / 95,2% (3 tháng)** — RDX loại bỏ những ngày đã đúng
  sẵn ⇒ chỉ là siết ngưỡng, không phải lọc sai-số.
- **Tương quan điểm RDX/YLD = 0,775, trùng điểm 50,7%** trên 4.276 ngày ⇒ hai chuỗi phần lớn
  là một tín hiệu; grid dùng RDX như một bản ^TNX hơi khác pha để cắt bớt ngày, không phải để
  thêm thông tin.
- Riêng 1 tháng (kỳ hạn duy nhất KHÔNG bị trần, tức duy nhất đo được thật): top-1 của 7D vẫn
  là **cấu hình 6D không dùng RDX**, và cấu hình tốt nhất có RDX>0 **thất placebo cả 2 giai đoạn**.

**Kết luận: NO-GO — không đưa DFII10 vào `macroSub`, engine không đổi.** Đóng dứt điểm đề
xuất #4 (lần thứ 3, lần này ở đúng bối cảnh của nó). Ba lần loại ở ba thiết kế khác nhau ⇒ đừng mở
lại mà không có cơ chế mới, không phải cách chấm điểm mới. Đường live giữ nguyên ràng buộc:
`fetchYield10y` CHỈ thử ^TNX, DFII10 chỉ làm dự phòng nguội khi cold-start (nếu tự tráo
real↔nominal giữa các lần cron thì điểm macro của một ngày quá khứ tự đổi — vỡ tính kiểm chứng
được của backtest, xem comment `scripts/fetch.ts`). Tái lập: `npx tsx scripts/dfii10-decomp-study.ts`.

## Evidence là GROSS trên XAU/USD — chi phí VN đo riêng (2026-09-04)

Mọi % `trainFav/testFav` và `medianTestReturnPct` ở trên đo trên **XAU/USD**: giá thế giới,
**không spread, không phí**. Người mua vàng miếng VN vào ở `sjcSell` và ra ở `sjcBuy` nên nhận
ít hơn. Vì backtest chạy 15 năm XAU/USD, **KHÔNG trừ spread VN vào bảng đó** (sẽ bóp méo con số
đã kiểm chứng) — chi phí đo riêng bằng giá SJC niêm yết thật:

```text
Lịch sử SJC: 572 ngày, 2025-02-08 → 2026-09-04
Spread mua-bán: trung vị 1,66%, min 0,66%, max 3,88%  (p80 2,09%, p90 2,50%, p95 2,83%)

H(ngày) | n   | RÒNG trung vị | %dương | CI95 %dương  | GROSS trung vị | chênh
     30 | 540 |         1,17% | 58,5%  |     39,6–77% |          2,73% | 1,55pt
     60 | 510 |         4,53% | 62,4%  |   36,1–87,6% |          5,89% | 1,36pt
     90 | 480 |        10,15% | 69,2%  |     37,9–95% |         11,76% | 1,60pt
    180 | 390 |        24,74% | 76,2%  |    49,2–100% |         26,57% | 1,83pt
```

`net = sjcBuy[t+H]/sjcSell[t] − 1`, `gross = sjcSell[t+H]/sjcSell[t] − 1`; CI block-bootstrap
block=H (cửa sổ kề nhau chồng lấn). Chênh net-vs-gross ổn định ~1,4–1,8pt = đúng một lần spread.

**Giới hạn trung thực:** 19 tháng, MỘT chế độ bull, CI %dương rộng tới 39,6–77% ở H30 ⇒ đây là số
**mô tả** giai đoạn đã có, KHÔNG phải evidence 2 giai đoạn. Không được trình bày như tỉ lệ đúng đã
kiểm chứng. Câu hỏi thật — "net return **trên đúng các ngày preset báo mua** còn dương không" — cần
≥2 giai đoạn SJC, hiện chưa đủ (P1-4 trong `docs/audit-and-improvement-proposals-2026.md`).

Hằng hiển thị: `VN_ROUND_TRIP` trong `src/lib/vn-gold.ts` (cố tình KHÔNG khóa bằng test — số trôi
mỗi lần cron thêm ngày; refresh khi mốc lịch sử đổi đáng kể). UI: `grossNote` trong
`src/components/Dashboard.tsx`, gắn cạnh cả 4 chỗ hiện % evidence.

## Tái lập kết quả

```bash
npm run collect                                    # sinh timeline.json từ dữ liệu thật (đã gồm yield + momentum)
npx tsx scripts/presets-study.ts                   # bảng tuyển chọn 3 kỳ hạn (4D search khi momentum có trong timeline)
npx tsx scripts/factor-study.ts                    # ablation: bật/tắt lợi suất / VIX / GPR
npx tsx scripts/factor-study-momentum-offline.ts   # ablation momentum: 3D vs 4D, dùng timeline.json có sẵn
npx tsx scripts/premium-buy-study.ts               # gradient premium cho tín hiệu mua (488 ngày SJC)
npx tsx scripts/premium-gate-study.ts              # cổng premium ≥p80: đúng kỳ hạn quyết định + cụm độc lập (BÁC "đợi chênh hạ")
npx tsx scripts/optimize-study.ts                  # study gốc v1 (1 kỳ hạn, HORIZON=21|63|126)
npx tsx scripts/horizon-study.ts                   # hiệu quả cấu hình mặc định theo 4 kỳ hạn
npx tsx scripts/consensus-study.ts                 # hiện trạng Toàn cảnh + grid đa kỳ hạn + đồng thuận k/3 (placebo đồng-n)
COT_DIR=<thư mục .txt> npx tsx scripts/cot-study.ts # ablation COT positioning (cần tải deacotYYYY.zip từ cftc.gov trước)
npx tsx scripts/macro-decomp-study.ts              # tách sub-signal vĩ mô DXY/FED/YLD, grid 6D (tự fetch DXY Yahoo lần đầu) — study tuyển v4
npx tsx scripts/verify-preset-evidence.ts          # đối chiếu PRESETS[].evidence với tính lại trên timeline hiện tại
npx tsx scripts/vn-net-return.ts                   # chi phí vòng mua-bán SJC thật (spread + net vs gross) — section GROSS ở trên
npx tsx scripts/seasonality-detrend-study.ts       # mùa vụ: 9 biến thể ngưỡng × 3 kỳ hạn, 4 cổng (NO-GO 0/27)
npx tsx scripts/seasonality-ablation.ts            # mùa vụ: giữ vs bỏ season trên trục presetComposite
```

Preset khai báo tại `src/lib/types.ts` (`PRESETS`) — số liệu evidence trong code phải khớp bảng "3 preset ĐANG PHÁT HÀNH (v4/v4.1)"; đổi preset thì cập nhật cả hai.
