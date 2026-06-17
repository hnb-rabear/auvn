# Time Machine — "mọi ngày quá khứ = hiện tại": xác suất đáy walk-forward

Ngày: 2026-06-17. Phạm vi: bỏ tam giác "Đáy đã xác nhận" (look-ahead) khỏi UI Time Machine, và hiển thị **xác suất gần đáy as-of-ngày** (walk-forward) cho bất kỳ ngày quá khứ nào — đúng bằng những gì gauge live sẽ nói nếu hôm đó là hôm nay. **Không** đụng composite/buckets phía mua (vốn đã as-of-ngày), không đổi gauge live hôm nay.

## Vấn đề

Người dùng muốn Time Machine **trung thực với thời gian thực**: đứng ở ngày quá khứ D phải thấy đúng thứ công cụ live sẽ hiển thị ngày D, chỉ bằng dữ liệu đến D. Hiện tại có 2 chỗ vi phạm ở phía **đáy**:

1. **Tam giác ▲ "Đáy đã xác nhận"** (`confirmedBottoms`) cần ±9 phiên **tương lai** mới xác nhận → không bao giờ biết được tại thời điểm thực. Người dùng không cần tính năng này.
2. **`prob%` của gauge săn đáy** là base-rate trên **toàn lịch sử** → look-ahead khi áp cho ngày quá khứ. Vì vậy Time Machine hiện chỉ dám hiện `bin` (past-only), không hiện %.

Phía mua (composite/zone/returns trong Time Machine) **đã** as-of-ngày — không nằm trong phạm vi sửa.

## Quyết định (chốt qua brainstorming)

- Time Machine hiển thị **xác suất gần đáy % + CI** cho ngày được chọn, tính **walk-forward** (chỉ dữ liệu đến ngày đó). Không lưu drivers đáy từng ngày — chỉ %/CI/bin.
- **Bỏ tam giác ▲ khỏi giao diện**; vẫn **giữ** `confirmedBottoms` trong `bottom.json` cho script nghiên cứu (`bottom-vs-buy-study`).
- Ngày quá sớm (mẫu cùng nhóm `n < 10`) → hiện **"Chưa đủ dữ liệu kiểm chứng"** thay con số (giống gauge live).
- Gợi ý hành động ("Gom rải") cho ngày quá khứ dùng **chính ngưỡng live**: `bottom.high = cycleProb ≥ 60 && n ≥ 10` (thay cho `cycleBin === topBin`).
- **Không đổi gauge live hôm nay**, **không tính per-dense-day** (giữ lưới thưa + forward-fill).

## Phương pháp — xác suất as-of-ngày (walk-forward)

**Tổng quát hoá công thức gauge hiện tại.** Gauge hôm nay đã đúng walk-forward: nó lấy tỉ lệ near-bottom trên mọi ngày lịch sử có nhãn đã hoàn tất (`i + H < length`), cùng `bin` với hôm nay. Ta mở rộng cho **mọi ngày D**:

Cho ngày D (chỉ số `idx_D`, bin past-only `bin_D`):
- **Tập nền** = các ngày `e` trên **lưới thưa STEP=3** (sau warm-up) thỏa: `e + H ≤ idx_D` (cửa sổ nhãn của `e` đã đóng **trước** D) **và** `bin_e == bin_D`.
- `prob_D` = % ngày trong tập nền có nhãn near-bottom = true.
- `n_D` = cỡ tập nền. `ci_D` = block-bootstrap (block = `H/3`) trên mảng nhãn 0/1.
- `n_D < 10` ⇒ `prob/ci = null` ("chưa đủ dữ liệu").

**Hệ quả khoá bằng test:** với ngày cuối, `e + H ≤ idx_last` ⇔ `e + H < length` — **trùng đúng** điều kiện gauge hiện tại ⇒ điểm walk-forward cuối == `cycle.prob`/`swing.prob` hiện tại. Gauge live **không đổi**.

**Không look-ahead:** `prob_D` chỉ phụ thuộc các ngày đã đáo hạn trước D; thêm dữ liệu sau D không làm đổi `prob_D`.

### Thưa-thống-kê / dày-hiển-thị (CLAUDE.md — không gộp)

- **Thống kê** (`prob/ci/n`): tính trên **lưới thưa STEP=3** — chống pseudo-replication (y hệt gauge hiện tại). Ngày cuối **luôn được ghim** vào lưới (như code hiện tại), nên **hôm nay tính tức thì, chính xác, không snap**.
- **Hiển thị**: Time Machine cho chọn **mọi phiên**. Ngày không rơi đúng nút lưới → **forward-fill**: lấy `prob/ci/n` của nút lưới thưa gần nhất **≤ ngày đó** (lệch tối đa 2 phiên — vô hại; `bin` hiển thị vẫn dày/chính xác từng ngày). Cùng cơ chế backtest buckets.

### Chi phí

~2.300 lần bootstrap khi collect (số nút lưới × 2 tầng) → vài chục giây, chạy trong cron. Chấp nhận.

## Luồng dữ liệu & file

- `src/lib/types.ts`
  - Thêm `BottomHistoryRow`: `{ date: string; cycle: { bin; prob; ci; n }; swing: { bin; prob; ci; n } }` (prob/ci có thể null khi `n < 10`).
  - Thêm `bottomHistory: BottomHistoryRow[]` vào `BottomAnalysis` (lưới thưa, past-only).
  - Thêm field optional vào `TimelinePoint`: `cycleProb?, cycleCi?, cycleN?, swingProb?, swingCi?, swingN?` (forward-filled; optional vì data cũ không có).
- `src/lib/bottom.ts`
  - Trong `buildTier`: ngoài `statRows` hiện có, tính **chuỗi walk-forward thưa**. Duyệt `statRows` theo thời gian, giữ tally "đã đáo hạn" theo bin: thêm `e` vào tally khi `e.i + H ≤ g.i`. Tại mỗi nút lưới `g`, lấy mảng nhãn của bin `g.bin` trong tally → `prob/ci/n` (gate `n<10`). Trả về mảng `{date, bin, prob, ci, n}` cho từng nút.
  - `runBottom`: gộp walk-forward cycle + swing theo ngày → `bottomHistory`. Giữ nguyên `signalHistory` (dày, bin từng ngày) + `confirmedBottoms`.
- `scripts/run.ts`
  - Cạnh chỗ merge `cycleBin`: forward-fill `bottomHistory` lên `timeline.points` — mỗi point lấy entry lưới gần nhất ≤ `pt.date`, gán `cycleProb/cycleCi/cycleN` + swing tương ứng. Trước nút đầu tiên ⇒ để undefined.
- `src/components/TimeMachine.tsx`
  - Bỏ prop `confirmedBottoms`; bỏ `bottomMarkers` trong `spark` memo + render `.tm-mk.bottom` (tam giác).
  - Thêm **gauge săn đáy as-of-ngày** trong panel ngày (dưới dải ngày/zone, cạnh Gợi ý): hiện `Đáy chu kỳ` + `Đáy sóng` với `prob% (CI lo–hi%)`, màu theo ngưỡng, "Chưa đủ dữ liệu" khi `n<10`/undefined. Đọc từ `p.cycleProb/...`.
  - `histGuidance`: đổi `bottom.high = (p.cycleProb ?? -1) >= 60 && (p.cycleN ?? 0) >= 10`; `verified = (p.cycleN ?? 0) >= 10`; label driver theo % thay vì bin.
- `src/components/Dashboard.tsx`
  - Ngừng truyền `confirmedBottoms` vào `<TimeMachine>` (giữ truyền vào chỗ khác nếu có — kiểm tra).
- `docs/bottom.md`
  - Thêm mục "xác suất as-of-ngày (walk-forward)": định nghĩa tập nền, bất biến ngày-cuối == gauge live, thưa/dày.

## Tách đơn vị (isolation)

- Toán walk-forward = phần tính trong `buildTier` (hàm thuần của chuỗi bar, test được qua `runBottom`).
- Trích hàm thuần `bottomPctClass(pct: number): "buy"|"neutral"|"sell"` (ngưỡng ≥60/≥35) dùng chung `BottomGauges` + Time Machine; **tái dùng CSS `.bottom-gauge-*`** sẵn có để hai nơi đọc giống hệt nhau (DRY, không lệch trình bày).

## Test

- `tests/bottom.test.ts` (chạy `runBottom` trên chuỗi bar tổng hợp):
  - **Bất biến ngày cuối:** `bottomHistory` phần tử cuối `.cycle.prob` == `cycle.prob` (và swing tương tự).
  - **Không look-ahead:** với chuỗi dựng sẵn, `prob` tại nút D không đổi khi nối thêm bar sau D; và chỉ gồm ngày `e + H ≤ idx_D`.
  - **Gate mẫu:** nút sớm có `n < 10` ⇒ `prob/ci = null`.
- **Golden hiện có phải vẫn xanh:** `bottom` `n`/`prob` hiện tại + backtest observations không đổi (walk-forward là field MỚI, không sửa `prob/ci/n` cũ).
- `npm run build` + `npm test` xanh.
- Tay: Time Machine hết tam giác; chọn ngày quá khứ thấy gauge %+CI; ngày sớm "chưa đủ dữ liệu"; ngày cuối khớp gauge live; "Gom rải" bật khi prob≥60.

## Cái KHÔNG làm (YAGNI)

- Không xóa `confirmedBottoms` khỏi `bottom.json`/script nghiên cứu — chỉ ẩn UI.
- Không đụng composite/zone/returns/buckets phía mua (đã as-of-ngày; ngoài phạm vi).
- Không lưu drivers đáy từng ngày (chỉ %/CI/bin).
- Không đổi gauge live hôm nay (== điểm cuối walk-forward).
- Không tính stat per-dense-day (giữ thưa + forward-fill).
- Không đổi cấu hình `BOTTOM_CONFIG` (H/ε/binEdges/weights).

## Rủi ro

- **Chi phí bootstrap** khi collect (~2.300 lần) — chạy cron, chấp nhận; nếu chậm quá có thể giảm iterations cho chuỗi lịch sử (giữ nguyên cho ngày cuối).
- **Forward-fill lệch ≤2 phiên** cho ngày giữa lưới — đúng nguyên tắc thưa, vô hại; ngày cuối (hôm nay) miễn nhiễm vì luôn được ghim.
- **Phình `timeline.json`**: thêm ~6 số/điểm; phần lớn null trước warm-up. Chấp nhận (data đã lớn).
