# Biểu đồ giá — toggle đơn vị Ounce / Chỉ

## Mục tiêu

Trên biểu đồ giá chính (`PriceChart` ở Dashboard), hai đường XAU/USD và SJC phải luôn cùng MỘT đơn vị, để độ lệch VN–thế giới đọc được trực tiếp. Thêm toggle 2 chế độ:

- **Ounce** (mặc định, hành vi hiện tại): trục USD/oz — SJC quy đổi sang USD/oz-tương-đương.
- **Chỉ**: trục triệu VND/chỉ — XAU quy đổi sang VND/chỉ bằng tỷ giá USD/VND **đúng ngày đó**, SJC lấy giá thật chia 10 (VND/lượng → VND/chỉ).

Chỉ áp dụng cho biểu đồ. Các ô giá, radar, PremiumChart, Time Machine, engine, JSON không đổi.

## Kiến trúc

Toàn bộ toán quy đổi nằm trong `src/lib/price-chart.ts` (đã là nơi chứa `sjcUsdMap` + `buildGeom`), không rải vào React.

### Đơn vị và công thức

```
TROY_OZ_GRAMS = 31.1034768, LUONG_GRAMS = 37.5, CHI_GRAMS = LUONG_GRAMS / 10 = 3.75

oz  (giữ nguyên): xau = point.price
                  sjc = sjcSell / usdVnd / LUONG_GRAMS * TROY_OZ_GRAMS      // USD/oz-tương-đương
chi (mới):        xau = point.price / TROY_OZ_GRAMS * usdVnd * CHI_GRAMS     // VND/chỉ
                  sjc = sjcSell / 10                                          // VND/chỉ
```

Chế độ `chi` là công thức thuận của `worldVndPerLuong` (scripts/run.ts), chế độ `oz` là công thức nghịch — hai chế độ cùng một quan hệ, nên tỷ lệ SJC/XAU (premium) giống hệt nhau ở cả hai. Đây là bất biến khoá bằng test.

### API mới trong `src/lib/price-chart.ts`

```ts
export type PriceUnit = "oz" | "chi";

/** date → giá trị cả 2 đường theo đơn vị. xau=null ⇒ dùng thẳng point.price (chế độ oz, không đổi). */
export function unitSeries(points, vnRows, unit): { sjc: Map<string, number>; xau: Map<string, number> | null }

export function fmtPrice(v: number, unit: PriceUnit): string   // "$4.504" | "14,3 tr₫"

buildGeom(points, start, span, sjc, W?, H?, opts?: { xau?: Map<string,number> | null; unit?: PriceUnit })
```

`unitSeries(_, _, "oz")` trả `{ sjc: sjcUsdMap(vnRows), xau: null }` — đường code cũ nguyên vẹn.

### `buildGeom`

Hiện `xauPath` luôn phủ toàn cửa sổ (points[] không thiếu ngày); SJC là series thưa dựng qua `collect` + `render`. Chế độ `chi` làm XAU cũng thưa (chỉ ngày có `usdVnd`), nên **dùng lại đúng `collect`/`render` đó cho XAU** thay vì viết nhánh riêng:

- `opts.xau == null` → XAU vẽ như cũ, `xauPath` luôn có, tail/from/asOf = null.
- `opts.xau` là Map → XAU đi qua `collect`/`render`: `xauPath` có thể null, có `xauTailPath`/`xauFrom`/`xauAsOf` như SJC.

`ChartGeom` thêm: `unit`, `xauTailPath`, `xauFrom`, `xauAsOf`, `yOf(i): number | null`; `xauPath` đổi thành `string | null`. `min`/`max`/`y` vẫn là trục chung của hai đường — bất biến "không chéo giả tạo" giữ nguyên.

`yOf(i)` là toạ độ y của đường XAU tại index i theo đơn vị đang chọn (`oz`: `y(points[i].price)`; `chi`: `y(xauMap.get(date))`, null khi ngày đó thiếu tỷ giá). Cần vì `PanZoomChart` đang đặt marker bằng `geom.y(points[i].price)` — ở chế độ `chi` giá trị USD nằm ngoài dải VND nên marker sẽ bay khỏi khung nếu không sửa. Đây là root cause chung cho mọi lớp marker (buy dots, bottom dots, con trỏ chọn ngày), sửa một chỗ.

### Giới hạn dữ liệu (không bịa số)

`usdVnd` chỉ có từ 2025-02-08 (566 ngày), timeline XAU có từ 2009. Ở chế độ `chi`, XAU **chỉ vẽ trong vùng có tỷ giá thật** — không forward-fill ngược về quá khứ bằng tỷ giá hiện tại. Chú thích dưới chart nói rõ "XAU: từ {ngày}" (dùng lại `xauFrom`, đúng cơ chế đã có cho SJC). Vùng so sánh VN–thế giới vốn cũng chỉ tồn tại trong khoảng này.

### UI

- Toggle: một nút `iconbtn small-btn` trong `.pc-ranges`, nhãn là đơn vị đang xem (`$/oz` ↔ `₫/chỉ`), `aria-pressed` + `aria-label` tiếng Việt. State `useState<PriceUnit>("oz")` trong `PriceChart` — không lưu localStorage (không được yêu cầu).
- Legend đổi theo đơn vị: `oz` → "XAU/USD · SJC (quy đổi $)"; `chi` → "XAU (quy đổi ₫/chỉ) · SJC (₫/chỉ)".
- Nhãn trục (`showAxis`) format qua `fmtPrice(v, geom.unit)` thay vì `fmtUsd` cứng.
- Note dưới chart: thêm nhánh `xauFrom`/`xauAsOf` song song nhánh SJC đã có.

## Ảnh hưởng tới caller khác

`TimeMachine` và `BearDownsideCard` gọi `buildGeom(points, start, span, map, 700, 200)` — không truyền `opts`, mặc định `unit="oz"`, `xau=null` ⇒ hành vi và pixel không đổi. `PanZoomChart` là component dùng chung: sửa marker sang `yOf(i)` và axis sang `fmtPrice` cho cả ba caller; ở chế độ `oz` cả hai đều cho kết quả giống hệt trước.

## Test (vitest, thêm vào `src/lib/price-chart.test.ts`)

1. `unitSeries("chi")`: XAU = `price/TROY*fx*CHI`, SJC = `sjcSell/10`; ngày thiếu `usdVnd` bị bỏ khỏi cả hai map.
2. Bất biến premium: tỷ lệ `sjc/xau` cùng ngày giống nhau ở `oz` và `chi` (sai số float nhỏ) — khoá việc hai công thức là nghịch đảo của nhau.
3. `buildGeom` chế độ `chi`: hai đường chung một trục (giá trị lớn hơn ⇒ y nhỏ hơn), `xauFrom` = ngày đầu có tỷ giá trong cửa sổ, `xauPath` null khi cửa sổ không có ngày nào có tỷ giá.
4. `yOf`: `oz` ≡ `y(points[i].price)`; `chi` trả null ở ngày thiếu tỷ giá và trong `[0,H]` ở ngày có.
5. Hồi quy: `buildGeom` không truyền `opts` cho kết quả y hệt bộ test hiện có (11 test cũ giữ nguyên, không sửa).

## Ngoài phạm vi

Ô giá/Dashboard, PremiumChart, Time Machine, Bear cards, engine, backtest, JSON, lưu đơn vị qua session, đơn vị thứ ba (lượng/gram).
