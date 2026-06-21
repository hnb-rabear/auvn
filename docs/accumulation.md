# Vùng tích lũy — phanh DCA chống mua đỉnh: phương pháp & bằng chứng

Cập nhật: 2026-06-20. Sinh bởi `scripts/accumulation-study.ts` trên dữ liệu thật.

Lớp **độc lập**, KHÔNG đụng composite mua/bán hay Bottom Hunter. Trả lời câu hỏi riêng:
**"gom bây giờ có hạ giá vốn trung bình 2–3 năm không?"** — bằng cách ghìm khối lượng DCA
(không bao giờ về 0) khi vàng đắt bất thường so với dải 2 năm hoặc composite bi quan.

## Thước đo

Giá MUA trung bình mỗi lượng (capital-weighted = ΣVND/Σlượng) của DCA-phanh vs DCA phẳng.
Chỉ dùng dữ liệu TẠI thời điểm mua (percentile trailing past-only + composite as-of) → không
forward-return, không pseudo-replication. Giá vốn thấp hơn = nhiều lượng/VND hơn = tốt.

## Cấu hình chốt (B)

| Tham số | Giá trị |
| --- | --- |
| Cửa sổ percentile | 504 phiên (≈2 năm) |
| Phanh khi giá | > percentile 75 → ×0.25 |
| Phanh khi composite | < −30 → ×0.5 |
| Sàn hệ số | 0.2 |

Evidence (cổng 2 giai đoạn, CI block-bootstrap):

| Giai đoạn | Cải thiện giá vốn | CI95 | Số tháng phanh |
| --- | --- | --- | --- |
| train 2009–2018 | +2.26% | [0.63%, 4.27%] | 32 |
| test 2019–2026 | +8.24% | [2.55%, 13.76%] | 65 |
| placebo (phanh ngẫu nhiên cùng số tháng) | ≈0 | — | — |

48/54 cấu hình lưới vượt cổng 2 giai đoạn. Winner thuần min-excess (A: đắt>0.6) phanh gần
như mọi tháng; chọn B (đắt>0.75) để ship vì trực giác hơn, CI chồng nhau.

## Giới hạn — đọc kỹ

1. Cận dưới CI train +0.63% — mỏng; chế độ phẳng/gấu lợi ích có thể ~0.6%, trong tầm spread
   mua-bán SJC vật chất. Đây là lan can chống FOMO, không phải máy đẻ vàng.
2. Số test +8% bị sóng tăng 2019–26 tô hồng — số train (~2%) đáng tin hơn.
3. Phanh-chỉ: mua ít hơn lúc đắt → giá vốn thấp hơn, đổi lại gom được ít vàng hơn lúc đắt.
4. Cheapness của XAU thế giới, không phải SJC. Premium VN không trong mô hình (như composite/bottom).
5. Cấu hình chọn khi biết test (như presets/bottom); `scripts/monitor-accumulation.ts` giám sát thoái hóa live.

## Đã LOẠI bằng bằng chứng (KHÔNG tái thêm khi chưa chạy lại study)

| Hướng | Kết quả | Phán quyết |
| --- | --- | --- |
| BOOST (gom mạnh khi rẻ/đáy) | train yếu/âm | LOẠI — chỉ giữ nửa BRAKE |
| Bottom Hunter làm booster | train −2.15% | LOẠI |
| Real-yield (DFII10) làm neo định giá | test +10.7% nhưng train âm | NO-GO — overfit bull (hồ sơ `scripts/accumulation-ryield.ts`) |
| Cửa sổ 3/4/5 năm | dương nhưng yếu hơn 2 năm | chọn 2 năm |
| Phanh "linh hoạt theo chu kỳ" (suppress/scale theo MA200, momentum 1y, detrend) | mọi biến thể TỆ HƠN bản cứng; 2011 (đỉnh→sập) và 2020 (bull) có chữ ký real-time y hệt nên bộ lọc không tách được | NO-GO (hồ sơ `scripts/accumulation-regime-study.ts`) |
| DCA dựa trên Săn đáy/điểm-mua thay cheapness | boost-đáy hại giá vốn (train −1.8%); chỉ giúp return 6–12 tháng (= việc Bottom Hunter đã làm), không phục vụ tích lũy 2–3 năm | NO-GO (hồ sơ `scripts/accumulation-signal-study.ts`) |

## Tái lập

```bash
npm run collect
npx tsx scripts/accumulation-study.ts    # tuyển config + cổng 2 giai đoạn + CI + placebo
npx tsx scripts/accumulation-ryield.ts   # hồ sơ NO-GO real-yield (cần mạng)
npx tsx scripts/accumulation-regime-study.ts   # hồ sơ NO-GO phanh linh hoạt theo chu kỳ
npx tsx scripts/accumulation-signal-study.ts   # hồ sơ NO-GO DCA dựa trên đáy/điểm-mua
```

`ACCUM_CONFIG` khai báo tại `src/lib/types.ts` — số evidence trong code phải khớp doc này.
