# Bear DCA Advisor — gom vàng theo pha thị trường: phương pháp & bằng chứng

Cập nhật: 2026-06-28. Sinh bởi các `scripts/bear-*.ts` trên dữ liệu thật.

Lớp **độc lập**, KHÔNG đụng composite mua/bán, Bottom Hunter, hay Vùng tích lũy cũ. Trả lời
một câu hỏi riêng cho người gom vàng vật lý DCA ngân sách cố định:
**"Tháng này nên gom bao nhiêu, theo pha thị trường đang ở?"** — *phản ứng theo dữ liệu,
KHÔNG dự đoán tương lai* (CLAUDE.md: "No prediction claims — decision support only").

Thay thế AccumulationCard. Chi tiết thiết kế: `docs/superpowers/specs/2026-06-27-bear-dca-advisor-v2-design.md`.

## Mô hình 4 pha (chỉ dùng quá khứ — rolling ATH + ddChange 21 phiên)

`dd` = drawdown từ đỉnh lịch sử (rolling ATH). `ddChange` = dd hôm nay − dd 21 phiên trước.

| Pha | Điều kiện | Khối lượng | Lý do |
| --- | --- | --- | --- |
| **Tăng (bull)** | dd < 15% | ×1.0 (gom đều) | lệch xuống làm tài sản −20% |
| **Sụp cấp tính (acute)** | dd ≥ 15% và ddChange > +3pp | DEPTH theo dd: ≥40%→1.5, ≥25%→1.0, ≥15%→0.75 | càng sâu càng gom mạnh |
| **Hồi phục (recovery)** | dd ≥ 15% và ddChange < −3pp | ×1.5 ⚠️ | cược leverage theo trend (rủi ro) |
| **Rỉ máu (grind)** | dd ≥ 15% và \|ddChange\| ≤ 3pp | BOOST theo pct2y: <25%→1.5, <50%→1.0, <75%→0.75, ≥75%→0.5 | gom theo định giá |

**Timing:** mua vào ngày DCA cố định. KHÔNG canh Bottom Hunter trong nhịp (đã chứng minh hại).

**Hybrid:** app gợi ý pha tự động; người dùng đè được (client state, không vào JSON). Engine:
`classifyPhase(dd, ddChange)` + `qtyForPhase(phase, dd, pct2y)` (src/lib/bear-dca.ts).

## Bằng chứng 4 pha (`scripts/bear-phase-taxonomy-study.ts`)

Đo CẢ giá vốn (capital-weighted) VÀ tài sản cuối (ngân sách cố định, tiền dư để mặt) vs FLAT
— vì giá vốn thuần đánh lừa (gom ít → giá vốn đẹp nhưng gom được ít vàng).

| Pha | n nhịp | Chiến thuật | Giá vốn vs FLAT | Tài sản vs FLAT |
| --- | --- | --- | --- | --- |
| BULL | 109 | FLAT | — | BOOST làm −20.64% nếu lệch |
| ACUTE | 20 | DEPTH | +3.94% | — |
| GRIND | 64 | BOOST | +1.85% | +1.35% (thắng cả 2) |
| RECOVERY | 11 | ×1.5 | ~0% | +10.23% ⚠️ (leverage) |

## Đã LOẠI bằng bằng chứng (KHÔNG tái thêm khi chưa chạy lại study)

| Hướng | Kết quả | Hồ sơ |
| --- | --- | --- |
| **BH canh timing trong nhịp** | −0.38% (toàn bear) .. −1.87% (cấp tính) vs mua đầu nhịp; BH bắn chỉ 13% nhịp | `bear-bh-timing-value.ts` |
| **Confluence nhiều tín hiệu** (pct2y+dd+composite+BH) | thua placebo; bật 4/204 nhịp | `bear-combine-signals-study.ts` |
| **Composite-6m làm cổng pha** | overfit: train −0.21%, test +1.62% | `bear-combine-signals-study.ts` |
| **BH xác nhận RECOVERY** | vô hiệu 0.00% | `bear-combine-signals-study.ts` |
| **Premium VN** | không backtest được (data quá ngắn) | — |
| **Bull tilt-down** (gom ít khi bull) | tài sản −20%..−31% | `bear-phase-taxonomy-study.ts` |
| **MA200 / momentum 6T làm ranh giới bull/bear** | MA200−DD15: CI block-bootstrap chứa 0 cả train+test; placebo gần bằng tín hiệu thật; momentum báo bear giả trong bull | `bear-trend-boundary-study.ts`, `bear-ma200-rigorous-study.ts` |
| **Dự đoán xu hướng nhiều năm từ đỉnh** | chỉ n=3 đỉnh lịch sử, kết quả trải −21%..−44%, hồi 40..107 tháng; "đỉnh→sập" và "chỉnh→tăng" giống hệt real-time | `bear-peak-analog.ts` |

**Bài học chính:** composite/BH/preset/MA200 đều là tín hiệu *forward-return ngắn hạn (1–3
tháng)*, KHÔNG cộng hưởng với bài toán *giá vốn 2–3 năm* của DCA. Phần lợi của tilt khối
lượng vốn mỏng (placebo gần chạm). Đây là **lan can phản ứng theo pha, không phải máy dự
báo**. Mô hình tối giản (pha + pct2y/dd) là toàn bộ câu chuyện.

## Health monitor + đồng bộ UI (2026-07-03, sau review)

`monitorBearDca` cũ có 3 lỗi tin cậy: (1) đo CHỈ giá vốn — chính doc này ghi "giá vốn thuần
đánh lừa"; (2) cửa sổ 2 năm gộp cả nhịp bull (q=1 y hệt baseline) pha loãng điểm về 0 →
bull thuần cho `impr=0` → "degraded" oan, và bear-vừa-bắt-đầu là lúc banner dễ sai nhất;
(3) `impr > 0` strict, không vùng nhiễu — một nhịp xấu lật banner. Bản mới:

- Chỉ chấm khi ≥6 **nhịp bear** trong cửa sổ (`recentBearCycles`), thiếu → `insufficient`.
- Giá vốn tính TRÊN nhịp bear (`recentImprPct`) + metric **tài sản cuối** toàn cửa sổ
  (`recentAssetImprPct`: ngân sách 1/nhịp, tiền chưa tiêu để mặt, gom quá xem như vay 0%).
- `degraded` chỉ khi một trong hai metric < **−0.5 điểm %** (vùng nhiễu).

**Đồng bộ Time Machine:** trước đây Time Machine hiện lớp phanh Accumulation cũ (×0.25 khi
pct2y>75%) — mâu thuẫn trực diện với card này cùng ngày (bull + giá đắt: card nói ×1.0, Time
Machine nói ×0.25). Giờ Time Machine dùng `bearDcaAt(prices, i, pct2y)` (cùng engine, golden
test khóa `bearDcaAt` ≡ `runBearDca` ở index cuối) — MỘT con số sizing toàn app.
`AccumulationCard.tsx` (dead component) đã xóa; engine accumulation + JSON giữ nguyên
(lớp còn sống, chỉ không còn surface UI riêng).

**Quy ước dấu ddChange (thống nhất):** dương = đáy SÂU THÊM, đơn vị "điểm %/tháng" (pp của
drawdown, KHÔNG phải % giá — hai số lệch nhau khi dd sâu). Card từng hiện "+5%/tháng" ở dòng
gợi ý và "−5%/tháng" trong note cho CÙNG một số.

## Giới hạn (đọc kỹ)

1. Bear lớn duy nhất trong lịch sử (2013–2019), n=76 nhịp; ACUTE n=20, RECOVERY n=11. Mỏng.
2. RECOVERY ×1.5 là cược leverage theo trend (giá vốn ~0, tài sản +10% chỉ vì bơm vốn lúc
   giá lên). Lỗ nếu hồi giả. UI bắt buộc hiện cảnh báo rủi ro.
3. Phân loại pha dùng giá XAU thế giới, không phải SJC. Premium VN ngoài mô hình.
4. **Nhãn pha chập chờn:** trong bear thật, acute/grind/recovery đổi gần như mỗi nhịp (ddChange
   dao động quanh ±3pp). Hệ số khối lượng vẫn ổn, nhưng nhãn hiển thị sẽ nhấp nháy. Chu kỳ
   "cấp tính kéo dài → rỉ máu → hồi" gọn gàng KHÔNG tồn tại — bear là chuỗi sụp-hồi lặp nhanh
   (`scripts/bear-phase-history.ts`, `bear-phase-cycles.ts`).
5. KHÔNG dự đoán tương lai. Mỗi pha tự kích hoạt khi dữ liệu xảy ra.

## Tái lập

```bash
npm run collect
npx tsx scripts/bear-phase-taxonomy-study.ts    # bằng chứng 4 pha (giá vốn + tài sản)
npx tsx scripts/bear-adaptive-study.ts          # ADAPTIVE 2 chế độ + sensitivity ngưỡng
npx tsx scripts/bear-combine-signals-study.ts   # 3 hướng kết hợp composite/BH/preset (đều loại)
npx tsx scripts/bear-bh-timing-value.ts         # BH timing vô ích
npx tsx scripts/bear-ma200-rigorous-study.ts    # MA200 vs dd15 (CI + placebo) — không đổi
npx tsx scripts/bear-peak-analog.ts             # dải kịch bản từ đỉnh — vì sao không dự đoán được
npx tsx scripts/bear-phase-history.ts           # liệt kê đoạn theo pha
npx tsx scripts/bear-phase-cycles.ts            # chu kỳ acute→grind→recovery liền kề
```

Cấu hình + ngưỡng khai báo tại `src/lib/bear-dca.ts` — số evidence phải khớp doc này.
