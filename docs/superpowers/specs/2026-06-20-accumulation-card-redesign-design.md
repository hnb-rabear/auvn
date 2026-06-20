# Thiết kế: Trình bày lại card "Vùng tích lũy" cho dễ hiểu

Ngày: 2026-06-20. Nhánh: `feat/accumulation-brake`. Phạm vi: chỉ `src/components/AccumulationCard.tsx` (+ CSS nhỏ nếu cần).

## Vấn đề
Card hiện tại dẫn bằng thuật ngữ ("phanh", "percentile 71", "×1", "CI", "composite", "2 giai đoạn") và chôn hành động. Người không rành chỉ số không hiểu phải làm gì.

## Nguyên tắc
1. **Hành động lên đầu, plain-language** — bỏ ký hiệu "×", dùng chữ đời thường.
2. **Dịch số sang lời** — "71%" → "đắt hơn 71% thời gian trong 2 năm qua".
3. **Gập mọi thứ kỹ thuật vào nút (i)** — mặt trước chỉ còn hành động + 1 câu + thanh.

## Mặt trước (luôn thấy khi mở accordion)
- Góc phải trên: nút **(i)** nhỏ (toggle bảng chi tiết).
- **Câu hành động** (to nhất) theo hệ số `a.mult`, kèm chấm màu:

| mult | Chữ | tone (class) |
| --- | --- | --- |
| 1 | Tháng này: MUA NHƯ BÌNH THƯỜNG | buy (xanh) |
| 0.5 | Tháng này: MUA BỚT LẠI (một nửa) | neutral (vàng) |
| 0.25 | Tháng này: MUA ÍT LẠI (≈¼) | sell (cam/đỏ) |
| 0.2 | Tháng này: MUA RẤT ÍT (≈⅕) | sell (đỏ) |

- **Câu giải thích** (theo phanh nào bật — đọc từ `a.brakes` id `price-top`/`comp-bear`):
  - Không phanh: `Giá đang ở {pp}% so với giá 2 năm qua — chưa tới vùng đắt (75%) cần ghìm mua.`
  - Chỉ `price-top`: `Giá đang ở vùng đắt nhất 2 năm ({pp}%) — dễ mua hớ, nên gom ít lại và để dành tiền cho lúc rẻ hơn.`
  - Chỉ `comp-bear`: `Xu hướng thị trường đang bất lợi nên tạm gom ít lại.`
  - Cả hai: `Vàng vừa đắt ({pp}%) vừa gặp xu hướng bất lợi — nên ghìm mạnh.`
  - `{pp}` = `Math.round(pricePct2y*100)`.
- **Thanh rẻ→đắt**: nền + phần tô tới `pp%` + một **vạch ghìm** đứng ở 75% (tick) + nhãn `rẻ` … `đắt`. Vạch ghìm bằng tick định vị tuyệt đối (không cần class màu mới).

## Nút (i) → bảng chi tiết (React state `showInfo`, mặc định ẩn)
Nội dung plain-language (đã duyệt), 4 mục + 1 dòng phụ số liệu:
- **Card này để làm gì?** Bạn mua vàng đều mỗi tháng. Card nhắc: tháng nào vàng đắt bất thường thì mua ít lại, để dành cho lúc rẻ hơn. Không bảo mua hay bán — chỉ chỉnh nhiều/ít.
- **Con số 71% là gì?** So giá hôm nay với chính giá vàng 2 năm qua. 71% = hôm nay đắt hơn 71% số ngày của 2 năm gần đây. Càng gần 100 càng đắt. Vượt 75 là vùng đắt → khuyên mua ít lại.
- **Có đáng tin không?** Đã thử lại trên 17 năm lịch sử giá vàng (chia 2 thời kỳ khác nhau để chắc không ăn may): "đắt thì ghìm mua" cho giá vốn trung bình rẻ hơn so với mua đều máy móc.
- **Đừng kỳ vọng quá.** Lợi ích thật khá nhỏ — rẻ hơn khoảng 2% ở điều kiện thường (có lúc nhiều hơn khi giá tăng mạnh, nhưng đừng trông vào đó). Đôi khi 2% không bù nổi chênh lệch mua–bán ở tiệm vàng. Là lan can chống mua hớ lúc đỉnh, không phải cách làm giàu.
- Dòng phụ nhỏ: `Chi tiết kỹ thuật: rẻ hơn +{trainImprPct}% (2009–2018) / +{testImprPct}% (2019–2026).` (đọc từ `ACCUM_CONFIG.evidence`).

## Giữ nguyên
- Banner **degraded** (nếu `health.status==='degraded'`) vẫn hiện sẵn ở đầu card (cảnh báo, không gập). Giữ câu đã sửa ("biên lợi gần đây … ≤ 0").
- Trạng thái **provisional** (chưa đủ 2 năm): câu đơn giản như hiện tại.
- Tiêu đề accordion ngoài ("Vùng tích lũy (DCA)") không đổi.

## Không làm (YAGNI)
- Không nhập "số tiền mua mỗi tháng" để quy ra tiền cụ thể (giữ chữ "một nửa/¼"); có thể thêm sau.
- Không popover/modal — dùng panel inline toggle cho hợp mobile + đồng bộ pattern app.

## Kiểm thử
- `npm run build` qua (static export, không lỗi type).
- Tự kiểm 4 trạng thái mult (1/0.5/0.25/0.2) ra đúng chữ/màu/giải thích; (i) bật/tắt; provisional + degraded vẫn đúng.
- CSS class dùng phải có sẵn trong `globals.css`; class/tick mới (nếu có) thêm tối thiểu.
