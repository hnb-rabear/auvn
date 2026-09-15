# BTMC / BTMH Ring Prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thu thập nhẫn trơn 9999 BTMC / BTMH đáng tin cậy và cho phép chọn hãng để hiển thị, không đổi vàng miếng SJC hoặc scoring.

**Architecture:** Collector local hiện có ghi lịch sử nhẫn theo hãng vào `public/data/history/ring-gold.json`, tách khỏi lịch sử legacy `vn-gold.json`. Dashboard đọc file tĩnh và nhớ hãng trong settings hiện có. Mạng lỗi chỉ bỏ lần lấy đó; không xóa bản ghi hợp lệ, không tự đổi hãng.

**Tech Stack:** Next.js static export, TypeScript, Node.js native fetch/fs, bộ kiểm thử hiện có; không thêm dependency.

## Global Constraints

- Đặc tả: `docs/superpowers/specs/2026-09-15-ring-brands-design.md`.
- Hãng mới chỉ `btmc` và `btmh`. Không xóa fetch vàng miếng SJC hoặc parser legacy đang có.
- Không commit/push hay chạy `scripts/sync-vn-gold.ts` trong triển khai nếu chưa được yêu cầu rõ ràng. Script sync tự commit/push; unit test phải giả lập lệnh Git.
- Không chạy collector thật vào `public/data` để thử. Dùng thư mục tạm và response fixtures; live probe chỉ đọc mạng.
- Không sửa lịch sử quá khứ, không gán ring legacy thành BTMC. File mới khởi tạo `[]`, không tạo báo giá giả.
- Không đổi preset, composite, zone, premium, backtest, Bottom Hunter, Bear DCA, Bear Downside hoặc hợp đồng summary v1.4.
- JSON nhẫn chỉ do collector local ghi trong phiên bản này. GitHub Actions tiếp tục phân tích/deploy, không thêm lịch hoặc collector nhẫn chạy cloud đang bị chặn IP.
- Giá lưu VND/lượng; nguồn API BTMC và dữ liệu BTMH dùng VND/chỉ. HTML có thể dùng nghìn VND/chỉ: parser phải biết đơn vị nguồn trước khi chuẩn hóa.
- Đủ hai giá hữu hạn, 50–600 triệu VND/lượng và mua ≤ bán mới nhận. Cập nhật nguyên cặp, không ghép hai thời điểm.
- Giờ tải `fetchedAt` không thay giờ nguồn `publishedAt`. Không chép báo giá cũ vào ngày mới để tạo lịch sử giả.
- UI tiếng Việt; native select có label; lưu localStorage trong try/catch, hydrate sau mount theo pattern hiện có.

---

## Quyết định cấu trúc

Không thêm `rings` vào từng `VnGoldEntry`: một ngày chỉ có nhẫn sẽ tạo dòng SJC null, trong khi `run.ts` dùng dòng cuối làm giá vàng miếng hiệu lực. File riêng tránh phải sửa engine, summary và các study để hiểu dòng nhẫn-only.

**Tạo:**
- `src/lib/ring-gold.ts`: types, validation, merge, lookup theo hãng/ngày, không Node API.
- `src/lib/ring-gold.test.ts`: kiểm tra cặp giá, ngày, merge và lookup.
- `scripts/ring-gold.ts`: hai nguồn chính thức, BTMC HTML fallback, đọc/ghi atomic file mới; không tự chạy khi import.
- `tests/ring-gold-collection.test.ts`: parser và collection/persistence bằng mock fetch/thư mục tạm.
- `public/data/history/ring-gold.json`: `[]` trước lần thu thập thật.

**Sửa:**
- `scripts/backfill-vn.ts`: gọi collector nhẫn riêng, chịu được lỗi nguồn enrichment, giữ nhẫn legacy cùng ngày.
- `scripts/sync-vn-gold.ts`: chỉ stage/kiểm tra thay đổi đúng hai file lịch sử.
- `src/app/page.tsx`: import JSON mới và truyền vào Dashboard.
- `src/components/Dashboard.tsx`: chọn hãng, nhớ settings, live và Time Machine.
- `docs/sync-vn-gold-setup.md`, `docs/sync-vn-gold-setup-android.md`: sửa lời hứa lấp bù nhẫn khi máy tắt; nêu hai file sync.
- `CHANGELOG.md`: ghi thay đổi khi triển khai; không ghi đã xong trước khi kiểm chứng.

Không đổi `src/lib/types.ts`, `analysis.json`, `summary.json` nếu file mới đủ đáp ứng UI. Không tách component hay tạo lớp provider chung cho hai nguồn.

## Task 1: Hợp đồng nhẫn và merge không mất dữ liệu

**Files:** `src/lib/ring-gold.ts`, `src/lib/ring-gold.test.ts`, `public/data/history/ring-gold.json`.

**Interfaces:**
```ts
export type RingBrand = "btmc" | "btmh";
export interface RingQuote {
  buy: number;
  sell: number;
  product: string;
  source: string; // URL cố định từ collector; không nhận URL tùy ý từ response
  publishedAt: string | null; // ISO có timezone; nguồn không cho giờ thì null
  fetchedAt: string; // ISO UTC
}
export interface RingGoldDay {
  date: string; // ngày VN của publishedAt; nếu không rõ dùng ngày quan sát
  quotes: Partial<Record<RingBrand, RingQuote>>;
}
export function ringBrand(value: unknown): RingBrand;
export function validRingQuote(value: unknown): value is RingQuote;
export function mergeRingQuote(
  history: RingGoldDay[], brand: RingBrand, quote: RingQuote
): RingGoldDay[];
export function ringQuoteAt(
  history: RingGoldDay[], brand: RingBrand, date: string, exact: boolean
): RingQuote | null;
```

- [ ] Viết test trước bằng runner hiện có. Fixture báo giá chỉ dùng trong tests:
```ts
const q = {
  buy: 142_500_000, sell: 146_500_000,
  product: "Nhẫn tròn trơn 9999", source: "https://btmc.vn/gia-vang-theo-ngay.html",
  publishedAt: "2026-09-15T08:50:00+07:00", fetchedAt: "2026-09-15T02:00:00Z",
};
expect(ringBrand("sjc")).toBe("btmc");
expect(validRingQuote({ ...q, buy: null })).toBe(false);
expect(validRingQuote({ ...q, buy: q.sell + 1 })).toBe(false);
const rows = mergeRingQuote([], "btmc", q);
expect(ringQuoteAt(rows, "btmh", "2026-09-15", false)).toBeNull();
expect(ringQuoteAt(rows, "btmc", "2026-09-14", false)).toBeNull();
expect(ringQuoteAt(rows, "btmc", "2026-09-16", true)).toBeNull();
expect(ringQuoteAt(rows, "btmc", "2026-09-16", false)).toEqual(q);
```
- [ ] Chạy test, xác nhận fail do module/hàm chưa tồn tại; không coi lỗi runner là test đỏ hợp lệ.
- [ ] Viết helper nhỏ: `ringBrand` nhận `btmh` thì trả `btmh`, còn lại `btmc`; validator kiểm tra số/chuỗi/ngày hợp lệ. `mergeRingQuote` không mutate input, chỉ cập nhật hãng của ngày báo giá, bảo toàn hãng khác và mọi ngày khác. Quote nguồn cũ hơn bản đã lưu thì bỏ; khi cùng publishedAt và cùng cặp giá thì no-op, không tạo Git diff chỉ vì fetchedAt thay đổi. Nếu publishedAt thiếu ở một phía, chỉ so fetchedAt trong cùng ngày và giữ trạng thái không rõ giờ nguồn.
- [ ] `mergeRingQuote` chỉ nhận ngày nguồn bằng ngày VN của `fetchedAt`; nguồn quá khứ hoặc tương lai trả nguyên history và collector ghi cảnh báo. Khi thiếu publishedAt, ngày quan sát lấy từ fetchedAt và giữ publishedAt null. Không cập nhật ngày quá khứ kể cả đã có quote, không ghi quote lấy muộn vào quá khứ Time Machine. UI vẫn tra được báo giá cũ đã lưu từ lần thu thập trước; lần khởi động đầu chỉ gặp quote nguồn cũ thì báo chưa có dữ liệu hợp lệ, không tự tạo lịch sử.
- [ ] Validator bắt timestamp có timezone rõ ràng, đúng lịch (không normalize 31/02 thành tháng sau) và `publishedAt <= fetchedAt`; quote tương lai trong cùng ngày cũng reject. Thêm test hai hãng cùng ngày không ghi đè nhau, quote cũ không hạ phiên mới, qua nửa đêm UTC vẫn đúng ngày VN, quote không có publishedAt không tự điền nó, giờ/ngày nguồn tương lai và thiếu timezone bị từ chối.
- [ ] Chạy lại test; tạo file dữ liệu mới chỉ chứa `[]`.

## Task 2: Collector chính thức, kiểm tra đúng sản phẩm

**Files:** `scripts/ring-gold.ts`, `tests/ring-gold-collection.test.ts`.

**Interfaces:**
```ts
import type { RingBrand, RingGoldDay, RingQuote } from "../src/lib/ring-gold";
export function parseBtmcRingApi(text: string, fetchedAt: string): RingQuote;
export function parseBtmcRingHtml(text: string, fetchedAt: string): RingQuote;
export function parseBtmhRingHtml(text: string, fetchedAt: string): RingQuote;
export async function fetchRingQuotes(): Promise<{
  quotes: Partial<Record<RingBrand, RingQuote>>;
  errors: Partial<Record<RingBrand, string>>;
}>;
export async function collectRingGold(filePath: string): Promise<{
  collected: number; changed: boolean; errors: Partial<Record<RingBrand, string>>;
}>;
```

- [ ] Captures phục vụ test lấy từ nguồn thật, cắt riêng phần bảng giá cần thiết, không đưa toàn bộ trang/scripts vào test. API BTMC mẫu đã đo:
```json
{"DataList":{"Data":[{"@n_632":"NHẪN TRÒN TRƠN (Vàng Rồng Thăng Long)","@h_632":"999.9","@pb_632":"14250000","@ps_632":"14650000","@d_632":"15/09/2026 08:50"}]}}
```
- [ ] Test API kỳ vọng 142.500.000 / 146.500.000 VND/lượng, publishedAt `2026-09-15T08:50:00+07:00`; thay suffix `632` bằng số khác vẫn đúng. Thay purity hoặc tên sản phẩm thành trang sức thì reject. Giá bán thiếu/0/NaN hoặc mua > bán thì reject nguyên cặp.
- [ ] BTMC lấy API HTTPS đã có trong `fetch.ts`; chỉ dùng đúng nhẫn Vàng Rồng Thăng Long 999.9, không regex rộng mọi "nhẫn". Khi API lỗi hoặc payload không hợp lệ, thử HTML `https://btmc.vn/gia-vang-theo-ngay.html`. Row đã xác minh: `NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU`, purity 999.9, ô `mua_1193` / `ban_1193`; lấy ID từ row đúng sản phẩm, không lấy row đầu tiên. Giá HTML 14250/14650 có đơn vị nghìn VND/chỉ nên nhân 10000. `datepicker11` là ngày chọn, KHÔNG phải giờ cập nhật; parser HTML trả publishedAt null khi không có timestamp báo giá. Đã tìm được endpoint công khai `/ProductHome/getGoldDate1?m=1193&d=15%2F09%2F2026` có giờ theo row; không thêm vào v1 vì sẽ cần thêm request và tham số, HTML fallback không rõ giờ đã có trạng thái trung thực.
- [ ] BTMH lấy `https://baotinmanhhai.vn/bang-gia-vang`; đọc JSON trong `window.__reactRouterContext.streamController.enqueue(...)`, giải tham chiếu scalar cho đúng row code `KGB`, name `Kim Gia Bảo 24K`, purity `99.99`, unit `VND/1 chỉ`, weight `1 chỉ`. Không cần decoder React Router tổng quát. Không eval JS. Mẫu extraction đã kiểm chứng:
```ts
const match = html.match(/window\.__reactRouterContext\.streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/);
if (!match) throw new Error("btmh: missing quote stream");
const values: unknown[] = JSON.parse(JSON.parse(match[1]));
if (!Array.isArray(values)) throw new Error("btmh: invalid quote stream");
const records = values.filter((v) => v && typeof v === "object" && !Array.isArray(v))
  .map((record) => Object.fromEntries(Object.entries(record as Record<string, unknown>)
    .filter(([key, value]) => /^_\d+$/.test(key) && Number.isInteger(value) && Number(value) >= 0)
    .map(([key, value]) => [String(values[Number(key.slice(1))]), values[Number(value)]])))
  .filter((record) => record.code === "KGB");
```
Có 2 bản sao KGB trong stream: chấp nhận nếu các field price/product/unit/time giống nhau; mâu thuẫn thì throw. Chỉ lấy scalar string/number thuộc các field whitelist, kiểm tra index trong bounds. `last_updated` của KGB là `2026-09-15 08:34:06.0` tại lần đo; giờ footer `08:34:25.0` thuộc max toàn bảng, không dùng thay thế. Diễn giải giờ địa phương VN `+07:00`, parser kiểm tra ngày/giờ trước khi tạo ISO. Giá scalar full VND/chỉ nhân 10. Stream thay format thì báo lỗi, không fuzzy-match row trang sức/Gift.
- [ ] Ghi fixture chứng minh mapping BTMH: sản phẩm chính thức SKU `KGB1C10022001`, category_code `KGB`, 1 chỉ 999.9, giá 14.650.000 VND; bảng mã `KGB`, mua 14.250.000/bán 14.650.000 VND/chỉ. Giá fixture là lịch sử khảo sát, không hardcode giá live.
- [ ] Test stream có Gift trước KGB vẫn lấy đúng KGB; sai đơn vị hoặc thiếu buy_price/sell_price thì throw. Hai bản sao KGB khác nhau phải throw. Fixture stream phải giữ nguyên toàn bộ array tham chiếu hoặc dùng array tổng hợp nhỏ với các index tự nhất quán, không cắt một đoạn JSON khiến index trỏ sai. BTMC HTML thiếu một cell thì throw. Timestamp không tìm được thì `publishedAt: null`, không mượn timestamp sản phẩm khác.
- [ ] Fetch dùng timeout 20 giây mỗi request, mỗi nguồn thử tối đa hai lần với delay 3 giây như code hiện có; HTTP 403 không retry ngay. Hai hãng chạy song song bằng `Promise.allSettled`; trả quote hợp lệ và lỗi riêng hãng. Không thêm cron dày hoặc retry vô hạn.
- [ ] `collectRingGold` đọc JSON hiện có trước, validate shape. File không tồn tại coi là `[]`; file hỏng thì throw, không ghi đè bằng `[]`. Merge quote hợp lệ, viết file tạm cùng thư mục rồi rename; chỉ write nếu JSON thay đổi. Lỗi fs luôn throw. Không nuốt lỗi mất dữ liệu thành "nguồn hỏng".
- [ ] Test mock một hãng reject + hãng kia thành công: hãng kia còn trong kết quả. Test trên thư mục tạm giữ bytes file hỏng và reject; thành công tạo JSON đọc lại được, lần lặp cùng quote không đổi file. Không gọi mạng thật trong unit tests.

## Task 3: Local sync giữ phần thành công

**Files:** `scripts/backfill-vn.ts`, `scripts/sync-vn-gold.ts`, `tests/ring-gold-collection.test.ts`.

**Consumes:** `collectRingGold(filePath)` từ Task 2.

- [ ] Viết regression fixture legacy một ngày đã có cặp nhẫn, response mới SJC-only. Kỳ vọng `ringBuy/ringSell` cũ còn nguyên. Response chỉ một phía nhẫn cũng giữ cặp cũ, không ghép giá khác thời điểm.
- [ ] Để test không chạy script khi import, đổi `main` thành export `runBackfill()` và guard entrypoint bằng `pathToFileURL(process.argv[1]).href === import.meta.url` (kiểm tra argv[1] tồn tại trước). Test stub `globalThis.fetch`, dùng thư mục tạm làm cwd, restore mocks/cwd trong finally. Không import bản hiện tại trước khi có guard vì nó tự gọi main.
- [ ] Backfill chạy collector nhẫn mới độc lập ngay khi bắt đầu, cùng các fetch cũ. Chuyển 4 fetch enrichment/live sang `Promise.allSettled`; kết quả cafef lỗi coi không có dòng mới, XAU/FX lỗi dùng cache/giá cùng ngày đã lưu nếu có, không ghi null đè dữ liệu cùng ngày hợp lệ. Giữ hành vi bỏ qua ngày lịch sử đã có.
```ts
const [ringResult, cafefResult, xauResult, fxResult, liveResult] = await Promise.allSettled([
  collectRingGold(RING_HISTORY_FILE), fetchCafefSjc(), fetchXau(),
  fetchUsdVndHistory(), fetchVnGold(),
]);
```
- [ ] Nếu collector reject vì parse JSON/disk: lỗi nghiêm trọng, dừng sync với exitCode 1. Lỗi mạng từng hãng nằm trong `ringResult.value.errors`, không reject. Nếu ít nhất một giá hợp lệ được thu thập/lưu hoặc legacy backfill thành công: log cảnh báo nhưng exitCode 0 để wrapper publish phần thành công. Nếu mọi nguồn giá đều hỏng và không có gì hữu ích thì exitCode 1, giữ dữ liệu cũ.
- [ ] Tại nhánh update dòng legacy hôm nay, chỉ thay cặp nhẫn khi response có cả mua/bán hợp lệ; nếu không, giữ nguyên cặp của `existing`. Không ghi giá BTMH mới vào trường ring legacy, không tạo dòng SJC null từ ring-only. `scripts/run.ts` và scoring không nhận dữ liệu hãng mới.
- [ ] Giữ sync dừng trên lỗi nghiêm trọng; KHÔNG bỏ guard để stage mọi file khi backfill exit1. Chỉ mở rộng allowlist:
```ts
const HISTORY_PATHS = [
  "public/data/history/vn-gold.json",
  "public/data/history/ring-gold.json",
];
// Dùng cùng danh sách cho diff --cached --quiet và git add.
```
- [ ] Bảo vệ công việc người dùng: trước sync, nếu hai file đích đã dirty hoặc index có file staged sẵn thì dừng và ghi lý do, không tự commit chúng. Không thay chiến lược rebase bằng theirs/ours, không reset khi conflict.
- [ ] Test coordinator bằng dependency stubs hoặc child process trong Git repo tạm có remote local: BTMH thành công trong khi cafef/XAU/FX fail vẫn lưu quote và wrapper tới bước stage; fs failure dừng. Không chạy wrapper thật ở repo chính.
- [ ] Giữ wrapper hiện có, không dựng queue/daemon. Hai lượt BTMC (legacy và branded) mỗi lần local sync được chấp nhận ở v1; chỉ deduplicate bằng sharing request khi có bằng chứng rate limit, không đổi contract fetch legacy để tiết kiệm một request.

## Task 4: Bộ chọn và Time Machine

**Files:** `src/app/page.tsx`, `src/components/Dashboard.tsx`, `src/lib/ring-gold.test.ts`.

**Consumes:** `RingGoldDay[]`, `ringBrand`, `ringQuoteAt`.

- [ ] Import file mới theo pattern import vn-gold hiện có, truyền prop `ringRows: RingGoldDay[]` xuống Dashboard; không thêm browser fetch hoặc endpoint.
- [ ] Settings thêm field, giữ key `au-settings-v2`:
```ts
interface Settings {
  weights: Record<CriterionKey, number>;
  presetId: string | null;
  ringBrand: RingBrand;
}
// DEFAULT_SETTINGS thêm ringBrand: "btmc".
// loadSettings trả {...các trường cũ, ringBrand: ringBrand(s.ringBrand)}.
// Mọi handler đổi preset/trọng số giữ ...settings, không xóa lựa chọn hãng.
```
- [ ] Đặt select ngoài điều kiện live/asOf để cả hai chế độ dùng được; không render hai select trùng id:
```tsx
<label htmlFor="ring-brand">Nhẫn trơn 9999</label>
<select id="ring-brand" value={settings.ringBrand}
  onChange={(e) => {
    const next = { ...settings, ringBrand: ringBrand(e.target.value) };
    setSettings(next);
    saveSettings(next);
  }}>
  <option value="btmc">BTMC</option>
  <option value="btmh">BTMH</option>
</select>
```
- [ ] Live lookup tới ngày VN hiện tại (không lấy ngày SJC làm freshness); asOf lookup exact ngày Time Machine. Dùng helper pure:
```ts
const selectedQuote = ringQuoteAt(
  ringRows, settings.ringBrand, selectedDate, isTimeMachine,
);
```
`selectedDate` live lấy từ `nowMs` đã có trong Dashboard (`new Date(nowMs + 7 * 3600_000).toISOString().slice(0, 10)`); state này đã khởi tạo từ `analysis.generatedAt` và cập nhật sau mount. Không tạo đồng hồ/hydration mechanism mới. AsOf là `asOf.point.date`; `isTimeMachine` bằng `asOf !== null` theo kiểu thực tế trong Dashboard.
- [ ] Giá format bằng `fmtMoney`; bổ sung nhãn rõ `tr VND/lượng`, sản phẩm và link nguồn cố định. Ngày trước hôm nay: "Giá ngày DD/MM/YYYY — chưa có giá mới". Không rõ publishedAt: "Không rõ thời điểm nguồn cập nhật; lấy lúc …". Không có quote: "Chưa có dữ liệu BTMC/BTMH". Không lấy flat legacy làm fallback cho hãng.
- [ ] Không đổi thẻ SJC, chart hoặc scoring. Bỏ hiển thị ring anonymous trong live/asOf tại đúng hai chỗ cũ, thay bằng quote theo hãng.
- [ ] Test helper exact/asOf/stale đã có ở Task 1; thêm kiểm tra settings cũ có weights/preset giữ nguyên sau roundtrip chọn hãng, invalid hãng về BTMC. Nếu không có DOM test harness, dùng test helper pure + manual UI, không cài framework mới.
- [ ] Manual UI: bàn phím tab/chọn cả hai hãng, reload giữ hãng; chỉnh preset rồi hãng và ngược lại không reset; localStorage bị chặn vẫn render; hẹp 400px không tràn; Time Machine trước ngày dữ liệu hiện thiếu; so điểm trước/sau đổi hãng không đổi. Dùng mock file trong sandbox build nếu cần, không ghi giá giả vào dữ liệu thật.

## Task 5: Kiểm chứng và tài liệu vận hành

**Files:** hai hướng dẫn sync, root changelog, đặc tả nếu cần ghi kết quả xác minh.

- [ ] Hướng dẫn sync nói rõ: máy tắt có thể lấp bù SJC từ CafeF, **không thể hứa lấp bù nhẫn**. Giữ lịch 09:00 / 13:30 hiện có; không tự sửa Task Scheduler/Termux của người dùng.
- [ ] Nêu hai file đích, dữ liệu theo hãng độc lập; lỗi một nguồn log riêng; không gọi cả lượt thành công nếu cả hai hãng nhẫn đều thiếu.
- [ ] Chạy kiểm thử mục tiêu rồi toàn bộ và build:
```sh
npx vitest run src/lib/ring-gold.test.ts tests/ring-gold-collection.test.ts
npm test
npm run build
git diff --check
git diff --stat
```
- [ ] So diff: dữ liệu legacy không bị sửa bởi tests/build, không đổi engine/preset, không có file không liên quan. Báo rõ test lỗi/chưa chạy, không suy build pass từ type-check.
- [ ] Live smoke chỉ fetch/parse và in hãng/sản phẩm/đơn vị/timestamp, không write hoặc sync. Một lần HTTP200 chỉ chứng minh nguồn hoạt động lúc kiểm tra, không tuyên bố SLA ổn định.
- [ ] Ghi changelog sau khi hoàn tất kiểm chứng. Trả kết quả và diff cho người dùng; commit/push chỉ khi được yêu cầu riêng.

## Tiêu chí hoàn tất

- Hai hãng đọc đúng sản phẩm và đơn vị; BTMC có HTML fallback, BTMH báo lỗi minh bạch nếu website đổi cấu trúc.
- Quote thành công không mất vì hãng khác/enrichment lỗi; quote lỗi không xóa giá tốt; file hỏng không bị overwrite.
- Chọn hãng không làm đổi phân tích hay nhãn vàng miếng SJC; lịch sử nhẫn cũ giữ nguyên và không bị gán thương hiệu.
- Tests/build và kiểm tra UI có kết quả được ghi nhận, không commit/push tự động trong phiên triển khai.
