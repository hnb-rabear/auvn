# Fusion composite ∧ đáy — tầng "MUA độ tin cao": phương pháp & bằng chứng

Cập nhật: 2026-06-19. Sinh bởi `scripts/fusion-study.ts` (offline trên `public/data/timeline.json`).

## Câu hỏi
Ghép tín hiệu mua composite với lớp Bottom Hunter (vùng đáy) có cải thiện precision/recall/timing
một cách bền vững qua 2 giai đoạn không — hay composite-gốc đã là tốt nhất?

## Phương pháp
Offline trên timeline 4.275 ngày (2009–2026). Chia train <2019 / test ≥2019. "Đúng" = lợi suất H
phiên sau tín hiệu > 0. excess = precision − baseline (mua ngày bất kỳ). CI 95% block-bootstrap
(block=H/3) vì lưới dày (step=1) ⇒ tín hiệu bắn chùm. Ba cơ chế: A=hợp nhất (OR), B=xác nhận chéo
(AND, composite-buy ∧ cycleBin==3), C=gấp oversold vào composite (grid 5D).

## Kết quả — chỉ B ở kỳ 3 tháng GO

| Kỳ | B train | comp train | B test | comp test | n B (tr/te) | Phán quyết |
| --- | --- | --- | --- | --- | --- | --- |
| 1m | 84,5% | 79,9% | 70,4% | 76,0% | 84/108 | LOẠI (test ngược) |
| **3m** | **92,8%** | 81,6% | **100%** | 95,3% | 69/89 | **GIỮ** |
| 6m | 90,5% | 88,0% | 100% | 99,5% | 74/86 | LOẠI (đã chạm trần) |

Ba kiểm chứng robust cho 3m (đều PASS): (1) placebo đồng-n train **+10,1pt** (B vs composite-top-n
cùng cỡ mẫu) ⇒ lớp đáy thêm thông tin trực giao, không chỉ "kén hơn"; (2) chia nhiều giai đoạn:
2009–2013 +6,1pt, 2019–2026 +4,7pt (2014–2018 là sa mạc tín hiệu n=2, bỏ); (3) lưới thưa STEP=3:
B n=54 96,3% CI[88,9–100] vs composite 88,7%.

## Cảnh báo (đọc trước khi tin số)
Con số test 100% (CI[100–100]) là **ảo do tín hiệu bắn chùm** trong một chu kỳ nới lỏng 2019–2026 —
KHÔNG đọc là "chắc thắng". Bằng chứng ràng buộc là lợi thế **train +10,1pt** (giai đoạn chứa bear) và
lưới thưa decorrelated. B là tầng **ít tín hiệu hơn nhưng tin cậy hơn** (~136→69 tín hiệu train).

## Biến thể đã LOẠI (không tái thử mù khi chưa chạy lại fusion-study.ts)
- **A — hợp nhất (OR):** recall↑ nhưng precision loãng ở 3m/6m (composite đã gần trần). Chức năng "gom
  rải" đã do Bottom Hunter gauge đảm nhiệm ⇒ thêm A là trùng lặp.
- **B ở 1m/6m:** không robust (1m placebo-test âm & thưa thua composite; 6m 2009–2013 âm).
- **C — gấp oversold vào composite:** oversold sống sót grid (trọng số >0) nhưng cấu hình thắng có n
  sát sàn 25 còn cấu hình n lớn để oversold=0 ⇒ mùi overfit (như đã loại real-yield+GSR).

## Tích hợp & giám sát
Cờ dẫn xuất `highConfidenceBuy3m` (`src/lib/fusion.ts`) — KHÔNG sửa composite/engine đáy. Bồi evidence
vào cấp guidance "strong" sẵn có, chỉ khi 3m + vùng mua + cycleBin==3 + verified. `scripts/monitor-fusion.ts`
mỗi cron tính lại → `fusion-health.json`; degraded khi B không còn vượt composite cả 2 giai đoạn hoặc
placebo train ≤ 0 ⇒ UI ẩn evidence.

## Tái lập
```bash
npx tsx scripts/fusion-study.ts     # A/B/C + 3 kiểm chứng robust cho B
npx tsx scripts/monitor-fusion.ts   # sức khỏe B-3m hiện tại
```

`HIGH_CONF_3M_EVIDENCE` trong `src/lib/fusion.ts` phải khớp bảng này (khóa bằng `fusion.evidence.test.ts`).
