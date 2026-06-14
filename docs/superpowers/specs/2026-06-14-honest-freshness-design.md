# Hiển thị thời gian thực & độ tươi số liệu (Honest Freshness)

Ngày: 2026-06-14

## Vấn đề

App là PWA tĩnh, đọc kết quả cron 2×/ngày; trình duyệt không thể fetch giá trực tiếp (CORS — lý do của Approach A). UI hiện chỉ hiển thị một dòng `Cập nhật: <generatedAt> (giờ VN)`. Dòng này **che giấu sự lệch nhau giữa các nguồn**: ví dụ `generatedAt`=2026-06-14 02:47 nhưng giá vàng VN `dataDate`=2026-06-12 (cũ 2 ngày). Giá thế giới tươi, giá VN cũ — một timestamp duy nhất không nói được điều đó.

"Real-time" ở kiến trúc này KHÔNG có nghĩa là ticker giá live (bất khả thi nếu không phá kiến trúc / trả phí). Nó có nghĩa là: **đồng hồ hiện tại + hiển thị trung thực mỗi số liệu được chụp lúc nào và đã cũ bao lâu.**

## Mục tiêu

1. Cron chạy dày hơn (hàng giờ) để số liệu thế giới + premium tươi hơn.
2. Hiển thị trung thực: đồng hồ "bây giờ" chạy live + một dòng tóm tắt độ tươi theo nguồn.

Không nằm trong phạm vi: fetch live trên trình duyệt, ticker giá, badge tuổi cho từng số (cân nhắc sau).

## Thiết kế

### 1. Tần suất cron

`.github/workflows/update-and-deploy.yml`:
- Đổi `cron: "23 1,13 * * *"` → `cron: "23 * * * *"` (mỗi giờ, phút :23).
- Public repo ⇒ GitHub Actions free không giới hạn phút. ~24 commit/ngày vào `data/` — chấp nhận được, đó vốn là chiến lược tích lũy.
- Lưu ý: BTMC (giá VN) chỉ cập nhật vài lần/ngày bất kể tần suất; XAU/USD biến động liên tục. Tần suất cao chủ yếu giúp giá thế giới + tính premium.
- Ràng buộc (đã có sẵn, chỉ cần xác nhận giữ nguyên): cron lỗi nguồn tạm thời KHÔNG được làm trắng dữ liệu — giữ data cũ + cảnh báo "cũ N ngày".

### 2. Timestamp theo nguồn (data model + fetch)

**`src/lib/types.ts`** — thêm vào `interface Analysis` (map song song, giữ `Prices` thuần số):

```ts
/** ISO thời điểm chụp theo nguồn; null = nguồn lỗi/không có lần chạy này */
sourceTimes?: {
  world?: string | null;   // XAU/USD: timestamp bar cuối (giờ báo giá Yahoo intraday)
  dxy?: string | null;
  yield10y?: string | null;
  vnGold?: string | null;  // BTMC: giờ fetch của ta (không có giờ server); ghép với dataDate
  usdVnd?: string | null;  // Vietcombank: giờ fetch của ta
  fed?: string | null;     // date bar FRED cuối
};
```

**`scripts/fetch.ts`** — bắt thời điểm:
- Yahoo (`GC=F`, `DX-Y.NYB`, `^TNX`): gọi `interval=1d` ⇒ **bar ngày**, không phải tick intraday. `chart.result[0].timestamp[]` có sẵn nhưng hiện bị **bỏ đi**: `fetchYahoo` (fetch.ts:38-52) slice epoch xuống chỉ còn `date` (`.slice(0,10)` tại fetch.ts:48), và `DailyBar` chỉ là `{date, close}` (fetch.ts:15-18).
  - Cần đổi `fetchYahoo` để **trả thêm** epoch bar cuối (vd field `lastTs: number` cạnh `bars`), KHÔNG đổi `DailyBar` (giữ nguyên cho mọi consumer khác).
  - Epoch bar cuối ≈ **giờ cập nhật cuối phiên** (khi thị trường mở, Yahoo cập nhật phần tử cuối gần với giờ giao dịch cuối; khi đóng cửa/cuối tuần = giá đóng phiên trước). KHÔNG khẳng định "intraday quote time" — chỉ là "giờ bar cuối, gần đúng cập nhật cuối phiên". Đây là điểm trung thực: tuổi hiển thị phản ánh đúng bản chất bar ngày.
- BTMC, Vietcombank: không có giờ server đáng tin ⇒ ghi `new Date().toISOString()` lúc fetch (giờ chụp của ta). (`new Date()` hợp lệ trong script Node — ràng buộc cấm `Date.now()` chỉ áp cho workflow script, không phải `scripts/`.)
- FRED (`fetchFedFunds` trả `{date,value}[]`, `fetchYield10y` trả `bars`): lấy `date` bar cuối.

**`scripts/run.ts`** (~dòng 218): điền `sourceTimes` từ kết quả fetch; nguồn lỗi → `null`.

Phân biệt quan trọng cho tính trung thực: giá thế giới mang **giờ thị trường** (có thể cũ vài phút dù cron vừa chạy); giá VN mang **giờ fetch của ta** + `dataDate` mà nó áp dụng.

### 3. UI — đồng hồ live + dòng tóm tắt độ tươi

**`src/components/Dashboard.tsx`**, thay dòng đơn tại ~:259.

**Đồng hồ live** (header): giờ hiện tại chạy từng giây, giờ VN.
- `useEffect` + `setInterval(1000)`, format `toLocaleString("vi-VN", { … timeZone: "Asia/Ho_Chi_Minh" })`.
- Cleanup interval khi unmount.
- Ví dụ: `Bây giờ: 14/06/2026 09:47:12 (giờ VN)`

**Dòng tóm tắt độ tươi** — tính tuổi tương đối từ `sourceTimes` + `dataDate`.
- Helper `timeAgo(iso)` → "5 phút trước" / "2 giờ trước" / "3 ngày trước" (vi-VN).
- Hiển thị rõ nguồn thế giới tươi nhất + giá VN, vì chúng lệch nhau:
  - Ví dụ: `Số liệu thế giới: 8 phút trước · Giá SJC: ngày 12/06 (2 ngày trước)`
- Quy tắc:
  - Phần thế giới dùng `sourceTimes.world` (giờ thị trường) → tuổi thực, chạy live cùng đồng hồ (re-render mỗi giây cập nhật cả tuổi).
  - Phần giá VN dùng `dataDate` cho ngày "áp dụng" + `sourceTimes.vnGold` cho giờ chụp; nếu `dataDate` < hôm nay, tuổi làm lộ rõ sự cũ (thay cho khoảng lệch bị giấu trước đây).
  - Nguồn bất kỳ `null` → phần đó hiện "không có dữ liệu", không crash.
  - Giữ banner `analysis.stale` hiện có (cảnh báo riêng, to hơn).

**Tương thích ngược**: `sourceTimes` là optional → nếu thiếu (file data cũ giữa lúc deploy), fallback về dòng `generatedAt` hiện tại. Không crash.

## Kiểm thử

- `timeAgo()`: unit test các mốc (phút/giờ/ngày, số ít/nhiều, vừa xong).
- Render Dashboard với `sourceTimes` đầy đủ → đúng dòng tóm tắt.
- Render với `sourceTimes` undefined → fallback `generatedAt`, không crash.
- Render với một nguồn `null` → "không có dữ liệu" cho phần đó.
- `fetch.ts`: bar cuối Yahoo cho ra ISO đúng từ epoch.

## File chạm

- `.github/workflows/update-and-deploy.yml` — cron hourly
- `src/lib/types.ts` — `sourceTimes` trên `Analysis`
- `scripts/fetch.ts` — bắt timestamp theo nguồn
- `scripts/run.ts` — điền `sourceTimes`
- `src/components/Dashboard.tsx` — đồng hồ live + dòng tóm tắt + `timeAgo`
- test tương ứng
