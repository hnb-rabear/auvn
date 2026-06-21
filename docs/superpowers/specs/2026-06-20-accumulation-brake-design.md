# Thiết kế: Lớp "Vùng tích lũy" — phanh DCA chống mua đỉnh

Ngày: 2026-06-20. Nhánh: `feat/accumulation-brake`. Trạng thái: chờ duyệt.

## 1. Vấn đề & lý do

Người dùng tích sản vàng vật chất theo kiểu DCA (mua đều). Câu hỏi: *"gom **bây giờ** có lợi cho giá vốn trung bình **nhiều năm** không?"* — một câu hỏi **khác hẳn** ba lớp đã có:

| Lớp | Câu hỏi | Tầm nhìn |
| --- | --- | --- |
| Composite (preset) | xu hướng thuận để vào? | 1–3 tháng |
| Bottom Hunter | giá sắp hết rơi? | bắt đáy nhọn |
| Fusion MUA độ-tin-cao | cả hai cùng bật | 3 tháng |
| **Vùng tích lũy (mới)** | **gom bây giờ có hạ giá vốn 2–3 năm?** | **2–3 năm** |

### Bằng chứng thăm dò (đã chạy, XAU/USD 17 năm, cổng 2 giai đoạn train<2019/test≥2019)

Thước đo: **giá MUA trung bình mỗi lượng** (capital-weighted = ΣVND/Σlượng) của DCA-điều-tiết so với DCA phẳng. Chỉ dùng dữ liệu **tại thời điểm mua** (percentile trailing past-only + composite as-of) → không forward-return, không pseudo-replication; giá vốn thấp hơn = nhiều lượng/VND hơn = tốt cho tích sản.

Kết luận quét toàn diện:
1. **Chỉ một feature qua cổng:** percentile giá so dải **2 năm** ("đắt/rẻ so chính nó gần đây"). Cửa sổ 2 năm (504 phiên) thắng 3/4/5 năm.
2. **Chỉ phanh, không boost.** Mọi "gom mạnh khi rẻ/đáy" đều yếu hoặc âm ở train; mọi "ghìm khi đắt/bi quan" đều bền. Nửa "mua ít khi đắt" mới mang tín hiệu.
3. **Bottom Hunter KHÔNG thuộc lớp này** — tăng mua khi nó báo "gần đáy" làm *tệ đi* giá vốn dài hạn (train −2.15%). Săn đáy nhọn ≠ hạ giá vốn nhiều năm.
4. **Real-yield (DFII10) NO-GO** — số test to (+10.7%) nhưng train âm: chữ ký overfit chế độ bull 2019–26, đúng như nó từng NO-GO ở bài toán đáy. Ghép vào kéo train từ +1.59% xuống +0.35%.
5. **Composite chỉ giúp ở nửa "tránh-bán"** (ghìm thêm khi composite bi quan), cộng dồn tốt với phanh định-giá.

Chi tiết quá trình: hội thoại brainstorm + `scripts/accumulation-study.ts` (chính) + `scripts/accumulation-ryield.ts` (hồ sơ NO-GO real-yield).

## 2. Cấu hình khóa & evidence

Tuyển bằng `scripts/accumulation-study.ts` (lưới 54 cấu hình, **48 vượt cổng 2 giai đoạn**, xếp theo min-excess + CI block-bootstrap + placebo). Cấu hình thắng thuần min-excess (A) phanh gần như mọi tháng (cảm giác "luôn ghìm"); ta **chọn cấu hình B nhẹ hơn để ship** vì trực giác hơn và **CI hai cấu hình chồng nhau** (chênh lệch không có ý nghĩa thống kê).

**ACCUM_CONFIG (B):**
- `win = 504` phiên (≈2 năm) — cửa sổ percentile giá, past-only.
- `expHi = 0.75` — phanh khi percentile giá > 0.75 (đỉnh vùng 2 năm).
- `mExp = 0.25` — hệ số khi đắt.
- `compThr = -30`, `mComp = 0.5` — ghìm thêm khi composite < −30.
- `floor = 0.2` — sàn hệ số (stack tối thiểu 0.25×0.5=0.125 → nâng 0.2). Hệ số ∈ {1, 0.5, 0.25, 0.2}, **không bao giờ >1, không bao giờ 0**.

**Evidence (giá vốn TB rẻ hơn DCA phẳng):**

| Giai đoạn | Cải thiện | CI95 block-bootstrap | Số tháng phanh |
| --- | --- | --- | --- |
| train (2009–2018) | **+2.26%** | [0.63%, 4.27%] | 32 |
| test (2019–2026) | **+8.24%** | [2.55%, 13.76%] | 65 |
| placebo (phanh ngẫu nhiên cùng số tháng) | train +0.32% / test −0.40% | ≈ 0 | — |

**Caveat trung thực (đưa vào UI + docs/accumulation.md):**
- Cận dưới CI train = **+0.63%** — mỏng. Ở chế độ phẳng/gấu lợi ích có thể chỉ ~0.6%, **trong tầm một lần spread mua-bán SJC vật chất**. Đây là **lan can chống FOMO mua đỉnh**, không phải "máy đẻ thêm vàng".
- Số test +8% bị bull 2019–26 tô hồng — đừng đọc làm kỳ vọng. Số train (~2%) đáng tin hơn.
- Phanh-chỉ nghĩa: mua ít hơn lúc đắt → giá vốn TB thấp hơn, **đổi lại gom được ít vàng hơn lúc đắt** (tiền để dành làm "đạn khô" cho ~25% tháng rẻ luôn xuất hiện trong mỗi chu kỳ 2 năm theo định nghĩa percentile).
- Cấu hình vẫn chọn khi biết test (như presets/bottom); cổng + min-excess hạn chế overfit nhưng không xóa → bắt buộc có **monitor thoái hóa live**.

## 3. Kiến trúc (theo khuôn `bottom.ts`/`runBottom`)

Mọi tính toán ở thời điểm collect; trình duyệt chỉ đọc JSON. Không nguồn dữ liệu mới (dùng XAU closes + composite đã có).

### 3.1 Core: `src/lib/accumulation.ts`
Hàm thuần `runAccumulation(bars: DailyBar[], composites: {date,composite}[]): AccumulationAnalysis`.
- `pricePct2y(i)`: percentile giá[i] so 504 phiên trước (past-only). null nếu < warmup.
- `accumMult(pricePct, composite)`: áp ACCUM_CONFIG → hệ số ∈ {1, 0.5, 0.25, 0.2}.
- Live (ngày cuối): `pricePct2y`, `composite`, `mult`, mảng `brakes` (giá-đỉnh / composite-bi-quan) + giải thích VN, `provisional` (true khi < warmup 504 phiên — không đủ 2 năm lịch sử).
- History (mọi phiên, step 1): `[{date, pricePct2y, mult}]` để Time Machine tra mọi ngày.

### 3.2 Types: `src/lib/types.ts`
- `ACCUM_CONFIG` constant (như `BOTTOM_CONFIG`/`PRESETS`) + evidence numbers, đồng bộ `docs/accumulation.md`.
- `interface AccumulationAnalysis { generatedAt; dataDate; pricePct2y; composite; mult; brakes: {id,label,explanation}[]; provisional; evidence; history: {date;pricePct2y;mult}[]; note }`.
- Bổ sung `TimelinePoint`: `accumMult?: number; pricePct2y?: number` (optional — file timeline cũ không có, merge theo NGÀY như `cycleBin`).

### 3.3 Pipeline: `scripts/run.ts`
- Sau khi dựng `timeline`, gọi `runAccumulation(xauRes.bars, timeline.points.map(p=>({date,composite})))`.
- Enrich `timeline.points` với `accumMult` + `pricePct2y` (merge theo date).
- Ghi `public/data/accumulation.json`.
- Gọi `monitorAccumulation(...)` → ghi `public/data/accumulation-health.json`.

### 3.4 Monitor: `scripts/monitor-accumulation.ts`
- Tính lại cải thiện giá vốn trên ~2 năm gần nhất vs phẳng; `status: ok | degraded | insufficient`.
- `degraded` khi cải thiện ≤ 0 trên cửa sổ gần đây. Hiển thị banner cảnh báo trên UI (như preset-health).

### 3.5 Study (đã có)
- `scripts/accumulation-study.ts` — tuyển + cổng 2 giai đoạn + CI + placebo + in cấu hình KHÓA.
- `scripts/accumulation-ryield.ts` — giữ làm **hồ sơ NO-GO** real-yield (như `bottom-feature-study.ts`).

## 4. UI (một accordion riêng, hero giữ nguyên)

Thêm accordion **"Vùng tích lũy (DCA)"** cạnh "Săn đáy" trong `Dashboard.tsx`, component mới `AccumulationCard.tsx` (khuôn `BottomGauges.tsx`), đọc `accumulation.json` + `accumulation-health.json`.

Nội dung:
- **Gauge** percentile giá so 2 năm (0 rẻ → 100 đắt), vạch phanh ở 75.
- **Verdict VN:** vd "Đỉnh vùng 2 năm (82%) — ghìm mua ×0.25" / "Vùng thường (40%) — mua đều ×1".
- **Phanh nào bật** + giải thích VN (giá-đỉnh / composite-bi-quan).
- **Dòng evidence:** "Lịch sử: phanh này hạ giá vốn TB +2.26% (2009–2018) / +8.24% (2019–2026), CI…".
- **Caveat** (mục 2): lan can chống FOMO, không phải máy đẻ vàng; ma sát spread; số test tô hồng.
- **Banner degraded** khi `accumulation-health.status==='degraded'`.
- **`provisional`**: khi < 2 năm lịch sử → "chưa đủ dữ liệu kiểm chứng" (sẽ không xảy ra với XAU 17 năm, nhưng giữ cho chặt).

**Time Machine:** `TimeMachine.tsx` đọc `point.accumMult` + `point.pricePct2y` (đã forward-fill/merge), hiển thị hệ số phanh as-of-ngày khi tua — nhất quán với đáy/composite đã có. Không có field (điểm timeline cũ) → ẩn dòng.

## 5. Kiểm thử (TDD)

- `accumulation.test.ts`:
  - `pricePct2y` past-only, không look-ahead (thêm dữ liệu tương lai không đổi giá trị quá khứ).
  - Ánh xạ hệ số: ngưỡng `expHi`/`compThr`, sàn `floor`; hệ số luôn ∈ [0.2, 1], **không >1, không =0**.
  - Golden: số evidence trong `ACCUM_CONFIG` khớp doc (như test presets/bottom).
  - History dày (step 1) là superset của live; giá trị mỗi ngày là hàm thuần của ngày đó.
- Regression `run.ts`/timeline: `accumMult`/`pricePct2y` merge đúng theo date, optional an toàn với file cũ.

## 6. Ngoài phạm vi / đã loại (ghi vào docs/accumulation.md để không tái thêm mù)

- **Boost (gom mạnh khi rẻ/đáy):** yếu/kém bền — đã loại.
- **Bottom Hunter làm booster:** train âm — đã loại.
- **Real-yield / GSR:** overfit chế độ bull — NO-GO (hồ sơ `accumulation-ryield.ts`).
- **Value-averaging có "kho chờ":** phức tạp, không tương xứng biên lợi ~2%.
- **Premium VN trong lõi:** chưa đủ lịch sử backtest (như composite/bottom) — để ngoài, caveat.
- **Đưa vào hero / market-timing (về 0):** từ chối — phá kỷ luật DCA.

## 7. Tài liệu

`docs/accumulation.md` mới (khuôn `docs/bottom.md`/`docs/presets.md`): phương pháp, evidence, giới hạn trung thực, bảng NO-GO. `ACCUM_CONFIG` evidence phải khớp doc (cùng quy ước presets.md ↔ PRESETS).
