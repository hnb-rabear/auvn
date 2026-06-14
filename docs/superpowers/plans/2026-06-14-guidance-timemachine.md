# Kế hoạch: đưa "Gợi ý hành động" vào Time Machine

Ngày: 2026-06-14. Mục tiêu: hiển thị lớp Gợi ý hành động (kết hợp điểm mua + săn đáy + chênh VN) tại từng điểm LỊCH SỬ trong Time Machine, để xem "lúc đó công cụ sẽ khuyên gì". Lớp live đã có (`src/lib/guidance.ts`, `ActionGuidance.tsx`, wiring trong `Dashboard.tsx`).

## Vấn đề cốt lõi cần quyết trước

Live panel cần 3 đầu vào: composite/zone + xác suất đáy + premium. Tại điểm lịch sử trong Time Machine:

| Đầu vào | Có sẵn? | Quyết định |
| --- | --- | --- |
| composite/zone | ✅ `timeline.points[i]` + `comps[idx]` | Dùng trực tiếp |
| Xác suất đáy theo ngày | ❌ Không lưu | **Ship `bin` đáy theo ngày** (past-only) — KHÔNG dùng prob% |
| Premium VN | ❌ Backtest cố tình loại VN (note trong timeline.json) | **Tắt cổng premium ở lịch sử** (world-only) |

Hai bẫy bắt buộc tránh:

1. **Look-ahead:** prob% live tính base-rate trên TOÀN BỘ lịch sử → áp vào ngày quá khứ là nhìn trộm tương lai. `bottomScore`/`bin` chỉ dùng RSI/macro tới ngày `i` → past-only. Vì thế lịch sử dùng **bin** (đạt nhóm điểm cao hay không), không dùng prob.
2. **Premium lịch sử không nhất quán:** chuỗi tự thu thập ~489 ngày, percentile trôi theo thời gian. Áp p80 hiện tại vào quá khứ là sai. → Lịch sử bỏ cổng premium; hàm tự ghi "chênh VN: chưa có dữ liệu". Nhất quán với note hiện có của timeline.

## Bước 1 — Data layer: ship bin đáy theo ngày

**`src/lib/bottom.ts`:**
- `buildTier()` đã tính `rows: {i, date, score, bin}` cho cả lịch sử (vòng `for i=WARMUP; i+=STEP`) nhưng đang vứt đi.
- Cho `runBottom()` trả thêm mảng đã sort theo ngày:
  ```ts
  signalHistory: { date: string; cycleBin: number; swingBin: number }[]
  ```
  Ghép từ `cycle.rows` và `swing.rows` (cùng `i`/`date` vì hai tier dùng chung `featuresAt`, chỉ khác `binEdges`).
- **Top bin:** với `binEdges=[-40,0,40]`, `binOf` trả 0..3; nhóm đáy cao nhất = `bin === binEdges.length` (=3, score ≥ 40). Khớp `recentTopFav` của `monitor-bottom.ts`. ĐỪNG hardcode 3 — lấy `binEdges.length`.

**`scripts/run.ts`:**
- Sau khi có `timeline` và `bottom.signalHistory`, làm giàu mỗi `timeline.points[i]` bằng `cycleBin`/`swingBin`. **Thực tế hai lưới TRÙNG NHAU** (backtest và bottom đều `WARMUP=756, STEP=3` trên cùng `xau.bars` → đã kiểm chứng: 1425 điểm, 0 lệch ngày). Dù vậy vẫn merge qua **Map theo NGÀY** (không theo index) để phòng hai constant lệch nhau về sau — rẻ và bền hơn, không phải vì lưới khác nhau.
- Ngày nào trong `signalHistory` không có bin (về lý thuyết: timeline point < bottom warmup) → để `undefined`, đừng gán 0 (0 là bin hợp lệ). **Lưu ý với dữ liệu hiện tại không có điểm nào như vậy**: timeline point đầu = `2009-06-15` (i=756) trùng đúng warmup đáy, nên mọi điểm đều có bin. Vẫn xử lý `undefined` đề phòng dữ liệu xau ngắn hơn về sau.

**`src/lib/types.ts`:**
- `TimelinePoint`: thêm `cycleBin?: number; swingBin?: number;` (optional — tương thích ngược timeline.json cũ).
- Thêm `signalHistory` vào type trả về của `runBottom` (hoặc `BottomAnalysis`).

Kích thước: ~1.200–1.400 điểm × 2 số nguyên ≈ vài KB. Đưa thẳng vào `timeline.json` (một nguồn cho Time Machine), không cần file riêng.

## Bước 2 — Refactor `deriveGuidance` dùng được cho cả 2 nơi

Hàm hiện nhận `cycleProb/swingProb/verified`. Lịch sử không có prob → đổi sang nhận "bottom descriptor" do caller tự dựng:

```ts
// THAY 4 field bottom bằng:
bottom: {
  high: boolean;      // live: cycleProb>=60 (verified) | history: bin===topBin
  verified: boolean;  // có dữ liệu kiểm chứng / đã qua warmup
  label: string;      // chuỗi lý do hiển thị, do caller dựng
}
```

Trong hàm:
- `bottomHigh = inp.bottom.verified && inp.bottom.high`
- reasons đáy: `inp.bottom.verified ? inp.bottom.label : "Săn đáy: chưa đủ dữ liệu kiểm chứng."`
- Ma trận strong/buy/dca/wait/premium-wait/reduce giữ NGUYÊN.

**Caller live (`Dashboard.tsx`)** dựng descriptor:
```ts
bottom: {
  high: cycleVerified && bottom.cycle.prob >= 60,
  verified: cycleVerified || swingVerified,
  label: `Săn đáy: xác suất gần đáy ${lvl} (chu kỳ ${fmt(bottom.cycle.prob)}%, sóng ${fmt(bottom.swing.prob)}%).`,
}
// lvl = cao(>=60)/trung bình(>=35)/thấp theo ngưỡng cũ
```

**Caller lịch sử (`TimeMachine.tsx`)** dựng descriptor từ bin:
```ts
const topBin = BOTTOM_CONFIG.cycle.binEdges.length; // KHÔNG hardcode 3
const hasBin = p.cycleBin !== undefined;
bottom: {
  high: hasBin && p.cycleBin === topBin,
  verified: hasBin,
  label: `Săn đáy: nhóm điểm đáy ${p.cycleBin === topBin ? "CAO" : "chưa cao"} (chu kỳ bin ${p.cycleBin}/${topBin}).`,
}
```

**`tests/guidance.test.ts`:** đổi 10 ca sang shape `bottom: {...}`; thêm ca `verified:false` ⇒ không kích hoạt + ghi "chưa đủ dữ liệu kiểm chứng".

## Bước 3 — Render trong Time Machine

**`TimeMachine.tsx`:**
- Import `deriveGuidance`, `ActionGuidance`, `BOTTOM_CONFIG`.
- Dùng `rawZone` (KHÔNG phải `zone` đã bị ép neutral khi tắt showSell) để guidance phản ánh đúng cả vùng bán — nhất quán với live.
- `useMemo` dựng guidance theo `idx`:
  ```ts
  const histGuidance = useMemo(() => deriveGuidance({
    zone: rawZone,
    composite,
    bottom: { /* descriptor bin ở Bước 2 */ },
    premiumPct: null,   // world-only ở lịch sử
    premiumP80: null,   // ⇒ cổng premium tắt
  }), [rawZone, composite, p.cycleBin]);
  ```
- Chèn `<ActionGuidance guidance={histGuidance} />` trong `tm-detail`, sau `tm-row` (ngày/zone) và trước `tm-scores`.

**`ActionGuidance.tsx`** (tùy chọn): thêm prop `compact?: boolean` để ẩn câu disclaimer dài khi nhúng (đã có disclaimer ở footer). Không bắt buộc.

## Bước 4 — Disclaimer & nhất quán

- Thêm dòng `muted small` dưới guidance lịch sử: "Ở chế độ lịch sử: chỉ tín hiệu thế giới (composite + nhóm điểm đáy past-only); chênh lệch VN không tham gia backtest."
- Giữ nguyên thông điệp vùng bán ("bớt mua, không bán tháo") — khớp `verdictFor` n/a của Time Machine.

## Bước 5 — Kiểm thử & xác minh

1. `npx vitest run` — guidance + bottom + test cũ phải xanh (thêm test ghép date `signalHistory` nếu có).
2. `npm run collect` (hoặc chạy `run.ts`) regenerate `timeline.json` có `cycleBin/swingBin`; kiểm tra điểm pre-2012 có bin `undefined`.
3. `npx tsx scripts/check-modes.ts` — không vỡ.
4. `npm run build` (PC có mạng đầy đủ — môi trường web bị chặn package `xlsx`).
5. Spot-check trực giác (đã backtest, KỲ VỌNG SỬA LẠI):
   - **Đáy đã xác nhận KHÔNG ra `dca`.** Backtest mọi đáy cycle xác nhận: `cycleBin` của chúng nằm ở bin 1–2/3, KHÔNG bao giờ bin 3 (2015-12→1, 2018-08→2, 2020-05→2, 2022-11→1, 2024-12→1, 2025-05→2). Vì `bottomHigh = bin===topBin(3)` chỉ bật ở bin 3 (base-rate đáy 63%, khớp ngưỡng live prob≥60; bin 0–2 chỉ 35–40%), nên tại đáy xác nhận guidance ra `wait`/`buy` theo composite, KHÔNG `dca`. Đây đúng luận điểm docs/bottom.md: "đáy thật" và "chấm điểm đáy top-bin real-time" hiếm khi trùng.
   - **Để xác minh `dca`:** tìm ngày có `cycleBin===3` (toàn lịch sử có 146 ngày như vậy) + composite < buyThr → phải ra `dca`. Phân bố guidance toàn lịch sử (world-only, premium off): `wait 78.5%, dca 9.3%, reduce 9.0%, buy 2.3%, strong 0.9%`.
   - Tua tới vùng composite ≥ +40 → `buy`/`strong`; vùng composite ≤ −40 → `reduce`.

## Thứ tự làm

1. Data: `bottom.ts` expose `signalHistory` → `run.ts` merge vào timeline → `types.ts` thêm field. Regenerate + kiểm tra JSON.
2. Refactor `deriveGuidance` + cập nhật caller live + test. Vitest xanh.
3. Wire `TimeMachine` + render + disclaimer. Build + spot-check.

## Rủi ro / lưu ý

- **Look-ahead:** chỉ dùng `bin` (past-only) cho lịch sử, KHÔNG tái dùng prob% live. Đã kiểm chứng `featuresAt` lọc `b.date <= di` nên bin chỉ dùng quá khứ.
- **Merge theo NGÀY** (không theo index) — như biện pháp phòng hờ. Đã kiểm chứng hai lưới hiện TRÙNG khít (cùng `WARMUP=756/STEP=3`, 1425 điểm, 0 lệch); date-map chỉ để bền nếu constant lệch về sau, KHÔNG vì lưới khác nhau.
- **`undefined` bin ≠ bin 0** — phân biệt rõ ở cả merge lẫn render. (Dữ liệu hiện tại không sinh `undefined` nào, nhưng giữ nhánh xử lý.)
- **Đáy xác nhận → `wait`/`buy`, không `dca`** (xem Bước 5.5) — đừng kỳ vọng `dca` sáng ở đáy thật.
- **Premium world-only ở lịch sử** — đừng tái dựng percentile lịch sử (mẫu quá ngắn → sai).
- `data/` là database tích lũy: `cycleBin/swingBin` là field mới optional, không phá dữ liệu cũ; chỉ đầy đủ sau lần `collect` kế tiếp.
