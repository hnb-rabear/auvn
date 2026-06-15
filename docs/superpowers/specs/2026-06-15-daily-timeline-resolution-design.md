# Timeline độ phân giải theo phiên — tách sampling thống kê vs hiển thị

Ngày: 2026-06-15
Trạng thái: đã duyệt thiết kế, chờ viết plan

## Vấn đề

Time Machine chỉ tra được ~1/3 số ngày. Người dùng chọn 10/06 hoặc 11/06 nhưng
timeline nhảy thẳng 09/06 → 12/06. Nguyên nhân: `scripts/backtest.ts` và
`src/lib/bottom.ts` đều lấy mẫu `STEP = 3` (mỗi 3 phiên một điểm) để giữ file
nhẹ. Mục tiêu: **mọi phiên giao dịch T2–T6 đều tra được** (XAU/USD không giao
dịch T7/CN nên cuối tuần không có điểm — đúng bản chất dữ liệu, không carry-forward).

## Ràng buộc toàn vẹn (KHÔNG được vi phạm)

`STEP = 3` không chỉ để nhẹ file — nó **chống pseudo-replication**. Cửa sổ lợi
nhuận 1/3/6 tháng của các ngày liền kề chồng lấn nặng (giá hôm nay ≈ hôm qua).
Nếu chấm thống kê mỗi ngày, `n` phình giả (vd n=379 → ~1137) và CI co lại giả
tạo → "săn đáy 39% (CI 28–49%)" trông chắc hơn thực tế dù không đáng tin hơn.

→ **Quy tắc cốt lõi: thống kê (buckets, count, pctFavorable, median, bottom
prob/CI/n) giữ STEP=3. Chỉ lưới hiển thị (timeline points, signalHistory,
confirmedBottoms) chuyển sang STEP=1.**

Bằng chứng bất biến: `backtest.json` trước/sau thay đổi phải **giống hệt**.
Chỉ `timeline.json` to ra (~290KB → ~870KB raw, ~30KB → ~90KB gzip).

## Kiến trúc: tách hai lưới index

### scripts/backtest.ts

Hiện một vòng `idxs` (STEP=3) vừa nuôi `returns` map (→ buckets) vừa đẩy
`points[]`. Tách:

- **Lưới THỐNG KÊ** — `for (i = WARMUP; i < n; i += 3)` → chỉ nuôi `returns`
  map → buckets/count/pctFavorable/median. `observations` đếm theo lưới này
  (giữ nghĩa cũ).
- **Lưới TIMELINE** — `for (i = WARMUP; i < n; i += 1)` → mỗi phiên một
  `TimelinePoint`. **Không** đẩy vào `returns` map. Mỗi điểm vẫn tính
  composite/zone/scores/returns past-only như cũ.

Giữ guard "ép bar cuối nếu off-grid" + "không nhân đôi điểm cuối" cho lưới
timeline (với STEP=1, bar cuối luôn on-grid → guard thành no-op nhưng giữ cho
an toàn).

Lưu ý hiệu năng: lưới timeline gọi các criterion ~3x số lần. Vẫn vài giây trong
cron 2×/ngày — chấp nhận. `closesUpTo`/`datesUpTo` slice mỗi điểm như hiện tại.

### src/lib/bottom.ts — `buildTier`

`buildTier` hiện một lưới STEP=3 sinh `rows`, rồi từ `rows` tính cả
`prob`/`ci`/`n` LẪN `signalHistory`/`confirmedBottoms`. Tách:

- **Lưới thưa (STEP=3)** → `labeled`/`favArr` → `prob`, `ci`, `n`. **Không đổi
  giá trị** so với hiện tại.
- **Lưới dày (STEP=1)** → `rows` đầy đủ → `signalHistory` (cấp cycleBin/swingBin
  cho mọi điểm timeline) + `collect()` confirmedBottoms (không sót đáy off-grid).

`curBin`/`curScore` (bin hiện tại từ bar cuối) không đổi.

**Bất biến giá trị bin:** bin một ngày = `binOf(bottomScore(featuresAt(i)),
binEdges)` — hàm thuần của ngày đó, **không phụ thuộc lưới**. Tách lưới chỉ
thêm ngày, không xê dịch bin ngày cũ. signalHistory dày là tập cha của thưa.

### scripts/run.ts

Không đổi logic merge (run.ts:269-276 đã merge theo NGÀY, bền). Giờ
`signalHistory` phủ mọi ngày → mọi điểm timeline có `cycleBin`/`swingBin` →
"Gợi ý hành động lịch sử" không còn trống ở ngày off-grid cũ.

### UI — không đổi code

`TimeMachine.tsx` đọc `timeline.points`; date picker đã dùng `indexOnOrBefore`
nên T7/CN tự lùi về T6. Comment `POINTS_PER_MONTH = 7` (TimeMachine.tsx:62-63)
giả định "mẫu mỗi 3 phiên → ~7 điểm/tháng" giờ sai — cập nhật thành ~21
phiên/tháng để các nút zoom (6 tháng, 1 năm…) căn cửa sổ đúng số điểm.

## Thay đổi test

**Sửa (đúng intent, không nới lỏng):**

- `tests/engine.test.ts:284` `points.length === observations` →
  `points.length > observations` (timeline dày hơn stats). Lý tưởng:
  `points.length === closes.length - WARMUP` (mọi bar sau warmup).
- `tests/engine.test.ts:310` "không nhân đôi điểm cuối" → vẫn áp cho lưới
  timeline STEP=1 (điều chỉnh n bars nếu cần để off-grid không còn ý nghĩa với
  STEP=1; với STEP=1 bar cuối luôn on-grid).
- `tests/engine.test.ts:296` "điểm cuối là bar cuối kể cả off-grid" → với STEP=1
  bar cuối luôn on-grid; giữ assert điểm cuối = bar cuối, returns["21"] null.

**Giữ nguyên (vẫn pass):**

- `tests/bottom.test.ts:161` tái dựng `n` bằng STEP=3 → đúng, vì prob/n giữ thưa.
- `tests/bottom.test.ts:201` signalHistory phủ bar cuối → vẫn pass (dày hơn).
- `tests/bottom.test.ts:189` confirmedBottoms → vẫn pass.

**Test mới (chốt integrity):**

- "tách sampling KHÔNG đổi buckets": so `backtest.buckets` (count, pctFavorable,
  median) của bản tách vs giá trị kỳ vọng STEP=3 cũ — phải bằng nhau.
- "timeline phủ mọi phiên": `timeline.points.length === closes.length - WARMUP`
  (hoặc xấp xỉ, trừ append-guard ở bar cuối).
- "bottom prob/ci/n không đổi khi dày signalHistory": `runBottom` cho `n` đúng
  bằng đếm STEP=3 (đã có ở :161) + `signalHistory.length` > số mẫu STEP=3.

## Verify hoàn tất

1. `npm test` — xanh.
2. `npm run collect` (hoặc `npx tsx scripts/run.ts`) — sinh data thật.
3. **So `backtest.json` trước/sau: giống hệt** (git diff chỉ chạm timeline.json,
   bottom prob/ci/n giữ nguyên).
4. `timeline.json` to ~3x, mọi phiên T2–T6 có điểm; mở Time Machine chọn 10/06,
   11/06 → tra được.
5. `npx tsx scripts/check-modes.ts` — composite all-mode không đổi nghĩa.

## YAGNI / loại khỏi scope

- Không carry-forward cuối tuần (đã chốt: T7/CN không hiển thị).
- Không toggle thưa/dày trên UI (chốt: luôn dày).
- Không đổi nguồn giá, không trộn giá VN cho cuối tuần.
- Không đụng buy/sell composite hay ngưỡng.
