# Vùng bán — bằng chứng đầy đủ (2026-07-10)

Phiên nghiên cứu sâu + rộng về mọi cách tìm "Vùng bán" cho người giữ vàng vật chất.
Thiết kế: `docs/superpowers/specs/2026-07-10-sell-zone-optimize-design.md`. 4 họ tín hiệu,
9 lần chạy study, cùng kỷ luật 2-phase (train <2019 / test ≥2019) + placebo + CI của dự án.

## Tóm tắt phán quyết

| Họ | Script | Phán quyết |
| --- | --- | --- |
| A. Grid tuyển sell-preset (6D KT/TK/MOM/DXY/FED/YLD × ngưỡng −30..−60) | `sell-preset-study.ts`, `sell-preset-deep-study.ts` | **NO-GO** — "nhận diện chu kỳ Fed thắt", chỉ 2 cụm độc lập/era |
| B. Top Hunter (đối xứng Bottom Hunter, nhãn gần-đỉnh) | `top-hunter-study.ts`, `top-hunter-deep-study.ts` | **NO-GO** — thua placebo-khối ở mức cụm, cả 2 tầng |
| C. Sell-timing trong cửa sổ kỳ hạn (rangePos 21 phiên tới) | `sell-timing-study.ts`, `-study2.ts`, `-study3.ts` | **GO MỘT PHẦN** — "đừng bán ngay" robust; "bứt 2σ thắng chờ-cuối" không claim |
| D. Premium-exit v2 (chênh SJC ≥ percentile, era split + placebo + CI) | `premium-exit-v2-study.ts` | **giữ SƠ BỘ** — gradient lặp lại nhưng era B chỉ ≈1-2 cửa sổ độc lập |
| E. GSR — tỉ lệ Vàng/Bạc (bạc nóng = đỉnh vàng?) | `gsr-sell-study.ts` | **NO-GO** — train ngược chiều hệ thống, 0/21 |
| F. FOMC calendar (bán trước/sau công bố Fed) | `fomc-sell-study.ts` | **NO-GO** — null có lực tốt (136 sự kiện độc lập), đóng hẳn |
| G. Trailing-exit không deadline (H 63/126/252) | `trail-exit-study.ts` | **NO-GO** — chờ-cuối thắng mọi luật thoát ở kỳ hạn dài, 0/18 |

## A. Grid sell-preset — NO-GO

Vòng 1 (`sell-preset-study.ts`) trông ngoạn mục: nhiều cấu hình FED-nặng (FED 0.4–0.5 +
TK) qua cổng 2-phase + placebo ngày-rời với min-excess +36..+57pt ở cả 3 kỳ hạn
(vd H63: train 100% n=29, test 96,3% n=54, med −6,7%).

Vòng 2 mức cụm (`sell-preset-deep-study.ts`, gap >21 phiên = cụm mới) lật kèo:

- Mọi cấu hình thắng = đúng **2 cụm/era**: 2018 (chu kỳ Fed thắt) ở train, 2022-03 →
  2023 (chu kỳ thắt sau COVID) ở test. Toàn bộ "n=54 ngày" là các cửa sổ chồng lấn
  trong 1-2 đợt.
- Fav-down ngày-mức **không vượt placebo liền-khối cùng cấu trúc run ở train**
  (83% < p95 97%; 87% < 100%; 100% = 100%…), chỉ vượt ở test nhờ cụm 2022 rất dài.
- Cơ chế là thật (Fed thắt mạnh + giá cao lịch sử → vàng giảm 2018, 2022) nhưng
  n độc lập ≈ 2 chu kỳ trong 17 năm ⇒ **không thể claim xác suất %**. Đúng bài học
  regime-unknowable của policy sell-zone 2026-07-04.

Không re-open nếu không có thêm ≥2 chu kỳ thắt mới trong dữ liệu.

## B. Top Hunter — NO-GO

Đối xứng Bottom Hunter: nhãn gần-đỉnh = giá không vượt +ε% trong H phiên tới; 6 feature
(sát đỉnh 252p, run-up 63p, RSI quá mua, z-score 63p, vĩ-mô-nghịch, mom 21p), lưới 126
hồ sơ trọng số × 3 bộ bin (`top-hunter-study.ts`).

Vòng 1 qua cổng cả 2 tầng (cycle H126 ε3%: lift +16,8/+21,1pt; swing H21 ε1,5%:
+17,7/+17,4pt) — nhưng trọng số thắng đều **macro:0.75** (nghịch dấu vĩ mô = Fed
thắt/DXY mạnh) → nghi cùng tín hiệu gốc với họ A.

Vòng 2 mức cụm (`top-hunter-deep-study.ts`) xác nhận: ngày gần-đỉnh **không vượt
placebo-khối p95 ở bất kỳ era nào** (cycle: 43%<57 train, 32%<35 test; swing: 53%<57,
44%<45); cụm đúng 2/9, 1/7, 5/11, 1/6 — đều ≤ p95 placebo. Cổng vòng 1 = pseudo-replication
thuần (cụm 2018/2022 dài). Đóng — không re-open nếu không có feature family mới.

## C. Sell-timing trong cửa sổ — GO MỘT PHẦN (phát hiện chính của phiên)

Câu hỏi: đứng ngày bất kỳ, NGƯỜI BÁN có kỳ hạn ~1 tháng (H=21 phiên) nên bán ngay hay
canh? Metric: vị trí giá bán trong range cửa sổ 21-phiên-TỚI (rangePos 0=đáy, 1=đỉnh),
neo mỗi 21 phiên, paired block-bootstrap CI, placebo = bán ngày ngẫu nhiên trong cửa sổ.

**Phát hiện robust (CI tách 0 ở 11/12 ô offset×H, cả train lẫn test):**

| Chiến lược | train | test |
| --- | --- | --- |
| Bán ngay (ngày 0) | 0.43–0.48 | 0.36–0.41 |
| Bán ngày ngẫu nhiên (placebo) | ~0.49 | ~0.51 |
| Bán cuối cửa sổ (chờ tối đa) | 0.50–0.55 | 0.55–0.60 |
| Luật z-score(10, k=2): bứt ≥2σ thì bán, không thì bán cuối | 0.54–0.57 | 0.54–0.60 |

- Vàng trend tăng ⇒ **bán ngay = bán gần đáy range tháng tới** (ảnh gương của phát hiện
  buy-side "buy-now đã ở 0.41 — mua thì mua ngay"). Người bán có headroom thật để chờ.
- Luật z(10,2) là luật DUY NHẤT/90 qua cổng đầy đủ vòng 2 (thắng bán-ngay + placebo +
  bán-cuối trên mean, CI ΔNow tách 0 cả 2 era); họ z-score chiếm 6/10 top (plateau).
- **Caveat trung thực:** lợi thế của z(10,2) so với "cứ chờ đến cuối kỳ" (ΔEnd
  +0.009..+0.037) có CI chứa 0, đổi dấu ở offset+14 và ở H=42, lân cận tham số âm ⇒
  KHÔNG claim "canh bứt phá tốt hơn chờ". Giá trị thực dụng của luật: chốt sớm được
  giá tương đương chờ-cuối mà không phải ôm đến hạn chót.
- H=42 (kỳ hạn 2 tháng): "đừng bán ngay" vẫn đúng (ΔNow test +0.14..+0.19, CI tách 0);
  bán-cuối vẫn nhỉnh hơn luật ⇒ với kỳ hạn dài hơn, chờ càng chiếm ưu thế.

**Câu guidance được phép hiển thị** (đúng phạm vi bằng chứng): "Nếu định bán trong
~1 tháng tới: đừng bán ngay hôm nay — trung bình 15 năm, giá ngày bán-ngay nằm ở
~0.4 vị trí của khoảng giá tháng kế tiếp. Bán gần cuối kỳ hạn của bạn, hoặc bán sớm
khi có cú bứt mạnh (≥2σ trên trung bình 10 phiên) — hai cách cho kết quả tương đương
(~0.55–0.6)." KHÔNG nói "canh đỉnh chính xác", KHÔNG %.

## D. Premium-exit v2 — giữ SƠ BỘ

Nâng cấp `premium-exit-study.ts` (487→493 ngày SJC, 2025-02 → 2026-07): chia đôi era +
placebo cùng-n + CI block-bootstrap (`premium-exit-v2-study.ts`).

- Gradient v1 lặp lại: chênh ≥p80 → lợi suất SJC sau đó kém hơn baseline ở CẢ 2 nửa,
  vượt placebo-p95 ngày-rời ở era A mọi H, era B từ H42 (vd H63 win180 p80: era A
  fav-down 20% vs baseline 7%; era B 73% vs 49%, med −7,3%).
- Nhưng CI trung thực (block ~overlap, cap n/3) cho thấy era B chỉ có **≈1-2 cửa sổ
  độc lập** ⇒ 0/12 cấu hình qua đủ cổng CI. Cùng loại NO-GO-vì-mẫu-mỏng như
  premium-brake — không phải NO-GO tín hiệu.
- Hành động: banner "VÙNG BÁN VN theo chênh lệch ≥p80" trên biểu đồ premium GIỮ NGUYÊN
  (đúng trạng thái sơ bộ đã công bố), **re-run khi có ≥36 tháng dữ liệu** (đủ ~4-6 cửa
  sổ độc lập H63/era).

## E. GSR (Vàng/Bạc) — NO-GO

Giả thuyết: bạc chạy nóng hơn vàng cuối sóng (GSR percentile thấp / GSR rơi nhanh 63p)
⇒ gần đỉnh vàng. 7 tín hiệu × 3 kỳ hạn (`gsr-sell-study.ts`), cổng học từ họ A: 2-phase +
placebo liền-khối + ≥3 cụm/era. **0/21 qua cổng.** Chết vì train NGƯỢC CHIỀU hệ thống:
2010–2018, bạc nóng là tín hiệu vàng TĂNG TIẾP (momentum kim loại quý — fav-down chỉ
7–34% vs baseline 40–46%); vài ô test 2019+ trông đẹp (chg63≤−20% H126: 91% down) nhưng
train phủ định = phụ thuộc regime, đúng loại lỗi mà cổng 2-phase sinh ra để chặn. Đóng.

## F. FOMC calendar — NO-GO (null có lực thống kê tốt nhất phiên)

Người bán linh hoạt vài ngày quanh kỳ họp Fed: bán trước hay sau công bố?
136 kỳ họp scheduled 2009–2026 (77 train / 59 test — sự kiện độc lập thật, không
pseudo-replication; nguồn: CSV returnandrisk 2009–2018 + federalreserve.gov 2019–2026,
loại unscheduled/notation vote). `fomc-sell-study.ts`:

- ret(d−1 → d+k), k ∈ {1,2,3,5,10}: mean ±0,26%, **CI chứa 0 ở mọi k, cả 2 era** —
  không có hướng "trước/sau" nào.
- Drift trước họp (d−5→d−1): ~0% cả 2 era.
- |move| ngày công bố (đóng-đóng): med 0,42% — còn THẤP hơn ngày thường 0,57%.
  Vàng không có sự kiện-vol FOMC ở khung daily close.
- Điều kiện thắt/nới: không mảng nào CI tách 0.

Null sạch, đủ lực ⇒ đóng hẳn — với người bán, ngày FOMC không phải yếu tố timing
(khác cổ phiếu/trái phiếu; phù hợp kết quả COT/factor: lịch vĩ mô Mỹ không cho tín
hiệu daily trên vàng).

## G. Trailing-exit không deadline — NO-GO

Kỳ hạn bán dài (3/6/12 tháng): trailing-stop ratchet (bán khi rơi y% từ đỉnh nắm giữ,
y ∈ {3,5,8,10}) + zscore spike, so bán-ngay/bán-cuối/placebo (`trail-exit-study.ts`).
**0/18.** ΔEnd âm gần khắp test (đến −0,45): kỳ hạn càng dài, uptrend càng làm
"cứ chờ đến cuối" thắng mọi luật thoát; trailing-stop nhả sớm đúng lúc sóng còn chạy.
Nhất quán với C ở H=42: lợi thế canh-điểm chỉ tồn tại (yếu) ở kỳ hạn ~1 tháng và
biến mất khi kỳ hạn dài ra. Đóng — người bán kỳ hạn dài: bán sát cuối kỳ hạn.

## Còn lại chưa đo (cập nhật sau phiên E/F/G)

- **COT phía bán** (spec longs cực đại = đỉnh?): cần `COT_DIR` zips tải thủ công từ cftc.gov.
- **GLD holdings flows**: data SPDR tải được nhưng lích kích; họ factor chưa từng test.
- Bị chặn dữ liệu: ring-vs-bar (chờ ≥6 tháng ring quotes), premium seasonality VN
  (chờ ≥3 mùa Tết), intraday (không có nguồn free).

## Nguồn cho số theo năm in trong UI (thêm 2026-09-04)

Các số "vùng bán theo regime" mà `src/lib/guidance.ts` và `src/components/Dashboard.tsx`
in cho user (median 1 tháng, % giá cao hơn sau 6 tháng, danh sách năm bull vs yếu) trước
đây KHÔNG có script nào tái lập — chúng lệch âm thầm khi engine đổi (thiếu 2009/2019/2023/2026).
Nay tái lập bằng:

```bash
npx tsx scripts/sellzone-regime-study.ts   # thống kê MÔ TẢ, không CI/placebo/claim hiệu quả
```

Số hiện hành (timeline 2009-09-03..2026-09-04, 396 ngày composite ≤ −40 = 9,3% lịch sử):
1 tháng median gộp −0,3% (44,9% số lần giá cao hơn), theo năm −2,7%..+2,1%; 6 tháng đảo dấu
theo regime — bull 2009/2010/2019/2024/2025 cao hơn 98,5–100%, yếu 2011/2016/2018/2022/2023/2026
thấp hơn 67–100%. **Chạy lại script này sau MỌI lần sửa engine** rồi sync text (bài học bug #10).
Phần `~0,4` / `~0,55–0,6` ở cùng đoạn UI có nguồn riêng (họ C bên trên) và không phụ thuộc
criterion `stats` ⇒ không đổi theo engine.

## Điều KHÔNG đổi

- Policy sell-zone 2026-07-04 (composite ≤ −40 = gió ngược observe-only) giữ nguyên —
  họ A/B chính là nỗ lực "đập đi làm lại" trục verdict bán và đều chết ở mức cụm.
- `zoneOf`, backtest buckets, engine, Bottom Hunter, Bear DCA, Bear Downside: không đổi.
- UI chỉ thêm guidance text từ phát hiện C (Dashboard sell-note + note trung lập +
  Time Machine gear note).
