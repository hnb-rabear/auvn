# Đánh dấu "khởi đầu vùng đáy" = cạnh lên cycleBin==3 (thay band percentile)

Ngày: 2026-06-18. Phạm vi: thay lớp lọc đáy trong Time Machine (band percentile — đã chứng minh kém) bằng marker **"điểm bắt đầu vùng đáy"** = ngày `cycleBin` vừa vào bin cao nhất (oversold + vĩ mô). Walk-forward, tham-số-0, có bằng chứng backtest.

## Bối cảnh & bằng chứng

Ba lần thử trước (ngưỡng tuyệt đối `cycleProb≥X%`, percentile, cheapness/confluence) đều gãy. Backtest (`scripts/bottom-approach-compare*.ts`, dữ liệu commit, 83 đáy chu kỳ thật) cho kết quả dứt khoát:

- `cycleProb≥60` tuyệt đối: phủ 4/18 năm (chỉ 2010–13), win 6T 54% (dưới nền). **Hỏng.**
- Cheapness (chiết khấu ≥15% / percentile): win 64–65% ≈ nền, hội tụ còn 56% (**dưới nền**). **Ngõ cụt.**
- **`cycleBin==3`** (oversold+vĩ mô): win 6T **75%**, trung vị **+11,4%**, **48%** trong ±10 phiên của đáy thật, phủ 15/18 năm. **Tốt nhất.**
- **Cạnh lên `cycleBin==3`** (ngày vừa vào, "bắt đầu"): 105 dấu (~6/năm), win 6T **78%**, trung vị +9,2%, **báo trước đáy thật ~3 phiên (lead +3)**, phủ 15/18 năm.

Kết luận: tín hiệu chưa bao giờ là vấn đề — `cycleBin==3` đã là chỉ báo đáy tốt nhất, bắn đều mọi năm. Hỏng nằm ở lớp calibration (`cycleProb` base-rate toàn cục) mà band đã lỡ lọc theo. **Cạnh lên bin==3** trả lời trực tiếp câu "hôm nay có phải khởi đầu đáy không": thưa, tách rời, báo sớm, walk-forward thuần.

## Quyết định (chốt qua brainstorming + backtest)

- Marker = **cạnh lên `cycleBin==3`**: `cycleBin[i]===3 && cycleBin[i−1]!==3`. Tham-số-0 (không cửa sổ/percentile/ngưỡng).
- **Thay** hẳn band percentile; xóa `bottomPercentileRank`/`maskRuns`/band rects/window selector/slider.
- Marker = **hình thoi hổ phách** (overlay HTML, khác chấm tròn mua/bán).
- Panel ngày: khi ngày chọn là cạnh lên → dòng "◆ Điểm BẮT ĐẦU vùng đáy".
- Walk-forward thuần (chỉ bin hôm nay vs hôm qua) → tính được ngay hôm nay, không look-ahead.
- Nhãn trung thực: mạnh hơn trong xu hướng tăng, yếu hơn trong gấu (dương cả 2 giai đoạn), KHÔNG khẳng định là đáy.

## Hàm thuần — `src/lib/timeline.ts`

```ts
/** Các ngày "bắt đầu vùng đáy" = cạnh lên bin đáy cao nhất:
 *  cycleBin[i]===3 && cycleBin[i-1]!==3 (oversold+vĩ mô vừa bật, hôm trước chưa). Walk-forward. */
export function bottomStartIdxs(points: TimelinePoint[]): number[]
```

- Duyệt tuyến tính; `points[i-1]?.cycleBin !== 3` (an toàn ở i=0: undefined≠3 ⇒ ngày đầu nếu bin3 vẫn tính cạnh).
- **Xóa** `bottomPercentileRank` + `maskRuns` (ngõ cụt — không giữ song song).

## Giao diện — `src/components/TimeMachine.tsx`

- **Xóa:** state `bottomPctl`/`bottomWindow`; memo `bottomRank`/`bottomRuns`/`bottomHitCount`; hằng `BOTTOM_WINDOWS`/`WINDOW_LABEL`; `spark.bands` + render `<rect className="tm-band">`; hàng nút cửa sổ + slider percentile.
- **Thêm:**
  - State `showBottomStart` (mặc định false).
  - Toggle trong panel ⚙: **"Đánh dấu khởi đầu vùng đáy"** + dòng nhỏ: *"Ngày oversold + vĩ mô lần đầu bật — điểm dò đáy sớm (walk-forward). Mạnh hơn trong xu hướng tăng; KHÔNG khẳng định là đáy."*
  - Memo `bottomStarts = useMemo(() => (showBottomStart ? bottomStartIdxs(points) : []), [showBottomStart, points])`.
  - Trong `spark` memo: `startMarkers = toMarkers(bottomStarts)` (tái dùng `toMarkers` sẵn có — lọc cửa sổ + map `{cx,cy}`); thêm `startMarkers` vào return; thêm `bottomStarts` (hoặc `startMarkers`) vào deps.
  - Render trong overlay `.tm-markers`: `{spark.startMarkers.map((m,i) => <span key={`st${i}`} className="tm-mk start" style={{left:`${(m.cx/spark.W)*100}%`, top:`${(m.cy/spark.H)*100}%`}} />)}`.
  - Panel ngày: `const isStart = bottomStarts.includes(idx);` → khi true, render dưới dải ngày: `<div className="muted small">◆ Điểm BẮT ĐẦU vùng đáy — oversold + vĩ mô vừa bật (dò đáy sớm, không phải đáy chắc)</div>`.

## CSS — `src/app/globals.css`

- **Xóa:** `.tm-band`.
- **Thêm:**
```css
.tm-mk.start {
  width: 9px;
  height: 9px;
  background: var(--gold);
  transform: translate(-50%, -50%) rotate(45deg);
}
```
(không `border-radius` → hình thoi; transform có cả translate-canh-giữa + rotate.)

## Test

- `tests/timeline.test.ts`:
  - Xóa describe `bottomPercentileRank` + `maskRuns`.
  - `bottomStartIdxs`: `cycleBin [1,3,3,2,3,undefined,3,3]` → `[1,4,6]`; `[3,3,1]` → `[0]` (cạnh đầu mảng); `[1,2,2,0]` → `[]`.
- `npm run build` + `npm test` xanh (golden engine/backtest không đổi — chỉ timeline.ts + UI).
- Tay: bật toggle → thoi hổ phách rải mọi năm (thưa); chọn đúng ngày cạnh-lên → panel hiện "◆ Điểm BẮT ĐẦU vùng đáy"; zoom/pan marker co đúng; tắt toggle hết marker + hết dòng panel.

## KHÔNG làm (YAGNI)

- Tín hiệu tham-số-0; xóa sạch percentile/band/window/slider.
- Tái dùng overlay marker + `toMarkers`; không thêm dữ liệu/engine.
- Chỉ cycle (không swing); không nút "nhảy tới đáy"; không tô cụm bin==3.

## Rủi ro

- **Phụ thuộc chế độ:** mạnh trong bò (test 6T +15%), yếu trong gấu (train +2,7%) — dương cả hai nhưng nhãn phải nói rõ "không phải đáy chắc, dò đáy sớm".
- Marker thoi phải đủ khác chấm tròn — `--gold` + rotate 45° + không bo tròn đảm bảo; thưa (~6/năm) nên không rối kể cả zoom "Tất cả".
- `bottomStarts.includes(idx)` O(n) mỗi render — n nhỏ (~100), chấp nhận; nếu lo có thể bọc Set.
