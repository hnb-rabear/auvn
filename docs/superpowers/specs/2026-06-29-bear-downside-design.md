# Module C — Phân phối rủi ro bear (Bear Downside) — thiết kế

Ngày: 2026-06-29. Trạng thái: đã brainstorm + duyệt, chờ viết plan. Module C của DCA Co-pilot (spec gốc `2026-06-29-dca-copilot-design.md`; Module A đã NO-GO, xem `docs/dca-copilot.md`).

## Bối cảnh & mục tiêu

Trả lời câu hỏi gốc thứ 3 của người dùng: **"Trong bear, giá có thể rơi đến đâu ở 1/3/6/12 tháng?"** — KHÔNG dự đoán điểm số (đã loại trong Bear DCA), mà đưa **phân phối lịch sử mức-rơi-thêm có điều kiện theo độ sâu drawdown hiện tại**, kèm CI. Lớp bối cảnh rủi ro, độc lập, chỉ đọc.

## Nguyên tắc bất biến (kế thừa CLAUDE.md)

- **No prediction claims — decision support only.** Đây là phân phối lịch sử có điều kiện, không phải tiên lượng.
- **Evidence-first:** train(<2019)/test(≥2019) + placebo (phân phối vô-điều-kiện) + CI; báo trung thực kể cả khi điều kiện hóa là nhiễu.
- **Free-tier, tính tại collection-time, repo là database, UI tiếng Việt.**
- **Không đụng** composite / Bottom Hunter / Bear DCA / Accumulation brake. Lớp độc lập.
- **Validate trên XAU/USD** (chuỗi dài duy nhất). Không có caveat VND vì đây là phân phối lợi suất XAU, không phải giá vốn VND.

## Đo lường & phân nhóm

- **ATH & drawdown:** rolling all-time-high từ đầu chuỗi (tái dùng pattern `rollingAth` trong `src/lib/bear-dca.ts`). `dd = (ATH − price)/ATH`.
- **Bucket độ sâu:** `[0–10%) · [10–20%) · [20–30%) · ≥30%` dưới ATH.
- **Horizon:** 21 / 63 / 126 / 252 phiên (≈ 1/3/6/12 tháng).
- **Mức rơi thêm (metric chốt):** với ngày i, `minFwd = min(price[i+1..i+H]) / price[i] − 1`. ≤ 0 nếu còn rơi; = 0 nếu hôm nay là đáy cửa sổ. (Đo "rơi đến đâu" = đáy tệ nhất, KHÔNG phải điểm cuối — điểm cuối gây ảo an toàn.)
- **Thống kê mỗi (bucket × horizon):** trung vị, p10 (kịch bản xấu), p90, **P(đáy đã phía sau)** = tỉ lệ `minFwd ≥ 0`, và `n`.
- **Lưới thưa STEP=3** chống pseudo-replication (cửa sổ forward chồng lấn — chấm mỗi ngày phình n giả, co CI giả), đúng quy ước `bottom.ts`/`backtest.ts`. Bucket < 30 mẫu (lưới thưa) → "chưa đủ dữ liệu", không hiện số.
- **CI:** `blockBootstrapCi` (có sẵn) cho **P(đáy phía sau)** (tỉ lệ). Trung vị/p10/p90 cần helper mới `blockBootstrapPercentileCi(values, q, blockSize)` để CI tôn trọng autocorrelation (không hẹp ảo).

## Kiểm chứng "điều kiện hóa có thêm thông tin?"

Study `scripts/bear-downside-study.ts`:

- **Placebo = phân phối vô-điều-kiện** (gộp mọi ngày, bỏ bucket), cùng thống kê mỗi horizon.
- **"Có thông tin" khi đạt CẢ 3:**
  1. **Đơn điệu hợp lý** — bucket sâu hơn ⇒ P(đáy phía sau) cao hơn *hoặc* mức rơi thêm bớt âm dần (qua 4 bucket).
  2. **Khác biệt thật** — CI(P-đáy-phía-sau) bucket sâu không trùm CI vô-điều-kiện.
  3. **Ổn định 2 giai đoạn** — (1)+(2) giữ ở cả train lẫn test.
- **Cờ `conditioningWorks: boolean`** chốt từ study (giống `provisional` các lớp khác):
  - **true** → UI hiện phân phối theo **bucket hiện tại**.
  - **false** → UI chỉ hiện **phân phối vô-điều-kiện**, kèm câu thẳng *"độ sâu drawdown không tiên lượng được mức rơi thêm — đây là phân phối lịch sử chung."*
- **Phân phối vô-điều-kiện LUÔN ship được** (tự nó hữu ích) ⇒ Module C không bao giờ "trắng tay". Báo đúng mức độ đạt 3 điều kiện, không ép GO.

## Engine live, UI, kiến trúc file

Tính tại collection-time; UI tra cứu.

| File | Vai trò |
|---|---|
| `src/lib/bear-downside.ts` | `runBearDownside(bars)` → `BearDownsideAnalysis`; thuần, past-only cho phần as-of |
| `src/lib/bear-downside.test.ts` | test engine |
| `scripts/bear-downside-study.ts` | kiểm chứng 3 điều kiện, in train/test, nguồn điền config + doc |
| `src/lib/indicators.ts` (+test) | thêm `blockBootstrapPercentileCi` |
| `src/lib/types.ts` | `BearDownsideAnalysis`, `BucketStat`, `HorizonStat`, `BEAR_DOWNSIDE_CONFIG` |
| `scripts/run.ts` | gọi runBearDownside, ghi `public/data/bear-downside.json` |
| `src/components/BearDownsideCard.tsx` | card UI |
| `src/app/page.tsx`, `Dashboard.tsx` | nạp JSON + accordion mới |
| `docs/bear-downside.md` | phương pháp + bằng chứng + kết luận conditioningWorks |

- **`runBearDownside`:** tính dd hôm nay → bucket; trả `currentDd`, `currentBucket`, `conditioningWorks`, và mảng 4 horizon. Mỗi horizon trả thống kê bucket hiện tại (nếu conditioningWorks ∧ đủ mẫu) **hoặc** vô-điều-kiện (fallback), kèm `{median, p10, p90, pBottomBehind, ci, n, source: "bucket"|"unconditional"}`. Bảng đầy đủ (mọi bucket × horizon + vô-điều-kiện) cũng nhúng JSON để minh bạch.
- **UI** accordion *"Nếu giá còn rơi (rủi ro bear)"*, cạnh accordion Bear DCA. Card hiện: dd hiện tại + bucket, rồi mỗi horizon một dòng "đáy tệ nhất về sau: trung vị −X%, xấu nhất(10%) −Y%, Z% lần đáy đã phía sau (CI a–b%)". Nếu !conditioningWorks → câu phân phối chung.

**Ví dụ hiển thị:**
> Giá đang −18% từ đỉnh (vùng 10–20%). Lịch sử các lần tương tự — đáy tệ nhất về sau:
> · 3 tháng: trung vị −3%, xấu nhất (10%) −11%, 58% lần đáy đã phía sau (CI 49–67%)
> · 12 tháng: …

## Không làm (YAGNI / đã loại)

- Dự đoán điểm số "giá sẽ chạm X" (đã loại trong Bear DCA).
- Gate mua/bán; đụng composite/Bottom Hunter/Bear DCA/Accumulation.
- Tái thêm GPR/VIX/DFII10/GSR.
- Module A intra-month timing (NO-GO) và Module B skip (chưa làm) — ngoài phạm vi.

## Thứ tự triển khai

1. Helper `blockBootstrapPercentileCi` (+test) — nền CI.
2. Engine `bear-downside.ts` (thống kê bucket × horizon, past-only) + test.
3. Study `bear-downside-study.ts` — chạy, kiểm 3 điều kiện, ghi kết quả.
4. Doc `bear-downside.md` + điền `BEAR_DOWNSIDE_CONFIG` (conditioningWorks + bằng chứng).
5. Wiring `run.ts` → JSON.
6. UI card + accordion + nạp JSON.
