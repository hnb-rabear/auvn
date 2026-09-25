# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Giá nhẫn trơn 9999 theo thương hiệu (BTMC / BTMH) trên Dashboard và Time Machine (`src/components/Dashboard.tsx`, `src/app/page.tsx`).
- Bộ chọn thương hiệu nhẫn (BTMC / BTMH) lưu tại thiết bị (`au-settings-v2`), bảo toàn lựa chọn hãng khi đổi trọng số hoặc preset (`src/lib/settings.ts`).
- Lưu trữ lịch sử giá nhẫn theo thương hiệu độc lập tại `public/data/history/ring-gold.json`.

### Fixed
- Cron dừng thay vì ghi đè `vn-gold.json` còn 1 dòng khi file lịch sử hỏng (`scripts/run.ts`).
- Cache lợi suất 10 năm gộp theo ngày thay vì so độ dài — cửa sổ Yahoo 20 năm trượt từng làm cache đóng băng (`scripts/run.ts`, `scripts/fetch.ts`).
- Thêm cache DXY (`public/data/history/dxy.json`): một lần Yahoo lỗi không còn xóa tín hiệu vĩ mô khỏi toàn bộ timeline (`scripts/run.ts`).
- Điểm Fed: làm tròn hiệu số lãi suất, mức tăng 0,25 không còn bị chấm −1 do sai số dấu phẩy động (08–09/2017) (`src/lib/criteria.ts`).
- Local sync dừng nếu không ở nhánh `main` và tự `git rebase --abort` khi conflict (`scripts/sync-vn-gold.ts`).
- Thu thập giá nhẫn độc lập từng nguồn: lỗi SJC/CafeF/tỷ giá không làm mất hoặc ghi đè giá nhẫn đã thu thập (`scripts/backfill-vn.ts`).
- Đọc và kiểm tra `vn-gold.json` trước khi ghi bất cứ file nào: lịch sử hỏng không còn để lại `ring-gold.json` dở dang làm kẹt các lần đồng bộ sau (`scripts/backfill-vn.ts`).
- Lỗi lịch sử nhẫn không còn chặn việc thu thập giá SJC — vẫn báo lỗi, nhưng sau khi dữ liệu SJC đã lưu (`scripts/backfill-vn.ts`).
- Báo giá trùng giá không ghi đè bản ghi cũ, giữ nguyên thời điểm nguồn công bố (`src/lib/ring-gold.ts`).
- BTMC chỉ lấy qua API (đã tự thử lại); bỏ đường dự phòng HTML vì trang web niêm yết tên sản phẩm khác, dễ trộn hai sản phẩm vào một chuỗi giá (`scripts/ring-gold.ts`).
- Cập nhật cặp nhẫn nguyên khối (atomic pair), không ghép giá khác thời điểm (`scripts/backfill-vn.ts`, `src/lib/ring-gold.ts`).
- Local sync kiểm tra preflight sạch và giới hạn allowlist chỉ 2 file lịch sử (`scripts/sync-vn-gold.ts`).

### Documentation
- Hướng dẫn đồng bộ SJC trên Windows và Android: làm rõ giới hạn không thể lấp bù nhẫn khi máy tắt và cơ chế 2 file lịch sử độc lập (`docs/sync-vn-gold-setup.md`, `docs/sync-vn-gold-setup-android.md`).