# Thiết kế: Tầng Săn Đáy (Bottom Hunter)

Ngày: 2026-06-13. Trạng thái: spec đã duyệt thiết kế, chờ review trước khi lập kế hoạch.

## Bối cảnh & mục tiêu

Engine hiện tại trả lời **"giờ có phải vùng mua không?"** — chấm điểm composite −100..+100 và báo % lịch sử thuận chiều. Người dùng muốn thêm một năng lực khác: **bắt đáy (điểm mua tốt nhất)** ở hai thang thời gian lồng nhau.

Đây là bài toán *khác* với phân loại vùng mua. "Dự báo đáy tuyệt đối" là gần như bất khả thi một cách bền vững (thị trường price-in nhanh — chính study GPR của dự án đã chứng minh). Vì vậy spec này dịch nó sang một **định nghĩa vận hành, backtest được, không bịa số**, giữ đúng nguyên tắc dự án *"No prediction claims — decision support only"*.

### Quyết định đã chốt (brainstorming 2026-06-13)

1. **Định nghĩa đáy:** dự báo đáy, nhưng phát biểu dưới dạng *xác suất kèm khoảng tin cậy*, không phải lời khẳng định.
2. **Thang thời gian:** cả hai tầng lồng nhau — đáy chu kỳ (nhiều tháng) + đáy sóng (vài tuần).
3. **Ngân sách:** giữ kiến trúc miễn phí (GitHub Actions cron → commit JSON → static PWA, không server, không API trả phí). "Chi phí không phải vấn đề" = công sức không giới hạn, KHÔNG nới lỏng free-tier.
4. **Hướng kỹ thuật:** Hybrid — xác suất có điều kiện (B) làm lõi, tín hiệu xác nhận đảo chiều (A) làm đầu vào, ML (C) chỉ là cổng kiểm chứng offline, chỉ nhận nếu thắng ngoài mẫu.
5. **Tích hợp:** module độc lập — 2 đồng hồ xác suất (đáy chu kỳ + đáy sóng) + overlay đánh dấu đáy trên biểu đồ giá. KHÔNG đụng vào composite vùng mua hiện tại.

## 1. Định nghĩa "đáy" (cốt lõi tính trung thực)

> **Đáy = "giá sẽ không rẻ hơn đáng kể trong H ngày tới."**

Một ngày `t` được dán nhãn **"gần đáy"** nếu giá thấp nhất trong **H phiên kế tiếp** không thấp hơn giá ngày `t` quá **ε%**:

```
min( close[t+1 .. t+H] ) >= close[t] * (1 - ε)
```

Việc nhìn tương lai **chỉ dùng để dán nhãn lịch sử khi backtest**. Tín hiệu live chỉ dùng dữ liệu quá khứ → không có look-ahead khi chạy thật.

Hai tầng lồng nhau (giá trị khởi điểm, sẽ tinh chỉnh bằng study — KHÔNG chốt cứng):

| Tầng | H (cửa sổ) | ε ("đáng kể") |
| --- | --- | --- |
| Đáy chu kỳ | ~126 phiên | ~4% |
| Đáy sóng | ~21 phiên | ~2% |

Output luôn ở dạng: **P(không rẻ hơn ≥ε% trong H ngày | trạng thái hiện tại) = X%, CI 95% [a–b]** — không bao giờ "đây là đáy".

## 2. Kiến trúc

Tầng "Đáy" **độc lập hoàn toàn** với composite vùng mua — không sửa `compositeScore` / `PRESETS` / `zoneOf`. Tái dùng pipeline hiện có:

- `src/lib/bottom.ts` — engine mới. Nhận chuỗi giá XAU + tín hiệu vĩ mô (giống tham số `runBacktest`) → trả về `BottomAnalysis { cycleProb, swingProb, cycleCi, swingCi, drivers[], confirmedBottoms[] }`.
- `scripts/run.ts` — gọi thêm bottom engine sau backtest, commit `public/data/bottom.json`.
- UI: 2 đồng hồ xác suất (đáy chu kỳ / đáy sóng) + overlay ▼ đánh dấu các đáy đã xác nhận trong lịch sử và ước lượng hiện tại trên biểu đồ giá.
- Free-tier nguyên vẹn: tất cả nguồn dữ liệu vẫn miễn phí. Ứng viên dữ liệu free MỚI (chỉ thêm nếu study chứng minh có ích): volume GC=F, GDX (cổ phiếu mỏ vàng), tỷ lệ gold/silver — đều từ Yahoo.

## 3. Tín hiệu / feature

Đưa vào *làm feature ứng viên*; study (Mục 7) quyết định cái nào trụ lại. ✅ = đã có trong engine.

- **Drawdown:** độ sâu từ đỉnh 252/756 phiên (percentile); tốc độ rơi (return 21/63 phiên).
- **Quá bán / đảo chiều (họ A):** ✅ RSI ngày+tuần, ✅ khoảng cách dưới MA200; phân kỳ RSI tăng (giá đáy thấp hơn, RSI đáy cao hơn); bật lên khỏi đáy N ngày; MACD cắt lên từ dưới 0.
- **Vĩ mô đảo chiều (đã chứng minh thống trị):** DXY tạo đỉnh & quay đầu; đỉnh lợi suất 10 năm & rơi; Fed pivot (kết thúc chu kỳ tăng / lần cắt đầu). Đây là cơ chế *vì sao* đáy chu kỳ hình thành.
- ✅ **Động lượng 12 tháng** + ✅ **chế độ biến động** (capitulation: spike rồi xẹp).
- **VN-specific** (cho tầng đáy giá VN): premium percentile thấp (`premium-buy-study` đã cho thấy trung vị +7,6%/+10,4%); SJC spread co lại.

## 4. Phương pháp xác suất + khoảng tin cậy

Bản rule-based (B):
- Rời rạc hóa trạng thái hiện tại thành **regime**; tính **base-rate thực nghiệm** P(gần đáy | regime) trên ~15 năm XAU (timeline lịch sử như `backtest.ts`).
- **CI 95% bằng block-bootstrap** (block = ~H/3 phiên) — đúng như `monitor-presets.ts`, để tôn trọng tín hiệu bắn chùm (CI hẹp ảo nếu resample từng điểm độc lập).
- Hai mô hình tách biệt cho chu kỳ vs sóng (khác H, ε, trọng tâm feature).
- Mỗi output kèm **drivers**: chuỗi giải thích tiếng Việt nêu yếu tố nào đang kéo xác suất lên/xuống (giữ văn hóa "signal explanations là chuỗi tiếng Việt user-facing").

## 5. ML chỉ là cổng kiểm chứng (C)

`scripts/bottom-ml-study.ts` (offline, free compute lúc collect/local):
- Gradient boosting / logistic regression, **walk-forward** train 2009–2018 / test 2019–2026 (đúng cách chia của `presets-study.ts`).
- So **calibration (Brier score) + AUC** với bản rule-based B.
- **Chỉ nhận ML nếu thắng B NGOÀI MẪU VÀ giữ giải thích được (feature importance).** Nếu không → ship B.
- ML không bao giờ vào đường live nếu chưa qua cổng này.

## 6. Trung thực & guardrails (DNA dự án)

- Không tuyên bố "đây là đáy"; luôn "xác suất … kèm CI 95%".
- Tầng **đáy giá VN** chỉ kiểm chứng nơi đủ premium data (≥ ngưỡng như tiêu chí premium hiện tại); trước đó UI ghi *"chưa đủ dữ liệu kiểm chứng"* — không bịa số.
- **Giám sát thoái hóa** như presets: mở rộng `monitor-presets.ts` (hoặc script song song) kiểm bottom engine mỗi cron, cảnh báo khi calibration tụt.
- Cron lỗi không blank app: giữ `bottom.json` cũ + cảnh báo "dữ liệu N ngày tuổi" (đồng bộ với cơ chế stale hiện có).
- Tín hiệu/feature đã LOẠI không tái thêm trừ khi study mới chứng minh: GPR, VIX (đã loại trong factor-study).

## 7. Trình tự triển khai (study-first — đúng văn hóa dự án)

1. **Study trước, UI sau.** Xây harness dán nhãn + chạy base-rate study trên timeline lịch sử → xác định ε/H tối ưu và tín hiệu nào *thực sự* vượt baseline out-of-sample. Chỉ tín hiệu thắng mới vào engine.
2. Chạy cổng ML (C) để biết có cần ML không.
3. Code `bottom.ts` + `bottom.json` + UI 2 đồng hồ + overlay.
4. Viết `docs/bottom.md` (phương pháp + bằng chứng), đồng bộ guardrails; cập nhật giám sát.

Baseline để vượt: tỉ lệ "gần đáy" của một ngày bất kỳ (base rate vô điều kiện). Tín hiệu chỉ có giá trị nếu nâng xác suất *vượt* base rate ở **cả hai** giai đoạn train/test — đúng tiêu chí min-excess của presets.

## 8. File mới / sửa

**Mới:**
- `src/lib/bottom.ts` — engine xác suất đáy (rule-based B)
- `scripts/bottom-study.ts` — harness dán nhãn + base-rate study (tinh chỉnh ε/H, tuyển feature)
- `scripts/bottom-ml-study.ts` — cổng kiểm chứng ML (C)
- `public/data/bottom.json` — output commit mỗi cron
- `docs/bottom.md` — phương pháp & bằng chứng

**Sửa:**
- `scripts/run.ts` — gọi + commit bottom engine
- `scripts/monitor-presets.ts` — mở rộng giám sát thoái hóa bottom (hoặc thêm `monitor-bottom.ts` song song)
- `src/lib/types.ts` — type `BottomAnalysis`, `BottomDriver`, `ConfirmedBottom`
- UI component(s) — 2 đồng hồ + overlay trên biểu đồ giá

## Phạm vi NGOÀI spec này (YAGNI)

- Không API/dữ liệu trả phí, không server riêng.
- Không đụng composite vùng mua / presets hiện tại.
- Không tín hiệu BÁN (bài toán bán đã được xử lý riêng và phần lớn vô giá trị theo study).
- ML chỉ là study; không build pipeline training online.

## Rủi ro & giới hạn

- **Selection bias / overfit:** chọn ε/H/feature có nhìn kết quả test. Giảm bằng tiêu chí min-excess 2 giai đoạn + block-bootstrap CI, nhưng con số nên đọc là *ước lượng lạc quan*.
- **Tín hiệu bắn chùm:** đáy chu kỳ trùng pivot vĩ mô, mẫu hiệu dụng nhỏ hơn n. CI block-bootstrap phản ánh điều này.
- **Backtest trên XAU/USD, mua vàng VN:** tương quan cao nhưng premium co giãn. Tầng đáy giá VN chỉ tin nơi đủ dữ liệu premium.
- **Quá khứ không bảo đảm tương lai.** Công cụ xác suất, không phải lời hứa.
