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

## Hai chế độ sử dụng

- **Toàn cảnh** (mặc định): radar 4 nhóm tiêu chí — nơi duy nhất tiêu chí chênh lệch VN có trọng số (25%) và có cảnh báo vùng bán. Dùng để *hiểu thị trường* và làm phanh an toàn trước khi mua.
- **Preset theo kỳ hạn**: cò súng MUA chuyên dụng. 3 preset **Sóng 1 tháng / Sóng 3 tháng / Tích lũy 6 tháng** — mỗi bộ tuyển bằng grid search trên 17 năm dữ liệu, điều kiện thắng baseline ở cả 2 giai đoạn độc lập (2009–2018, 2019–2026). Tín hiệu mua đúng 73–96% tùy kỳ hạn so với baseline 52–80%, kèm khoảng tin cậy 95% (block bootstrap). Preset **không hiển thị vùng bán** vì phía bán chưa từng được kiểm chứng đạt.

Quy tắc một dòng: **mua nghe app khi preset + toàn cảnh thuận nhau; bán theo kế hoạch kỳ hạn của bạn hoặc khi biểu đồ chênh lệch báo VÙNG BÁN VN (chênh ≥ p80)**. Tín hiệu bán composite gần như vô giá trị: đúng 49% sau 1 tháng, và ở 6 tháng nó *ngược* — giá tăng trung vị +9,5% sau khi báo bán (vùng bán nổ giữa sóng tăng có quán tính). Tín hiệu bán thật của vàng VN là **chênh lệch cao bất thường**: kiểm chứng 487 ngày SJC, mua lúc chênh ≥ p80 thì sau 2 tháng chỉ +1,5% trung vị (57% số lần), còn chênh ≤ p20 thì +10,4% (90%).

Các yếu tố tin tức/địa chính trị (GPR) và VIX đã được test và bị loại vì không cải thiện (hoặc làm giảm) độ chính xác; lợi suất Mỹ 10 năm được giữ vì cải thiện rõ. Phương pháp, bảng số liệu, khoảng tin cậy và các giới hạn cần biết: [docs/presets.md](docs/presets.md).

## Giám sát thoái hóa tự động

Mỗi cron, app chạy lại đúng cấu hình các preset trên dữ liệu mới nhất (`scripts/monitor-presets.ts` → `preset-health.json`). Preset mất phong độ (lợi thế sụp dưới 5pt, hoặc 2 năm gần nhất thua baseline quá 5pt) → badge ⚠ trên nút, banner cảnh báo, và tin Telegram. App tự khai khi chính nó hết đáng tin.

## Máy thời gian — xét lại lịch sử

Bấm vào biểu đồ giá để chọn bất kỳ ngày nào trong ~17 năm: engine chấm điểm **theo chế độ đang chọn, chỉ bằng dữ liệu có đến ngày đó** (không nhìn trước tương lai), rồi đối chiếu giá thực tế sau 1/3/6 tháng và phán ✓ đúng / ✗ sai. Công cụ đi kèm:

- Zoom 6 tháng / 1 / 2 / 5 năm / tất cả; slider cuộn cửa sổ trái–phải
- Chấm xanh = ngày có tín hiệu mua của chế độ đang chọn; nút ◀ ▶ nhảy thẳng giữa các tín hiệu
- Toggle "Hiện vùng bán (chỉ tham khảo 1 tháng)" — chấm đỏ + verdict bán, nhưng chỉ chấm đúng/sai ở kỳ hạn 1 tháng; 3–6 tháng ghi "không chấm" vì lịch sử cho thấy bán dài hạn thường ngược

## Biểu đồ chênh lệch VN — thế giới

Đường premium ~490 ngày kèm vạch percentile p20/p50/p80: dưới vạch xanh = chênh rẻ lịch sử (mua VN ít thiệt), trên vạch đỏ = chênh đắt bất thường. Khi chênh hiện tại vượt p80, app hiện banner **VÙNG BÁN VN theo chênh lệch** — tín hiệu bán đáng tin nhất cho vàng vật chất VN (bằng chứng: `npx tsx scripts/premium-exit-study.ts`); dưới p20 hiện ghi chú vùng mua ít thiệt.

## Chạy local

```bash
npm install
npm run collect   # fetch dữ liệu thật + phân tích + backtest -> public/data/
npm run dev       # mở http://localhost:3000
npm test          # test engine
npm run build     # export tĩnh ra out/

# công cụ nghiên cứu / chẩn đoán
npx tsx scripts/monitor-presets.ts      # sức khỏe preset + CI bootstrap
npx tsx scripts/check-modes.ts          # in composite 4 chế độ (đối chiếu UI)
npx tsx scripts/presets-study.ts        # tuyển chọn preset 3 kỳ hạn
npx tsx scripts/factor-study.ts         # ablation: lợi suất / VIX / GPR
npx tsx scripts/single-factor-study.ts  # từng tín hiệu vĩ mô đứng một mình
npx tsx scripts/horizon-study.ts        # hiệu quả theo 4 kỳ hạn
npx tsx scripts/backfill-vn.ts          # nhập lại lịch sử SJC từ CafeF
npx tsx scripts/premium-exit-study.ts   # chênh cao có phải vùng bán VN tốt?
```

Lỗi dev server "Cannot find module './NNN.js'" sau khi build nhiều lần: xóa thư mục `.next` rồi chạy lại `npm run dev` (cache webpack thối, không phải bug).

## Deploy (free, một lần duy nhất)

1. Tạo repo GitHub, push code lên nhánh `main`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Xong. Workflow `update-and-deploy.yml` tự chạy khi push và theo lịch 2 lần/ngày.

Mở trang trên điện thoại → "Thêm vào màn hình chính" để cài như app.

## Thông báo Telegram (tùy chọn)

Nhận cảnh báo khi: preset **chuyển vào/ra vùng mua**, chế độ toàn cảnh vào vùng bán (kèm caveat), hoặc preset bị đánh dấu **mất phong độ**. Chỉ báo lúc chuyển trạng thái, không spam mỗi ngày. Cài đặt:

1. Chat với `@BotFather` trên Telegram → `/newbot` → lấy **bot token**.
2. Chat với bot vừa tạo (bấm Start, gửi 1 tin bất kỳ), rồi mở `https://api.telegram.org/bot<TOKEN>/getUpdates` → lấy **chat id** trong `"chat":{"id":...}`.
3. Repo GitHub → Settings → Secrets and variables → Actions → thêm `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`.

Không đặt secrets thì bước thông báo tự bỏ qua, không ảnh hưởng gì.

## Miễn trừ trách nhiệm

Công cụ hỗ trợ quyết định dựa trên thống kê quá khứ. Không phải khuyến nghị đầu tư. Không đảm bảo kết quả tương lai.
