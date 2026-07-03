# Bear Downside "Triển vọng" — trình bày chống ảo giác (design)

Ngày: 2026-07-03. Trạng thái: **đã duyệt thiết kế, chờ triển khai**. Bối cảnh: card đã recency-weighted (hl=504) + pUp đã backtest calibration (giữ nguyên, xem `docs/bear-downside.md`). Vấn đề còn lại là **cách TRÌNH BÀY** khiến người dùng dễ ảo giác — không phải sai số engine.

## Mục tiêu

Chặn đồng thời 4 kiểu ảo giác khi đọc số:

1. **Trung vị-như-dự-đoán** — đọc "Điển hình $4.618" thành "giá sẽ là 4.618".
2. **Giả-chính-xác** — chữ số lẻ tạo cảm giác chắc chắn dù độ tản ±10–20%.
3. **Không thấy nghiêng bull** — số đang lạc quan vì recency nghiêng ~2 năm bull; user không biết đó là tần suất lịch sử có điều kiện chế độ.
4. **Neo vào "Cơ hội tăng", quên rủi ro** — chỉ nhìn 83% tăng, bỏ qua khả năng dúi/kết thấp.

Không đụng engine thống kê (recency-504, pUp giữ nguyên — đã kiểm chứng). Đây thuần là lớp trình bày + thêm 2 percentile vào dữ liệu.

## Thiết kế

### Bảng — mỗi kỳ hạn 1 hàng

| Cột | Nội dung | Nguồn |
| --- | --- | --- |
| Kỳ hạn | 1/3/6 tháng | — |
| **Rủi ro dúi** (giữa→xấu) | dải `median → p10` của mức-rơi-thêm, kèm % và giá làm tròn | `band.median`, `band.p10` (đã có) |
| **Kết cục điển hình** (50% giữa) | dải `p25 → p75` của lợi suất tại mốc, kèm % và giá | `band.endP25`, `band.endP75` (**MỚI**) |
| Thực tế | giá đáy + kết thực tế khi đã đáo hạn; "chưa đáo hạn" nếu chưa | như hiện tại |
| **Khả năng** | `pUp%↑ / (100−pUp)%↓` (hai chiều, thay "Cơ hội tăng" một chiều) | `band.pUp` |

- **Bỏ số-điểm-median khỏi hiển thị** (chỉ còn dải) — chống neo điểm. `endMedian` vẫn giữ trong dữ liệu nhưng không in.
- **Làm tròn:** giá → ~$100 gần nhất, hiển thị dạng `~$4.0k`; % → số nguyên; tiền tố `~`.

### Nhãn chế độ — hiện LUÔN dưới bảng (không giấu trong ⓘ)

> ⚠ Khoảng & tần suất theo **lịch sử nghiêng ~2 năm gần (đang bull)** · khoảng rộng = bất định cao · **KHÔNG phải dự đoán**

ⓘ chi tiết giữ nguyên, bổ sung giải thích dải p25–p75 & median→p10.

### Ánh xạ chống ảo giác

| Ảo giác | Cơ chế chặn |
| --- | --- |
| Trung vị-như-dự-đoán | hiện DẢI thay 1 số; bỏ số điểm |
| Giả-chính-xác | làm tròn ~$100 + `~` + dải rộng lộ bất định |
| Không thấy nghiêng bull | nhãn chế độ luôn hiện |
| Neo pUp/quên rủi ro | dải kết HAI CHIỀU (đầu thấp âm ở 1–3T) + cột rủi ro dúi + ↑/↓ |

## Thay đổi kỹ thuật

1. **types.ts:** `BearHorizonStat` + `BearAsOfBand` thêm `endP25`, `endP75`.
2. **bear-downside.ts `computeHorizonStat`:** tính `endP25`/`endP75` = weighted percentile của `termValues` tại .25/.75 (nhánh weighted & nhánh vô-trọng-số, đối xứng code hiện có). `runBearDownsideHistory.toBand` map thêm 2 trường.
3. **Regen data** qua `npm run collect` (bear-downside.json + timeline.bearAsOf).
4. **BearDownsideCard.tsx:** render dải + ↑/↓ + nhãn chế độ; đổi tên header; xử lý `chưa đáo hạn`; fallback LegacyRow đọc field mới từ `bd.shown` (fresh data có; guard nếu thiếu).
5. **bear-downside-view.ts** (nếu cần helper format dải/làm tròn).

## Bất biến giữ nguyên (không được phá)

- **Golden:** dải as-of ngày cuối === `runBearDownside(bars).unconditional` — cả hai path dùng chung `computeHorizonStat` nên thêm field vẫn bằng nhau.
- `computeHorizonStat` không truyền ages ⇒ vô trọng số (unit test cũ nguyên).
- Không đổi recency-504, không đổi pUp (đã kiểm chứng calibration).
- Lưới thưa STEP=3.

## Test

- Unit: `computeHorizonStat` trả `endP25 ≤ endMedian ≤ endP75`; weighted vs unweighted.
- Golden: giữ test as-of===unconditional (thêm so khớp endP25/endP75).
- View helper: format dải & làm tròn.
- `npm test` toàn bộ + `tsc` + `npm run build`.

## Ngoài phạm vi (YAGNI)

- Không thêm biểu đồ dải/fan (đã cân nhắc, chọn bảng-dải cho nhẹ).
- Không đổi công thức thống kê. Không đụng lớp khác (Bottom/Bear DCA/composite).
