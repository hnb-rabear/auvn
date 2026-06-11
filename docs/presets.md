# Bộ cấu hình (preset) theo kỳ hạn — phương pháp & bằng chứng test

Cập nhật: 2026-06-11 (v2 — sau khi thêm tín hiệu lợi suất Mỹ 10 năm). Sinh bởi `scripts/presets-study.ts` + `scripts/factor-study.ts` trên dữ liệu thật đến 11/06/2026.

## Câu hỏi cần trả lời

Với từng kỳ hạn nắm giữ (1 / 3 / 6 tháng), bộ trọng số tiêu chí + ngưỡng mua nào cho tín hiệu MUA **chính xác nhất một cách bền vững** — không phải chính xác nhất trên quá khứ rồi sụp đổ với dữ liệu mới (overfitting)?

## Phương pháp

1. **Dữ liệu:** timeline giả lập 1.425 ngày (2009–2026), mỗi ngày engine chấm điểm 3 tiêu chí thế giới (kỹ thuật, thống kê, vĩ mô) **chỉ bằng dữ liệu có đến ngày đó**, kèm lợi suất XAU thực tế sau 21/63/126 phiên.
2. **Chia đôi thời gian:** train 2009–2018, test 2019–2026. Hai giai đoạn tính chất rất khác nhau (train chứa bear market vàng 2013–2015; test chủ yếu bull) — cấu hình sống được ở cả hai mới đáng tin.
3. **Grid search:** 66 tổ hợp trọng số (bước 10%) × 4 ngưỡng mua (+30/+40/+50/+60) = 264 cấu hình mỗi kỳ hạn.
4. **Điều kiện nhận:**
   - ≥ 25 tín hiệu mua ở **mỗi** giai đoạn (đủ mẫu);
   - tỉ lệ đúng **vượt baseline ở cả hai giai đoạn** (baseline = mua ngày bất kỳ, lãi sau kỳ hạn — vàng trôi tăng nên baseline đã cao sẵn, vượt được mới là lợi thế thật).
5. **Xếp hạng:** theo **lợi thế tệ nhất** trong 2 giai đoạn (min-excess) — ưu tiên ổn định, phạt cấu hình chỉ rực rỡ một thời kỳ.

"Đúng" nghĩa là: tín hiệu MUA bắn → giá XAU cao hơn sau đúng kỳ hạn đó.

## Nghiên cứu yếu tố mới (ablation, v2)

Ba ứng viên được test bằng cách bật/tắt từng tín hiệu rồi chạy lại toàn bộ tuyển chọn, so min-excess của cấu hình tốt nhất:

| Biến thể | 1 tháng | 3 tháng | 6 tháng | Kết luận |
| --- | --- | --- | --- | --- |
| Gốc (DXY + Fed) | +19,8pt | +13,0pt | +10,6pt | — |
| + Lợi suất Mỹ 10 năm (^TNX) | +16,7pt | **+26,0pt** | **+20,1pt** | **GIỮ** — cải thiện vượt trội 3–6 tháng |
| + VIX | +19,4pt | +16,1pt | +10,9pt | LOẠI — thua "+lợi suất"; thêm vào cùng lợi suất không cải thiện gì (26,1/20,1 ≈ 26,0/20,1) |
| + GPR (rủi ro địa chính trị) | +14,4pt | +12,0pt | +6,5pt | LOẠI — **làm giảm** độ chính xác ở mọi kỳ hạn |
| Tất cả | +13,3pt | +14,2pt | +20,1pt | LOẠI — GPR kéo tụt |

**Bài học từ GPR:** vàng nhảy vọt *khi* chiến tranh/khủng hoảng nổ ra, nhưng chỉ số rủi ro địa chính trị cao **không dự báo** được lợi suất 1–6 tháng *sau đó* — thị trường đã price-in ngay khi tin ra. Tin tức/địa chính trị là lý do giải thích quá khứ, không phải tín hiệu giao dịch tương lai.

Tín hiệu lợi suất dùng **^TNX danh nghĩa** (Yahoo) vì toàn bộ bằng chứng được kiểm trên nó; DFII10 (lợi suất thực, mạnh hơn về lý thuyết) chỉ làm dự phòng vì FRED hay lỗi 504 với series ngày. Mapping: thay đổi 63 phiên ≤ −0,4 điểm → +2 … ≥ +0,4 điểm → −2.

## Kết quả — 3 preset được chọn (v2)

| Preset | Trọng số (KT / TK / VM) | Ngưỡng mua | Đúng 2009–2018 | Đúng 2019–2026 | Baseline (train/test) | Trung vị lãi (test) |
| --- | --- | --- | --- | --- | --- | --- |
| **Sóng 1 tháng** | 0 / 10% / 90% | +40 | **73,4%** (n=94) | **77,4%** (n=106) | 51,9% / 60,6% | +4,0% |
| **Sóng 3 tháng** | 10% / 0 / 90% | +50 | **82,2%** (n=45) | **95,7%** (n=69) | 55,7% / 69,7% | +7,4% |
| **Tích lũy 6 tháng** | 0 / 10% / 90% | +50 | **89,4%** (n=47) | **100,0%** (n=66) | 57,7% / 79,9% | +14,3% |

KT = kỹ thuật XAU, TK = thống kê lịch sử, VM = vĩ mô (DXY + hướng Fed + lợi suất 10 năm). Chênh lệch VN = 0% trong preset (lý do bên dưới). Khi nhiều cấu hình đồng hạng min-excess, chọn bản có đa dạng tiêu chí hơn.

Top 5 đầy đủ mỗi kỳ hạn: `npx tsx scripts/presets-study.ts` (cần `npm run collect` trước). Ablation: `npx tsx scripts/factor-study.ts`.

### So sánh với cấu hình mặc định (35/25/20/20, ngưỡng +40)

| Kỳ hạn | Mặc định (train) | Preset v2 (train) | Mặc định (test) | Preset v2 (test) |
| --- | --- | --- | --- | --- |
| 1 tháng | 67,4% (n=46) | 73,4% (n=94) | n=1 (không đủ mẫu) | 77,4% (n=106) |
| 3 tháng | 60,9% (n=46) | 82,2% (n=45) | n=1 | 95,7% (n=69) |

Mặc định không tệ nhưng quá kén trong thị trường bull (2019–2026 chỉ bắn 1 tín hiệu). Preset bắn đều ở cả hai chế độ thị trường và chính xác hơn.

## Phát hiện chính

**Vĩ mô thống trị mọi kỳ hạn.** Tổ hợp "DXY yếu + Fed hạ lãi suất + lợi suất 10 năm đang rơi" là yếu tố dự báo mạnh và bền nhất cho vàng — đúng cơ chế kinh tế: vàng không sinh lãi nên hấp dẫn khi lợi suất giảm, định giá bằng USD nên hưởng lợi khi USD yếu. Kỹ thuật giá (RSI, MA200) chỉ đóng vai phụ.

## Giới hạn — đọc kỹ trước khi tin con số

1. **Tín hiệu bắn chùm.** Điểm vĩ mô cao kéo dài cả giai đoạn Fed nới lỏng, các tín hiệu cách 3 phiên chồng lấn kỳ hạn lên nhau → mẫu hiệu dụng nhỏ hơn n trên bảng đáng kể. Con số **100%** của preset 6 tháng (n=66) về bản chất là "vài đợt nới lỏng tiền tệ 2019–2026 đều trúng" — không phải 66 lần cá cược độc lập. Đừng đọc nó là "chắc chắn thắng".
2. **Chỉ 2 giai đoạn kiểm chứng.** Bộ lọc min-excess giảm rủi ro overfit nhưng không diệt được — việc chọn cấu hình có nhìn kết quả test (selection bias nhẹ). Con số % nên đọc là **ước lượng lạc quan**; kỳ vọng thực tế thấp hơn vài điểm.
3. **Backtest trên XAU/USD, bạn mua vàng VN.** Tương quan cao nhưng chênh lệch SJC co giãn. Lịch sử SJC đã backfill 487 ngày từ CafeF (02/2025→nay, `scripts/backfill-vn.ts`) — đủ để tiêu chí chênh lệch chạy **percentile thật** trong phân tích live (phân phối: p20=11%, trung vị 14%, p80=16,6%), nhưng vẫn chỉ phủ giai đoạn test nên **chưa đủ điều kiện 2 giai đoạn để vào preset**. Premium giữ 0% trong preset cho tới khi dữ liệu phủ nhiều chế độ thị trường hơn (≥ vài năm).
4. **Tín hiệu BÁN không có preset.** Mọi nghiên cứu (xem horizon-study) cho thấy đoán đỉnh dài hạn với vàng sai 51–75% — không cấu hình bán nào qua được bộ lọc. App giữ ngưỡng bán mặc định −40 chỉ để cảnh báo ngắn hạn.
5. **Yếu tố chưa/không đưa vào:** GPR và VIX đã test và bị loại (bảng trên). NHTW mua vàng (dữ liệu quý, trễ), chính sách NHNN (không có feed máy đọc), COT positioning (chưa test) — ứng viên cho vòng sau.
6. Quá khứ không bảo đảm tương lai. Công cụ xác suất, không phải lời hứa.

## Giám sát thoái hóa & khoảng tin cậy (v3)

Preset không được tin vô thời hạn:

- **Mỗi cron**, `scripts/monitor-presets.ts` chạy lại đúng cấu hình preset trên timeline mới nhất → `preset-health.json`: min-excess hiện tại, hiệu quả 2 năm gần nhất vs baseline cùng kỳ, và **CI 95% block-bootstrap** cho % đúng giai đoạn test (block = kỳ hạn/3 phiên, tôn trọng tín hiệu bắn chùm — CI hẹp ảo nếu resample từng điểm).
- **degraded** khi min-excess < 5pt hoặc 2 năm gần nhất thua baseline > 5pt (hòa baseline trong bull market không tính — vô hại). App hiện ⚠ trên nút preset + banner; Telegram báo khi chuyển trạng thái.
- CI hiển thị cạnh evidence trên verdict card — ví dụ preset 1 tháng: điểm 77,4% nhưng CI 62–91%. Con số đơn lẻ luôn lạc quan hơn sự thật.

## Tái lập kết quả

```bash
npm run collect                      # sinh timeline.json từ dữ liệu thật (đã gồm tín hiệu lợi suất)
npx tsx scripts/presets-study.ts     # bảng tuyển chọn 3 kỳ hạn
npx tsx scripts/factor-study.ts      # ablation: bật/tắt lợi suất / VIX / GPR
npx tsx scripts/optimize-study.ts    # study gốc v1 (1 kỳ hạn, HORIZON=21|63|126)
npx tsx scripts/horizon-study.ts     # hiệu quả cấu hình mặc định theo 4 kỳ hạn
```

Preset khai báo tại `src/lib/types.ts` (`PRESETS`) — số liệu evidence trong code phải khớp bảng này; đổi preset thì cập nhật cả hai.
