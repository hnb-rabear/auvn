# Giá nhẫn trơn 9999 theo thương hiệu (BTMC / BTMH)

Ngày: 2026-09-15. Trạng thái: thiết kế đã duyệt, chưa triển khai.

## Vấn đề

Giá nhẫn hiện "nhiều lúc không lấy được". Nguyên nhân KHÔNG chỉ ở nguồn chập chờn —
có hai đường trong code tự làm mất giá nhẫn đã lấy được:

1. **Ghi đè về null.** `scripts/backfill-vn.ts:140-152` thay TOÀN BỘ dòng hôm nay bằng
   kết quả lần fetch mới nhất. BTMC lỗi + cafef trả SJC ⇒ `live.sjcSell` có giá trị,
   nhánh này chạy, `ringBuy/ringSell` của lần fetch tốt trước đó bị ghi đè thành null.
   Đường cron đã chống lỗi này (`scripts/run.ts:194-202` giữ `?? existing`), local sync thì chưa.
2. **Nguồn không liên quan chặn việc lưu.** `scripts/backfill-vn.ts:83-88` gom
   cafef + XAU + tỷ giá + live vào một `Promise.all`; một nguồn reject ⇒ cả lượt dừng,
   giá nhẫn đã lấy được không bao giờ tới đĩa. `scripts/sync-vn-gold.ts:57-62` dừng
   trước bước commit khi backfill lỗi, nên dữ liệu có cứu được cũng không lên repo.

Phụ: `fetchVnGold` (`scripts/fetch.ts:364-385`) dừng ở nguồn đầu tiên không throw,
kể cả nguồn đó không có nhẫn (cafef). Đã có cảnh báo tại `scripts/run.ts:163-164`
nhưng không có cơ chế thử tiếp nguồn CÓ nhẫn.

Dữ liệu đo được: 01→15/09/2026 thiếu nhẫn 2 ngày (04/09 — trước bản sửa HTTPS 05/09 —
và 12/09, chưa rõ nguyên nhân vì log không ghi lý do thiếu nhẫn).

## Phạm vi

**Trong phạm vi:** thu thập giá nhẫn trơn 9999 của **BTMC** và **BTMH**, cho phép người
dùng chọn thương hiệu để hiển thị; sửa hai đường làm mất dữ liệu ở trên.

**Ngoài phạm vi (không đổi):** vàng miếng SJC (giá, premium VN–thế giới, spread, biểu đồ,
lịch sử) giữ nguyên hoàn toàn. Không bỏ fetcher SJC. Composite, preset, backtest,
Bottom Hunter, Bear DCA, Bear Downside không đổi. Không thêm server, dịch vụ trả phí,
hay gọi mạng từ trình duyệt.

**Bỏ:** nhẫn SJC khỏi bộ chọn — `sjc.com.vn` (trang chủ, `PriceService.ashx`, `tygiavang.xml`)
đều trả **HTTP 403 từ IP nhà** (đo 2026-09-15), không có nguồn nhẫn SJC dùng được.
Không thay bằng nguồn tổng hợp bên thứ ba rồi gắn nhãn "SJC".

## Nguồn (đã kiểm chứng từ IP nhà, 2026-09-15)

| Hãng | Nguồn chính | Sản phẩm | Ghi chú |
| --- | --- | --- | --- |
| BTMC | `https://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=…` HTTP 200 | `NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)`, `@h_632="999.9"` | có `@pb`/`@ps` (VND/chỉ) + `@d_632` = giờ nguồn công bố |
| BTMC | dự phòng: `https://btmc.vn/gia-vang-theo-ngay.html` HTTP 200 | cùng sản phẩm | HTML, chỉ dùng khi API hỏng |
| BTMH | `https://baotinmanhhai.vn/bang-gia-vang` HTTP 200 | `Kim Gia Bảo 24K`, mã `KGB`, độ tinh khiết 99.99, đủ mua/bán | đã đối chiếu mã sản phẩm và giá trên website chính thức |

**BTMH đã xác minh thêm ngày 2026-09-15:** trang
`https://baotinmanhhai.vn/vang-tich-luy/nhan-tron-ep-vi-kim-gia-bao-loai-1-chi-24k-999-9-kgb1c10022001`
trả sản phẩm nhẫn 1 chỉ 999.9, SKU `KGB1C10022001`, thuộc tính `category_code = KGB`;
bảng giá dùng `code = KGB`. Giá bán sản phẩm 14.650.000 VND/1 chỉ khớp dòng KGB
(giá mua 14.250.000). Đây là đối chiếu tại thời điểm khảo sát, không phải giá cố định.
Dòng `Trang sức - Nhẫn tròn BTMH` chỉ có giá mua và dòng `Kim Gia Bảo Gift 24K`
là sản phẩm khác — không được dùng thay thế.

## Thiết kế

### Dữ liệu

Bản ghi giá nhẫn tách theo thương hiệu, lưu thêm (additive) bên cạnh các trường hiện có.
Mỗi bản ghi mang: **giá mua, giá bán, tên sản phẩm, nguồn, thời điểm nguồn công bố,
thời điểm lấy**.

- **Cặp mua/bán ghi nguyên khối** — cùng sản phẩm, cùng lần lấy, cùng thời điểm công bố.
  Không ghép giá mua lần này với giá bán lần trước.
- **Thời điểm nguồn công bố ≠ thời điểm lấy.** Nguồn không công bố giờ thì để trống và
  hiển thị "không rõ thời điểm cập nhật"; không lấy giờ tải thay thế.
- **Lịch sử cũ giữ nguyên, không gán lại thương hiệu.** Các trường `ringBuy`/`ringSell`
  hiện có từng đến từ nhiều đường fetch khác nhau (BTMC hoặc nhánh SJC) ⇒ không có căn cứ
  gán toàn bộ thành BTMC. Không migration hồi tố.
- **Không chép giá ngày cũ sang ngày mới.** Giá cũ chỉ dùng để hiển thị kèm tuổi dữ liệu.

### Thu thập

- Mỗi hãng lấy **độc lập**: BTMC lỗi không chặn BTMH và ngược lại.
- Lượt lấy thất bại hoặc thiếu một phía **giữ nguyên bản ghi hợp lệ đã có cùng ngày**,
  không ghi đè thành null (mở rộng quy tắc đã có ở `scripts/run.ts:194-202`).
- **Giá nhẫn lấy được phải lưu được** dù cafef/XAU/tỷ giá lỗi. Phần làm giàu dữ liệu
  (premium) thiếu thì để null, không hủy cả lượt.
- Local sync phải **commit được phần đã cứu** thay vì dừng sớm khi một bước lỗi.
- Vẫn chạy trên thiết bị cá nhân theo lịch hiện có; web chỉ đọc JSON tĩnh.
- Bản triển khai đầu dùng file riêng `public/data/history/ring-gold.json`, không tạo
  dòng nhẫn-only trong `vn-gold.json` vì engine đang coi dòng cuối là phiên SJC hiệu lực.
  Collector nhẫn theo hãng nằm trên đường local backfill/sync; cron cloud giữ nguyên
  phân tích legacy và deploy. Cam kết nhẫn sống sót khi enrichment lỗi áp dụng cho
  collector mới này, không phải thay mọi cơ chế thoát lỗi của engine legacy.

### Hiển thị

- Bộ chọn **BTMC / BTMH** ngay cạnh giá nhẫn, không bắt vào Cài đặt. Mặc định **BTMC**.
- Lựa chọn nhớ trên thiết bị, dùng khóa cấu hình sẵn có; giá trị lạ hoặc thiếu ⇒ về mặc định
  **mà không xóa trọng số/preset người dùng đã chỉnh** (`loadSettings` hiện trả
  `DEFAULT_SETTINGS` khi validate hỏng — nhánh mới không được kéo theo hành vi đó).
- Hiện giá mua/bán, tên sản phẩm, nguồn, thời điểm công bố của hãng đang chọn.
- Hãng đang chọn thiếu giá hôm nay ⇒ hiện bản ghi gần nhất **kèm ngày**; chưa từng có
  ⇒ "Chưa có dữ liệu". **Không tự đổi sang hãng khác.**
- Time Machine theo cùng hãng đang chọn; ngày không có dữ liệu hãng đó thì nói rõ, không
  lấy giá hãng khác hay giá ngày sau lấp vào.

### Bất biến (không được vi phạm)

- Đổi hãng hiển thị **không đổi** composite, zone, preset, `ringDiscountPct`, premium,
  backtest hay bất kỳ số evidence nào. Đây là tầng hiển thị.
- `ringDiscountPct` (`scripts/run.ts:246-249`) vẫn lấy nhẫn **cùng phiên** với SJC từ
  nguồn chuẩn hiện hành, không đổi theo lựa chọn người dùng.
- Hợp đồng `summary.json` (schemaVersion 1.4, `docs/summary-json.md`) giữ nguyên hình dạng
  các trường `market.ringBuy/ringSell/ringDate`. Dữ liệu theo hãng nếu công bố thì thêm mới,
  không đổi kiểu trường cũ.
- Đơn vị: mọi nguồn đi qua chuẩn hóa VND/lượng hiện có (`normalizeVnd`, dải 50–600 triệu).
  BTMC/BTMH báo VND/chỉ ⇒ sai hệ số là lệch 10 lần.

## Kiểm thử

1. Lượt sau thiếu nhẫn **không xóa** giá nhẫn hợp lệ đã lưu cùng ngày.
2. Lấy được nhẫn nhưng cafef/XAU/tỷ giá lỗi ⇒ giá nhẫn vẫn được lưu.
3. Một hãng lỗi ⇒ hãng còn lại vẫn ghi được.
4. Đổi hãng hiển thị ⇒ composite/zone/preset không đổi.
5. Cấu hình cũ (trọng số, preset) không bị xóa khi thêm khóa chọn hãng; giá trị hãng lạ về mặc định.
6. Hãng chưa có lịch sử ⇒ UI báo thiếu, không hiện giá hãng khác.

## Giới hạn đã biết

- Ánh xạ BTMH đã được chứng minh tại thời điểm khảo sát. Parser vẫn phải kiểm tra
  đúng mã/sản phẩm, độ tinh khiết và đơn vị; nguồn đổi cấu trúc thì báo lỗi, không lấy dòng gần giống.
- Nhẫn SJC **không có nguồn hoạt động** (403 từ IP nhà) — bỏ khỏi bộ chọn là mô tả đúng
  hiện trạng, không phải lựa chọn thẩm mỹ.
- Thiếu nhẫn 12/09/2026 chưa truy được nguyên nhân (log không ghi lý do). Thiết kế này
  chặn cả hai cơ chế mất dữ liệu đã biết, nhưng **không khẳng định** đó là nguyên nhân ngày đó.
- Lịch sử nhẫn BTMH bắt đầu từ lúc bật ⇒ Time Machine sẽ trống ở quá khứ với hãng này.
- Ring-vs-bar vẫn chờ ≥6 tháng dữ liệu nhẫn liên tục (`docs/bottom.md`); thiết kế này
  không mở lại nghiên cứu đó.
