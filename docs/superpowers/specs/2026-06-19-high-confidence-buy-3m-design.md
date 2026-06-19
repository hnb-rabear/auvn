# Thiết kế: Tầng "MUA độ tin cao" cho kỳ 3 tháng (fusion composite ∧ đáy)

Ngày: 2026-06-19. Trạng thái: spec chờ duyệt.
Nguồn bằng chứng: `scripts/fusion-study.ts` (offline trên `public/data/timeline.json`, 4.275 ngày 2009–2026).

## 1. Mục tiêu

Nâng **độ chính xác (precision) của tín hiệu mua** bằng cách tận dụng thông tin từ lớp Bottom Hunter
mà composite hiện không nắm. Cụ thể: khi tín hiệu mua composite (preset 3 tháng) **VÀ** vùng đáy
(`cycleBin==3`: RSI quá bán + vĩ mô đảo chiều) **cùng bật**, lịch sử cho thấy đây là tập điểm mua
**chính xác nhất** ở kỳ 3 tháng — vượt cả việc siết composite xuống cùng cỡ mẫu. Ta hiển thị tập con
này như một tầng **"MUA — ĐỘ TIN CAO"**, không thay đổi điểm composite.

**Đối chiếu thực tế code (quan trọng):** app ĐÃ có một dạng fusion — `deriveGuidance`
(`src/lib/guidance.ts`) có cấp `level: "strong"` = `isBuy && bottomHigh` (bottomHigh =
xác suất đáy `prob ≥ 60`, mọi kỳ hạn), nhãn "Tín hiệu mạnh nhất". Tầng này KHÔNG gắn bằng
chứng và KHÔNG giới hạn kỳ hạn. Spec này KHÔNG tạo khái niệm/nhãn mới: nó **bồi bằng chứng
đã kiểm chứng vào đúng cấp "strong" sẵn có, chỉ khi đang ở 3m và đúng điều kiện đã backtest**
(`cycleBin==3`). Các kỳ khác giữ "strong" như cũ (không evidence). Tránh đẻ thêm tầng trùng lặp.

Không nằm trong phạm vi (đã cân nhắc và LOẠI bằng study — xem §6):
- Tầng "Gom rải sớm" (hợp nhất OR / đáy-ngoài-composite) cho 1m/6m — trùng lặp Bottom Hunter gauge, precision thấp hơn.
- Gấp feature oversold vào composite (hướng C) — sống sót grid nhưng mùi overfit (mẫu nhỏ).
- Tầng độ-tin-cao cho 1m và 6m — không robust (xem bằng chứng §6).
- Thay đổi điểm composite hoặc engine Bottom Hunter. Thu thập dữ liệu mới (không cần — dùng `cycleBin` đã có).

## 2. Bằng chứng (vì sao chỉ 3m)

Khung kiểm chứng đồng bộ presets/bottom: train <2019 / test ≥2019, "đúng" = lợi suất H phiên sau > 0,
CI 95% block-bootstrap (block=H/3), lưới thưa STEP=3 cho mẫu hiệu dụng.

**B = composite-buy ∧ `cycleBin==3`** so với composite-gốc:

| Kỳ | B train | comp train | B test | comp test | n B (tr/te) | Phán quyết |
| --- | --- | --- | --- | --- | --- | --- |
| 1m | 84,5% | 79,9% | 70,4% | 76,0% | 84/108 | **LOẠI** (test ngược) |
| **3m** | **92,8%** | 81,6% | **100%** | 95,3% | 69/89 | **GIỮ** |
| 6m | 90,5% | 88,0% | 100% | 99,5% | 74/86 | **LOẠI** (đã chạm trần) |

Ba kiểm chứng robust riêng cho 3m (đều PASS):
1. **Placebo đồng-n** (so với composite-top-n cùng cỡ mẫu — tách "thêm thông tin" khỏi "kén hơn"):
   train **+10,1pt** (B 92,8% vs composite-top-n 82,6%), test +1,1pt. → lớp đáy mang **thông tin trực giao**, không chỉ là siết ngưỡng.
2. **Chia nhiều giai đoạn** (2014–2018 là sa mạc tín hiệu n=2, bỏ qua): 2009–2013 **+6,1pt**, 2019–2026 **+4,7pt** — dương ở cả hai giai đoạn có mẫu thật.
3. **Lưới thưa STEP=3** (mẫu decorrelated): B n=54 **96,3%** CI[88,9–100] vs composite 88,7%.

So sánh: 1m placebo test ÂM + thưa thua composite → loại; 6m placebo test +0,0 + 2009–2013 ÂM → loại.

**Cảnh báo trung thực (ghi vào UI + docs):** con số test **100%** (CI[100–100]) là **ảo do tín hiệu bắn chùm**
trong một chế độ nới lỏng tiền tệ 2019–2026 — KHÔNG đọc là "chắc thắng". Bằng chứng ràng buộc thật là
**lợi thế train +10,1pt** (giai đoạn khó, chứa bear 2013–15) và **lưới thưa 96,3% (n=54)**. B là tầng
**ít tín hiệu hơn nhưng tin cậy hơn** (3m: ~136→69 tín hiệu train) — đúng mục tiêu "ít mua sai".

## 3. Kiến trúc

Nguyên tắc bất di: **không sửa composite, không sửa engine Bottom Hunter.** Tầng độ-tin-cao là một
**cờ DẪN XUẤT** thuần hàm từ hai đại lượng đã có — tôn trọng ranh giới "Bottom Hunter does NOT touch
the buy/sell composite" trong CLAUDE.md.

Hàm thuần mới trong `src/lib` (đề xuất `src/lib/fusion.ts`):

```
highConfidenceBuy3m(presetId, isBuyZone, bottomCycleBin, cycleVerified): boolean
  = presetId === "3m" && isBuyZone && bottomCycleBin === HIGH_CONFIDENCE_BIN (3) && cycleVerified
```

Kèm hằng evidence `HIGH_CONF_3M_EVIDENCE` (cấu trúc tương tự `Preset.evidence`) chứa số liệu §2 để UI
và docs cùng đọc một nguồn — số trong code phải khớp docs (cùng quy ước presets.md ↔ PRESETS).

`HIGH_CONFIDENCE_BIN = 3` ứng với `BOTTOM_CONFIG` binEdges `[-40,0,40]` (bottomScore ≥ 40). Nếu binEdges
đổi, hằng này phải đổi theo — khóa bằng test.

### Vì sao cờ dẫn xuất, không phải điểm số mới
Tập B = giao hai tín hiệu đã được kiểm chứng độc lập. Gộp thành điểm số (hướng A/C) đã được đo và LOẠI.
Cờ dẫn xuất giữ hai lớp nguyên vẹn, có thể bật/tắt hiển thị mà không rủi ro hồi quy điểm.

## 4. Luồng dữ liệu & điểm tích hợp live

Mọi đầu vào đã có sẵn ở `Dashboard` (`src/components/Dashboard.tsx`):
- `isBuyZone` (đã tính: `zone === "buy" || "strong-buy"` dưới preset).
- `preset?.id` (từ `settings.presetId`).
- `bottom.cycle.bin`, và `cycleVerified = !BOTTOM_CONFIG.cycle.provisional && bottom.cycle.n >= 10` (đã có).

→ Tính `const highConf = highConfidenceBuy3m(preset?.id ?? null, isBuyZone, bottom.cycle.bin, cycleVerified)`.

Không cần dữ liệu mới, không đổi cron fetch. `cycleBin` lịch sử đã nằm trong `timeline.json`; `bottom.cycle.bin`
hiện tại đã nằm trong `bottom.json`.

## 5. Thay đổi UI

KHÔNG đổi nhãn/tone của cấp `strong` (giữ "Tín hiệu mạnh nhất — định giá thuận VÀ XAU đang
dò đáy"). Chỉ **bồi một khối evidence** vào hero verdict khi `highConf === true` (tức đang ở 3m
+ vùng MUA + `cycleBin==3` + verified — tập con của các trường hợp `level==="strong"`):

- Thêm tag nhỏ cạnh nhãn strong: **"(đã kiểm chứng — 3 tháng)"**.
- Khối evidence (đọc từ `HIGH_CONF_3M_EVIDENCE`): *"Lịch sử ở kỳ 3 tháng, khi composite báo MUA
  VÀ giá ở vùng đáy: đúng 92,8% (2009–2018, n=69) / 100% (2019–2026, n=89); lưới thưa 96,3%
  (n=54, CI 88,9–100). Lớp đáy thêm +10,1pt so với chỉ siết composite cùng cỡ mẫu."*
- **Câu cảnh báo bắn chùm** (bắt buộc, §2): *"Con số 100% là ước lượng lạc quan do tín hiệu bắn
  chùm trong một chu kỳ nới lỏng — bằng chứng vững là lợi thế giai đoạn 2009–2018."*
- Khi `degraded` (§7): ẩn khối evidence (vẫn giữ tag? không — ẩn cả tag), hiển thị strong như cũ.

Khi KHÔNG phải 3m, hoặc `cycleBin<3`, hoặc chưa verified: hero hiển thị **nguyên như hiện tại**
(cấp strong/buy/... không kèm evidence). Không có tag/evidence cho 1m/6m. Gauge Bottom Hunter giữ
nguyên vai trò độc lập — không trùng lặp vì đây chỉ là phần evidence bồi vào verdict sẵn có.

## 6. Các biến thể đã LOẠI (ghi để không tái thử mù)

Đo bằng `scripts/fusion-study.ts` trên cùng dữ liệu:
- **A — Hợp nhất (OR)**: recall↑ (1m TP 232 vs 168; 3m 255 vs 183; 6m 262 vs 181) nhưng precision loãng → NO-GO ở 3m/6m (composite đã gần trần). Là núm recall, không phải precision. Chức năng "gom rải" đã do Bottom Hunter gauge đảm nhiệm → thêm A là trùng lặp.
- **B ở 1m/6m**: không robust (1m placebo-test âm & thưa thua composite; 6m 2009–2013 âm, test không thêm thông tin).
- **C — gấp oversold vào composite (grid 5D)**: oversold sống sót (trọng số >0) và min-excess nhỉnh, NHƯNG cấu hình thắng có n sát sàn 25 còn cấu hình n lớn đều để oversold=0 → mùi overfit, đúng dấu đã loại real-yield+GSR. NO-GO.

## 7. Giám sát thoái hóa

Theo đúng mẫu `monitor-presets.ts` → `preset-health.json`. Mở rộng (hoặc thêm `monitor-fusion.ts`):
mỗi cron tính lại trên timeline mới nhất, cho kỳ 3m:
- precision B (composite-buy ∧ cycleBin==3) vs composite-gốc ở train & test;
- **degraded** khi B không còn vượt composite ở CẢ HAI giai đoạn (hoặc placebo đồng-n train ≤ 0) — UI ẩn/đánh dấu badge nếu degraded;
- CI 95% block-bootstrap hiển thị cạnh evidence.

## 8. Tài liệu

`docs/fusion.md` mới (cùng văn phong bottom.md/presets.md): câu hỏi, phương pháp, bảng bằng chứng §2,
ba kiểm chứng robust, các biến thể đã loại §6, cảnh báo bắn chùm, lệnh tái lập (`npx tsx scripts/fusion-study.ts`).
`HIGH_CONF_3M_EVIDENCE` trong code phải khớp bảng trong doc.

## 9. Kiểm thử

- **Đơn vị (thuần):** `highConfidenceBuy3m` — bảng chân trị: chỉ true khi 3m + buy + bin==3 + verified; false khi preset khác / không buy / bin<3 / chưa verified.
- **Khóa hằng:** `HIGH_CONFIDENCE_BIN === 3` khớp `BOTTOM_CONFIG.cycle.binEdges.length` (3 ranh giới ⇒ bin cao = 3).
- **Hồi quy bằng chứng:** test nhỏ kiểm `HIGH_CONF_3M_EVIDENCE` khớp đầu ra `fusion-study.ts` cho 3m (hoặc snapshot số liệu), giống cách preset evidence khớp `presets-study`.
- **Không hồi quy composite:** test xác nhận thêm cờ không đổi `composite`/`zone` ở mọi nhánh.

## 10. Tiêu chí hoàn thành

- `scripts/fusion-study.ts` chạy được offline, in phán quyết B per-horizon + ba kiểm chứng (đã có).
- `highConfidenceBuy3m` + `HIGH_CONF_3M_EVIDENCE` trong `src/lib`, có test.
- Dashboard hiển thị badge "ĐỘ TIN CAO" đúng điều kiện, kèm evidence + cảnh báo; không badge ở 1m/6m.
- `monitor-fusion` (hoặc mở rộng monitor-presets) cập nhật health mỗi cron; UI tôn trọng trạng thái degraded.
- `docs/fusion.md` khớp số liệu code.
- `npm test` + `npm run build` xanh.
