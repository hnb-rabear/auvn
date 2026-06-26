# Vùng tích lũy — phanh DCA chống mua đỉnh: phương pháp & bằng chứng

Cập nhật: 2026-06-25. Sinh bởi `scripts/accumulation-study.ts` trên dữ liệu thật.

Lớp **độc lập**, KHÔNG đụng composite mua/bán hay Bottom Hunter. Trả lời câu hỏi riêng:
**"gom bây giờ có hạ giá vốn trung bình 2–3 năm không?"** — bằng cách ghìm khối lượng DCA
(không bao giờ về 0) khi vàng đắt bất thường so với dải 2 năm.

**MỘT cổng duy nhất** (giá đắt vs dải 2 năm). Cổng composite cũ đã bị **loại bằng ablation**:
đóng góp biên của nó ≈0 trên train và CI chồng hoàn toàn với bản chỉ-giá; đứng một mình CI
train còn chứa 0 (xem mục "Đã LOẠI" + `scripts/accumulation-ablation.ts`).

## Thước đo

Giá MUA trung bình mỗi lượng (capital-weighted = ΣVND/Σlượng) của DCA-phanh vs DCA phẳng.
Chỉ dùng dữ liệu TẠI thời điểm mua (percentile trailing past-only + composite as-of) → không
forward-return, không pseudo-replication. Giá vốn thấp hơn = nhiều lượng/VND hơn = tốt.

## Cấu hình chốt (SHIP)

| Tham số | Giá trị |
| --- | --- |
| Cửa sổ percentile | 504 phiên (≈2 năm) |
| Phanh khi giá | > percentile 75 → ×0.25 |
| Sàn hệ số | 0.2 (chỉ một cổng nên hệ số thực ∈ {1, 0.25}) |

Evidence (cổng 2 giai đoạn, CI block-bootstrap):

| Giai đoạn | Cải thiện giá vốn | CI95 | Số tháng phanh |
| --- | --- | --- | --- |
| train 2009–2018 | +2.82% | [0.92%, 5.02%] | 28 |
| test 2019–2026 | +7.15% | [1.71%, 12.37%] | 60 |
| placebo (phanh ngẫu nhiên cùng số tháng) | ≈0 (−0.03% .. +0.46%) | — | — |

Lưới tuyển vẫn quét cả biến thể có cổng composite (`cThr ∈ {null,−20,−30}`), nhưng cấu hình
ship chốt ở bản **chỉ-giá** vì ablation cho thấy cổng composite không thêm gì có ý nghĩa
(đắt>0.75; winner min-excess đắt>0.6 phanh gần như mọi tháng nên không chọn).

## Giới hạn — đọc kỹ

1. Cận dưới CI train +0.92% — mỏng; lợi ích thực có thể ~1%, trong tầm spread mua-bán SJC
   vật chất. Đây là lan can chống FOMO, không phải máy đẻ vàng.
2. Số test +8% bị sóng tăng 2019–26 tô hồng — số train (~2%) đáng tin hơn.
3. Phanh-chỉ: mua ít hơn lúc đắt → giá vốn thấp hơn, đổi lại gom được ít vàng hơn lúc đắt.
4. Cheapness của XAU thế giới, không phải SJC. Premium VN không trong mô hình (như composite/bottom).
5. Cấu hình chọn khi biết test (như presets/bottom); `scripts/monitor-accumulation.ts` giám sát thoái hóa live.

## Đã LOẠI bằng bằng chứng (KHÔNG tái thêm khi chưa chạy lại study)

| Hướng | Kết quả | Phán quyết |
| --- | --- | --- |
| Cổng composite (<−30 → ×0.5) làm cổng phanh thứ 2 | đóng góp biên FULL−PRICE: train +0.10% (nhiễu), test +0.66% (sóng tăng tô hồng); composite-only train +0.07% CI [−0.52%, +0.69%] (chứa 0) | LOẠI — gỡ khỏi engine, ship 1 cổng (hồ sơ `scripts/accumulation-ablation.ts`) |
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
npx tsx scripts/accumulation-ablation.ts # ablation: đóng góp biên của cổng composite (đã loại)
npx tsx scripts/accumulation-ryield.ts   # hồ sơ NO-GO real-yield (cần mạng)
npx tsx scripts/accumulation-regime-study.ts   # hồ sơ NO-GO phanh linh hoạt theo chu kỳ
npx tsx scripts/accumulation-signal-study.ts   # hồ sơ NO-GO DCA dựa trên đáy/điểm-mua
```

`ACCUM_CONFIG` khai báo tại `src/lib/types.ts` — số evidence trong code phải khớp doc này.
