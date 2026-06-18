# Thanh trượt lọc đáy (walk-forward) + dải nền trên Time Machine

Ngày: 2026-06-18. Phạm vi: thêm một lớp khám phá trong Time Machine — toggle + slider đặt ngưỡng **xác suất đáy chu kỳ walk-forward** (`cycleProb`, as-of-ngày), tô **dải nền** các khoảng ngày đạt ngưỡng. Song song lớp "Ngưỡng thử nghiệm" composite hiện có, không thay nó.

## Mục tiêu

Người dùng muốn "lọc đáy" giống thanh "Ngưỡng thử nghiệm" hiện có (lọc `composite ≥ ngưỡng`, tô vòng xanh dương), nhưng theo **xác suất gần đáy**. Đúng tinh thần "đáy = hôm nay": mỗi ngày được chấm `cycleProb` **walk-forward** (chỉ dữ liệu đến ngày đó). Slider cho thấy "các vùng mà — theo thời gian thực — tool đã báo gần-đáy ≥ X%". KHÔNG phải đáy nhìn-lại.

## Quyết định (chốt qua brainstorming)

- Lọc theo **`cycleProb`** (đáy chu kỳ ≈6 tháng). Không dùng swing.
- **Lớp riêng, toggle riêng** (`showBottomExp`), song song lớp composite (`showExp`) — bật/tắt độc lập.
- Đánh dấu = **tô dải nền dọc mờ** (band) các khoảng ngày liên tiếp đạt ngưỡng, KHÔNG phải chấm rời.
- Ngưỡng mặc định **60%** (ngưỡng "gần đáy cao" đã kiểm chứng, cũng là ngưỡng bật "Gom rải").

## Dữ liệu & hành vi

- Mỗi `TimelinePoint` đã có `cycleProb?: number | null` (walk-forward, as-of-ngày — đã ship).
- Ngày **đạt** ngưỡng `T`: `cycleProb != null && cycleProb >= T`.
- Ngày `cycleProb == null` (n<10 / trước warm-up) → **không bao giờ đạt** (loại tự nhiên).
- **Gom dải liên tiếp:** các index đạt liền nhau gộp thành một khoảng `{start, end}` để tô một band, không phải nhiều chấm.
- **Đếm:** "N ngày đạt / M ngày **có dữ liệu**" — M = số ngày `cycleProb != null` (KHÔNG phải tổng `points.length`), để tỉ lệ trung thực. (Khác slider composite dùng tổng ngày.)
- Mặc định T = 60.

## Hàm thuần (isolation)

`src/lib/timeline.ts`:

```ts
/** Các dải index LIÊN TIẾP có cycleProb != null && >= threshold (cho lớp lọc đáy). */
export function bottomBandRuns(points: TimelinePoint[], threshold: number): { start: number; end: number }[]
```

- Duyệt tuyến tính; mở dải khi gặp ngày đạt, đóng khi gặp ngày không đạt (null hoặc < threshold).
- Test: `cycleProb [null,70,71,50,80,null,90]`, T=60 → `[{start:1,end:2},{start:4,end:4},{start:6,end:6}]`.

## Giao diện (TimeMachine.tsx)

- **State mới:** `showBottomExp: boolean` (mặc định false), `bottomThr: number` (mặc định 60). Độc lập `showExp`/`expThr`.
- **Toggle** trong panel ⚙, ngay dưới checkbox "Ngưỡng thử nghiệm" composite hiện có: `"Ngưỡng đáy thử nghiệm"`.
- **Slider** (hiện khi `showBottomExp`, dùng lại class `.tm-exp`, đặt cạnh slider composite):
  - Nhãn: `Ngưỡng đáy ≥ {bottomThr}% — {N} ngày đạt / {M} ngày có dữ liệu` + ghi chú nhỏ: *"vùng tool báo gần-đáy real-time (walk-forward) — chỉ để khám phá"*.
  - `<input type=range min=0 max=100 step=1 value={bottomThr}>`.
- **Dải nền trên chart:**
  - `bottomRuns = useMemo(() => showBottomExp ? bottomBandRuns(points, bottomThr) : [], [showBottomExp, bottomThr, points])`.
  - Trong `spark` memo: lọc run giao với cửa sổ `[start,end)`, kẹp `s=max(run.start,start)`, `e=min(run.end,end-1)`, map sang `{x: x(s), w: x(e) - x(s) + step}` với `step = W/(win.length-1)` (bề rộng một khoảng lấy mẫu). **`+ step` để dải 1 ngày (`s==e`) vẫn nhìn thấy** (không bị width 0).
  - Render **`<rect className="tm-band" x={..} y=0 width={..} height={spark.H}>` TRƯỚC `<path>`** trong SVG (nằm dưới đường giá + marker + con trỏ).
  - Lý do dùng SVG rect (không HTML overlay như marker tròn): chữ nhật **kéo giãn vẫn là chữ nhật**, không méo; tự co theo zoom/pan qua cùng hàm `x()`.
- **Đếm:** `M = points.filter(p => p.cycleProb != null).length`; `N = points.filter(p => p.cycleProb != null && p.cycleProb >= bottomThr).length`.

## CSS

`src/app/globals.css`:
```css
.tm-band { fill: rgba(230, 184, 76, 0.14); }
```

## Test

- `tests/timeline.test.ts`: `bottomBandRuns` — gom dải liên tiếp, loại null, cắt dải tại ngày < ngưỡng, biên ngưỡng (>= chứ không >).
- `npm run build` + `npm test` xanh. Không golden nào đổi (chỉ thêm lớp hiển thị + 1 hàm thuần mới).
- Tay: bật toggle → dải hổ phách mờ hiện dưới đường giá tại vùng cycleProb≥60; kéo slider → dải vẽ lại tức thì; zoom/pan → dải co đúng khung; ngày `cycleProb==null` không tô; tắt toggle → hết dải.

## KHÔNG làm (YAGNI)

- Chỉ tầng cycle (không swing); chỉ band (không thêm chấm/vòng).
- Không thêm dữ liệu (cycleProb đã có); không đụng backtest/stats/engine.
- Không đụng slider composite, marker mua/bán/cursor, gauge as-of-ngày, gợi ý.
- Không nút "nhảy tới đáy" (chỉ tô dải; điều hướng để sau nếu cần).

## Rủi ro

- **Mẫu số đếm = ngày có dữ liệu** (không phải tổng ngày) — nhãn phải ghi rõ "ngày có dữ liệu".
- Band full-height có thể che marker → đặt **dưới** path + marker, màu **mờ (.14)**.
- Run vẽ phần giao cửa sổ: phải kẹp `start/end` đúng để band không tràn ngoài khung khi zoom/pan.
