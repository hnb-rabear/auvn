# Thống nhất biểu đồ thời gian (PanZoomChart) + đường SJC cho Máy Thời gian — thiết kế

**Ngày:** 2026-07-12 · **Trạng thái:** đã duyệt (B / C / A trong phiên brainstorm)

## Vấn đề

1. **Trùng lặp code thật:** PriceChart và TimeMachine copy nguyên ~150 dòng handler cử chỉ
   (pan / tap / pinch / wheel — comment còn tham chiếu chéo nhau) + toán geometry (TimeMachine
   tự tính `spark` inline thay vì dùng `buildGeom` của `src/lib/price-chart.ts`).
   BearDownsideCard dùng cơ chế thứ ba (mật độ px cố định + cuộn ngang native + rescale
   trục Y debounce qua `src/lib/bdo-window.ts`).
2. **Máy Thời gian thiếu đường SJC** — người dùng muốn xem giá SJC quy đổi $ khi tua lịch sử,
   giống biểu đồ giá trên cùng.

## Quyết định phạm vi (đã chốt với chủ dự án)

- **B:** thống nhất CẢ BA chart (PriceChart, TimeMachine, BearDownsideCard) về cùng một cơ chế
  tương tác pan/tap/pinch/wheel. Spec v3 của BearDownsideCard (cuộn native, không zoom,
  `2026-07-12-bear-downside-card-v3` + `…-window-rescale`) **bị thay thế** bởi spec này.
- **C:** đường SJC (quy đổi USD/oz, cùng trục $) thêm vào TimeMachine dưới dạng **toggle trong
  menu ⚙, mặc định TẮT**. BearDownsideCard KHÔNG thêm SJC (card nói về phân phối XAU).
- **A:** phần dùng chung là **component lõi `<PanZoomChart>`** sở hữu SVG + cử chỉ + marker
  overlay + nhãn ngày 2 góc + nhãn trục; mỗi chart giữ chrome riêng (nút range, gear, FAB,
  date input) vì chrome 3 chart khác nhau thật.
- PremiumChart ngoài phạm vi (SVG tĩnh, trục % premium, không tương tác).

## Kiến trúc

### 1. `src/components/PanZoomChart.tsx` (mới)

Controlled component — cha giữ state cửa sổ, lõi chỉ báo sự kiện:

```ts
interface MarkerLayer { key: string; className: string; idxs: number[] }

interface PanZoomChartProps {
  points: TimelinePoint[];                 // trục thời gian + giá XAU
  geom: ChartGeom;                          // cha tính qua buildGeom (memo) — cha cần meta
                                            // (sjcFrom/sjcAsOf/min/max) cho chrome, tính 1 lần
  window: { start: number; span: number };
  onWindowChange(next: { start: number; span: number }, gesture: "pan" | "zoom"): void;
  onSelect?(idx: number): void;             // tap
  selectedIdx?: number | null;              // vạch dọc + chấm cursor
  markers?: MarkerLayer[];                  // buy/sell/exp/start… — class CSS sẵn có (.tm-mk.*)
  height: number;                           // px hiển thị = H của viewBox/buildGeom
                                            // 160 (PriceChart) / 200 (TM — CSS cũ đã cao 200px
                                            // dù viewBox 120, nay đồng nhất) / 200 (BDO)
  denseDots?: boolean;                      // .tm-markers.dense
  showAxis?: boolean;                       // nhãn $ min/max (.pc-axis) — PriceChart bật
  ariaLabel: string;
  children?: ReactNode;                     // FAB ◀▶ của TimeMachine — render trong wrapper
}
```

Lõi sở hữu (một bản duy nhất, xóa 2 bản copy):

- SVG `viewBox 0 0 W H`, `preserveAspectRatio="none"`, vẽ `geom.xauPath` cùng
  `geom.sjcPath` và `geom.sjcTailPath` (nét đứt) nếu có.
- Cử chỉ: 1 ngón tap (< TAP_PX=6 px) = `onSelect`; kéo ngang = pan; 2 ngón pinch = zoom;
  wheel = zoom (listener gốc non-passive để `preventDefault` chặn cuộn trang). Toán cửa sổ
  dùng `applyBrushDrag`/`zoomTo` của `src/lib/brush.ts` (giữ nguyên). Nhả 1 ngón sau pinch
  tiếp tục pan bằng ngón còn lại (hành vi hiện có).
- Marker overlay HTML (chấm tròn tuyệt đối — SVG circle bị stretch méo) + chấm/vạch cursor.
- Nhãn ngày 2 góc (`.tm-edge from/to`), nhãn trục min/max (`.pc-axis`, tùy chọn).
- px→index: hàm thuần `idxAtFrac(start, span, frac)` thêm vào `src/lib/price-chart.ts`
  (có test kẹp biên).

### 2. `src/lib/price-chart.ts` (mở rộng nhẹ)

- `buildGeom` giữ nguyên chữ ký (đã nhận `W`, `H`) — không đổi hành vi, test hiện có giữ.
- Thêm `idxAtFrac`. `MIN_SPAN=14`, `POINTS_PER_MONTH=21` dùng chung từ đây (TimeMachine bỏ
  hằng local trùng).

### 3. Từng chart sau khi chuyển

**PriceChart** — chrome: chip range/nút range, date inputs Custom, legend, note SJC; state
`months`/`win` giữ nguyên ngữ nghĩa (mọi cử chỉ → Custom). Marker layers: buy, start (◆ đáy),
cursor. `showAxis` bật. Hành vi người dùng KHÔNG đổi.

**TimeMachine** — chrome: nút zoom tháng, ⚙ (thêm toggle **"Hiện đường SJC (quy đổi $)"**,
mặc định tắt), slider ngưỡng thử, FAB ◀▶ (children), dateband, các khối as-of. State
`viewStart/viewSpan/zoomMonths` giữ nguyên; gesture `pan` KHÔNG đổi nhãn nút đang chọn,
`zoom` → "custom" (hành vi hiện có). Marker layers: exp, sell, buy, start, cursor. Xóa toán
`spark` inline — dùng `buildGeom` (H=120). Dashboard truyền thêm `vnRows`; `sjcUsd` memo
qua `sjcUsdMap`, chỉ truyền vào geom khi toggle bật. Khi cửa sổ không giao dữ liệu VN thì
đường SJC vắng tự nhiên (hành vi `buildGeom` sẵn có).

**BearDownsideCard** — bỏ toàn bộ cơ chế cuộn native + px cố định + debounce
(`bdo-sparkwrap`, `visibleRange`, `localMinMax`, drag-scroll chuột, `scrollToIdx`).
Chart phần trên thành `<PanZoomChart>` H=200, marker: cursor. Nút cửa sổ: **6T=126 /
1N=252 / 3N=756 / Tất cả** — bấm nút = đặt span + căn giữa quanh ngày đang chọn
(`centerWindow`); pan giữ nút đang chọn, zoom bỏ active (không có nút "custom" riêng).
Chọn ngày qua date input hoặc `asOfIdx` từ ngoài → nếu ngoài cửa sổ thì căn giữa lại.
Trục Y co theo cửa sổ = hành vi mặc định của `buildGeom` (thay cho rescale debounce).
`src/lib/bdo-window.ts` + `src/lib/bdo-window.test.ts` **xóa**. Không SJC.

### 4. CSS (`globals.css`)

- Mới: `.pzc-wrap { position:relative; margin-bottom:6px }`, `.pzc-chart { width:100%;
  display:block; background:var(--card2); border-radius:8px; touch-action:none;
  user-select:none; cursor:crosshair }` (height inline theo prop). PriceChart nhận thêm
  nền card2 + bo góc (trước không có) — đồng nhất có chủ đích.
- Tái dùng nguyên: `.tm-markers`/`.tm-mk.*` (+`.dense`), `.tm-edge`, `.pc-axis`, `.tm-fab`.
- Xóa sau khi migrate: `.tm-chartwrap`, `.tm-chart`, `.pc-chartwrap`, `.pc-chart`,
  `.bdo-sparkbox`, `.bdo-sparkwrap`, `.bdo-edge`, `.bdo-spark`. Giữ `.bdo-winbtns`,
  `.bdo-dateband`, `.bdo-table*`.

## Luồng dữ liệu

```text
cha (state cửa sổ + idx) ──window/selectedIdx/geom──▶ PanZoomChart
PanZoomChart ──onWindowChange(next, gesture)──▶ cha setState
PanZoomChart ──onSelect(idx)──▶ cha setIdx / setSelIdx
cha: geom = useMemo(buildGeom(points, start, span, sjcUsd?, W, H))
```

## Xử lý lỗi / biên

- `points.length < 2` → không render chart (hành vi hiện có từng chart giữ nguyên).
- `vnRows` rỗng / cửa sổ không giao dữ liệu VN → `sjcPath=null`, không vẽ (sẵn có).
- Kẹp biên cửa sổ: mọi đường vào (`applyBrushDrag`, `zoomTo`, `centerWindow`) đã kẹp
  `[0, total−span]`, span `[MIN_SPAN, total]`.
- timeline.json cũ thiếu `bearAsOf` → BearDownsideCard giữ nhánh fallback bảng tĩnh (không chart).

## Kiểm thử

- Test thuần hiện có giữ nguyên: `price-chart.test.ts` (buildGeom), `brush.test.ts`.
- Thêm test `idxAtFrac` (kẹp biên, span=1).
- Xóa `bdo-window.test.ts` cùng lib.
- `npm test` + `npm run build` (static export) sạch.
- Kiểm tra tay: 3 chart cùng cử chỉ; SJC toggle TM; BearDownside chọn ngày ↔ date input
  ↔ `asOfIdx` đồng bộ; PriceChart golden hành vi không đổi.

## Rủi ro

- BearDownsideCard đổi UX vừa ship trong tuần (spec v3) — chủ đích, đã chốt B.
- PriceChart thêm nền card2 — thay đổi thị giác nhỏ, có chủ đích.
