# Bear DCA Advisor — Thiết kế & bằng chứng

Ngày: 2026-06-27. Thay thế AccumulationCard bằng card thích ứng bear market.

## Bối cảnh & động lực

Người dùng mua vàng vật lý (SJC/nhẫn) ~1 chỉ/tháng bằng DCA. Hiện dùng Bottom Hunter
làm timing. Vấn đề: trong bear thật (2013–2019), Bottom Hunter câm 96% tháng → không thể
là trụ cột chiến thuật. AccumulationCard cũ (BOOST pct2y thuần) bị điểm mù: khi giá mới
bắt đầu sụp từ vùng đắt, pct2y vẫn cao → bảo gom ít đúng lúc đáng gom nhiều hơn.

## Tóm tắt backtest (scripts/bear-*-study.ts, scripts/bear-adaptive-study.ts)

Bear thật duy nhất trong lịch sử: 2013-04-12 → 2019-08-13, max DD 44%, 76 tháng.

### Kết quả ADAPTIVE vs BASE (gom đều 1 chỉ/tháng)

| Giai đoạn | BOOST (pct2y) | DEPTH (dd ATH) | **ADAPTIVE** |
|---|---|---|---|
| Cấp tính (11 tháng, ddChange>3pp) | −0.04% ❌ | +1.75% | **+1.75%** |
| Bear bình thường (65 tháng) | +1.50% | +0.58% | **+1.50%** |
| Bear tổng (76 tháng) | +1.30% | +0.77% | **+1.55%** |
| Bull/sideways | +4.8% | +0.1% | (không áp dụng) |

ADAPTIVE = BOOST ở bình thường + DEPTH ở cấp tính → thắng cả hai giai đoạn.

### Ngưỡng phát hiện cấp tính (sensitivity)

| Ngưỡng ddChange | n acute | Bear tổng | Cấp tính |
|---|---|---|---|
| >1pp | 26 | +1.41% | +0.65% |
| >2pp | 18 | +1.53% | +1.14% |
| **>3pp** | **11** | **+1.55%** | **+1.75%** ← chọn |
| >4pp | 7 | +1.49% | +2.26% |
| >5pp | 5 | +1.44% | +2.29% |

>3pp/tháng là tối ưu tổng. Ngưỡng cao hơn tốt hơn ở acute nhưng giảm bear tổng.

### BH timing (COMBO-A)

Mua ngay khi BH bắn lần đầu trong nhịp (không chờ ngày giá thấp nhất). Nếu BH không
bắn → mua ngay đầu nhịp. **Không chờ deadline cuối tháng** — backtest: khi BH không bắn,
cuối window đắt hơn đầu 58% trường hợp, TB +0.7% đắt hơn trong bear.

## Kiến trúc (Approach A — tính toán lúc collect, không lúc page load)

### Data pipeline (scripts/run.ts)

Thêm lớp `bearDca` song song với `accumulation`:

```
BearDcaPoint[] (date, price, pricePct2y, dd, ddChange, bhPrice|null)
  → runBearDca(points) → BearDcaAnalysis (JSON)
  → public/data/bear-dca.json
```

Không cần file riêng nếu tích hợp vào `accumulation.json` — tách file để độc lập.

### Engine (src/lib/bear-dca.ts)

**Phát hiện chế độ:**
```
ddChange = dd_hôm_nay - dd_tháng_trước  (tháng = 21 phiên)
isAcute  = ddChange > 0.03 (>3pp/tháng)
```

**Tính qty:**
```
DEPTH (cấp tính — theo dd ATH):
  dd ≥ 40% → ×1.5
  dd ≥ 25% → ×1.0
  dd ≥ 15% → ×0.75
  dd < 15% → ×0.5  (buffer: sắp thoát bear)

BOOST (bình thường — theo pct2y):
  pct2y < 25% → ×1.5
  pct2y < 50% → ×1.0
  pct2y < 75% → ×0.75
  pct2y ≥ 75% → ×0.5
```

**Timing gợi ý:**
- Nếu BH đã bắn trong nhịp hiện tại → note "BH đã bắn, nếu chưa mua thì mua ngay"
- Nếu BH chưa bắn → "mua đầu nhịp, không chờ"

**Bear detection:** dd từ rolling ATH ≥ 15%.

### Types mới (src/lib/types.ts)

```typescript
interface BearDcaAnalysis {
  generatedAt: string;
  dataDate: string;
  isBear: boolean;           // dd >= 15%
  ddFromAth: number;         // 0..1
  ddChange: number;          // pp/tháng (21 phiên)
  isAcute: boolean;          // ddChange > 0.03
  pricePct2y: number | null;
  mult: number;              // qty multiplier ∈ {0.5, 0.75, 1.0, 1.5}
  mode: "acute" | "normal" | "bull";
  bhFiredThisCycle: boolean; // BH bắn trong 21 phiên gần nhất
  note: string;              // giải thích tiếng Việt
}
```

### Component (src/components/BearDcaCard.tsx)

Thay thế `AccumulationCard`. Ba trạng thái:

**Bull (isBear=false):**
- Banner ⚠ "Card này chỉ dùng trong vùng Bear. Thị trường hiện không ở vùng Bear (giá cách đỉnh X%)."
- Note chân card (luôn hiện): "Chỉ áp dụng khi thị trường ở vùng Bear (giá cách đỉnh ≥15%)."

**Bear bình thường (isBear=true, isAcute=false):**
- Headline: hành động (GOM ÍT LẠI / GOM ĐỀU / GOM NHIỀU HƠN)
- Giải thích: pct2y, lý do
- Gauge: thanh pct2y (rẻ→đắt), vạch mốc
- Chế độ badge: "Bình thường · −X% ATH"
- Note chân card: "Chỉ áp dụng khi thị trường ở vùng Bear (giá cách đỉnh ≥15%)."

**Bear cấp tính (isBear=true, isAcute=true):**
- Headline: hành động theo DEPTH
- Giải thích: dd ATH, ddChange, lý do dùng DEPTH thay pct2y
- Gauge: thanh dd ATH (đỉnh→sâu), ngưỡng bậc thang
- Chế độ badge: "Sụp cấp tính · −X%/tháng"
- Note chân card: "Chỉ áp dụng khi thị trường ở vùng Bear (giá cách đỉnh ≥15%)."

**Popup ⓘ (dùng chung):**
- Giải thích mục đích, 2 chế độ, BH timing, kiểm chứng số liệu

### Tích hợp vào Dashboard

- `AccumulationCard` → `BearDcaCard` trong `Dashboard.tsx`
- Accordion label giữ nguyên "Vùng tích lũy (DCA)" hoặc đổi thành "Mức mua tháng này"
- Import `bear-dca.json` trong `page.tsx` tương tự `accumulation.json`

### Monitor (scripts/monitor-bear-dca.ts)

Tính lại `recentImprPct` trên ~2 năm gần nhất (tương tự monitor-accumulation). Ghi
`bear-dca-health.json`. Hiển thị cảnh báo degraded nếu impr ≤ 0.

## Scripts nghiên cứu (giữ lại, không ship vào app)

- `scripts/bear-strategy-study.ts` — so 7 chiến thuật DCA, backtest bear/bull
- `scripts/bear-deadline-check.ts` — kiểm tra deadline vs đầu tháng
- `scripts/bear-phase-study.ts` — phân tích 3 định nghĩa cấp tính (A/B/C)
- `scripts/bear-combo-c-study.ts` — grid search α (pct2y vs dd ATH)
- `scripts/bear-adaptive-study.ts` — backtest ADAPTIVE 2 chế độ + sensitivity

## Giới hạn

1. Bear duy nhất trong lịch sử (2013–2019) — n=76 tháng, n acute=11. CI chưa tính.
2. Bear hiện tại (5300→4000) chưa có trong train/test — không biết sẽ kéo dài bao lâu.
3. Depth thang bậc (15/25/40%) chọn theo trực giác kinh tế, chưa qua grid search đầy đủ.
4. Giá XAU/USD thế giới, không phải SJC — premium VN không trong mô hình.
5. Đây là lan can hỗ trợ quyết định, không phải lời hứa tối ưu hóa.

## Các hướng đã LOẠI

- **Chờ deadline cuối tháng** — đắt hơn đầu tháng 58% trường hợp trong bear
- **UNION (BH hoặc pct2y<40%)** — miss 45% tháng, không chấp nhận được
- **α trung gian (0.3–0.5)** — không thắng ở giai đoạn nào, trung dung không có lợi
- **Bull mode tự động fallback** — tránh nhầm lẫn; bull dùng composite 6 tháng

## Tái lập

```bash
npm run collect
npx tsx scripts/bear-adaptive-study.ts   # backtest chính
npx tsx scripts/bear-phase-study.ts      # phân tích giai đoạn A/B/C
npx tsx scripts/bear-combo-c-study.ts    # grid search alpha
```
