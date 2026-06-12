# Lớp "ngưỡng thử nghiệm" trong máy thời gian

Ngày: 2026-06-12. Trạng thái: đã duyệt thiết kế.

## Bối cảnh & mục đích

Người dùng muốn biết "nếu ngưỡng mua là X thì lịch sử trông thế nào" mà không sửa
`buyThreshold` — vì ngưỡng chuẩn (+40/+50) được tuyển bằng grid search 17 năm và bảng
% kiểm chứng chỉ đúng tại ngưỡng đó (xem docs/presets.md). Sửa tay ngưỡng thật sẽ làm
% kiểm chứng hiển thị sai lệch — vi phạm nguyên tắc không bịa số.

Giải pháp: một lớp highlight **thuần UI, chỉ để khám phá** trong card máy thời gian.
Không đụng engine, backtest, notify, hay dữ liệu precomputed.

## Hành vi

Tất cả nằm trong `src/components/TimeMachine.tsx`:

1. **Checkbox "Ngưỡng thử nghiệm"** cạnh toggle "Hiện vùng bán" — mặc định tắt.
2. Bật → hiện hàng slider: phạm vi **0 → 100, bước 1**, giá trị khởi tạo = ngưỡng
   chuẩn của chế độ đang chọn (`preset?.buyThreshold ?? 40`).
3. Trên biểu đồ giá: lớp marker **vòng tròn rỗng màu xanh dương** (stroke, không fill)
   tại mọi ngày có `pointComposite(p, weights) ≥ ngưỡng thử`. Vẽ **dưới** chấm xanh lá
   đặc (tín hiệu kiểm chứng) — ngày trùng thành chấm đặc có viền, hai lớp phân biệt rõ.
4. Cạnh slider: dòng đếm `ngưỡng +55: 23 ngày đạt / 1.190 ngày` + chú thích cố định:
   *"chỉ để khám phá — % kiểm chứng chỉ áp dụng cho ngưỡng chuẩn"*.

Nút điều hướng ◀▶ tín hiệu và dòng đếm tín hiệu chuẩn **không** bị ngưỡng thử ảnh
hưởng — chúng vẫn theo `buyThreshold` chuẩn.

## Kỹ thuật

- 2 state mới: `showExperiment: boolean`, `expThreshold: number`.
- `expIdxs` qua `useMemo`, lọc giống hệt pattern `signalIdxs`/`sellIdxs` sẵn có.
- Marker vẽ trong khối `spark` cùng cách `sellMarkers`; bán kính theo mức zoom như
  hai lớp hiện tại.
- Không lưu localStorage — phiên khám phá tạm thời, tắt bật lại về mặc định.
- Vài dòng CSS cho marker rỗng + hàng slider. Tổng ~40 dòng thay đổi.

## Kiểm thử

- Unit test cho logic lọc theo ngưỡng: đếm đúng số ngày tại ngưỡng biên 0 / 50 / 100.
- `npm test` và `npm run build` xanh, test hiện có không vỡ.

## Ngoài phạm vi (chủ động KHÔNG làm)

- Thống kê %-đúng tại ngưỡng thử — tính trên toàn lịch sử không tách train/test sẽ
  trông như bảng kiểm chứng nhưng kém tin cậy, khuyến khích ngưỡng-shopping (overfit
  bằng mắt).
- Lưu ngưỡng thử lâu dài.
- Áp ngưỡng thử vào cảnh báo/notify hay bất kỳ đường quyết định nào.
