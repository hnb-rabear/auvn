# Máy thời gian cho card "Triển vọng 1/3/6 tháng tới" (Bear Downside)

Ngày: 2026-07-02. Trạng thái: đã brainstorm, chờ duyệt spec → writing-plans.

## Mục tiêu

Cho card **"Triển vọng 1/3/6 tháng tới"** ([BearDownsideCard.tsx](../../../src/components/BearDownsideCard.tsx)) một thanh trượt thời gian riêng: cuộn về ngày quá khứ bất kỳ và xem **phân phối card LÚC ĐÓ nói** (as-of, walk-forward) đặt cạnh **thứ THỰC TẾ đã xảy ra** từ ngày đó, kèm dấu ✓/✗ hai mặt. Mục đích: kiểm chứng độ thật của card — "card bảo đáy điển hình −3.9%, thực tế dúi −7%; card bảo kết cục +5%, thực tế +12%".

Không phải dự đoán. Là tái hiện lịch sử + đối chiếu. Lớp độc lập — KHÔNG đụng composite, Bottom Hunter, Bear DCA, Accumulation brake.

## Quyết định đã chốt (brainstorm)

| Câu hỏi | Chốt |
| --- | --- |
| Sống ở đâu | Card Triển Vọng có **thanh trượt riêng**, độc lập, KHÔNG sync với Time Machine |
| Payoff chính | Phân phối điển hình (as-of) **vs THỰC TẾ** xảy ra, cạnh nhau |
| Baseline "card lúc đó nói" | **Tái hiện walk-forward as-of chính xác** (không phải dải cố định) |
| Nguồn tính dải | **Approach A — precompute tại collection-time**, byte-đồng nhất engine |
| Chấm ✓/✗ | **Hai mặt**: đáy thực vs p10 (rủi ro) VÀ kết cục thực vs endMedian (triển vọng) |

## Kiến trúc

Tuân thủ Approach A của repo (mọi phân tích chạy tại collection-time; repo là database) + quy tắc **sparse-stats / dense-display**.

### 1. Data layer (collection-time)

**Producer mới — `src/lib/bear-downside.ts`:**

```ts
export interface BearAsOfBand {
  median: number;    // đáy điển hình (worst-dip) %
  p10: number;       // đuôi 1/10 rủi ro %
  endMedian: number; // kết cục điển hình % tại mốc
  pUp: number;       // % lần giá cao hơn
  n: number;
}
export interface BearAsOfRow { date: string; bands: Record<"21" | "63" | "126", BearAsOfBand | null>; }

export function runBearDownsideHistory(
  bars: { date: string; close: number }[]
): BearAsOfRow[];
```

- Chạy trên **cùng mảng** `bars` mà `runBearDownside` dùng ⇒ nguồn chung, tái hiện chính xác.
- Lưới **thưa STEP=3** (mảng `statIdxs`) như phần thống kê hiện có — chống pseudo-replication, khớp quy tắc repo.
- Với mỗi ngày lưới X: dải **vô-điều-kiện** (conditioning đã bị bác) trên các mẫu `j` (bội STEP) đã **đáo hạn as-of X**: `j + H ≤ X`. Đúng biên như `runBearDownside` (`i + H >= closes.length` → bỏ).
- Tái dùng `furtherDrawdownPct`, `terminalReturnPct`, `computeHorizonStat`; chỉ giữ 5 trường `{median, p10, endMedian, pUp, n}` (bỏ CI — card không hiển thị). Làm tròn 1 chữ số.
- `n < MIN_N (30)` → `band = null`.

**Attach — `scripts/run.ts`:** ngay sau `runBearDownside(xauRes.bars)` ([run.ts:314](../../../scripts/run.ts#L314)), gọi `runBearDownsideHistory(xauRes.bars)` rồi forward-fill lên `timeline.points` bằng helper mới `forwardFillBearAsOf(points, rows)` trong `src/lib/timeline.ts` — sao chép nguyên mẫu `forwardFillBottomHistory` ([timeline.ts:68](../../../src/lib/timeline.ts#L68)): snap nút gần nhất ≤ ngày, merge theo NGÀY (không index).

**Type — `src/lib/types.ts` `TimelinePoint`:** thêm optional (tương thích timeline.json cũ):

```ts
/** Dải Bear Downside as-of-ngày (walk-forward, forward-fill lưới thưa). undefined = timeline.json cũ; null-band từng H = chưa đủ mẫu. */
bearAsOf?: Record<"21" | "63" | "126", BearAsOfBand | null>;
```

### 2. Card UI (`BearDownsideCard.tsx`)

- Nhận thêm prop `timeline` (đã có sẵn ở Dashboard cùng scope với `bd` — [Dashboard.tsx:586](../../../src/components/Dashboard.tsx#L586)). `<BearDownsideCard bd={bearDownside} timeline={timeline} />`.
- State: `idx` = ngày đang chọn (mặc định = `points.length - 1`).
- Điều khiển: **`<input type="range">`** trên `points` + dải ngày đọc + `<input type="date">` (như gear của Time Machine). KHÔNG pan/zoom SVG.
- Header phản ánh ngày X: giá `points[X].price` + `−dd%` as-of X (client-side: `ATH(prices[0..X])`).
- Bảng mỗi kỳ hạn 1/3/6T, 3 khối logic:
  - **Card lúc đó nói** (as-of) — `points[X].bearAsOf[h]`: đáy điển hình (median), kết cục điển hình (endMedian), cơ hội tăng (pUp). `bearAsOf` undefined hoặc band null / `n<30` → "chưa đủ dữ liệu".
  - **Thực tế** (từ X) — đáy tệ thực `min(price[X+1..X+H]) / price[X] − 1` (client, chính xác từ prices); kết cục thực = `points[X].returns[h]`. `X + H > last` → "chưa đáo hạn".
  - **✓/✗ hai mặt** — đáy: ✓ nếu `actualDip ≥ p10` (không thủng đuôi), ✗ nếu `< p10`. Kết cục: ✓ nếu `actualTerminal ≥ endMedian`, ✗ nếu thấp hơn. Chỉ chấm khi CẢ band lẫn thực tế có (đủ mẫu + đã đáo hạn); còn lại để trống.

### 3. Continuity ngày hiện tại

X = mới nhất → dải = read live hôm nay (khớp card hiện tại), cột thực tế = "chưa đáo hạn". Cuộn về quá khứ → thực tế điền dần. Mặc định card không đổi so với hiện tại.

### 4. Toàn vẹn & biên

- Không look-ahead: dải as-of X chỉ dùng cửa sổ đáo hạn `j+H≤X`; dd dùng `prices[0..X]`.
- timeline.json cũ thiếu `bearAsOf` → card fallback về `bd.shown` như hiện tại, ẩn thanh trượt. Graceful.
- Kích thước: `bearAsOf` forward-fill dày ≈ +15 số/point (~5k point), cùng cấp với stat/point đang có; timeline.json ghi đè mỗi lần (không tích lũy). Làm tròn 1 số. Nếu phình, chuyển lưu thưa + forward-fill trong card sau.

## Testing

- **Golden (khóa toàn vẹn):** `runBearDownsideHistory(bars)` tại ngày lưới CUỐI === `runBearDownside(bars).unconditional` (khớp từng số 5 trường). Chứng minh "tái hiện chính xác".
- **Verdict logic:** đáy vs p10, kết cục vs endMedian; các nhánh chưa-đủ-mẫu / chưa-đáo-hạn để trống.
- **Fallback:** timeline.json không `bearAsOf` → card render `bd.shown`, không crash, ẩn slider.

## Docs

Cập nhật `docs/bear-downside.md`: thêm mục "Máy thời gian as-of" (phương pháp walk-forward, luật ✓/✗ hai mặt, nguồn chung với engine).

## Ngoài phạm vi (YAGNI)

- Không sync với Time Machine. Không pan/zoom/pinch. Không nút prev/next tín hiệu. Không CI trên as-of. Không điều-kiện-hóa theo bucket drawdown (đã bị bác). Không thêm horizon 12T.
