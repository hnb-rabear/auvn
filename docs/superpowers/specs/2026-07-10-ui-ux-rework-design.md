# UI/UX rework — chart chính + as-of toàn trang + IA theo câu hỏi

Ngày: 2026-07-10. Phạm vi: **chỉ presentation layer** (`Dashboard.tsx`, `TimeMachine.tsx`, components, CSS). Không đụng scoring engine, consensus, guidance logic, backtest, data pipeline, JSON schema.

## Động lực (đã chốt qua brainstorming)

1. Nhìn cũ / thiếu polish.
2. Luồng dùng hằng ngày chưa trơn. Thứ tự ưu tiên thông tin: **giá bây giờ → mua không? → gom không? → đồ thị tháng này → chi tiết**.
3. Tái sử dụng cơ chế chọn thời điểm từ biểu đồ (hiện chỉ Máy thời gian có) cho cả app.

## Quyết định kiến trúc (Hướng A — đã duyệt)

**1 chart chính + cả app as-of.** Nâng lõi tính as-of của Máy thời gian lên cấp trang: chart chính cầm `selectedIdx: number | null` (index vào `timeline.points`); `null` = live, chọn ngày = toàn bộ dashboard hiển thị giá trị as-of ngày đó. Máy thời gian không còn là accordion riêng — nó **trở thành** cơ chế của cả trang.

Hai hướng bị loại: (B) as-of là sheet overlay — không đạt "cả app as-of"; (C) viết lại trắng — rủi ro rơi mất ràng buộc an toàn.

## Bố cục trang (trên → dưới, mobile-first)

```text
┌──────────────────────────────┐
│ VùngVàng                  ⚙  │  header
├──────────────────────────────┤
│ (banner stale/degraded)      │  giữ nguyên logic
├──────────────────────────────┤
│ SJC 121.5M  Nhẫn 118.2M      │  ① GIÁ — dải giá gọn, số to
│ TG quy đổi 98.1M · chênh +23%│
├──────────────────────────────┤
│ ❓MUA?   GOM / QUAN SÁT…     │  ② chip trả lời: guidance.level/when
│ ❓GOM?   ×1.0 — thị trường…  │  ③ chip trả lời: Bear DCA phase + ×
├──────────────────────────────┤
│ 📈 CHART CHÍNH               │  ④ SJC + XAU, chấm tín hiệu,
│    [1T] 3T  1N  Max          │     chạm → chọn ngày, kéo → pan
│  (sticky khi as-of: ← Hôm nay│
│   + kết quả sau 1/3/6T ✓/✗)  │
├──────────────────────────────┤
│ ▸ Mua bây giờ? (chi tiết)    │  4 khối <details> đóng mặc định
│ ▸ Gom dài hạn? (chi tiết)    │
│ ▸ Triển vọng 1/3/6 tháng     │
│ ▸ Chi tiết & kiểm chứng      │
├──────────────────────────────┤
│ footer disclaimer            │
└──────────────────────────────┘
```

- Chạm chip → cuộn xuống khối chi tiết tương ứng.
- Chọn ngày trên chart → chip + 4 khối chuyển as-of; thanh sticky trên chart hiện `← Hôm nay` + ngày đang xem + **kết quả sau đó 1/3/6T (✓/✗, từ `point.returns`)**; viền/nền trang đổi nhẹ báo "đang xem quá khứ".
- FAB ⚙ + `SettingsSheet` (slider trọng số, chế độ custom) giữ nguyên.
- Verdict-note an toàn (cảnh báo bán, sell-timing, chưa-đủ-dữ-liệu) + chip high-conf 3T "đã kiểm chứng" (fusion) nằm trong chip/khối Mua? — không giấu, cả live lẫn as-of.

## Chart chính (`PriceChart` — component mới)

**Dữ liệu & 2 đường:**

- XAU/USD: đường chính, từ `timeline.points` (dense mỗi phiên, 4275 điểm, 2009-07-09 → nay, ~17 năm; field `price`).
- SJC: đường phụ, từ `public/data/history/vn-gold.json` field `sjcSell` (493 rows, sớm nhất **2025-02-08**, ~17 tháng).
- **2 trục giá tuyệt đối**: SJC trục trái (triệu/lượng), XAU trục phải ($). KHÔNG normalize % (đã loại vì gây hiểu lầm). Range dài hơn dữ liệu SJC → đường SJC ngắn + chú thích "SJC: từ 2025-02".
- Nút range `[1T] 3T 1N Max`, mặc định 1T.

**Chấm tín hiệu (luôn hiện, không toggle):**

- ● vàng — ngày đồng thuận MUA: `presetComposites(points, preset)` cho 3 preset (logic hiện trong TimeMachine.tsx:155-161, chuyển vào lib as-of), đậm dần theo k.
- ▲ xanh — điểm bắt đầu tín hiệu săn đáy: `bottomStartIdxs` (đã export từ `src/lib/timeline.ts`).
- Chỉ hiện trong range đang xem; 1T thường trống — chấp nhận, không độn.

**Gesture (port từ TimeMachine, mô tả đúng hành vi đã có):**

- Chạm 1 lần (≤6px di chuyển) → chọn phiên gần nhất, crosshair + tooltip ngày/giá.
- Kéo ngang → **pan** cửa sổ nhìn (`applyBrushDrag` từ `src/lib/brush.ts` — tái dùng nguyên).
- KHÔNG port pinch/wheel zoom (`zoomTo`) — range chuyển bằng nút coarse. Ít control hơn TimeMachine cũ, chủ đích.
- Vùng chart đặt `touch-action: none` (như `.tm-chart` hiện tại) — kéo dọc TRÊN chart không cuộn trang; giới hạn cao chart ≤ ~40% màn hình để phần còn lại cuộn bình thường.
- `← Hôm nay` (sticky trên chart, chỉ hiện khi as-of) → về live.
- Ngày as-of ngoài lịch sử VN → khối chênh lệch hiện "chưa có dữ liệu VN ngày này".

**Kỹ thuật:** SVG viewBox thuần như TimeMachine hiện tại — không thư viện chart, không dependency mới.

## State as-of & luồng dữ liệu

**`useAsOf` hook + `src/lib/as-of.ts` (mới — TÁCH từ ruột TimeMachine.tsx, không viết lại logic):**

```text
selectedIdx: number | null            // index vào timeline.points; null = live
asOf = {
  verdict:      buyKs đếm từ presetComposites 3 preset + consensusLabel/consensusZone
                (logic TimeMachine.tsx:155-161 chuyển vào lib)
  guidance:     deriveGuidance(GuidanceInput as-of)  — hàm pure sẵn có (guidance.ts:68);
                trong as-of: premiumPct = null (gate sẵn có — trung thực, không có premium quá khứ)
  bearDca:      bearDcaAt(prices, idx, pricePct2y)   (bear-dca.ts:73, golden-tested ≡ runBearDca)
  bottom:       TimelinePoint.cycleProb/cycleProbUw/swingBin/… (walk-forward, forward-fill
                từ bottomHistory — đã precompute trong timeline)
  bearDownside: TimelinePoint.bearAsOf (BearAsOfBand, types.ts:692)
  highConf3m:   chip "đã kiểm chứng" fusion (logic TimeMachine.tsx:308-314)
  returns:      point.returns{21,63,126} + ✓/✗
  prices:       point.price + vn-gold row cùng ngày (nếu có)
}
```

- Live path = `useAsOf(null)` trả **thẳng số precompute trong JSON** — không tính lại, tránh lệch với notify/monitor (quy tắc chart ≡ card ≡ monitor).
- Component con (`BearDcaCard`, `BottomGauges`, `BearDownsideCard`) không tự biết live/as-of — chỉ render data qua props. Props hiện tại giữ nguyên hình dạng (`bearDca+health`, `bottom+crashMode`, `bd+timeline`).
- **Giới hạn as-of trung thực (như TimeMachine hiện tại):** khối ④ chỉ hiện điểm số per criterion (không có chuỗi giải thích tín hiệu — không precompute cho quá khứ); premium không áp dụng cho quá khứ; acute-crash fallback `probUnweighted` giữ nguyên.
- Test mới: `useAsOf(hôm nay) ≡ số liệu live JSON`; snapshot as-of vài ngày lịch sử ≡ giá trị TimeMachine cũ render. Golden test hiện có giữ nguyên.

## 4 khối chi tiết (8 accordion cũ → 4)

1. **Mua bây giờ?** — hàng preset (Toàn cảnh + 3 kỳ hạn, badge ⚠ degraded, tooltip evidence) + điểm đồng thuận k/3 + lý do guidance đầy đủ + chip high-conf 3T + gauge composite (radar context) + `PremiumChart`.
2. **Gom dài hạn?** — `BearDcaCard` (phase + × + override) trước, `BottomGauges` (% gần đáy 2 tầng, CI, calibration) sau — hành động trước, xác suất sau.
3. **Triển vọng 1/3/6 tháng** — `BearDownsideCard` nguyên trạng (đã qua thiết kế anti-illusion riêng, không đụng nội dung; card này có slider as-of riêng qua `point.bearAsOf` — khi trang as-of thì đồng bộ theo trang).
4. **Chi tiết & kiểm chứng** — 4 thẻ tiêu chí + bảng backtest + freshness + giá phụ XAU/USDVND + build info.

Mapping cũ→mới: "Chi tiết điểm số"→④ (gauge về ①, giá phụ + freshness về ④); "4 nhóm tiêu chí"→④; "Kiểm chứng lịch sử"→④; "Chênh lệch VN−TG"→①; "Săn đáy"→②; "Vùng tích lũy (DCA)"→②; "Triển vọng"→③; "Máy thời gian"→cơ chế trang (xóa bước cuối).

## Ràng buộc an toàn — checklist regression (KHÔNG được rơi)

1. Acute-crash gate: phase as-of == "acute" → mọi prob săn đáy hiện `probUnweighted` + cảnh báo.
2. Verdict-note bán / sell-timing note ("đừng bán ngay — bán muộn trong kỳ hạn hoặc lúc bứt ≥2σ") theo as-of zone, không giấu.
3. "Chưa đủ dữ liệu kiểm chứng" cho VN-premium khi thiếu dữ liệu VN (live lẫn as-of; as-of luôn `premiumPct: null`).
4. Đồng thuận = display aggregation — evidence hiển thị per-preset, không claim "nhiều preset đồng ý = chính xác hơn".
5. Headwind (composite ≤ −40) = OBSERVE, tone trung tính — không "VÙNG BÁN"/"BỚT MUA".
6. Cron fail → giữ data cũ + banner stale.
7. Chip high-conf 3T (fusion) hiển thị cả live lẫn as-of — không rơi khi gộp IA.

## Thi công — strangler, 2 phase, KHÔNG bước nào phá app

**Phase 1 — khung.** Mỗi bước 1 commit độc lập, `npm test` + `npm run build` pass, app dùng được, revert được:

1. Tách `useAsOf`/`as-of.ts` từ TimeMachine — chưa đổi UI; thêm golden test `useAsOf ≡ TimeMachine cũ ≡ live`.
2. Thêm `PriceChart` cạnh layout cũ — scrub chỉ hiện crosshair/tooltip, chưa lan ra trang.
3. Nối as-of ra chip + khối — TimeMachine cũ vẫn nguyên, chạy song song đối chiếu.
4. Gộp IA 8→4 khối, thêm dải giá + 2 chip theo bố cục mới.
5. Xóa TimeMachine — commit riêng, cuối, **chỉ sau khi chủ dự án dùng thử và xác nhận**. Chưa xác nhận thì giữ cả hai. `brush.ts` giữ nguyên (PriceChart vẫn dùng `applyBrushDrag`).

**Phase 2 — polish (sau khi khung chạy):**

- Token hóa `globals.css`: surface 3 cấp (`--surface-0/1/2`), thang chữ 5 bậc, spacing 4/8px, radius + shadow thống nhất. Giữ dark `#0e0c08` + gold `#e6b84c` + buy/sell.
- Số to (giá, %, ×) dùng `font-variant-numeric: tabular-nums`, cỡ riêng.
- Chart: path smoothing nhẹ, grid mờ, tooltip bo góc, chấm tín hiệu có halo.
- Chip Mua?/Gom?: nền tone theo level (tái dùng biến tone guidance).
- KHÔNG font ngoài (PWA offline), KHÔNG animation ngoài transition ngắn, KHÔNG thư viện mới.

## Cái KHÔNG làm (YAGNI)

- Không tab, không router, không trang riêng.
- Không theme sáng / toggle theme.
- Không pinch/wheel zoom trên PriceChart (range = nút coarse).
- Không legend toggle chấm tín hiệu (chấm luôn hiện).
- Không port zone band overlay (dải màu buy/sell của TimeMachine cũ) — bỏ khỏi scope; cân nhắc lại chỉ khi dùng thử thấy thiếu.
- Không đụng engine, JSON schema, cron, notify, monitor.
- Không thêm dependency.

## Test / kiểm chứng

- `npm test` pass toàn bộ + test mới (`useAsOf` golden, live ≡ JSON).
- `npm run build` (static export) pass từng bước.
- Tay, mobile ≤380px: giá + 2 chip + chart lọt ~1 màn; kéo dọc ngoài chart cuộn trang bình thường; chạm chart chọn ngày; range switch; sticky `← Hôm nay` + returns; chạm chip cuộn đúng khối; desktop ≥760px.
- Regression: 7 ràng buộc an toàn ở trên + dữ liệu cũ/thiếu (stale, thiếu sourceTimes, preset degraded, custom weights) render đúng.

## Rủi ro còn lại & đối sách

| Rủi ro | Đối sách |
| --- | --- |
| Diff lớn | Strangler 5 bước, mỗi bước revert được; TimeMachine chỉ xóa sau xác nhận thật |
| SJC/XAU chung chart khó đọc | 2 trục tuyệt đối, không normalize; chú thích rõ nguồn/đơn vị từng trục |
| Chart chiếm vùng `touch-action:none` — chạm vào không cuộn trang | Giới hạn cao chart ≤ ~40% viewport (TimeMachine hiện tại cùng hành vi, đã dùng quen) |
| Mất tính năng cũ khi gộp IA | Mapping cũ→mới tường minh (bảng trên); checklist an toàn 7 điểm trong review từng bước |
