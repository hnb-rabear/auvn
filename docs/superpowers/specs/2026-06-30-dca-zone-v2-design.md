# DCA Zone v2 — Vùng giá đẹp trong 30 ngày tới (mở lại Module A) — thiết kế

Ngày: 2026-06-30. Trạng thái: đã brainstorm + duyệt, chờ viết plan.

## Bối cảnh — vì sao mở lại

Module A cũ (`docs/dca-copilot.md`) kết luận NO-GO cho "canh điểm vào trong tháng". Nhưng kết luận đó hẹp và khung **sai thước**:

1. Đo bằng **giá vốn trung bình điều hòa qua ~180 tháng** → chênh lệch một ngày bị bình quân hóa gần như biến mất ⇒ thiên về NO-GO kể cả khi vùng đẹp có thật ở cấp tháng.
2. Dùng **biên độ tháng dương lịch** (ngày 1→30), trong khi câu hỏi thật là **cửa sổ trượt 30 ngày về phía trước** neo tại ngày bất kỳ.
3. Chưa thử: thước **ghép cặp theo từng cửa sổ**, TA cổ điển (Bollinger/Stochastic/Williams), **điều kiện theo biến động**, **"né đỉnh"** bất đối xứng.

→ Mở lại với thước đúng + các họ tín hiệu chưa thử. Giữ kỷ luật train/test + placebo + CI, không hạ chuẩn để ép GO.

## Câu hỏi chốt

> Đứng ở ngày bất kỳ (vd 15/6), có ~30 ngày tới (≈21 phiên XAU) để xuống tiền DCA. Vùng giá nào trong 30 ngày tới là "đẹp" để vào — và có đáng đợi thay vì mua ngay hôm nay không?

## Cửa sổ & mốc tham chiếu

- Neo tại ngày `t`. Cửa sổ trượt = các phiên XAU trong `[t, t+30 ngày dương lịch]` (~21 phiên). **Horizon chính H≈21 phiên; kiểm tra độ bền thêm H≈42 phiên.**
- "Vùng đẹp lý tưởng" = `min` giá trong cửa sổ (đáy 30-ngày-tới); đỉnh cửa sổ = mốc tệ nhất.
- Min/max cửa sổ là **tương lai** → chỉ dùng **chấm điểm trong backtest** (ex-post). Quyết định live luôn **past-only** (chỉ dữ liệu ≤ ngày quyết định). Không nhìn trộm tương lai khi chạy thật.

## Thước đo

Vị trí trong biên độ cửa sổ của ngày luật chọn:

```
rangePos = (P_mua − min_cửa_sổ) / (max_cửa_sổ − min_cửa_sổ)   # 0 = đáy, 1 = đỉnh
```

Chuẩn hóa 0–1 ⇒ so sánh được giữa các neo có biến động khác nhau. Ghép cặp theo từng neo.

**Phụ:** "né đỉnh" = `(max − P_mua)/(max − min)`; quy ra tiền = trung bình `(P_mua − min)/min` (% đắt hơn đáy) → dịch sang "tiết kiệm ~X bps" để biết edge có **đáng** không.

## Baseline (khớp quyết định "mua ngay hay đợi")

| Mốc | Ý nghĩa |
|---|---|
| **Mua NGAY ngày t** | baseline chính — không canh |
| Mua ngày ngẫu nhiên trong cửa sổ (seeded) | placebo — null của "có kỹ năng canh" |
| Đáy / đỉnh cửa sổ | trần / sàn lý thuyết (tham chiếu edge tối đa) |

Luật phải đưa gần đáy hơn **mua ngay** VÀ **placebo** mới có giá trị.

## Kiểm định thống kê

- **Ghép cặp theo neo:** `Δ = rangePos(luật) − rangePos(mua-ngay)` và `Δ' = rangePos(luật) − rangePos(placebo)`; hàng trăm cặp ⇒ mạnh hơn thước cũ.
- **Chống pseudo-replication:** neo mọi ngày ⇒ cửa sổ chồng lấn nặng ⇒ n phình, CI hẹp ảo. Khắc phục: **neo thưa (mỗi ~21 phiên)** cho thống kê + **block-bootstrap theo độ dài chồng lấn** cho CI. Chấm dày chỉ để hiển thị.
- **Win-rate / sign test:** % neo luật thắng mua-ngay và thắng placebo.
- **Cổng:** edge cùng chiều + CI lệch khỏi 0 ở **cả** train(<2019) **lẫn** test(≥2019), **và** thắng placebo; xếp theo min(train,test).
- **Chống multiple-testing:** nhiều chỉ báo × tham số ⇒ phòng vệ bằng tập test giữ riêng + placebo + min(train,test); không nhận luật chỉ thắng train.

## Phân tích kỹ thuật (họ tín hiệu — past-only)

- **A. Vị trí tương đối:** percentile giá trong W ∈ {10,21,42,63}; z-score `(P−SMA_W)/σ_W`.
- **B. Quá bán / mean-reversion:** RSI(14) ngưỡng {25,30,35}; **Bollinger %B(20,2σ)**; **Stochastic %K(14)**; **Williams %R(14)**; khoảng cách dưới đỉnh gần đây.
- **D. Điều kiện theo biến động:** ATR(14) / realized-vol(20) — chỉ canh khi cửa sổ *dự kiến* dao động rộng (ước bằng vol quá khứ). Giả thuyết: edge bị giấu khi trộn cả giai đoạn phẳng.
- **E. Hồi sau nhịp rơi:** mua phiên giảm đầu sau chuỗi tăng; mua khi giá cắt lại lên MA ngắn sau khi thủng.
- **BỎ họ mùa-vụ-lịch** (ngày-trong-tháng) vì cửa sổ trượt làm nó mất nghĩa. (Turn-of-month có thể thêm sau nếu muốn.)

**Cấu trúc luật:** luật định một **ngưỡng/vùng** past-only; trong cửa sổ, mua phiên ĐẦU chạm vùng; chưa chạm tới hết cửa sổ → buộc mua phiên cuối.

## Cổng GO & sản phẩm

- **GO** ⇔ rangePos của luật thấp hơn mua-ngay **và** placebo, CI lệch khỏi 0, **cả train lẫn test**, size đáng kể (vd cắt ≥ ~10–15% biên độ cửa sổ tới đáy). Xếp theo min(train,test).
- **Nếu GO** → ship card "Canh vào DCA" mới: đứng hôm nay hiện **ngưỡng giá vùng đẹp** cho 30 ngày tới, vd *"🟢 Vùng đẹp ≤ $3.880 (percentile thấp / chạm dải Bollinger dưới); chạm trong 30 ngày → vào; chưa chạm tới ~ngày 30 → buộc mua"*. Ngưỡng tính past-only.
- **Nếu NO-GO** → báo cáo có sức nặng (đã hỏi đúng câu per-window, cạn TA cổ điển + điều kiện biến động + né đỉnh), kèm bằng chứng ⇒ yên tâm DCA đều tay.

**Kỳ vọng trung thực:** "né đỉnh" và "điều kiện biến động" là 2 góc nhiều cơ hội nhất; "bắt đáy chính xác" vẫn khó. Tiền nghiệm: vàng intra-30-ngày gần ngẫu nhiên ⇒ edge nếu có thì nhỏ. Không hạ chuẩn để ép GO.

## Công cụ / kiến trúc

- **Dữ liệu:** XAU/USD daily ~20 năm (Yahoo `GC=F` qua `scripts/fetch.ts`). SJC ~6 tháng: descriptive, không gate.
- **Stack:** TypeScript + `tsx`, theo khung `bottom-study`/`dca-timing-study`.
- **Tái dùng** `src/lib/indicators.ts`: `rsi, sma, percentileRank, percentile, blockBootstrapCi, blockBootstrapPercentileCi, seededRandom`.
- **Indicators mới (có test):** Bollinger %B, Stochastic %K, Williams %R, ATR, realized-vol.
- **Helper mới:** `pairedBlockBootstrapCi(deltas, block)` — CI cho chuỗi chênh-lệch ghép cặp.
- **Study mới:** `scripts/dca-zone-study-v2.ts` — đua họ A/B/D/E × tham số × {mua-ngay, placebo}, in train/test + CI + win-rate + size.
- **Lib live (nếu GO):** `src/lib/dca-zone-live.ts` tính ngưỡng vùng đẹp past-only; card UI.
- **Doc:** `docs/dca-zone-v2.md` — phương pháp + bằng chứng + kết luận.

## Không làm (YAGNI)

- Không dùng giá vốn 15-năm làm thước (đã chứng minh loãng).
- Không họ mùa-vụ-lịch (cửa sổ trượt).
- Không dự đoán điểm giá; ngưỡng vùng đẹp là trạng-thái past-only, backtest kiểm chứng.
- Không đụng composite/Bottom Hunter/Bear DCA/Accumulation/Bear Downside.

## Tested and REJECTED (khung cũ — đừng lặp lại)

Đo "canh điểm trong tháng" bằng **giá vốn 15-năm** trên **biên độ tháng dương lịch** (Module A cũ) là khung sai/loãng → NO-GO không kết luận được gì về vùng đẹp cấp cửa-sổ. v2 này thay bằng thước rangePos ghép cặp trên cửa sổ trượt 30 ngày.
