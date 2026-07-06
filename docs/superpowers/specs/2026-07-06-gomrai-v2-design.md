# Gom rải v2 — tuyển chọn lại trigger bằng study (design)

Ngày: 2026-07-06. Trạng thái: design đã duyệt, chờ implementation plan.

## Vấn đề (đo trên data commit 2026-07-05)

Cờ "Gom rải" hiện tại (guidance level `dca` = điểm trung tính + `cycleProb ≥ 60`, n≥10, cổng acute) vừa **quá dày** vừa **bỏ qua đáy**:

- 430 ngày bật / 4275 ngày (2009–2026), 48 đợt. Riêng 2026: 54 ngày / 10 đợt, có đợt 12 ngày liền.
- Chỉ 35/194 đáy đã xác nhận (`confirmedBottoms`, cả 2 tầng) có cờ trong ±7 phiên (18%). Trắng 2014–2019, 2021–2023.
- Precision: 40% ngày bật nằm gần đáy thật.

Nguyên nhân cấu trúc: `cycleProb` là base-rate theo bin có recency-weight — trong bull, bin nào cũng base-rate cao ⇒ ngưỡng tuyệt đối ≥60 bật tràn lan, mất nghĩa "đáy". (Con số "7 đợt/6 năm" trong docs là của study lưới thưa; hiển thị dày hơn nhiều.) Đồng thời cờ chỉ dùng tầng cycle ⇒ bỏ toàn bộ đáy swing.

## Yêu cầu đã chốt với chủ dự án

1. **Cân bằng**: giảm dày VÀ tăng phủ đáy cùng lúc.
2. Bắt **cả 2 tầng** đáy: swing (~1–2 tháng) + cycle.
3. **Dạng hiển thị do study quyết** (marker+đuôi TTL vs dải), chọn theo số liệu.
4. **NO-GO ⇒ xóa cờ khỏi UI** (gauge xác suất đáy + toggle "khởi đầu vùng đáy" giữ nguyên — lớp đã validate riêng).

Hướng đã chọn: **A — study tuyển chọn mới** (`scripts/gomrai-study.ts`), các hướng B (dùng ngay cạnh `cycleBin==3`) và C (chỉ siết hiển thị prob≥60) bị loại vì không phủ swing / không sửa được chuyện bỏ đáy; B là tập con của grid A. Hướng percentile/ngưỡng-tương-đối cho prob KHÔNG mở lại (đã LOẠI trong `bottom-approach-compare`).

## Study `scripts/gomrai-study.ts`

**Dữ liệu:** chỉ data đã commit — `public/data/timeline.json` (prob/bin walk-forward từng ngày, composite, giá), `public/data/bottom.json` (`confirmedBottoms` làm ground truth), `bearPhases(prices)` từ `src/lib/bear-dca.ts`. Không fetch mạng.

**Chính sách giữ nguyên trong mọi ứng viên:** loại ngày headwind (composite ≤ −40 — giữ precedence của guidance); pha Bear DCA `acute` ⇒ prob rớt về `probUnweighted` (chính sách recency-504 đã chốt). Cạnh bin không bị ảnh hưởng acute (bin là điểm thô, không phải base-rate).

**Họ trigger ứng viên** (tất cả walk-forward thuần):

| Nhóm | Ứng viên |
| --- | --- |
| Cạnh bin | cạnh lên `cycleBin==3` (mốc đã validate: win 6T 78%, ~6/năm) · cạnh lên `swingBin==3` (validate lần đầu) · hợp 2 cạnh |
| Cạnh prob | cạnh lên `cycleProb≥thr` · `swingProb≥thr` · `max(cycle,swing)Prob≥thr`, thr ∈ {55, 60, 65, 70, 75} |
| Lai | cạnh bin OR cạnh prob |

**Grid hiển thị:** TTL ∈ {0, 2, 3, 5, 8, 10} phiên (ngày kích hoạt + đuôi "đang trong cửa sổ gom") × cooldown ∈ {0, 10, 21, 42} phiên giữa 2 đợt.

**Thước đo mỗi cấu hình:**

- Coverage: % đáy xác nhận (từng tầng + gộp) có ngày-active trong ±7 phiên.
- Precision: % ngày active trong ±7 phiên của một đáy xác nhận.
- Chất lượng: win 6T (126 phiên) + median return **per-đợt**, tính tại ngày kích hoạt (tránh pseudo-replication — cùng lý do lưới thưa STEP=3 của backtest).
- Mật độ: đợt/năm, ngày active/năm, số năm có bắn.

**Cổng (kỷ luật repo):**

1. Win6T per-đợt vượt baseline (mọi ngày đủ điều kiện, cùng vũ trụ loại-headwind) ở **CẢ** train (<2019) lẫn test (≥2019).
2. Vượt **placebo đồng-n**: giữ nguyên số đợt/năm, ngày kích hoạt random trong các ngày đủ điều kiện, ~500 seed cố định; cấu hình phải ≥ p90 phân bố placebo trên metric chính ở cả 2 giai đoạn.
3. Ràng buộc cân bằng (chỉnh được sau khi thấy phân bố thực, ghi rõ giá trị cuối vào docs): coverage gộp ≥ 35%, ngày active/năm ≤ 25, bắn ≥ 60% số năm.
4. Xếp hạng theo **min-excess** (lợi thế tệ nhất trong 2 giai đoạn).

Ground truth `confirmedBottoms` nhìn tương lai — chỉ dùng để TUYỂN CHỌN offline (cùng cách `bottom-approach-compare`), không bao giờ vào đường live.

**Không cấu hình nào qua cả 4 cổng ⇒ NO-GO.**

## Wiring nếu GO

- `GOMRAI_CONFIG` trong `src/lib/types.ts`: trigger thắng + TTL + cooldown + số evidence (quy ước code ↔ docs như `PRESETS`/`BOTTOM_CONFIG`).
- Một hàm thuần duy nhất trong `src/lib/timeline.ts` (thay ruột `gomRaiIdxsBy`): `(points, phases) → tập ngày active` — cạnh kích hoạt + đuôi TTL + cooldown, loại headwind, cổng acute. **Dashboard live lẫn Time Machine cùng gọi hàm này trên timeline points**; `deriveGuidance` level `dca` đọc trạng thái active từ đó (luật "dải trên chart ≡ card guidance từng ngày", bài học ×0.25 vs ×1.0).
- UI: marker ngày kích hoạt + đuôi mờ TTL trên chart Time Machine; card GOM RẢI chỉ sáng trong cửa sổ active, thêm ngữ cảnh "đợt kích hoạt ngày X, còn N phiên".
- Test: cập nhật golden `tests/dca-band.test.ts` (card ≡ dải từng ngày); test mới cho hàm trigger (TTL, cooldown, headwind, acute) + snapshot khớp output study.
- Docs: `docs/bottom.md` mục "Gom rải v2" (bảng evidence + lệnh tái lập); cập nhật đoạn tương ứng trong CLAUDE.md.

## Wiring nếu NO-GO

- `deriveGuidance` bỏ nhánh `dca` (giữ enum hay xóa hẳn — quyết khi làm); Time Machine bỏ dải gom rải.
- GIỮ: gauge xác suất đáy, toggle "khởi đầu vùng đáy" (`bottomStartIdxs`), toàn bộ stats `bottom.json`.
- Ghi NO-GO vào `docs/bottom.md` cùng format các tín hiệu đã loại (GPR/VIX/COT/DCA-timing) + cập nhật CLAUDE.md.

## Phạm vi KHÔNG đụng

Composite, presets v4, consensus, Bear DCA, Bear Downside, Accumulation brake, backtest buckets, cách tính `prob`/`ci`/`calibration` trong `bottom.json`. Đây thuần lớp display/guidance + 1 script study.

## Không commit

Theo rule của chủ dự án: làm xong để nguyên working tree, không `git commit`/`git push`.
