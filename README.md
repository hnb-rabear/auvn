# Vùng Vàng — trợ lý vùng mua/bán vàng

PWA miễn phí giúp xác nhận **vùng mua / vùng bán** vàng vật chất Việt Nam (SJC, nhẫn) theo xác suất. Không dự đoán giá — chấm điểm 4 nhóm tiêu chí, tổng hợp thành điểm −100..+100 kèm % kiểm chứng lịch sử (backtest 15+ năm giá thế giới).

## Cách hoạt động

- **GitHub Actions cron (8:23 & 20:23 giờ VN)** lấy giá vàng VN (BTMC/SJC), XAU/USD + DXY (Yahoo), tỷ giá (Vietcombank), lãi suất Fed (FRED) → chạy engine chấm điểm + backtest → commit kết quả JSON vào `public/data/` → deploy lên GitHub Pages.
- **App tĩnh** chỉ đọc JSON đã tính sẵn: mở là có ngay, không gọi API ngoài.
- Lịch sử giá VN tự tích lũy mỗi ngày trong `public/data/history/vn-gold.json` — repo chính là database. Đã backfill 487 ngày lịch sử SJC từ CafeF (02/2025→nay) kèm premium tính từ XAU × tỷ giá, nên tiêu chí chênh lệch VN chạy percentile thật ngay từ đầu (`scripts/backfill-vn.ts` chạy lại được nếu cần).

## 4 nhóm tiêu chí (trọng số chỉnh được trong app)

1. **Kỹ thuật XAU/USD (35%)** — RSI ngày/tuần, MA200, biên độ 52 tuần, hỗ trợ/kháng cự
2. **Chênh lệch VN — thế giới (25%)** — premium SJC vs giá quy đổi, spread mua–bán, nhẫn vs miếng
3. **Vĩ mô (20%)** — DXY, hướng lãi suất Fed, lợi suất Mỹ 10 năm, nhịp tỷ giá USD/VND
4. **Thống kê lịch sử (20%)** — percentile giá 1y/3y, mùa vụ theo tháng, chế độ biến động

## Bộ cấu hình theo kỳ hạn (preset)

Trong ⚙ Trọng số có 3 preset **Sóng 1 tháng / Sóng 3 tháng / Tích lũy 6 tháng** — mỗi bộ được tuyển bằng grid search trên 17 năm dữ liệu với điều kiện thắng baseline ở cả 2 giai đoạn độc lập (2009–2018, 2019–2026). Tín hiệu mua của preset đúng 73–96% tùy kỳ hạn, so với baseline 52–80%. Các yếu tố tin tức/địa chính trị (GPR) và VIX đã được test và bị loại vì không cải thiện (hoặc làm giảm) độ chính xác. Phương pháp, bảng số liệu đầy đủ và các giới hạn cần biết: [docs/presets.md](docs/presets.md).

## Máy thời gian — xét lại lịch sử

Kéo slider về bất kỳ ngày nào trong ~17 năm qua: engine chấm điểm **chỉ bằng dữ liệu có đến ngày đó** (không nhìn trước tương lai), hiển thị vùng mua/bán nó sẽ tuyên bố lúc ấy, rồi đối chiếu giá thực tế sau 1/3/6 tháng và phán: ✓ quyết định đúng / ✗ quyết định sai.

## Chạy local

```bash
npm install
npm run collect   # fetch dữ liệu thật + phân tích + backtest -> public/data/
npm run dev       # mở http://localhost:3000
npm test          # test engine
npm run build     # export tĩnh ra out/
```

## Deploy (free, một lần duy nhất)

1. Tạo repo GitHub, push code lên nhánh `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Xong. Workflow `update-and-deploy.yml` tự chạy khi push và theo lịch 2 lần/ngày.

Mở trang trên điện thoại → "Thêm vào màn hình chính" để cài như app.

## Thông báo Telegram (tùy chọn)

Nhận cảnh báo khi preset **chuyển vào/ra vùng mua** (chỉ báo lúc chuyển trạng thái, không spam mỗi ngày):

1. Chat với `@BotFather` trên Telegram → `/newbot` → lấy **bot token**.
2. Chat với bot vừa tạo (bấm Start, gửi 1 tin bất kỳ), rồi mở `https://api.telegram.org/bot<TOKEN>/getUpdates` → lấy **chat id** trong `"chat":{"id":...}`.
3. Repo GitHub → Settings → Secrets and variables → Actions → thêm `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`.

Không đặt secrets thì bước thông báo tự bỏ qua, không ảnh hưởng gì.

## Miễn trừ trách nhiệm

Công cụ hỗ trợ quyết định dựa trên thống kê quá khứ. Không phải khuyến nghị đầu tư. Không đảm bảo kết quả tương lai.
