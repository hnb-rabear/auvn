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
- Sau khi có `timeline` và `bottom.signalHistory`, làm giàu mỗi `timeline.points[i]` bằng `cycleBin`/`swingBin` qua tra cứu nearest-≤-date (hai lưới lấy mẫu khác nhau: backtest vs bottom STEP=3 → map theo NGÀY, không theo index). Dựng Map/binary-search trên `signalHistory` đã sort.
- Điểm timeline trước warmup đáy (i<756 ⇒ ~trước 2012, tùy xau bắt đầu) sẽ KHÔNG có bin → để `undefined`, đừng gán 0 (0 là bin hợp lệ).

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
5. Spot-check trực giác: tua tới đáy đã xác nhận (2015-12, 2018-08) → guidance nên ra `dca` (đáy bin cao + composite thường trung tính, đúng phát hiện thực nghiệm trong docs/bottom.md). Tua tới nhịp tăng giữa chu kỳ → `wait` hoặc `buy`.

## Thứ tự làm

1. Data: `bottom.ts` expose `signalHistory` → `run.ts` merge vào timeline → `types.ts` thêm field. Regenerate + kiểm tra JSON.
2. Refactor `deriveGuidance` + cập nhật caller live + test. Vitest xanh.
3. Wire `TimeMachine` + render + disclaimer. Build + spot-check.

## Rủi ro / lưu ý

- **Look-ahead:** chỉ dùng `bin` (past-only) cho lịch sử, KHÔNG tái dùng prob% live.
- **Map hai lưới theo ngày**, không theo index — backtest grid ≠ bottom grid.
- **`undefined` bin ≠ bin 0** — phân biệt rõ ở cả merge lẫn render.
- **Premium world-only ở lịch sử** — đừng tái dựng percentile lịch sử (mẫu quá ngắn → sai).
- `data/` là database tích lũy: `cycleBin/swingBin` là field mới optional, không phá dữ liệu cũ; chỉ đầy đủ sau lần `collect` kế tiếp.
