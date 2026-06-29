# DCA Co-pilot — thiết kế (thay Bottom Hunter)

Ngày: 2026-06-29. Trạng thái: **Module A đã thực thi → NO-GO** (xem `docs/dca-copilot.md`). Canh thời điểm trong tháng không có lợi thế giá-vốn bền vững; không ship UI Module A, giữ Bottom Hunter. Module B/C chưa làm.

## Bối cảnh & động cơ

Bottom Hunter hiện tại trả lời "xác suất gần đáy **chu kỳ** (126 phiên) / **sóng** (30 phiên)". Đây **không** phải câu hỏi người dùng cần. Nhu cầu thật:

1. **(A)** Tháng này vùng giá nào đẹp để vào? (không muốn mua mù ngày 1)
2. **(B)** Tháng này không có vùng đẹp thì có nên chờ tháng sau?
3. **(C)** Trong bear, giá có thể rơi đến đâu ở 1/3/6/12 tháng?

Quyết định: **thay hẳn** Bottom Hunter bằng engine **DCA Co-pilot** (A+B+C), thu hồi phần lõi đã validated (tín hiệu rsi+macro, block-bootstrap CI, walk-forward, fetch). Gỡ gauge đáy chu kỳ/sóng khỏi UI.

## Nguyên tắc bất biến (kế thừa CLAUDE.md)

- **No prediction claims — decision support only.** C là *phân phối lịch sử có điều kiện*, KHÔNG phải dự đoán điểm số. Dự đoán "giá sẽ chạm X" đã bị LOẠI trong Bear DCA study (placebo gần bằng) — không tái xây.
- **Evidence-first:** train/test + placebo + CI trước mọi quyết định; báo trung thực kể cả khi giết ý tưởng.
- **Free-tier only**, tính tại collection-time, repo là database, UI tiếng Việt.

## Hàm mục tiêu (xương sống mọi study)

Thước đo DUY NHẤT: **giá vốn dài hạn**.

```
giá vốn = tổng tiền đã chi ÷ tổng số chỉ vàng đã mua
```

Mô phỏng một người DCA ngân sách cố định/tháng qua toàn lịch sử XAU/USD. Luật "tốt hơn" = giá vốn **thấp hơn** baseline ở **cả train (<2019) lẫn test (≥2019)** VÀ **thắng placebo**. Đây là thước đo duy nhất khiến quyết định "chờ tháng sau" (B) kiểm chứng được (chờ = dời tiền sang tháng khác, chỉ đánh giá trên giá vốn tổng).

**Baselines & placebo:**
- **B0** — mua ngày 1 mỗi tháng (cái cần đánh bại)
- **B1** — mua ngày giữa tháng cố định
- **Placebo** — mua ngày **ngẫu nhiên** mỗi tháng. Nếu luật không hơn placebo ⇒ canh thời điểm là ảo giác ⇒ báo NO-GO.

## Dữ liệu & cảnh báo trung thực

- Backtest trên **XAU/USD daily 15-20 năm** (chuỗi duy nhất đủ dài).
- Giá vốn *thật* của người dùng là **VND** (SJC/nhẫn); chỉ có ~6 tháng dữ liệu VN ⇒ **không kiểm chứng được giá vốn VND**. Engine validated trên XAU làm proxy; UI hiển thị tín hiệu canh-thời-điểm (XAU) + giá VN thật để bấm nút, kèm dòng "chênh lệch VN premium chưa đủ dữ liệu kiểm chứng". Đúng pattern dự án.

## Giao thức kiểm chứng (mọi module)

train <2019 / test ≥2019, block-bootstrap CI, gate = vượt baseline + placebo ở cả hai giai đoạn (min-excess > 0), giống `bottom-study`/`accumulation-study`. Báo trung thực nếu edge nhỏ/không có.

---

## Module A — Vùng vào trong tháng

Mỗi ngày giao dịch, engine trả lời "hôm nay có phải vùng đẹp để xuống tiền tháng này?" — past-only.

**Các họ luật ứng viên (study đua, gate chọn):**
- **R1 — Vị trí tương đối:** giá ≤ percentile p của biên độ W phiên gần nhất. Lưới W ∈ {21, 42, 63}, p ∈ {20, 25, 30, 35}.
- **R2 — Lệch chuẩn:** giá thấp hơn SMA(W) k độ lệch chuẩn.
- **R3 — Trũng + xác nhận:** R1 VÀ (RSI quá bán hoặc MACD đảo lên) — tái dùng `bottomFeatures` rsi/macd. Tránh bắt dao rơi.
- **R4 — Rơi từ đỉnh tháng:** giá ≤ x% dưới đỉnh trong-tháng-tới-giờ.

**Cơ chế hạn chót:** trong tháng phải mua. Chưa gặp vùng đẹp tới ngày cuối tháng → **buộc mua ngày cuối** (biến thể "buộc mua"; B sẽ nới ra).

**Hiển thị live (3 trạng thái, KHÔNG dùng %):**
- 🟢 **Vùng đẹp** — giá trong vùng theo luật đã validated → "có thể vào"
- 🟡 **Chờ** — chưa tới vùng, còn thời gian trong tháng
- 🔴 **Hết tháng, chưa có vùng** — cân nhắc buộc mua

Kèm: percentile giá hiện tại vs biên độ gần đây; CI mức tiết kiệm kỳ vọng.

**Đầu ra:** luật thắng (W, p, ngưỡng), % giá vốn tiết kiệm vs B0 (train/test), có vượt placebo. Nếu không họ nào vượt placebo ⇒ doc ghi "canh thời điểm trong tháng không có edge bền vững, chỉ nên mua vào dip đơn giản".

## Module B — Chờ tháng sau (skip phụ thuộc chế độ)

Nới "buộc mua cuối tháng" của A thành cho phép dời tiền. Chế độ lấy từ **Bear DCA phase** có sẵn (bull / sụp cấp tốc / hồi phục / lì).

**BEAR (sụp cấp tốc / drawdown sâu) → nhịn kiên nhẫn:** chưa gặp vùng đẹp → dời + **dồn ngân sách**; không trần cứng nhưng có **trần an toàn 6-12 tháng** chống kẹt tiền. Vùng đẹp định nghĩa tương đối nên dip cục bộ vẫn kích hoạt khi giá rơi đều.

**BULL (bull / hồi phục / lì) → nhịn có trần:** dời tối đa **N tháng** (lưới N ∈ {1, 2, 3}), dồn ngân sách; chạm trần → buộc xuống tiền.

**Ngân sách dồn:** tháng nhịn → tiền cộng vào kho; gặp vùng đẹp (hoặc chạm trần) → mua một lần bằng toàn kho.

**Study B:** mô phỏng skip-theo-chế-độ qua 15 năm, đo giá vốn vs A-không-skip và vs B0, train/test + placebo.

**Cảnh báo:** số lần "quyết định nhịn" lịch sử rất ít ⇒ CI rộng, khó đạt gate. Nếu B không vượt A-không-skip ở cả hai giai đoạn ⇒ **ship A trước, B ở trạng thái provisional/tắt**, ghi rõ "chưa đủ bằng chứng skip có lợi". Không ép B qua cổng.

## Module C — Phân phối rủi ro bear

Không dự đoán điểm số; phân phối lịch sử có điều kiện theo độ sâu drawdown hiện tại.

1. Chia lịch sử theo **drawdown từ đỉnh**: bucket 0-10%, 10-20%, 20-30%, >30%.
2. Mỗi bucket: phân phối forward return ở 21 / 63 / 126 / 252 phiên (≈1/3/6/12 tháng).
3. Báo cho bucket khớp hôm nay: **trung vị**, **biên 10%-90%**, **P(đáy đã ở phía sau)**, **block-bootstrap CI**.

**Ví dụ:** "XAU đang −18% từ đỉnh (bucket 10-20%). Sau 3 tháng: trung vị −3%, xấu nhất 10% rơi thêm −11%, 58% trường hợp đáy đã ở phía sau (CI 49-67%)."

**Placebo/gate:** so phân phối có điều kiện vs **vô điều kiện**. Nếu drawdown không làm phân phối khác đi đáng kể ⇒ báo thẳng "độ sâu drawdown không tiên lượng được mức rơi thêm", chỉ hiển thị phân phối thô tham khảo. Train/test xác nhận ổn định.

**Vai trò UI:** bối cảnh rủi ro cạnh quyết định skip (B) — "nhịn chờ trong bear thì downside còn cỡ nào". Không tự động hóa, chỉ soi sáng.

---

## Kiến trúc file

| File | Vai trò |
|---|---|
| `src/lib/dca-copilot.ts` | engine live (A+B+C), thay `bottom.ts` |
| `scripts/dca-timing-study.ts` | study A — đua luật R1-R4, gate |
| `scripts/dca-skip-study.ts` | study B — skip theo chế độ |
| `scripts/bear-downside-study.ts` | study C — phân phối có điều kiện |
| `docs/dca-copilot.md` | phương pháp + bằng chứng (thay `docs/bottom.md`) |
| UI `DcaCopilotCard` | thay `BottomCard` |

Phần thu hồi từ `bottom.ts`: `bottomFeatures` (rsi/macd/macro), `blockBootstrapCi`, các chỉ báo trong `indicators.ts`, pattern walk-forward past-only.

## Thứ tự triển khai (mỗi phần ship riêng)

1. **A** — lõi, đua luật, gate. Ship engine timing + UI 3 trạng thái.
2. **C** — độc lập, dễ. Thêm bối cảnh rủi ro.
3. **B** — khó nhất, có thể provisional. Skip theo chế độ.

## Không làm (YAGNI / đã loại)

- Dự đoán điểm số "giá sẽ chạm X" (đã loại trong Bear DCA).
- Tái thêm GPR, VIX, lợi suất thực DFII10, GSR (đã loại trong các study trước) — trừ khi study mới chứng minh có ích cho mục tiêu giá vốn.
- Gauge đáy chu kỳ/sóng cũ (% near-bottom) — gỡ khỏi UI.
- Ép B qua gate khi mẫu skip quá ít.
