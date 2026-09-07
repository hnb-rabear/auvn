# AUVN summary JSON

Snapshot công khai cho AI assistant và consumer máy đọc:

`https://hnb-rabear.github.io/auvn/data/summary.json`

File được tạo cuối mỗi lần `npm run collect`. Consumer chỉ đọc kết luận sẵn; không cần cào HTML hay tính lại điểm.

## Phiên bản

`schemaVersion` hiện là `"1.3"`. Consumer nên từ chối hoặc chuyển sang parser tương ứng khi major version không hỗ trợ. Thêm hoặc đổi nghĩa field phải cập nhật tài liệu và version.

- `1.3`: thêm `changed` (khác biệt so lần sinh trước, để consumer poll nhiều lần/ngày không phải tự giữ state). `bottomHunter.isBottomStart` giờ yêu cầu `signalHistory` cùng ngày với `dataDate`. Số thập phân của `accumulation.bearDca` và `accumulation.pricePercentile2y` làm tròn 4 chữ số.
- `1.2`: thêm `bottomHunter` (kết quả Bottom Hunter hiện tại + cờ khởi đầu vùng đáy) và `market.changes` (biến động so phiên trước). Consumer không cần tải `bottom.json` (769 KB) hay `history/vn-gold.json` nữa.
- `1.1`: thêm `signals.premiumGate`; `modelHealth.overall` thu hẹp về các lớp sinh kết luận và thêm `degradedLayers`/`insufficientLayers`.
- `1.0`: bản đầu.

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
  - `changes`: biến động so mốc lịch sử liền trước, hoặc `null` khi lịch sử có dưới hai mốc.
    - `prevDate`: ngày của mốc dùng làm gốc so sánh — entry cuối cùng trong lịch sử VN có ngày nhỏ hơn `dataDate`.
    - `xauUsd`, `sjcSell`, `ringSell`, `vnPremiumPct`: giá trị hôm nay trừ giá trị tại `prevDate`, cùng đơn vị với field gốc. Bên nào thiếu giá thì delta là `null`, không phải `0` — nhẫn thường thiếu, xem `warnings`.
    - Lịch sử VN ghi cả ngày không có báo giá mới (cuối tuần, nghỉ lễ) bằng cách chép lại giá hôm trước. Delta bằng `0` vì vậy có thể là "thị trường đứng giá" HOẶC "hôm nay không có báo giá mới" — đối chiếu `dataDate` và `sourceFreshness.vnGold` trước khi kết luận.
- `changed`: khác biệt so snapshot sinh lần trước. Dành cho consumer quét nhiều lần mỗi ngày: đọc field này thay vì tự lưu state cục bộ, tránh cảnh mất file là mất tín hiệu và hai máy báo lệch nhau.
  - `sincePrevRun`: `dataDate` đã đổi. Là `true` khi không có snapshot cũ để so — mặc định thiên về "có thể mới", không ru ngủ.
  - `newBuySignals`, `lostBuySignals`: id preset vừa bật hoặc vừa mất cờ `isBuy`.
  - `bottomStartToday`: bản sao của `bottomHunter.isBottomStart`, để mọi tín hiệu cần cảnh báo nằm chung một chỗ.
  - `phaseChanged`: pha Bear DCA khác lần trước. Là `false` khi không có snapshot cũ (không biết thì không báo động).
- `bottomHunter`: kết quả Bottom Hunter hiện tại, lớp NGỮ CẢNH nằm ngoài trục mua.
  - `cycle`, `swing`: hai tầng đáy, mỗi tầng gồm `bin`, `prob`, `ci`, `probUnweighted`, `n`. Không kèm `drivers` (chỉ web cần).
  - `n` đếm quan sát trên lưới thưa ba phiên, và các cửa sổ lợi suất chồng lên nhau — đây KHÔNG phải số mẫu độc lập. `n` lớn với `ci` hẹp không đồng nghĩa độ chắc chắn cao; xem `docs/bottom.md`.
  - `crashMode`: `true` khi Bear DCA ở pha `acute`. Khi đó `prob` có trọng số recency lạc quan giả, consumer phải đọc `probUnweighted` — đúng cổng hiển thị mà web dùng.
  - `isBottomStart`: `true` khi phiên `dataDate` là cạnh lên vào bin đáy cao nhất (`cycleBin` chuyển từ khác `3` sang `3`). So sánh theo phiên giao dịch liền trước trong lịch sử, không phải theo ngày lịch — cuối tuần không có phiên. Luôn là `false` khi lịch sử tín hiệu chưa chạy tới `dataDate` (Bottom Hunter lỗi trong khi phần còn lại của cron vẫn chạy): thà im lặng còn hơn báo cạnh lên của một ngày cũ như thể hôm nay.
  - `lastBottomStartDate`, `daysSinceBottomStart`: cạnh lên gần nhất (kể cả hôm nay) và số ngày dương lịch từ đó tới `dataDate`. Bằng `0` khi `isBottomStart` là `true`; cả hai là `null` khi lịch sử chưa từng vào bin `3`.
- `signals.presets`: ba preset `1m`, `3m`, `6m`. Mỗi mục có điểm hiện tại, ngưỡng mua, cờ `isBuy`, và `pointsToThreshold`. Khoảng cách bằng `0` khi đang báo mua, ngược lại là số điểm còn thiếu, làm tròn một chữ số thập phân.
- `signals.consensus`: số preset đang báo mua, tổng số preset, vùng và kết luận tổng hợp.
- `signals.radarContext`: composite mặc định chỉ làm ngữ cảnh; `isHeadwind` báo gió ngược khi vùng radar là `sell` hoặc `strong-sell`.
- `signals.premiumGate.blocksBuying`: `true` khi chênh VN ≥ p80 lịch sử — cùng cổng `premium-wait` mà web dùng, đã tính sẵn. `premiumP80` là `null` khi chưa đủ lịch sử để xếp hạng, khi đó cổng không chặn.
- `accumulation.effectiveBuyMultiplier`: hệ số mua hiệu lực từ Bear DCA.
- `accumulation.bearDca`: toàn bộ pha và lý do Bear DCA hiện tại.
- `accumulation.pricePercentile2y`: percentile giá trong dải hai năm, từ `0` đến `1`, hoặc `null`.
- `accumulation.twoYearBrake`: phanh chống FOMO riêng, gồm hệ số, trạng thái, lý do và cờ provisional. Phanh này không được nhân vào `effectiveBuyMultiplier`.
- `modelHealth.overall`: `ok`, `degraded`, hoặc `insufficient`.
  - `degraded` khi một lớp SINH KẾT LUẬN (preset `1m`/`3m`/`6m`, fusion 3m, Bear DCA) mất phong độ trên dữ liệu mới — đúng điều kiện web hiện cảnh báo.
  - `insufficient` chỉ khi thiếu bằng chứng preset (không đủ ba preset).
  - Lớp ở trạng thái `insufficient` KHÔNG ghim `overall`. `insufficient` nghĩa là chưa đủ chu kỳ để chấm điểm, không phải kết luận sai: Bear DCA nằm ở trạng thái này liên tục từ 2026-07 vì mới có 3 chu kỳ gấu trong khi cần 6. Bottom Hunter và phanh 2 năm là ngữ cảnh nên cũng không ghim `overall`.
- `modelHealth.degradedLayers`, `modelHealth.insufficientLayers`: tên mọi lớp đang có vấn đề, kể cả lớp ngữ cảnh và lớp chưa đủ dữ liệu. Các health object gốc nằm cùng nhóm để consumer đọc chi tiết.
- `warnings`: cảnh báo nguồn và độ mới dữ liệu từ phân tích.
- `sourceFreshness`: thời điểm từng nguồn, hoặc `null` khi analysis cũ chưa có thông tin này.

Giá chưa có dùng `null`, không dùng `0`.

## Quy tắc consumer

1. Chỉ `signals.presets[*].isBuy` là tín hiệu mua thật.
2. `signals.consensus` chỉ đếm tín hiệu từ preset đã kiểm chứng riêng. Mức đồng thuận không chứng minh độ chính xác cao hơn.
3. Không dùng `signals.radarContext.composite` hoặc `zone` làm cò súng mua. Radar chỉ cho ngữ cảnh và gió ngược.
4. Dùng `accumulation.effectiveBuyMultiplier` cho quy mô mua. Không tự nhân thêm `twoYearBrake.multiplier`.
5. `signals.premiumGate.blocksBuying = true` thì đừng đuổi giá dù preset báo mua. Không tự so lại `vnPremiumPct` với ngưỡng nào khác.
6. `bottomHunter` là ngữ cảnh, không phải tín hiệu mua — quy tắc 1 vẫn giữ nguyên. `prob` cao không thay cho `isBuy`.
7. `bottomHunter.crashMode = true` thì đọc `probUnweighted` thay cho `prob` ở cả hai tầng. Không tự trộn hai số.
8. `bottomHunter.isBottomStart` chỉ báo điểm khởi đầu gom rải, không bảo đảm đã tới đáy. Chất lượng tín hiệu phụ thuộc chế độ thị trường: win 6 tháng 92–93% giai đoạn từ 2019, nhưng chỉ 61–69% trong giai đoạn gấu trước 2019 (`docs/bottom.md`). Đừng phát biểu như một xác suất chạm đáy.
9. Dùng `changed` để biết có gì mới, đừng tự lưu state cục bộ. `changed.sincePrevRun = false` và mọi mảng rỗng nghĩa là lần quét này không có gì đáng báo.
10. Kiểm tra `stale`, `warnings`, `modelHealth.overall`, và `sourceFreshness` trước khi đưa kết luận. `modelHealth.degradedLayers` chứa lớp ngữ cảnh thì chỉ chiết khấu phần ngữ cảnh, không chiết khấu tín hiệu preset. `insufficientLayers` không phải lý do để chiết khấu kết luận — đó là lớp chưa đủ chu kỳ để chấm điểm.
11. Đây là hỗ trợ quyết định, không phải dự báo hay cam kết lợi nhuận.
