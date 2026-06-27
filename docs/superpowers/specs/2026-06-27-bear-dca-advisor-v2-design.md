# Bear DCA Advisor v2 — 4 pha + Hybrid: Thiết kế & bằng chứng

Ngày: 2026-06-27. Thay thế thiết kế v1 (2026-06-27-bear-dca-advisor-design.md). Tiến hóa
BearDcaCard hiện có: thêm pha RECOVERY, bull→gom đều, hybrid override, **gỡ bỏ BH timing**.

## Bối cảnh & vì sao v2

v1 đưa Bottom Hunter (BH) làm công cụ canh ngày mua trong nhịp. Backtest sau đó
(`scripts/bear-bh-timing-value.ts`) chứng minh **chờ BH tệ hơn mua đầu nhịp** ở mọi giai
đoạn (−0.38% toàn bear, −1.87% cấp tính) — vì BH bắn quá hiếm (13% nhịp bear), 87% nhịp
còn lại phải mua ở deadline giá xấu hơn. Người dùng cũng xác nhận BH trên Time Machine
không đáng tin bằng trực giác. → **Gỡ BH khỏi quyết định DCA.**

Đồng thời mở rộng: mỗi pha thị trường có chiến thuật riêng, và người dùng đè được pha
(hybrid) vì họ tin trực giác hơn auto-detect.

## Tổng hợp nghiên cứu (mọi tín hiệu đã test)

`scripts/bear-combine-signals-study.ts` test 3 hướng kết hợp composite/BH/preset vào
quyết định khối lượng, train(<2019)/test(>=2019) + placebo:

| Hướng | Train | Test | Phán quyết |
| --- | --- | --- | --- |
| H1 Confluence (nhiều tín hiệu đồng thuận) | −0.02% | +0.00% | LOẠI — bật 4/204 nhịp, thua cả placebo |
| H2 Composite-6m làm cổng pha | −0.21% | +1.62% | LOẠI — overfit (âm train, dương test) |
| H3 BH xác nhận RECOVERY | 0.00% | 0.00% | LOẠI — điều kiện gần như không trùng |

**Kết luận:** composite/BH/preset là tín hiệu forward-return 1–3 tháng, KHÔNG cộng hưởng
với bài toán giá vốn 2–3 năm của DCA. Khớp triết lý CLAUDE.md "tách các lớp". Premium VN
KHÔNG backtest được (data quá ngắn) → loại khỏi mô hình lịch sử. Thứ DUY NHẤT thắng: pha
thị trường + pct2y/dd.

## Bằng chứng 4 pha (`scripts/bear-phase-taxonomy-study.ts`)

Báo CẢ giá vốn VÀ tài sản cuối (ngân sách 1/tháng, tiền dư để mặt) — vì giá vốn thuần
đánh lừa (gom ít → giá vốn đẹp nhưng gom được ít vàng).

| Pha | n nhịp | Chiến thuật | Giá vốn vs FLAT | Tài sản vs FLAT |
| --- | --- | --- | --- | --- |
| BULL | 109 | **FLAT** (gom đều) | — | BOOST cho −20.64% nếu lệch |
| ACUTE | 20 | **DEPTH** (theo dd) | +3.94% | — |
| GRIND | 64 | **BOOST** (theo pct2y) | +1.85% | +1.35% (thắng cả 2) |
| RECOVERY | 11 | **×1.5** (gom mạnh) | ~0% | +10.23% ⚠️ |

## Engine (sửa `src/lib/bear-dca.ts`)

### Phân loại pha — chỉ dùng quá khứ (rolling ATH + ddChange 21 phiên)

```
ddChange = dd_now − dd_(21 phiên trước)

BULL     : dd < 0.15
ACUTE    : dd >= 0.15 AND ddChange >  +0.03
RECOVERY : dd >= 0.15 AND ddChange <  −0.03
GRIND    : dd >= 0.15 AND |ddChange| <= 0.03
```

### Khối lượng theo pha

```
BULL     → 1.0  (gom đều)
ACUTE    → depthQty(dd):  dd>=0.40→1.5, dd>=0.25→1.0, dd>=0.15→0.75  (dưới 0.15 không xảy ra trong ACUTE)
GRIND    → boostQty(pct2y): <0.25→1.5, <0.50→1.0, <0.75→0.75, >=0.75→0.5
RECOVERY → 1.5  (gom mạnh, cờ rủi ro = true)
```

`depthQty`, `boostQty` đã tồn tại từ v1 — giữ nguyên. Thêm hàm `classifyPhase`.

### Override (hybrid)

Engine tính `suggestedPhase` (tự động). Hàm `qtyForPhase(phase, dd, pct2y)` thuần để UI
tính lại hệ số khi người dùng chọn pha khác. Engine KHÔNG lưu lựa chọn người dùng (state
phía client, không vào JSON).

### Types (sửa `src/lib/types.ts`)

```typescript
export type BearPhase = "bull" | "acute" | "recovery" | "grind";

// SỬA BearDcaAnalysis: bỏ bhFiredThisCycle; đổi mode→phase; thêm các pha
export interface BearDcaAnalysis {
  generatedAt: string;
  dataDate: string;
  isBear: boolean;        // dd >= 0.15
  ddFromAth: number;
  ddChange: number;
  phase: BearPhase;       // suggestedPhase tự động
  pricePct2y: number | null;
  mult: number;           // hệ số cho phase tự động
  recoveryRisk: boolean;  // true khi phase==="recovery" (UI hiện cảnh báo)
  note: string;
}
```

Bỏ field `isAcute`, `mode`, `bhFiredThisCycle` của v1. `BearDcaPoint` bỏ `cycleProb`,
`swingProb` (không còn dùng). `BearDcaHealth` (cấu trúc) giữ nguyên — NHƯNG `monitorBearDca`
phải tính lại khối lượng theo mô hình 4-pha mới (dùng chung `classifyPhase` + `qtyForPhase`:
bull→1.0, acute→depthQty, grind→boostQty, recovery→1.5), không còn dùng `isAcute`/cycleProb.

### Data pipeline (`scripts/run.ts`)

`bearDcaPoints` bỏ cycleProb/swingProb (chỉ còn date, price, pricePct2y). Phần còn lại
giữ nguyên: ghi `bear-dca.json` + `bear-dca-health.json`.

## Component (sửa `src/components/BearDcaCard.tsx`)

4 trạng thái hiển thị theo `phase` (hoặc pha người dùng đè):

- **bull:** "GOM ĐỀU" + giải thích "vùng Tăng, gom đều tay". Gauge pct2y tham khảo.
- **acute:** "GOM theo độ sâu" + gauge dd ATH (vạch 25%/40%). Badge "Sụp cấp tính · −X%/tháng".
- **grind:** "GOM theo định giá" + gauge pct2y (vạch 75%). Badge "Rỉ máu · cách đỉnh X%".
- **recovery:** "GOM MẠNH ×1.5" + **banner cảnh báo rủi ro** (cố định). Badge "Hồi phục · +X%/tháng".

**Hybrid override UI:** hàng nút chọn pha (4 nút: Tăng/Cấp tính/Rỉ máu/Hồi phục). Nút pha
được app gợi ý có dấu "(gợi ý)". Bấm nút khác → card tính lại hệ số + giải thích cho pha đó
bằng `qtyForPhase`. Hiển thị tín hiệu thô (dd, ddChange, pct2y) để người dùng tự phán đoán.

**Cảnh báo RECOVERY (cố định khi phase/chọn = recovery):**
> ⚠️ Gom mạnh khi hồi phục là cú cược giá tiếp tục lên. Nếu "hồi giả" rồi sụp tiếp, bạn lỗ.
> Bằng chứng mỏng (n=11 nhịp). Cân nhắc theo khẩu vị rủi ro.

**Note chân card (mọi pha):**
> ⓘ Chỉ áp dụng vùng Bear (giá cách đỉnh ≥15%). Vùng Tăng: gom đều tay.

**Timing:** card ghi rõ "Mua vào ngày DCA cố định của bạn." Không nhắc BH.

## Giới hạn (đọc kỹ)

1. Bear duy nhất trong lịch sử (2013–2019), n=76 nhịp; ACUTE n=20, RECOVERY n=11. Mỏng.
2. RECOVERY ×1.5 là **cược leverage theo trend**, không phải kỹ năng giá vốn (giá vốn ~0,
   tài sản +10% chỉ vì bơm vốn lúc giá lên). Lỗ nếu hồi giả. Cảnh báo bắt buộc trên UI.
3. Phân loại pha dùng giá XAU thế giới, không phải SJC. Premium VN ngoài mô hình.
4. ddChange 21 phiên: pha có thể đổi trễ ~1 nhịp so cảm nhận thị trường.
5. composite/BH/preset đã test và LOẠI khỏi quyết định DCA (overfit/vô hiệu/thua placebo).

## Đã LOẠI bằng bằng chứng

| Hướng | Lý do | Hồ sơ |
| --- | --- | --- |
| BH canh timing trong nhịp | −0.38%..−1.87% vs mua đầu nhịp | `bear-bh-timing-value.ts` |
| Confluence nhiều tín hiệu | thua placebo, bật 4/204 | `bear-combine-signals-study.ts` |
| Composite-6m làm cổng pha | overfit (âm train) | `bear-combine-signals-study.ts` |
| BH xác nhận RECOVERY | vô hiệu 0.00% | `bear-combine-signals-study.ts` |
| Premium VN | không backtest được (data ngắn) | — |
| Bull tilt-down (BOOST/HALF) | tài sản −20%..−31% | `bear-phase-taxonomy-study.ts` |

## Tái lập

```bash
npm run collect
npx tsx scripts/bear-phase-taxonomy-study.ts    # bằng chứng 4 pha (giá vốn + tài sản)
npx tsx scripts/bear-combine-signals-study.ts   # 3 hướng kết hợp (đều loại) + placebo
npx tsx scripts/bear-bh-timing-value.ts         # BH timing vô ích
```
