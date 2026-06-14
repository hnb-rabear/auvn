# Timeline gồm bar mới nhất + phân biệt "ngày giả lập" vs "hôm nay"

Ngày: 2026-06-14

## Vấn đề

Người dùng mở app ngày 14/06 (Chủ Nhật) thấy màn hình Time Machine hiển thị "Ngày giả lập 11/06 · XAU $4.090" và một box "Gợi ý hành động" cho ngày đó — trông như toàn bộ app trễ 3 ngày, gây hiểu lầm "chậm thế thì làm sao kịp mua/bán".

Thực tế là hai chuyện riêng, không phải app chậm:

1. **Timeline rớt bar cuối.** `scripts/backtest.ts` dựng timeline bằng vòng lặp `for (i = WARMUP; i < closes.length; i += STEP)` với `STEP = 3`. Bar cuối (06-12, thứ Sáu) không rơi đúng lưới bước-3 nên bị bỏ → điểm cuối timeline = 06-11. Time Machine mặc định nhảy tới điểm cuối (`idx = points.length - 1`) nên hiện 06-11 + giá cũ 4090.
2. **Cuối tuần thị trường nghỉ.** 13/06 = thứ Bảy, 14/06 = Chủ Nhật → vàng thế giới (GC=F) đóng cửa, không có bar mới. Bar gần nhất là thứ Sáu 06-12. Dữ liệu LIVE thật (`analysis.json`) đã có `dataDate: 2026-06-12`, giá 4238 — mới nhất có thể. Không trễ; thị trường nghỉ.

Box "Gợi ý hành động" trong ảnh là guidance **lịch sử bên trong Time Machine** (theo ngày giả lập), KHÁC với box "Gợi ý hành động" LIVE ở đầu trang. Khi ngày giả lập = điểm cuối timeline, nó trông như tín hiệu hôm nay.

## Mục tiêu

1. Timeline luôn gồm bar giao dịch mới nhất (điểm cuối = bar thật gần nhất, khớp `analysis.dataDate`).
2. Time Machine làm rõ "ngày giả lập" là điểm cuối lịch sử mô phỏng, tách bạch với tín hiệu "hôm nay" ở đầu trang.
3. Dòng freshness chú thích khi thị trường vàng thế giới đang đóng cửa cuối tuần, để tuổi số liệu lớn không bị hiểu là dữ liệu cũ/hỏng.

Không nằm trong phạm vi: đổi STEP backtest (giữ bước-3 cho phần backtest), tự dựng điểm "live" bằng tay, thêm nguồn dữ liệu.

## Thiết kế

### Phần 1 — Timeline gồm bar mới nhất (`scripts/backtest.ts`)

Vòng lặp tại `scripts/backtest.ts:62` hiện là:

```ts
for (let i = WARMUP; i < closes.length; i += STEP) {
  // ... thân: chấm điểm, tính returns, points.push({...})
}
```

Đổi thành: dựng danh sách index trước, thêm index bar cuối nếu chưa có, rồi duyệt danh sách (thân vòng lặp GIỮ NGUYÊN):

```ts
const idxs: number[] = [];
for (let i = WARMUP; i < closes.length; i += STEP) idxs.push(i);
if (idxs.length && idxs[idxs.length - 1] !== closes.length - 1) idxs.push(closes.length - 1);
for (const i of idxs) {
  // ... thân y nguyên
}
```

An toàn:
- Bar cuối có `returns` toàn null (vòng `if (i + h >= closes.length) continue` tại backtest.ts:121 bỏ qua) → KHÔNG đẩy giá trị nào vào `returns` map → buckets backtest KHÔNG đổi. Chỉ thêm đúng 1 điểm vào mảng `points`.
- Dùng đúng đường chấm world-only sẵn có (technical + stats + macro), không dựng điểm tay.
- Nếu bar cuối đã rơi đúng lưới (đã là index cuối), điều kiện `!==` bỏ qua, không nhân đôi.

Hệ quả: điểm cuối timeline = 06-12, default Time Machine rơi vào đó, giá khớp `analysis.dataDate`.

### Phần 2 — Time Machine phân biệt ngày giả lập vs hôm nay (`src/components/TimeMachine.tsx`)

Không đổi cấu trúc/`idx` mặc định. Hai chỉnh nhỏ:

1. Nhãn "Ngày giả lập" (TimeMachine.tsx:405) thêm hậu tố `(mới nhất)` khi đang ở điểm cuối:

```tsx
<div className="muted small">Ngày giả lập{idx === points.length - 1 ? " (mới nhất)" : ""}</div>
```

2. Chú thích dưới box guidance lịch sử (TimeMachine.tsx:423-426) thêm câu chỉ về box live đầu trang:

```tsx
<p className="muted small">
  Ở chế độ lịch sử: chỉ tín hiệu thế giới (điểm mua + nhóm điểm đáy past-only);
  chênh lệch VN không tham gia backtest. Tín hiệu cho hôm nay xem ở
  <b> Gợi ý hành động</b> đầu trang.
</p>
```

Tiêu đề card đã rõ ("Xét lại lịch sử — máy thời gian", TimeMachine.tsx:234) — giữ nguyên.

### Phần 3 — Dòng freshness: chú thích cuối tuần (`src/lib/freshness.ts` + `src/components/Dashboard.tsx`)

Thêm helper thuần vào `src/lib/freshness.ts`:

```ts
/** Vàng thế giới (GC=F) đóng cửa: T7 cả ngày + CN trước 22:00 UTC (giờ mở lại). */
export function isGoldMarketClosed(nowMs: number): boolean {
  const d = new Date(nowMs);
  const dow = d.getUTCDay(); // 0=CN, 6=T7
  if (dow === 6) return true;
  if (dow === 0 && d.getUTCHours() < 22) return true;
  return false;
}
```

Trong `Dashboard.tsx`, import `isGoldMarketClosed`, và trong khối freshness (sau nhánh `mounted ? ...`), thêm dòng chú thích khi thị trường đóng:

```tsx
{mounted && isGoldMarketClosed(nowMs) && (
  <div className="freshness-note muted small">
    Thị trường vàng thế giới nghỉ cuối tuần — đây là phiên gần nhất, không phải dữ liệu cũ.
  </div>
)}
```

Đặt trong `<div className="freshness">`, sau khối clock/sources, vẫn trong điều kiện `mounted` (tránh lệch hydration — `isGoldMarketClosed` phụ thuộc giờ client).

## Kiểm thử

- `isGoldMarketClosed` (unit, `tests/freshness.test.ts`):
  - Thứ Bảy bất kỳ giờ → true (vd `2026-06-13T10:00:00Z`).
  - Chủ Nhật trước 22:00 UTC → true (vd `2026-06-14T21:00:00Z`).
  - Chủ Nhật từ 22:00 UTC → false (vd `2026-06-14T23:00:00Z`).
  - Thứ Sáu → false (vd `2026-06-12T10:00:00Z`).
  - Thứ Hai → false (vd `2026-06-15T10:00:00Z`).
- Timeline (kiểm tra thủ công sau khi chạy collect hoặc qua test backtest nếu có): điểm cuối `points` có `date` = bar XAU cuối cùng; số bucket backtest không đổi so với trước.
- `npm test` toàn bộ xanh; `npx tsc --noEmit` sạch; `npm run build` thành công.

## File chạm

- `scripts/backtest.ts` — gồm index bar cuối vào timeline
- `src/lib/freshness.ts` — helper `isGoldMarketClosed`
- `tests/freshness.test.ts` — test cho helper
- `src/components/TimeMachine.tsx` — nhãn "(mới nhất)" + chú thích trỏ về box live
- `src/components/Dashboard.tsx` — dòng chú thích cuối tuần
- `public/data/timeline.json` — tái sinh qua collect (nếu chạy được)
