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
- Chuỗi giá Yahoo lấy từ mốc cố định 2006-09-25 thay cho cửa sổ 20 năm trượt — lịch sử quá khứ (xác suất săn đáy, mùa vụ, biến động) không còn tự đổi mỗi lần cron chạy (`scripts/fetch.ts`).
- Đồng bộ lại số kiểm chứng preset và "MUA độ tin cao" sau khi Yahoo sửa lịch sử GC=F ngày 15/09 (`src/lib/types.ts`, `src/lib/fusion.ts`, `docs/presets.md`, `docs/fusion.md`).
- CI "MUA độ tin cao" tính theo đợt độc lập thay vì mảng ngày đã lọc; hiển thị số đợt độc lập (9/6) thay cho số ngày (`scripts/calc-fusion-evidence.ts`, `scripts/monitor-fusion.ts`).
- Săn đáy: card live và Time Machine cùng dùng tầng chu kỳ để xét "đáy cao"; ô "strong" không còn khuyên "gom dứt khoát hơn" vì kiểm toán lịch sử cho thấy xác suất cao không đúng nhiều hơn (`src/components/Dashboard.tsx`, `src/lib/guidance.ts`).
- Biểu đồ chênh lệch bỏ lời khuyên thời điểm mua (≥p80 "đừng mua", ≤p20 "ít thiệt nhất") trái với quyết định hạ cấp premium 15/09 (`src/components/PremiumChart.tsx`).
- Chế độ trọng số tùy chỉnh không còn in bằng chứng của trọng số mặc định; bảng backtest chỉ tô sáng khi đúng trục đang xem (`src/components/Dashboard.tsx`).
- Service worker chỉ cache phản hồi thành công; bảng thiết lập khi đóng không còn nhận focus bàn phím (`public/sw.js`, `src/components/SettingsSheet.tsx`).
- Workflow chạy `npm test` sau deploy (báo Telegram khi fail) và không còn hủy lượt chạy dở (`.github/workflows/update-and-deploy.yml`).

- Cổng cảnh báo "đang sụp nhanh" của Săn đáy bật cả khi giá sụt ≥8% trong 42 phiên, không chỉ khi sụt ≥15% so với đỉnh mọi thời đại — những ngày cổng cũ bỏ sót mà máy báo ≥55% thì đúng 0/37 (`src/lib/bear-dca.ts`, `src/components/*`, `src/lib/as-of.ts`, `src/lib/summary.ts`).
- Tỷ giá của một ngày chỉ ghi một lần: cron (Vietcombank) và backfill (Yahoo) không còn ghi đè nhau làm premium cùng ngày nhảy qua lại (`scripts/run.ts`, `scripts/backfill-vn.ts`).

### Changed
- Preset 3 và 6 tháng: bỏ câu "cò súng đã kiểm chứng 2 giai đoạn", nói rõ mô phỏng tuyển chọn trung thực chỉ giữ lợi thế ở preset 1 tháng (`src/components/Dashboard.tsx`, `src/components/SettingsSheet.tsx`, `src/lib/as-of.ts`).
- Hero hiện số đợt độc lập thay cho số ngày và kèm cảnh báo selection bias; nhãn n của Săn đáy nói rõ cửa sổ chồng nhau thay cho "hiệu dụng ≈202" (`src/components/Dashboard.tsx`, `src/components/BottomGauges.tsx`).
- Bỏ các câu "gom rải", "tránh mua", "hạn chế mua", "so với 3 năm", "19 tháng" đã lỗi thời (`src/lib/criteria.ts`, `src/lib/summary.ts`, `src/components/*`).
- Thu thập giá nhẫn độc lập từng nguồn: lỗi SJC/CafeF/tỷ giá không làm mất hoặc ghi đè giá nhẫn đã thu thập (`scripts/backfill-vn.ts`).
- Đọc và kiểm tra `vn-gold.json` trước khi ghi bất cứ file nào: lịch sử hỏng không còn để lại `ring-gold.json` dở dang làm kẹt các lần đồng bộ sau (`scripts/backfill-vn.ts`).
- Lỗi lịch sử nhẫn không còn chặn việc thu thập giá SJC — vẫn báo lỗi, nhưng sau khi dữ liệu SJC đã lưu (`scripts/backfill-vn.ts`).
- Báo giá trùng giá không ghi đè bản ghi cũ, giữ nguyên thời điểm nguồn công bố (`src/lib/ring-gold.ts`).
- BTMC chỉ lấy qua API (đã tự thử lại); bỏ đường dự phòng HTML vì trang web niêm yết tên sản phẩm khác, dễ trộn hai sản phẩm vào một chuỗi giá (`scripts/ring-gold.ts`).
- Cập nhật cặp nhẫn nguyên khối (atomic pair), không ghép giá khác thời điểm (`scripts/backfill-vn.ts`, `src/lib/ring-gold.ts`).
- Local sync kiểm tra preflight sạch và giới hạn allowlist chỉ 2 file lịch sử (`scripts/sync-vn-gold.ts`).

### Documentation
- Hướng dẫn đồng bộ SJC trên Windows và Android: làm rõ giới hạn không thể lấp bù nhẫn khi máy tắt và cơ chế 2 file lịch sử độc lập (`docs/sync-vn-gold-setup.md`, `docs/sync-vn-gold-setup-android.md`).