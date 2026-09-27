# Săn đáy: bỏ phần trăm, hiện bậc kèm nền (spec A)

Ngày: 2026-09-25. Trạng thái: đã duyệt từng phần với chủ dự án.

## Vì sao

Kiểm toán walk-forward trong `bottom.json.calibration` cho thấy `prob` của tầng chu kỳ
bị **hiệu chuẩn ngược** ở vùng cao: máy nói 60–80% thì thực tế đúng 26%, 80–100% đúng
47%, trong khi 40–60% đúng 45%. 84 nút walk-forward báo prob ≥60% chỉ đúng 25 lần, dồn
vào hai chế độ: 2011–2013 đúng 4/49 (gấu dài, RSI quá bán lặp lại) và 2023–2025 đúng
18/22. Con số % phản ánh chế độ thị trường, không phải độ chắc chắn.

So Brier walk-forward sòng phẳng (mọi ứng viên chỉ dùng nhãn đã đáo hạn):

| Ứng viên | Train | Test | Cả kỳ |
| --- | --- | --- | --- |
| prob hiện tại (recency-504) | 0,236 | **0,271** | 0,253 |
| chỉ dùng tỉ lệ nền | **0,211** | 0,284 | 0,246 |
| co 50% về nền | 0,221 | 0,272 | 0,246 |

Không phương án % nào thắng ở cả hai giai đoạn. Nhưng **thứ hạng bin** thì giữ vững:

| Tầng chu kỳ (H=126, ε=3%) | Train | Test |
| --- | --- | --- |
| nền | 30,6% | 49,8% |
| bin 3 | 43,4% (+12,8pt, 15 đợt) | 68,5% (+18,8pt, 9 đợt) |
| bin 2 | 30,6% (0,0pt) | 53,4% (+3,6pt) |
| bin 0–1 | dưới nền | dưới nền |

⇒ Thứ hạng dùng được, độ lớn tuyệt đối thì không. Hiển thị bậc, bỏ %.

## Thiết kế

### 1. Trục hiển thị = bậc theo bin

- bin 3 → `high` "Cao hơn bình thường"
- bin 2 → `normal` "Ngang mức bình thường"
- bin 0–1 → `low` "Thấp hơn bình thường"

Mỗi bậc hiện kèm tỉ lệ đúng lịch sử của CHÍNH bậc đó và tỉ lệ nền, tách hai giai đoạn
(2009–2018 / 2019–2026) — không gộp, vì gộp giấu mất chuyện nền chênh 31% vs 50% — cùng
số đợt độc lập (khối H phiên cố định).

`prob`, `probUnweighted`, `ci`, `ess`, `calibration` vẫn tính và ghi vào `bottom.json`
như cũ. Engine, nhãn, trọng số, `bottomHistory` KHÔNG đổi. Đây là lớp hiển thị.

### 2. Cổng sụp nhanh hạ bậc

Cổng `isCrashDisplayMode` (acute ∨ dd42 ≥ 8%) giữ nguyên, nhưng thay vì đổi sang
`probUnweighted` (vốn cũng sai như nhau), nó **hạ bậc `high` xuống `normal`**. Đo được:

| bin 3 | Train | Test |
| --- | --- | --- |
| thị trường êm | 48,1% vs nền 31,3% | 69,8% vs nền 50,1% |
| đang sụp nhanh | 33,3% vs nền 27,5% (5 đợt) | 1 ngày |

### 3. Ảnh hưởng

- `src/lib/bottom-tier.ts` (mới): `bottomTierOf(bin, crash)`, nhãn tiếng Việt, và
  `computeTierEvidence` — chạy mỗi lần cron, ghi `bottom.json.tierEvidence` (sau review: hằng
  số cứng sẽ fail định kỳ vì mỗi ngày cron gắn nhãn thêm một ngày cũ).
- Gauge (`BottomGauges.tsx`) hiện bậc + bằng chứng, không còn số %.
- Gợi ý hành động: live (`Dashboard.tsx`) và Time Machine (`as-of.ts`) cùng dùng
  `bottomTierOf(cycleBin, crash) === "high"` cho `bottom.high` — quy tắc biểu đồ ≡ thẻ.
  Mức `strong` tự tắt khi đang sụp nhanh.
- Fusion (`cycleBin === 3`) không đổi.
- `summary.json` → 1.6: thêm `bottomHunter.cycle.tier` / `swing.tier` và `tierEvidence`;
  giữ `prob`/`probUnweighted`/`crashMode`, ghi rõ là số thô đã lỗi hiệu chuẩn.

### 4. Kiểm chứng

- Test khóa thứ hạng đúng chiều ở cả hai giai đoạn (bin 3 > nền > bin 0–1).
- Test khóa cổng sụp nhanh hạ bậc.
- Test khóa THỨ HẠNG trên timeline hiện tại (không khóa số cụ thể).

## Giới hạn

- Khoảng cách tới nền KHÔNG ổn định (+12,8 vs +18,8pt) — chỉ thứ hạng là bền.
- Test chỉ 9 đợt độc lập ở bin 3 chu kỳ ⇒ khoảng tin cậy rộng.
- Đây là đáy XAU/USD, không phải đáy SJC.
