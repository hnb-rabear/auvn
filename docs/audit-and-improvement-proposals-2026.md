# Đánh Giá Toàn Diện Hệ Thống & Đề Xuất Nâng Cấp — AUVN (Gold Zone Advisor)

**Ngày đánh giá:** 04/09/2026  
**Người thực hiện:** Bé Homi (Hermes Agent)  
**Phạm vi:** Toàn bộ kiến trúc dữ liệu, thuật toán định lượng (Presets v4/v4.1, Bottom Hunter, Bear DCA), tính thực tế tại thị trường vàng Việt Nam và hạ tầng triển khai.

---

## I. Tổng Quan & Điểm Sáng Dự Án (Strengths)

1. **Kỷ luật định lượng hiếm thấy ở dự án cá nhân:**
   - Phân chia nghiêm ngặt Out-of-Sample (Train 2009–2018 / Test 2019–2026).
   - Có kiểm định Placebo cùng cỡ mẫu (Same-n placebo, Contiguous-block placebo) để loại bỏ ảo tưởng thống kê.
   - Sẵn sàng loại bỏ các biến tưởng như "thần thánh" nhưng gây nhiễu thực tế (GPR, VIX, M2, Breakeven Inflation, COT positioning).
2. **Kiến trúc Zero-Cost thông minh:**
   - Dùng Git repository làm cơ sở dữ liệu thời gian thực.
   - GitHub Actions chạy tính toán trước (Precomputed static data), Client chỉ tải JSON tĩnh, loại bỏ hoàn toàn chi phí máy chủ và tránh lỗi CORS.
3. **Ý thức cao về tính trung thực thống kê:**
   - Dùng `STEP = 3` để giảm hiện tượng Pseudo-replication (tự tương quan chuỗi).
   - Tách bạch giữa tín hiệu sóng ngắn (Presets) và chiến lược tích sản (Bear DCA).

---

## II. Các Vấn Đề Kỹ Thuật & Hạn Chế Cốt Lõi (Critical Flaws & Edge Cases)

### 1. Sự Phi Thực Tế của Sóng 1 Tháng do Chênh Lệch Mua – Bán (Bid-Ask Spread Drag)
- **Hiện trạng:** Preset 1 tháng báo tỷ lệ đúng 89.1%, trung vị lợi nhuận test là `+4.1%` (tính trên giá thế giới XAU/USD).
- **Vấn đề:** Tại thị trường Việt Nam, spread Mua – Bán của SJC và Vàng Nhẫn thường neo ở mức `1.5% – 3%` (thậm chí lên tới 4% khi thị trường biến động mạnh).
- **Hệ quả:** Sau khi trừ phí spread tiệm vàng ăn đứt, lợi nhuận thực tế (Net Return) của sóng 1 tháng gần như về 0 hoặc âm. Việc khuyến nghị lướt sóng 1 tháng cho vàng vật chất tại VN là thiếu khả thi.

### 2. Dữ Liệu Vàng Nhẫn Bị Trượt (Fall-Through Bug)
- **Hiện trạng:** Giao diện hiển thị `Nhẫn mua / bán: — / —`.
- **Nguyên nhân:** Trong `fetch.ts`, khi các nguồn BTMC và SJC bị chặn IP/WAF, hệ thống tự động fallback sang `cafef.vn`. Mã nguồn CafeF scraper được định nghĩa chỉ cào SJC, gán cứng `ringBuy: null, ringSell: null`.
- **Hệ quả:** Mất hoàn toàn dữ liệu Vàng Nhẫn 9999 — loại tài sản được người dân gom tích sản nhiều nhất hiện nay.

### 3. Nguy Cơ Overfitting Ở Preset v4.1 (Tách Sub-signal Vĩ Mô)
- **Hiện trạng:** Nhận thấy năm 2023 bị "câm" (0 tín hiệu mua trong một năm tăng giá mạnh), tác giả ép `FED = 0` ở các preset 3m và 6m để mở khóa tín hiệu (được 16 tín hiệu mua).
- **Hạn chế:** Việc thay đổi trọng số để giải quyết một năm cụ thể trong quá khứ là dấu hiệu điển hình của Overfitting (khớp quá mức vào dữ liệu lịch sử). Trong tương lai khi chu kỳ Fed đảo chiều phức tạp, bộ trọng số này có thể mất tính tổng quát.

### 4. Bất Đối Xứng Giữa Lợi Suất Thực (Real Yield) và Lợi Suất Danh Nghĩa (`^TNX`)
- **Hiện trạng:** Thuật toán dùng lợi suất danh nghĩa Mỹ 10 năm (`^TNX`) làm trọng số vĩ mô lớn (20% – 40%).
- **Hạn chế:** Giá vàng toàn cầu phản ứng trực tiếp với **Lợi suất thực (Real Yield = Nominal Yield − Expected Inflation)**. Giai đoạn 2024–2026, lạm phát neo cao khiến lợi suất thực giảm dù lợi suất danh nghĩa tăng, dẫn đến vàng bứt phá đỉnh lịch sử. Việc dùng `^TNX` danh nghĩa khiến hệ thống đánh giá vĩ mô bị "lệch pha" với dòng tiền thông minh.

### 5. Rủi Ro Thanh Khoản Thực Tế & Can Thiệp Hành Chính Tại VN
- **Hiện trạng:** Thuật toán giả định rằng khi có tín hiệu mua là nhà đầu tư có thể mua được vàng theo giá niêm yết.
- **Thực tế:** Thị trường VN thường xuyên xảy ra tình trạng "cháy hàng", giới hạn mua 1–2 chỉ/người, phải bốc số online, hoặc tiệm ngừng giao dịch. Khi NHNN can thiệp thị trường (bán vàng miếng trực tiếp, siết hóa đơn), chênh lệch SJC-TG biến động dị biệt, bẻ gãy mọi tương quan kỹ thuật của XAU/USD.

### 6. Điểm Mù Cuối Tuần (Weekend Desync)
- **Hiện trạng:** XAU/USD đóng cửa từ đêm thứ 6 đến rạng sáng thứ 2.
- **Thực tế:** Các tiệm vàng VN vẫn mở cửa giao dịch vào thứ 7 và Chủ Nhật. Nếu có biến cố địa chính trị nổ ra cuối tuần, giá vàng VN nhảy múa tự do trong khi hệ thống AUVN bị "đóng băng" dữ liệu thế giới.

### 7. Hiệu Ứng Vía Thần Tài Gây Bẫy Đu Đỉnh Ngắn Hạn
- **Hiện trạng:** Tiêu chí Thống kê (Historical stats) chấm điểm cộng mùa vụ cho tháng 1 - tháng 2 âm lịch (hiệu ứng Tết & Thần Tài).
- **Thực tế:** Giá thế giới không có chu kỳ này. Tại VN, sát ngày Thần Tài giá bị đẩy lên đỉnh và spread bị kéo giãn tối đa, sau ngày Thần Tài giá tụt ngay lập tức. Nếu hệ thống báo "VÙNG MUA" vào sát ngày Thần Tài sẽ tạo bẫy tâm lý cho người dùng.

---

## II-bis. Đính Chính Sau Đối Chiếu Code & Dữ Liệu (2026-09-04)

Mục II viết trước khi đối chiếu source. Bảy cáo buộc kiểm lại: 4 đúng-một-phần, 3 sai. Lộ trình ở Mục III dựng trên bản đính chính này, không dựng trên Mục II.

| # | Cáo buộc Mục II | Đối chiếu code/data | Phán quyết |
| --- | --- | --- | --- |
| 1 | Spread ăn hết lãi preset 1m, net về 0 hoặc âm | Spread SJC thực đo trên 572 phiên `public/data/history/vn-gold.json`: p10 1,24% / trung vị 1,66% / p90 2,50% / max 3,88%. Vòng 30 ngày mua-giá-bán → bán-giá-mua: **trung vị +1,23%, 59% số lần dương** (gross sell→sell +2,77%, 66%) | ĐÚNG HƯỚNG, SAI ĐỘ LỚN. Spread ăn ~1,5pp, không ăn hết. Lỗ hổng thật là **trình bày**: `medianTestReturnPct` là số XAU/USD nhưng UI hiện thẳng "trung vị lãi +4,1%" không nhắc phí (`src/components/Dashboard.tsx:584`). Caveat: mẫu 2025-02→2026-09 (bull), chưa điều kiện theo tín hiệu preset |
| 2 | cafef hardcode `ringBuy/ringSell: null` làm **mất** dữ liệu nhẫn | Data còn nguyên 49 phiên nhẫn (2026-06-11→2026-09-03). `run.ts:195` đã giữ nhẫn cũ trong cùng ngày. Gốc lỗi khác: `prices` lấy `effective` = entry **cuối cùng**, entry đó nhẫn null → hiện `—` (`scripts/run.ts:215`) | ĐÚNG TRIỆU CHỨNG, SAI GỐC. Là lỗi hiển thị, không mất dữ liệu |
| 3 | v4.1 ép `FED = 0` ở 3m/6m để mở khóa 2023 | Đảo chiều: v4.1 chính là bản **reopen bỏ FED=0**, Fed nhỏ >0 (`types.ts:353`, `types.ts:370`; `docs/presets.md:60`). FED=0 chỉ còn ở 1m, và ở 1m **không cấu hình nào bắn được 2023** — chọn theo phủ-max n train | SAI CƠ CHẾ, ĐÚNG LO NGẠI. Luật chọn "ưu tiên cấu hình bắn 2023" vẫn là chọn-khi-biết-test, `docs/presets.md:58` tự ghi nhận |
| 4 | Phải thay `^TNX` bằng `DFII10` | DFII10 đã đo và loại 2 lần: `docs/bottom.md:312+` (thắng test, **thua train** — overfit chế độ) và `docs/accumulation.md:55` (test +10,7%, train âm). `^TNX` chọn có lý do ghi rõ ở `docs/presets.md:54` | LÝ THUYẾT ĐÚNG, ĐỀ XUẤT BỎ QUA BẰNG CHỨNG. Ô trống hợp lệ duy nhất: DFII10 chưa vào lưới `macroSub` của `macro-decomp-study.ts` |
| 5 | Không mô hình được thanh khoản/can thiệp NHNN | Đúng, không mô hình được. Nhưng khan hàng đã có tín hiệu: spread ≥2,5% → điểm −1 (`src/lib/criteria.ts:240-245`) | ĐÚNG, đã phòng hộ một phần |
| 6 | Thiếu badge cuối tuần | Badge đã tồn tại: `Dashboard.tsx:912-915` qua `isGoldMarketClosed` (`src/lib/freshness.ts:18`). VN history đủ 7 ngày/tuần (82 dòng mỗi weekday) | SAI — đã có |
| 7 | Chấm mùa vụ theo tháng 1–2 **âm lịch** (Thần Tài) | `seasonalityTable` dùng **dương lịch**, lợi suất XAU 63 phiên tới, không biết gì âm lịch (`src/lib/criteria.ts:516-528`). Ngày Thần Tài không hề được nhận diện | SAI CHI TIẾT, nhưng chạm đúng một bug khác — xem #8 |

### Hai bug Mục II bỏ sót (quan trọng hơn phần lớn Mục II)

**#8 — Signal mùa vụ thoái hóa gần thành hằng số dương.** Ngưỡng tuyệt đối ±2% gặp tài sản xu-hướng-tăng:

```text
T1 +4,06 [+1]   T2 +2,01 [+1]   T3 +1,23        T4 -0,74
T5 +1,96        T6 +3,09 [+1]   T7 +3,69 [+1]   T8 +1,12
T9 +0,64        T10 +2,63 [+1]  T11 +4,15 [+1]  T12 +5,00 [+1]
```

**7/12 tháng cho +1, 0/12 tháng cho −1** — chỉ đội điểm mua, gần như không mang thông tin. Nghi vấn cùng họ ở `pctScore` (percentile giá 1y/3y) đã **ĐO VÀ LOẠI** 2026-09-04: ngưỡng tương đối nên cả hai phía vẫn bắn trong test (pct1y 202/1932 phiên MUA, pct3y 60/1932) ⇒ không thoái hóa, không vào grid mùa vụ. Xem "Bằng chứng P1-2".

**Kết cục #8 (đóng 2026-09-04, P1-1b-detrend):** mô tả bug ĐÚNG, nhưng **không có bản sửa nào thắng cổng**. Đo 9 biến thể ngưỡng × 3 kỳ hạn (`scripts/seasonality-detrend-study.ts`): de-trend/rank đúng là mở lại phía âm (`demean1` → 37,1/29,7/33,2) và excess nhìn hấp dẫn (`demean2` @63 test +15,5pt), nhưng **0/27 ô qua cổng** — CI95 trùm baseline mọi ô và không ô nào vượt placebo chọn ngẫu nhiên **cùng số tháng**. Chọn 2–3 tháng bất kỳ trong 12 cho excess tương đương ⇒ tháng lịch không mang thông tin, không phải "chưa tìm đúng ngưỡng". `abs2` đang phát hành cũng không qua cổng nào. Ablation giữ-vs-bỏ (`seasonality-ablation.ts`, trục `presetComposite`): bỏ season tệ hơn 1,2–1,9pt ở 3/6 ô và giảm n cả 6 ô, **nhưng Δ đó cũng là nhiễu** (n=16–32, CI [46–100]). ⇒ **GIỮ NGUYÊN**, vì cả hai hướng đổi đều không có bằng chứng; season chỉ chiếm 1/4 tiêu chí `stats` mà `stats` nắm 0,1–0,2 trọng số preset nên ảnh hưởng thực nhỏ ở mọi hướng. Bảng đầy đủ: `docs/presets.md` "Mùa vụ theo tháng — de-trend NO-GO".

**#9 — Tiêu chí chênh lệch VN không tham gia bất kỳ preset nào đang phát hành.** Cả 3 preset đặt `premium: 0` (`types.ts:335,352,369`). Mục II phàn nàn hệ thống xa rời thực tế VN nhưng không nêu việc VN đã bị loại khỏi phần tính điểm. Lý do trong code là hợp lệ (chưa đủ 2 giai đoạn kiểm chứng) — nhưng đó là hạn chế lớn nhất của hệ thống, đáng đứng đầu Mục II.

**#10 — Look-ahead trong backtest ở đúng signal mùa vụ của #8** — ✅ **ĐÃ SỬA 2026-09-04** (phát hiện cùng ngày khi truy `fusion.evidence.test.ts` đỏ). `scripts/backtest.ts:48` tính `seasonalityTable(closes, dates)` **một lần trên TOÀN chuỗi** rồi truyền cho mọi điểm lịch sử:

```ts
const season = seasonalityTable(closes, dates);   // MỘT LẦN, toàn chuỗi
...
statsCriterion(closesUpTo, datesUpTo, season),     // dùng cho mọi điểm quá khứ
```

Điểm năm 2010 được chấm bằng trung bình tháng tính từ chính tương lai của nó. Đường live sạch (`criteria.ts:570` tự tính khi không được truyền) — chỉ lịch sử bị.

Hệ quả đo được: Yahoo phục vụ **cửa sổ trượt ~20 năm**, nên mỗi lần cron bar đầu chuỗi rụng (2009-07-06 → 2009-09-03), trung bình tháng đổi: **T5 2,30→1,96 và T8 2,07→1,12 tụt qua ngưỡng ±2** ⇒ 109 điểm train lệch `stats` ±0,25 ⇒ `2010-11-04` (một ngày SAI) chen vào top-60 placebo ⇒ `favTop` 91,7→90,0 ⇒ `orthogonalTrainPt` 1,7→**3,3**. `favB/trainN/fullN/CI` không đổi, nên **7/8 hằng vẫn khớp** — chỉ test placebo (xếp hạng trong cụm điểm sát nhau) đủ nhạy để bắt.

Đây là bug nghiêm trọng hơn #8: #8 làm signal vô dụng, #10 làm **evidence không tái lập được**.

**Bản sửa (đóng 2026-09-04):** call site đổi thành `statsCriterion(closesUpTo, datesUpTo)` — mỗi điểm tự dựng bảng mùa vụ từ tiền tố của nó, cùng đường với live. Chi phí đo được 4276 gọi ≈ 1,7s ⇒ không cần cache. Khóa bằng test `walk-forward: cắt bớt bar tương lai KHÔNG đổi điểm quá khứ` (`tests/engine.test.ts`): `runBacktest(bars)` vs `runBacktest(bars.slice(0,1100))`, `scores`/`composite` các ngày chung phải bằng nhau. **Đã kiểm test có tác dụng**: revert call site làm test đỏ với `stats 0,75 vs 0,5` tại `2021-01-26`. Golden bucket snapshot cập nhật từ output thật (mùa vụ walk-forward khác toàn chuỗi ⇒ phân bố zone dịch, xuất hiện `strong-buy`; `observations` giữ 216).

**Re-validate (P1-1b, xong cùng ngày):** timeline regenerate bằng `npm run collect`, rồi:

- `verify-preset-evidence.ts`: cả 3 preset lệch ≤1,2pt mọi ô, **vẫn vượt cổng** (train +30,1/+33,4/+20,8pt, test +29,4/+31,2/+22,4pt); `monitor-presets` cả 3 `status=ok` ⇒ không hạ preset nào. Hằng `PRESETS[].evidence` ×3 cập nhật từ đầu ra script.
- `calc-fusion-evidence.ts`: **cả 8 số khớp nguyên bản trước đó** (kể cả `orthogonalTrainPt` 3,3) ⇒ bug chỉ đổi thứ tự xếp hạng trong cụm điểm sát nhau, không đổi tín hiệu. `monitor-fusion` `status=ok`. Nợ ở `src/lib/fusion.ts` + `docs/fusion.md` đã đóng.
- `bear-downside-conditioning-study.ts`: `conditioningWorks=false` giữ nguyên — không ứng viên nào đạt cổng ship (`composite-bins` beat placebo nhưng CIΔ chứa 0).
- `consensus-study.ts`: kết luận không đổi — đồng thuận k/3 vẫn không vượt placebo đồng-n nhất quán ⇒ claim discipline hiện tại (display aggregation, không claim "nhiều preset đồng ý = chính xác hơn") vẫn đúng.
- **Số cứng user-facing giờ có script tái lập.** `src/lib/guidance.ts` (level `headwind`) và `Dashboard.tsx` (verdict-note vùng bán) in các số theo năm dẫn xuất từ composite mà TRƯỚC ĐÓ không script nào tái lập được — chính họ bug này. Đã viết `scripts/sellzone-regime-study.ts` (thống kê MÔ TẢ: 396 ngày `composite ≤ −40` = 9,3% lịch sử; 1 tháng median gộp −0,3%, 44,9% cao hơn; 6 tháng ĐẢO DẤU theo regime — bull 2009/2010/2019/2024/2025 cao hơn 98,5–100%, yếu 2011/2016/2018/2022/2023/2026 thấp hơn 67–100%) và sync text theo output thật (danh sách năm cũ đã lệch: thiếu 2009/2019/2023/2026).

**(b) de-trend chưa làm** — tách sang P1-1b-detrend (dưới). Đo thật: bỏ look-ahead **KHÔNG** sửa #8 (walk-forward vẫn `−1: 0,0% / +1: 62,1%`, toàn chuỗi `0,0% / 58,9%`) ⇒ #8 và #10 là hai việc độc lập, không phải "hai bug cùng một hàm sửa một lần" như mô tả ban đầu.

---

## III. Lộ Trình Nâng Cấp (bản tối ưu 2026-09-04)

### Nguyên tắc lọc

Repo này có 13+ study và ~940 cấu hình đã đo với cổng train/test + placebo + CI. Mọi đề xuất phải qua 3 câu hỏi trước khi vào lộ trình:

1. **Đã đo chưa?** Nếu study đã kết luận NO-GO → không ship, chỉ mở lại khi có cơ chế mới hoặc dữ liệu mới.
2. **Đã có trong code chưa?** Kiểm `grep` trước khi đề xuất.
3. **Là lỗi trình bày hay lỗi mô hình?** Lỗi trình bày sửa được bằng vài dòng và không cần study.

Phần lớn Mục II thuộc loại 3. Đó là tin tốt — sửa rẻ.

### P0 — Sửa ngay, không cần study (giờ, không phải ngày)

| Việc | Chi tiết | Tiêu chí xong |
| --- | --- | --- |
| **P0-1. Hiển thị giá nhẫn theo entry non-null gần nhất** | `scripts/run.ts:215`: `ringBuy/ringSell` quét ngược lịch sử tìm entry non-null thay vì đọc mỗi `effective`; kèm nhãn tuổi ("giá nhẫn: ngày 03/09"). ~1 dòng + nhãn UI | UI hết `— / —` khi lịch sử còn dữ liệu nhẫn; test giữ mốc: entry mới nhất nhẫn null vẫn ra giá của phiên trước |
| **P0-2. Nhãn "chưa trừ spread" cho evidence preset** ✅ **XONG 2026-09-04** | `grossNote` (`Dashboard.tsx`) gắn cạnh **cả 4** chỗ hiện % evidence (consensus buy note, highConf note, khối kiểm chứng preset, khối `bt63`). Số VN đo thật bằng `scripts/vn-net-return.ts` trên 572 ngày SJC 2025-02→2026-09: spread trung vị **1,66%**, vòng 30 ngày ròng **+1,17%** vs gross +2,73% (58,5% số lần dương). Hằng: `VN_ROUND_TRIP` (`src/lib/vn-gold.ts`, cố tình không khóa test — trôi theo cron). KHÔNG trừ spread vào backtest | Người dùng không còn đọc +4,1% như tiền vào tay. Bảng đầy đủ 4 kỳ hạn + CI + giới hạn trung thực ở `docs/presets.md` section "Evidence là GROSS…" |
| **P0-3. Cảnh báo spread giãn ở tầng hiển thị** ✅ **XONG 2026-09-04** | `spreadBadge()` (`src/lib/vn-gold.ts`) + chip cạnh giá SJC (`Dashboard.tsx`): luôn hiện `spread X,XX%`, thêm `· GIÃN RỘNG` (chip đỏ) khi ≥ p90 = **2,50%**. Ngưỡng lấy từ `VN_ROUND_TRIP.spreadP90Pct` (percentile đo trên 572 ngày), **trùng đúng** ngưỡng −1 điểm của signal `spread` trong `criteria.ts` ⇒ badge và radar không thể nói khác nhau (khóa bằng test) | ✅ 4 test trong `vn-gold.test.ts`: bình thường ⇒ không cờ; đúng vạch p90 ⇒ có cờ (`>=`, không phải `>`); ngưỡng ≡ `criteria.ts`; thiếu giá / `sjcSell ≤ 0` ⇒ null (không chia 0, không bịa badge). Dùng percentile %, không hardcode VND — giá vàng đổi thì mức VND tuyệt đối vô nghĩa |

### P1 — Study bắt buộc trước khi ship (mỗi việc = 1 script + 1 doc + commit)

| Việc | Giả thuyết | Cổng nghiệm thu |
| --- | --- | --- |
| **P1-1(a). Mùa vụ: bỏ look-ahead** ✅ **ĐÓNG 2026-09-04** | `backtest.ts` tính `season` một lần toàn chuỗi ⇒ evidence không tái lập | ĐÃ SỬA: call site walk-forward + test invariant (đã kiểm test đỏ khi revert). Chi tiết ở #10 |
| **P1-1b. Re-validate sau P1-1(a)** ✅ **ĐÓNG 2026-09-04** | Sửa (a) đổi **toàn bộ timeline lịch sử** ⇒ mọi số dẫn xuất đổi theo | ĐÃ CHẠY: `verify-preset-evidence` (3 preset lệch ≤1,2pt, vẫn vượt cổng, không hạ preset nào), `calc-fusion-evidence` (8/8 số khớp nguyên bản), `bear-downside-conditioning-study` (`conditioningWorks=false` giữ), `consensus-study` (kết luận không đổi), `monitor-presets`/`monitor-fusion` đều `ok`. Thêm `scripts/sellzone-regime-study.ts` để số cứng user-facing có script tái lập. Chi tiết ở #10 |
| **P1-1b-detrend. Mùa vụ: de-trend ngưỡng** ✅ **ĐÓNG 2026-09-04 — NO-GO hai chiều, giữ nguyên** | #8 vẫn nguyên sau (a). Thay ngưỡng tuyệt đối ±2% bằng de-trend chéo-tháng / xếp hạng để mở lại phía âm | ĐÃ ĐO 2 vòng. Vòng 1 (`seasonality-detrend-study.ts`, 9 biến thể × 3 kỳ hạn, cổng n≥25 + excess>0 + CI không trùm baseline + vượt placebo cùng-số-tháng): **0/27 qua**. De-trend ĐÚNG mở lại phía âm như probe, nhưng CI trùm baseline mọi ô và không ô nào vượt placebo ⇒ tháng lịch không mang thông tin. `abs2` đang phát hành cũng không qua. Vòng 2 (`seasonality-ablation.ts`, trục `presetComposite`): bỏ season tệ hơn 1,2–1,9pt ở 3/6 ô, giảm n cả 6 ô — nhưng n=16–32 CI [46–100] ⇒ Δ cũng là nhiễu. **Cổng viết trước nói "fail thì bỏ về 0"; không bỏ, vì ablation cho thấy bỏ cũng không có bằng chứng** ⇒ giữ nguyên, ghi rõ là NO-GO hai chiều. Bảng: `docs/presets.md` |
| **P1-2. Kiểm `pctScore` percentile giá** ✅ **ĐÓNG 2026-09-04** | Nghi vấn cùng họ #8: percentile 1y/3y có thoái hóa thành −2 thường trực trong bull dài? | ĐÃ ĐO (`scripts/pctscore-study.ts`): **không** thoái hóa — phía MUA vẫn bắn trong test (pct1y 202/1932 phiên, pct3y 60/1932). Engine giữ nguyên. Bảng đầy đủ ở "Bằng chứng P1-2" bên dưới |
| **P1-3. DFII10 trong lưới `macroSub`** | Ô trống hợp lệ duy nhất của đề xuất #4: DFII10 chưa từng vào lưới 6D của `macro-decomp-study.ts` (2 lần loại trước ở bối cảnh khác) | Cùng cổng như `macro-decomp-study.ts`. Dự báo train âm như 2 lần trước — chạy để đóng dứt điểm câu hỏi, không phải để ship. Ship chỉ khi thắng cả train và test + qua placebo |
| **P1-4. Net-return có điều kiện tín hiệu** | P0-2 đo vô-điều-kiện. Câu hỏi thật: net return **trên đúng các ngày preset báo mua** còn dương không? | Cần ≥2 giai đoạn SJC. **Hiện chưa đủ** (19 tháng, 1 chế độ bull) ⇒ để mở, chạy lại khi đủ 36 tháng. Ghi thẳng "chưa đủ dữ liệu kiểm chứng" ở UI theo đúng luật backtest |

### Bằng chứng P1-2 — phân bố điểm percentile giá (2026-09-04)

Tái lập: `npx tsx scripts/pctscore-study.ts` (không ghi file, không đổi engine).

**Phương pháp.** Nguồn `fetchXau()` = `yahoo:GC=F`, **5032 bars, 2006-09-04 → 2026-09-04** — bars THẬT, không đọc `timeline.json` (giá timeline làm tròn `$0.1` mà `percentileRank` đếm strict-lower ⇒ tạo giá bằng nhau giả; timeline lại bắt đầu sau `WARMUP=756` nên mất 3 năm đầu của `pct3y`; và nó **không lưu** hai sub-score này). Điểm lấy bằng cách gọi chính `statsCriterion` rồi bốc signal theo `id` — không copy 5 dòng ngưỡng sang script (tránh hai bản sự thật). Lưới **dày, mỗi phiên**, vì đây là thống kê **mô tả phân bố điểm**, không suy diễn forward-return ⇒ **không có n độc lập, không CI, không p-value**; đừng đọc bảng này như evidence hiệu quả.

```text
── pct1y (cửa sổ 252 phiên) ──
năm    |    n | rank p10/p50/p90 |     −2 |     −1 |      0 |     +1 |     +2 | phía MUA
TẤT CẢ | 4781 |         10/75/99 | 1644  34.4% |  942  19.7% | 1116  23.3% |  574    12% |  505  10.6% | 1079  22.6%
2007   |   83 |        93/99/100 |   83   100% |    0     0% |    0     0% |    0     0% |    0     0% |    0     0%
2008   |  253 |         8/69/100 |   72  28.5% |   50  19.8% |   76    30% |   27  10.7% |   28  11.1% |   55  21.7%
2009   |  252 |        59/88/100 |  115  45.6% |   87  34.5% |   45  17.9% |    5     2% |    0     0% |    5     2%
2010   |  252 |        78/95/100 |  168  66.7% |   81  32.1% |    3   1.2% |    0     0% |    0     0% |    0     0%
2011   |  252 |        76/94/100 |  150  59.5% |   88  34.9% |   14   5.6% |    0     0% |    0     0% |    0     0%
2012   |  250 |         14/59/87 |   20     8% |   60    24% |  110    44% |   47  18.8% |   13   5.2% |   60    24%
2013   |  252 |           1/8/38 |    0     0% |    0     0% |   36  14.3% |   73    29% |  143  56.7% |  216  85.7%
2014   |  252 |          4/30/61 |    0     0% |   10     4% |  117  46.4% |   62  24.6% |   63    25% |  125  49.6%
2015   |  252 |          1/12/38 |    0     0% |    1   0.4% |   45  17.9% |   96  38.1% |  110  43.7% |  206  81.7%
2016   |  250 |         18/88/99 |  120    48% |   49  19.6% |   34  13.6% |   45    18% |    2   0.8% |   47  18.8%
2017   |  251 |         22/55/89 |   24   9.6% |   61  24.3% |  118    47% |   48  19.1% |    0     0% |   48  19.1%
2018   |  250 |          1/42/96 |   51  20.4% |   30    12% |   54  21.6% |   45    18% |   70    28% |  115    46%
2019   |  252 |        57/80/100 |   95  37.7% |   86  34.1% |   71  28.2% |    0     0% |    0     0% |    0     0%
2020   |  253 |        69/95/100 |  170  67.2% |   55  21.7% |   28  11.1% |    0     0% |    0     0% |    0     0%
2021   |  252 |         18/35/68 |    2   0.8% |   21   8.3% |  133  52.8% |   91  36.1% |    5     2% |   96  38.1%
2022   |  251 |          2/51/96 |   46  18.3% |   33  13.1% |   79  31.5% |   22   8.8% |   71  28.3% |   93  37.1%
2023   |  250 |        51/80/98  |   67  26.8% |   93  37.2% |   85    34% |    5     2% |    0     0% |    5     2%
2024   |  252 |        83/96/100 |  181  71.8% |   69  27.4% |    2   0.8% |    0     0% |    0     0% |    0     0%
2025   |  252 |        90/98/100 |  229  90.9% |   23   9.1% |    0     0% |    0     0% |    0     0% |    0     0%
2026   |  170 |         34/76/99 |   51    30% |   45  26.5% |   66  38.8% |    8   4.7% |    0     0% |    8   4.7%

── pct3y (cửa sổ 756 phiên) ──
năm    |    n | rank p10/p50/p90 |     −2 |     −1 |      0 |     +1 |     +2 | phía MUA
TẤT CẢ | 4277 |         9/85/100 | 1879  43.9% |  925  21.6% |  620  14.5% |  413   9.7% |  440  10.3% |  853  19.9%
2009   |   84 |        97/99/100 |   84   100% |    0     0% |    0     0% |    0     0% |    0     0% |    0     0%
2010   |  252 |        93/98/100 |  249  98.8% |    3   1.2% |    0     0% |    0     0% |    0     0% |    0     0%
2011   |  252 |        92/98/100 |  238  94.4% |   14   5.6% |    0     0% |    0     0% |    0     0% |    0     0%
2012   |  250 |         71/84/94 |   58  23.2% |  176  70.4% |   16   6.4% |    0     0% |    0     0% |    0     0%
2013   |  252 |          1/18/68 |    0     0% |   23   9.1% |   62  24.6% |   63    25% |  104  41.3% |  167  66.3%
2014   |  252 |          1/10/23 |    0     0% |    0     0% |    1   0.4% |  131    52% |  120  47.6% |  251  99.6%
2015   |  252 |           0/4/14 |    0     0% |    0     0% |    5     2% |   46  18.3% |  201  79.8% |  247    98%
2016   |  250 |         14/59/93 |   44  17.6% |   42  16.8% |  114  45.6% |   35    14% |   15     6% |   50    20%
2017   |  251 |         44/71/88 |   14   5.6% |  116  46.2% |  116  46.2% |    5     2% |    0     0% |    5     2%
2018   |  250 |         20/53/95 |   55    22% |   58  23.2% |   64  25.6% |   73  29.2% |    0     0% |   73  29.2%
2019   |  252 |        59/91/100 |  138  54.8% |   54  21.4% |   60  23.8% |    0     0% |    0     0% |    0     0%
2020   |  253 |        90/98/100 |  225  88.9% |   28  11.1% |    0     0% |    0     0% |    0     0% |    0     0%
2021   |  252 |         64/75/86 |   14   5.6% |  184    73% |   54  21.4% |    0     0% |    0     0% |    0     0%
2022   |  251 |         17/61/94 |   44  17.5% |   53  21.1% |   94  37.5% |   60  23.9% |    0     0% |   60  23.9%
2023   |  250 |         66/89/99 |  118  47.2% |   98  39.2% |   34  13.6% |    0     0% |    0     0% |    0     0%
2024   |  252 |        94/99/100 |  250  99.2% |    2   0.8% |    0     0% |    0     0% |    0     0% |    0     0%
2025   |  252 |        97/99/100 |  252   100% |    0     0% |    0     0% |    0     0% |    0     0% |    0     0%
2026   |  170 |        78/92/100 |   96  56.5% |   74  43.5% |    0     0% |    0     0% |    0     0% |    0     0%

pct1y: phía MUA (+1/+2) bắn 202/1932 phiên test (≥2019-01-01) = 10.5%; phiên MUA gần nhất 2026-08-03
pct3y: phía MUA (+1/+2) bắn  60/1932 phiên test (≥2019-01-01) =  3.1%; phiên MUA gần nhất 2022-11-09
```

**Phán quyết theo đúng cổng viết trước khi thấy số: ĐÓNG P1-2, engine giữ nguyên.** Cả hai signal đều bắn phía MUA trong giai đoạn test ⇒ **không** cùng họ #8. Khác biệt cơ chế: mùa vụ là signal **lịch** với ngưỡng tuyệt đối ⇒ 0/12 tháng cho −1 là một phía **chết hẳn, vĩnh viễn**; percentile là signal **trạng thái** với ngưỡng tương đối ⇒ cả 5 bucket đều dùng được (toàn kỳ pct1y −2 34,4% / MUA 22,6%; pct3y −2 43,9% / MUA 19,9%), và mọi phía đều lật khi trạng thái lật (2013–2015 gần như MUA hoàn toàn, 2024–2025 gần như −2 hoàn toàn).

Hai điều ĐƯỢC phép nói thêm, không hơn:

- `pct3y` không có phiên MUA nào sau 2022-11 (2023–2026 = 0/922). Đó là **phát biểu trạng thái đúng** — giá 2024–2026 thật sự ở đỉnh dải 3 năm (rank p50 = 99) — chứ không phải bằng chứng signal hỏng. Trong một bull nhiều năm, một signal đảo-chiều-theo-dải **phải** nằm ở phía bán; đòi nó bắn MUA là đòi look-ahead.
- Bảng này **không** trả lời "signal có mang thông tin không". Câu đó cần ablation (bỏ signal, đo lại min-excess qua cổng 2 giai đoạn) ⇒ thuộc P1-1, nơi trọng số `stats` đã là một chiều của grid. P1-2 chỉ đóng nghi vấn hằng-số.

Không đổi: `criteria.ts`, ngưỡng 10/30/70/90, cửa sổ 252/756, `PRESETS`, backtest, timeline, dữ liệu.

### P2 — Mở rộng thu thập dữ liệu (mở khóa tương lai)

| Việc | Vì sao |
| --- | --- |
| **P2-1. `sync-vn-gold.ts` lấy luôn giá nhẫn từ IP nhà** | Đúng đường: block là theo **dải IP datacenter**, không theo nguồn (CLAUDE.md). Không thêm nguồn remote — thêm cũng vẫn bị chặn trên runner |
| **P2-2. Tích lũy nhẫn tới ≥6 tháng liên tục** | Nhẫn hiện chỉ 49 phiên. Mở khóa ring-vs-bar (đang BLOCKED vì cỡ mẫu, `docs/bottom.md`) |
| **P2-3. Tích lũy premium SJC tới ≥36 tháng** | Mở khóa 3 thứ cùng lúc: `premium: 0` ở preset (#9), `premium-brake-study` (NO-GO-vì-mẫu-mỏng, cơ chế cùng họ với phanh đã thành công), `premium-exit-v2` (0/12 vì era B chỉ ~1-2 cửa sổ độc lập) |

### ĐÃ ĐÓNG — không đưa vào lộ trình

| Đề xuất bản cũ | Vì sao bỏ |
| --- | --- |
| ~~Thêm fallback DOJI / Webgia / Giavang.net~~ | Trái CLAUDE.md: block theo dải IP, không theo nguồn. Thay bằng P2-1 |
| ~~Trừ cứng 2% SJC / 1,5% nhẫn vào bảng backtest~~ | Backtest chạy trên XAU/USD 15 năm; trừ spread VN vào đó là bóp méo con số đã kiểm chứng. Thay bằng P0-2 (nhãn + số VN đo riêng) |
| ~~Thay `^TNX` bằng `DFII10` làm biến vĩ mô chính thức~~ | Đã loại 2 lần bằng bằng chứng. Hạ cấp thành P1-3 (study, không phải thay) |
| ~~Badge `[THỊ TRƯỜNG TG ĐÓNG CỬA]`~~ | Đã có (`Dashboard.tsx:912`) |
| ~~Cảnh báo spread > 2,5 triệu/lượng~~ | Gần trùng tín hiệu đang chạy; hạ cấp thành P0-3 (đổi từ VND sang percentile) |
| ~~**Trailing stop + bán từng phần theo `premium-exit-study.ts`**~~ | **CHẶN.** `docs/sell-zone.md`: `trail-exit-study.ts` **0/18 cấu hình** — bán-cuối-kỳ thắng mọi luật exit, ΔEnd tới −0,45 ở test; `premium-exit-v2-study.ts` **0/12** qua cổng CI, trạng thái SƠ BỘ. Ship việc này = ship tín hiệu chưa validate, đúng loại lỗi cả repo được xây để chống. Điều đã đo và ĐƯỢC phép nói (family C, `docs/sell-zone.md`) chỉ là: "đừng bán ngay — bán muộn trong kỳ hạn hoặc lúc bứt ≥2σ", đã ship dạng text ở `Dashboard.tsx:560` |

### Thứ tự thực thi đề xuất

~~P0-1~~ → ~~P0-2~~ → ~~P0-3~~ → ~~P1-2~~ (đã đóng, `pctScore` KHÔNG cần vào grid mùa vụ) → ~~P1-1(a) + P1-1b~~ → ~~P1-1b-detrend~~ (cả ba đóng 2026-09-04) → **P2-1** (việc kế tiếp: thu giá nhẫn từ IP nhà). P1-3 chạy khi có mạng rảnh. P1-4 và P2-2/P2-3 là chờ dữ liệu, không phải chờ code.

**Toàn bộ nhánh mùa vụ (#8 + #10) đã đóng.** #10 là bug thật, đã sửa. #8 là mô tả đúng nhưng không có bản sửa nào thắng cổng, và bỏ hẳn cũng không ⇒ giữ nguyên. Đừng mở lại họ này bằng thêm ngưỡng — placebo cùng-số-tháng đã trả lời chung cho cả họ. Hướng còn sống: mùa vụ **VN** theo lịch Tết trên giá SJC (chờ ≥3 mùa Tết).

**Nợ đã đóng 2026-09-04:** `HIGH_CONF_3M_EVIDENCE.orthogonalTrainPt` không còn trôi theo cửa sổ Yahoo — gốc là #10, đã sửa và khóa bằng test walk-forward. Sau khi regenerate, `calc-fusion-evidence.ts` cho lại đúng cả 8 số cũ.

**Luật rút ra từ #10 — áp cho mọi việc sau:** mọi số dẫn xuất từ timeline phải có **một script tái lập được**, và script đó phải chạy lại sau MỌI lần sửa engine. Bug này sống được vì các số theo năm ở `guidance.ts`/`Dashboard.tsx` không có script nào sinh ra chúng — không ai biết chúng đã lệch (danh sách năm thiếu 2009/2019/2023/2026). `scripts/sellzone-regime-study.ts` là bản trả nợ đó.
