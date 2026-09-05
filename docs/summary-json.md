# AUVN summary JSON

Snapshot công khai cho AI assistant và consumer máy đọc:

`https://hnb-rabear.github.io/auvn/data/summary.json`

File được tạo cuối mỗi lần `npm run collect`. Consumer chỉ đọc kết luận sẵn; không cần cào HTML hay tính lại điểm.

## Phiên bản

`schemaVersion` hiện là `"1.0"`. Consumer nên từ chối hoặc chuyển sang parser tương ứng khi major version không hỗ trợ. Thêm hoặc đổi nghĩa field phải cập nhật tài liệu và version.

## Trường chính

- `generatedAt`: thời điểm tạo snapshot, ISO 8601 UTC.
- `dataDate`: ngày phiên giá mới nhất, dạng `YYYY-MM-DD`.
- `stale`, `staleDays`: trạng thái và số ngày dữ liệu cũ theo phân tích AUVN.
- `market`: giá thị trường hiện tại.
  - `xauUsd`: USD/oz.
  - `sjcBuy`, `sjcSell`, `ringBuy`, `ringSell`, `worldVndPerLuong`, `vnPremiumVnd`: VND/lượng.
  - `ringDate`: ngày báo giá nhẫn, hoặc `null`.
  - `usdVnd`: VND/USD.
  - `vnPremiumPct`: premium SJC so với giá thế giới, đơn vị `%`.
- `signals.presets`: ba preset `1m`, `3m`, `6m`. Mỗi mục có điểm hiện tại, ngưỡng mua, cờ `isBuy`, và `pointsToThreshold`. Khoảng cách bằng `0` khi đang báo mua, ngược lại là số điểm còn thiếu, làm tròn một chữ số thập phân.
- `signals.consensus`: số preset đang báo mua, tổng số preset, vùng và kết luận tổng hợp.
- `signals.radarContext`: composite mặc định chỉ làm ngữ cảnh; `isHeadwind` báo gió ngược khi vùng radar là `sell` hoặc `strong-sell`.
- `accumulation.effectiveBuyMultiplier`: hệ số mua hiệu lực từ Bear DCA.
- `accumulation.bearDca`: toàn bộ pha và lý do Bear DCA hiện tại.
- `accumulation.pricePercentile2y`: percentile giá trong dải hai năm, từ `0` đến `1`, hoặc `null`.
- `accumulation.twoYearBrake`: phanh chống FOMO riêng, gồm hệ số, trạng thái, lý do và cờ provisional. Phanh này không được nhân vào `effectiveBuyMultiplier`.
- `modelHealth.overall`: `ok`, `degraded`, hoặc `insufficient`. Các health object gốc nằm cùng nhóm để consumer đọc chi tiết.
- `warnings`: cảnh báo nguồn và độ mới dữ liệu từ phân tích.
- `sourceFreshness`: thời điểm từng nguồn, hoặc `null` khi analysis cũ chưa có thông tin này.

Giá chưa có dùng `null`, không dùng `0`.

## Quy tắc consumer

1. Chỉ `signals.presets[*].isBuy` là tín hiệu mua thật.
2. `signals.consensus` chỉ đếm tín hiệu từ preset đã kiểm chứng riêng. Mức đồng thuận không chứng minh độ chính xác cao hơn.
3. Không dùng `signals.radarContext.composite` hoặc `zone` làm cò súng mua. Radar chỉ cho ngữ cảnh và gió ngược.
4. Dùng `accumulation.effectiveBuyMultiplier` cho quy mô mua. Không tự nhân thêm `twoYearBrake.multiplier`.
5. Kiểm tra `stale`, `warnings`, `modelHealth.overall`, và `sourceFreshness` trước khi đưa kết luận.
6. Đây là hỗ trợ quyết định, không phải dự báo hay cam kết lợi nhuận.
