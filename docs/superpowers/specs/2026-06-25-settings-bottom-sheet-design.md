# Thiết kế: Bottom sheet cho Preset + Trọng số

Ngày: 2026-06-25
Trạng thái: đã duyệt thiết kế, chờ viết plan.

## Vấn đề

Trên mobile, control thiết lập bị rải rác:

- Nút `⚙ Trọng số` ở header (đỉnh trang).
- `preset-row` (Toàn cảnh + 3 preset) nằm giữa trang, sau khối giá.
- Panel slider trọng số hiện inline khi toggle, ngay dưới preset-row.
- Hiệu ứng (verdict) ở hero, gần đỉnh trang.

Hệ quả: muốn chỉnh thiết lập phải chạm nút ở đỉnh → cuộn xuống tìm panel → kéo slider → cuộn ngược lên xem verdict đổi. Vuốt lên-xuống quá nhiều.

## Mục tiêu

Gom toàn bộ thiết lập (preset + trọng số) vào **một bottom sheet** mở bằng **FAB** nổi đáy-phải, có **dải verdict realtime ghim trong sheet** để không phải cuộn đi đâu. Trang chính gọn lại.

Không đổi: scoring engine, backtest, data pipeline, localStorage schema (`au-settings-v2`), các accordion khác.

## Trang chính (bỏ gì)

- Bỏ nút `⚙ Trọng số` khỏi header — header chỉ còn tiêu đề.
- Bỏ `preset-row` khỏi giữa trang.
- Giữ dòng hero meta hiện có (`Dashboard.tsx:185`: `· preset {label}`) — chỉ hiện khi có preset active, không hiện gì cho Toàn cảnh/Tùy chỉnh. Nhãn FAB mới là chỉ báo mode chính cho cả 3 trạng thái.

## FAB (nút mở sheet)

- `position: fixed`, góc dưới-phải, luôn hiển thị dù cuộn ở đâu, vừa tầm ngón cái.
- Nhãn = mode đang dùng:
  - Có preset → `p.label` (vd `⚙ Sóng 3 tháng`).
  - `customized` (đã kéo slider, không preset) → `⚙ Tùy chỉnh`.
  - Mặc định → `⚙ Toàn cảnh`.
- Chạm → mở bottom sheet.

## Bottom sheet

Trượt từ đáy, đè overlay mờ. Đóng bằng: nút `✕`, bấm overlay, phím `Esc`. (Không làm vuốt-xuống-để-đóng — cần xử lý gesture touch, thừa cho app 1 người dùng.)

**Ràng buộc cốt lõi: nội dung mặc định phải vừa ~1 viewport, không cuộn trong sheet** — nếu phải cuộn trong sheet thì tái hiện đúng cái đau cũ.

Thứ tự trên→dưới:

1. **Tay nắm kéo** (chỉ trang trí, không kéo được) + nút đóng `✕`.
2. **Dải verdict ghim** (sticky đầu sheet): badge vùng + điểm composite. **Cập nhật realtime** khi kéo slider. Dashboard đã tính sẵn `composite`, `zone`, `verdictLabel` (có gating MUA của preset: `zone = preset && !isBuyZone ? "neutral" : rawZone`, label `CHƯA CÓ TÍN HIỆU MUA` ở `Dashboard.tsx:130-135`) — **truyền xuống làm prop, KHÔNG tính lại trong sheet** (tránh nhân đôi logic gating). Kéo slider → `setWeight` cập nhật state Dashboard → `useMemo` tính lại → sheet re-render với prop mới.
3. **Chip preset**: `Toàn cảnh · Sóng 1 tháng · Sóng 3 tháng · Tích lũy 6 tháng`. Chip đang chọn sáng viền vàng. Chạm = nạp `p.weights` + `presetId`. Chip preset `degraded` hiện `⚠` (như preset-row hiện tại).
4. **5 slider trọng số** (technical, premium, macro, stats, momentum) — hàng compact. Kéo slider → `presetId: null` → state `Tùy chỉnh` (không chip nào sáng).
5. **`ℹ Giải thích`** (collapsible, mặc định đóng): chứa đoạn text dài hiện tại (Toàn cảnh vs Preset, grid search 17 năm, docs/presets.md, lưu ý bảng % kiểm chứng theo trọng số mặc định). Thu gọn để sheet mặc định ngắn.

**Desktop / màn rộng** (tùy chọn, ưu tiên thấp — app mobile-first): media query canh sheet vào giữa thay vì dán đáy. Nếu phức tạp thì bỏ, dán đáy cũng chạy được trên desktop.

## State & logic

Giữ nguyên logic hiện có, chỉ đổi vỏ render:

- `showSettings` → đổi tên `sheetOpen` (bool), FAB toggle.
- `applyPreset` / `setWeight` / `customized` / `loadSettings` / `saveSettings` **không đổi**, chỉ di chuyển nơi render vào sheet.
- Kéo slider vẫn set `presetId: null` (thoát preset). localStorage `au-settings-v2` giữ nguyên schema.
- Nhãn FAB suy ra từ `preset` / `customized` state.

## Chuyển động & a11y

- Sheet: `transform: translateY` + `transition`; overlay fade `opacity`. Tôn trọng `prefers-reduced-motion` → bỏ animation.
- Khóa cuộn body khi sheet mở.
- `role="dialog"`, `aria-modal="true"`, `Esc` đóng. **Không làm focus trap** — thừa cho app 1 người dùng.

## File đụng tới

- `src/components/Dashboard.tsx` — bỏ nút header + `preset-row`; thêm FAB + render `<SettingsSheet>`; truyền `weights`, `preset`, `customized`, `analysis.criteria`, `applyPreset`, `setWeight`, `health`, `composite`, `verdictLabel`, `zone`, `sheetOpen`, `onClose`.
- `src/components/SettingsSheet.tsx` (mới) — verdict strip + chip preset + sliders + giải thích. Nhận `composite`/`verdictLabel`/`zone` làm prop (KHÔNG tính lại). Giữ Dashboard gọn.
- `src/app/globals.css` — thêm `.fab`, `.sheet`, `.sheet-overlay`, `.sheet-handle`, `.sheet-verdict`; tái dùng/giữ style chip từ `.preset-row` + `.iconbtn`.

## Không thuộc phạm vi

- Không đổi scoring engine, backtest, data, hay logic preset/weights.
- Không thêm preset mới.
- Không đổi các accordion "Chi tiết điểm số" và phần dưới.
