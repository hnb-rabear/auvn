# Lọc đáy theo percentile tương đối (cửa sổ trượt) — thay ngưỡng tuyệt đối

Ngày: 2026-06-18. Phạm vi: thay logic lọc của lớp "Ngưỡng đáy thử nghiệm" trong Time Machine — từ *"cycleProb ≥ ngưỡng tuyệt đối"* (đã chứng minh vô dụng) sang *"cycleProb thuộc top X% của cửa sổ trượt gần"*, có bộ chọn cửa sổ.

## Vấn đề (đã chẩn đoán bằng dữ liệu thật)

Band tuyệt đối (`cycleProb ≥ 60`) chỉ tô **2010–2013** rồi tắt hẳn từ 2014. Nguyên nhân: `cycleProb` là **base-rate toàn lịch sử mở rộng**; giai đoạn gấu vàng 2011–2015 (−45%) nhồi vô số ngày oversold-nhưng-không-đáy (nhãn FALSE) vào base-rate của bin, kéo nó tụt dưới 60 **vĩnh viễn** (cửa sổ mở rộng, dữ liệu xấu cũ ở lại mãi). Trong khi đó tín hiệu phân biệt `cycleBin=3` (oversold+vĩ mô) **vẫn bắn đều mỗi năm** (2020: 56 ngày, 2024: 36). Lỗi nằm ở **lớp đổi-sang-xác-suất tuyệt đối**, không phải tín hiệu.

Bằng chứng (số ngày `cycleProb≥60`): 2011=195, 2013=48, **2014→2026 = 0** (dù prob max 2026 vẫn 52%, bin=3 vẫn bắn).

## Quyết định (chốt qua brainstorming)

- Lọc theo **percentile tương đối** của `cycleProb` trong **cửa sổ trượt** (không phải ngưỡng tuyệt đối).
- **Bộ chọn cửa sổ** 6T/1N/2N/3N (126/252/504/756 phiên), mặc định **2N (504)**.
- **Slider percentile** P, mặc định **85** (top 15%).
- Dùng chính `cycleProb` (đủ mượt: ~29–30 giá trị/năm) — **KHÔNG** thêm điểm số thô / dữ liệu / engine.
- **Thay** hẳn slider tuyệt đối; giữ vỏ toggle + band SVG.
- Walk-forward: cửa sổ chỉ gồm ngày ≤ ngày xét (past-only) → "đáy = hôm nay".

## Mô hình

Cho mỗi ngày `i`:
- Cửa sổ = `points[max(0, i-W+1) .. i]` (W = windowSessions; gồm chính ngày i, chỉ quá khứ).
- `vals` = các `cycleProb` trong cửa sổ ≠ null.
- Nếu `cycleProb[i] == null` HOẶC `vals.length < minSamples (=60)` → rank = `NaN` (không tô).
- Ngược lại: `rank[i] = round( count(v <= cycleProb[i]) / vals.length * 100, 1 )` (0..100; 100 = cao nhất cửa sổ).

Ngày **đạt** = `!isNaN(rank[i]) && rank[i] >= P`. Band = các dải index liên tiếp đạt.

**Vì sao sửa được lỗi:** percentile là **tương đối trong cửa sổ gần** → mọi giai đoạn luôn có top X% → band rải đều mọi năm; cửa sổ trượt **đẩy dữ liệu cũ ra** nên không bị gấu 2011–2015 đầu độc.

## Hàm thuần (isolation) — `src/lib/timeline.ts`

```ts
/** Percentile (0..100) của cycleProb mỗi ngày trong cửa sổ trượt W phiên (gồm ngày đó,
 *  chỉ quá khứ). NaN nếu cycleProb[i]==null hoặc cửa sổ < minSamples mẫu non-null. */
export function bottomPercentileRank(
  points: TimelinePoint[],
  windowSessions: number,
  minSamples = 60
): number[]

/** Gom các dải index có mask[i]===true liên tiếp. */
export function maskRuns(mask: boolean[]): { start: number; end: number }[]
```

- **Xóa** `bottomBandRuns` (logic tuyệt đối cũ — đã bị thay) + test của nó.

## Giao diện — `src/components/TimeMachine.tsx`

- **State:** bỏ `bottomThr`; thêm `bottomPctl` (mặc định 85), `bottomWindow` (mặc định 504). Giữ `showBottomExp`.
- **Memo:**
  - `bottomRank = useMemo(() => showBottomExp ? bottomPercentileRank(points, bottomWindow) : [], [showBottomExp, bottomWindow, points])`.
  - `bottomRuns = useMemo(() => maskRuns(bottomRank.map((r) => !Number.isNaN(r) && r >= bottomPctl)), [bottomRank, bottomPctl])`.
  - `bottomHitCount = useMemo(() => bottomRank.filter((r) => !Number.isNaN(r) && r >= bottomPctl).length, [bottomRank, bottomPctl])`.
- **UI khi `showBottomExp`:**
  - Hàng nút cửa sổ (tái dùng class `iconbtn small-btn` như chip zoom): `[6T]=126 [1N]=252 [2N]=504 [3N]=756`, nút đang chọn có class `active`, onClick `setBottomWindow`.
  - Slider percentile (class `.tm-exp`): nhãn `Top {100 - bottomPctl}% giống đáy nhất · cửa sổ {nhãn} — {bottomHitCount} ngày` + ghi chú nhỏ *"tương đối trong cửa sổ, KHÔNG khẳng định là đáy thật (walk-forward)"*; `<input type=range min=0 max=100 step=1 value={bottomPctl}>`.
- **Band:** spark `bands` vẫn nhận `bottomRuns` (`{start,end}[]`) — **render giữ nguyên** (SVG `<rect className="tm-band">` trước `<path>`).
- Nhãn cửa sổ map: `{126:"6 tháng",252:"1 năm",504:"2 năm",756:"3 năm"}`.

## CSS

Không cần class mới (`.tm-band` đã có; nút cửa sổ dùng `iconbtn small-btn` sẵn có).

## Test

- `tests/timeline.test.ts`:
  - Xóa describe `bottomBandRuns`.
  - `bottomPercentileRank`: `cycleProb=[50,10,30,90,20]`, window=5, minSamples=1 → `[100, 50, 66.7, 100, 40]`; một ngày `cycleProb=null` → phần tử đó `NaN`; cửa sổ < minSamples → `NaN`.
  - `maskRuns`: `[false,true,true,false,true]` → `[{start:1,end:2},{start:4,end:4}]`; rỗng/toàn-false → `[]`.
- `npm run build` + `npm test` xanh (golden engine/backtest không đổi — chỉ timeline.ts + UI).
- Tay: bật toggle → band rải đều mọi năm (2014/2018/2020/2024…), KHÔNG dồn 2009–2013; đổi 6T↔3N đổi mật độ; kéo slider co/giãn; warmup đầu không tô; tắt toggle hết band.

## KHÔNG làm (YAGNI)

- Percentile của `cycleProb` — không thêm điểm số thô/dữ liệu/engine/`runBottom`/`BOTTOM_CONFIG`.
- Tái dùng band rendering + style nút; xóa helper tuyệt đối chết (không giữ song song).
- Không tầng swing; không nút "nhảy tới đáy"; không animation.

## Rủi ro

- **Tương đối, không tuyệt đối:** sóng tăng không-đáy vẫn bị tô "top X% ít xấu nhất" → nhãn phải nói rõ "không phải đáy thật". Đánh đổi cố hữu (user đã chấp nhận).
- Cửa sổ 6T ít mẫu (~42 STEP-3) → percentile lập bập hơn; user tự chọn.
- `bottomPercentileRank` O(N·W) mỗi lần đổi cửa sổ (~2M phép, <50ms) — memo theo `[points, bottomWindow]` nên chỉ chạy khi đổi cửa sổ, không chạy khi kéo slider.
