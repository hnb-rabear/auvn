# BearDownsideCard v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card "Triển vọng 1/3/6 tháng tới" quay lại bảng 3 dòng (dễ so sánh 3 kỳ hạn hơn khối v2) với CSS riêng hết tràn ngang mobile, và khung thời gian đổi từ sparkline-toàn-lịch-sử sang khung cuộn ngang mật độ cố định (6T/1N/3N) để chọn ngày chính xác hơn.

**Architecture:** Chỉ đổi lớp trình bày trong `src/components/BearDownsideCard.tsx` + CSS trong `src/app/globals.css`. Engine, `bear-downside-view.ts`, types, JSON không đổi. Spec: `docs/superpowers/specs/2026-07-12-bear-downside-card-v3-design.md`.

**Tech Stack:** Next.js + TypeScript (static export), React client component, SVG + native `overflow-x: auto` scroll, CSS thuần trong `globals.css`. Không thêm dependency.

## Global Constraints

- UI tiếng Việt; giữ NGUYÊN mọi format chống-ảo-giác: `usdK` (`~$X,Xk`), dải p25→p75, `pUpTenths` bậc 1/10, caveat cuối card, nội dung banner ⓘ, và toàn bộ số liệu/nội dung cột bảng y hệt bản trước v2.
- KHÔNG đụng `.bt-table*` (bảng backtest `Dashboard.tsx` dùng chung) và KHÔNG sửa class `.tm-*` (TimeMachine).
- Bảng dùng class riêng `.bdo-table*` — KHÔNG `white-space: nowrap`, dùng `table-layout: fixed`.
- Hằng số khung thời gian: `WINDOW_SESSIONS = { "6T": 126, "1N": 252, "3N": 756 }`, `VIEWPORT_PX = 360`, `pxPerSession = VIEWPORT_PX / WINDOW_SESSIONS[winKey]`. Mặc định `winKey = "6T"`.
- Khung thời gian: `overflow-x: auto` + `touch-action: pan-x` trên `.bdo-sparkwrap` (khác `pan-y` của v2) — cuộn ngang do trình duyệt xử lý, KHÔNG code kéo tay/`setPointerCapture`. KHÔNG pinch/wheel zoom.
- Bỏ hẳn 2 nút ◀▶ (`.bdo-fab`) — tap giờ đã đủ chính xác.
- KHÔNG đổi `src/lib/bear-downside.ts`, `src/lib/bear-downside-view.ts`, `src/lib/types.ts`, dữ liệu JSON. `monthAnchors`/`monthPosOf` tiếp tục không dùng ở UI nhưng GIỮ NGUYÊN trong `bear-downside-view.ts` (có test riêng).
- Repo không test React component — kiểm bằng `npm test` (toàn bộ suite hiện có phải pass) + `npm run build`. Không có công cụ trình duyệt tự động trong môi trường thực thi — xác nhận hành vi UI bằng đọc code, không claim đã test tương tác thật.
- Commit message tiếng Việt kiểu `feat:`/`fix:` như lịch sử repo.

---

### Task 1: Bảng 3 dòng thay khối kỳ hạn

**Files:**

- Modify: `src/components/BearDownsideCard.tsx` (thay `Block`/`LegacyBlock` bằng `Row`/`LegacyRow` + 2 chỗ markup)
- Modify: `src/app/globals.css` (thay block CSS `.bdo-blocks`/`.bdo-block*`/`.bdo-h`/`.bdo-grid`/`.bdo-label` bằng `.bdo-table*`)

**Interfaces:**

- Consumes: `BearAsOfBand`, `BearHorizonStat` từ `@/lib/types`; helpers sẵn có: `HSHORT`, `HS`, `usdK`, `usd`, `signed`, `signedInt`, `pUpTenths`, `enoughSamples`.
- Produces: component `Row({H, band, price, actualDip, actualTerm})` và `LegacyRow({s, price})` — Task 2 không đụng tới chúng, chỉ đụng phần chọn thời gian phía trên bảng.

- [ ] **Step 1: Thay `Block` bằng `Row`**

Trong `src/components/BearDownsideCard.tsx`, tìm và xóa toàn bộ:

```tsx
/**
 * Một khối kỳ hạn — lưới 2 cột: Đáy điển hình · Kết cục (dải p25→p75) ·
 * Khả năng (bậc 1/10) · Thực tế (CHỈ render khi đã đáo hạn — xem ngày quá khứ).
 */
function Block({ H, band, price, actualDip, actualTerm }: {
  H: (typeof HS)[number];
  band: BearAsOfBand | null;
  price: number;
  actualDip: number | null;
  actualTerm: number | null;
}) {
  const label = HLABEL[H];
  if (!band) {
    return (
      <div className="bdo-block empty">
        <span className="bdo-h">{label}</span>
        <span>chưa đủ dữ liệu</span>
      </div>
    );
  }
  const px = (pct: number) => price * (1 + pct / 100);
  const t = pUpTenths(band.pUp); // bậc 1/10 — chi tiết hơn là giả-chính-xác (ít cửa sổ độc lập)
  const matured = actualDip != null && actualTerm != null;
  return (
    <div className="bdo-block">
      <div className="bdo-h">{label}</div>
      <div className="bdo-grid">
        <div className="bdo-cell">
          <div className="bdo-label">Đáy điển hình</div>
          <div>{usdK(px(band.median))} <span className="down small">({signedInt(band.median)})</span></div>
        </div>
        <div className="bdo-cell">
          <div className="bdo-label">Kết cục điển hình</div>
          <div>
            {usdK(px(band.endP25))}<span className="muted"> → </span>{usdK(px(band.endP75))}
            <div className="small muted">{signedInt(band.endP25)}…{signedInt(band.endP75)}</div>
          </div>
        </div>
        <div className="bdo-cell">
          <div className="bdo-label">Khả năng</div>
          <div>
            <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
          </div>
        </div>
        {matured && (
          <div className="bdo-cell">
            <div className="bdo-label">Thực tế</div>
            <div>đáy {usdK(px(actualDip!))} <span className="down small">({signedInt(actualDip!)})</span></div>
            <div>kết {usdK(px(actualTerm!))} <span className={`small ${actualTerm! >= 0 ? "up" : "down"}`}>({signedInt(actualTerm!)})</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
```

Thay bằng:

```tsx
/**
 * Một hàng kỳ hạn — đáy điển hình (đỏ, rủi ro) · kết cục điển hình (xanh/đỏ) ·
 * THỰC TẾ (đáy + kết cục thực tế khi xem ngày quá khứ đã đáo hạn) · khả năng (bậc 1/10).
 */
function Row({ H, band, price, actualDip, actualTerm }: {
  H: (typeof HS)[number];
  band: BearAsOfBand | null;
  price: number;
  actualDip: number | null;
  actualTerm: number | null;
}) {
  const label = HSHORT[H];
  if (!band) {
    return (
      <tr>
        <td>{label}</td>
        <td className="muted" colSpan={4}>chưa đủ dữ liệu</td>
      </tr>
    );
  }
  const px = (pct: number) => price * (1 + pct / 100);
  const t = pUpTenths(band.pUp); // bậc 1/10 — chi tiết hơn là giả-chính-xác (ít cửa sổ độc lập)
  const matured = actualDip != null && actualTerm != null;
  return (
    <tr>
      <td>{label}</td>
      <td>
        {usdK(px(band.median))} <span className="down small">({signedInt(band.median)})</span>
      </td>
      <td>
        {usdK(px(band.endP25))}<span className="muted"> → </span>{usdK(px(band.endP75))}
        <div className="small muted">{signedInt(band.endP25)}…{signedInt(band.endP75)}</div>
      </td>
      <td>
        {matured ? (
          <>
            <div>đáy {usdK(px(actualDip!))} <span className="down small">({signedInt(actualDip!)})</span></div>
            <div>kết {usdK(px(actualTerm!))} <span className={`small ${actualTerm! >= 0 ? "up" : "down"}`}>({signedInt(actualTerm!)})</span></div>
          </>
        ) : (
          <span className="muted">chưa đáo hạn</span>
        )}
      </td>
      <td>
        <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Thay `LegacyBlock` bằng `LegacyRow`**

Ngay sau đó, tìm và xóa:

```tsx
/** Khối kỳ hạn cho fallback (timeline.json cũ không có bearAsOf) — chỉ ngày mới nhất, không có Thực tế. */
function LegacyBlock({ s, price }: { s: BearHorizonStat; price: number }) {
  const label = HLABEL[String(s.horizonDays)] ?? String(s.horizonDays);
  if (!enoughSamples(s.n, s.horizonDays)) {
    return (
      <div className="bdo-block empty">
        <span className="bdo-h">{label}</span>
        <span>chưa đủ dữ liệu (n={s.n})</span>
      </div>
    );
  }
  const at = (pv: number) => usd(price * (1 + pv / 100));
  const t = pUpTenths(s.pUp);
  return (
    <div className="bdo-block">
      <div className="bdo-h">{label}</div>
      <div className="bdo-grid">
        <div className="bdo-cell">
          <div className="bdo-label">Đáy điển hình</div>
          <div>{at(s.median)} <span className="down small">({signed(s.median)})</span></div>
        </div>
        <div className="bdo-cell">
          <div className="bdo-label">Kết cục điển hình</div>
          <div>{at(s.endMedian)} <span className={`small ${s.endMedian >= 0 ? "up" : "down"}`}>({signed(s.endMedian)})</span></div>
        </div>
        <div className="bdo-cell">
          <div className="bdo-label">Khả năng</div>
          <div>
            <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

thay bằng:

```tsx
/** Hàng UI cho fallback (timeline.json cũ không có bearAsOf) — chỉ ngày mới nhất nên không có thực tế. */
function LegacyRow({ s, price }: { s: BearHorizonStat; price: number }) {
  const label = HSHORT[String(s.horizonDays)] ?? String(s.horizonDays);
  if (!enoughSamples(s.n, s.horizonDays)) {
    return (<tr><td>{label}</td><td className="muted" colSpan={4}>chưa đủ dữ liệu (n={s.n})</td></tr>);
  }
  const at = (pv: number) => usd(price * (1 + pv / 100));
  const t = pUpTenths(s.pUp);
  return (
    <tr>
      <td>{label}</td>
      <td>{at(s.median)} <span className="down">({signed(s.median)})</span></td>
      <td>{at(s.endMedian)} <span className={s.endMedian >= 0 ? "up" : "down"}>({signed(s.endMedian)})</span></td>
      <td className="muted">chưa đáo hạn</td>
      <td>
        <span className="up">≈{t}/10↑</span> <span className="muted">·</span> <span className="down">{10 - t}/10↓</span>
      </td>
    </tr>
  );
}
```

Lưu ý: `HLABEL` chỉ được dùng trong `Block`/`LegacyBlock` (đã kiểm toàn file — không nơi nào khác dùng), nên sau 2 bước trên nó thành unused. XÓA dòng khai báo ở đầu file:

```tsx
const HLABEL: Record<string, string> = { "21": "1 tháng", "63": "3 tháng", "126": "6 tháng" };
```

(để nguyên sẽ lỗi unused-var khi `npm run build`.)

- [ ] **Step 3: Thay markup bảng ở path legacy (fallback)**

Trong nhánh `if (!hasAsOf || !p) { ... }`, thay:

```tsx
        <div className="bdo-blocks">
          {bd.shown.map((s) => <LegacyBlock key={s.horizonDays} s={s} price={bd.currentPrice} />)}
        </div>
```

bằng:

```tsx
        <div className="bdo-table-wrap">
          <table className="bdo-table">
            <thead>
              <tr><th>Kỳ hạn</th><th>Đáy điển hình</th><th>Kết cục điển hình</th><th>Thực tế</th><th>Cơ hội tăng</th></tr>
            </thead>
            <tbody>
              {bd.shown.map((s) => <LegacyRow key={s.horizonDays} s={s} price={bd.currentPrice} />)}
            </tbody>
          </table>
        </div>
```

- [ ] **Step 4: Thay markup bảng ở path chính (v2 → v3)**

Cuối component, thay:

```tsx
      <div className="bdo-blocks">
        {HS.map((H) => (
          <Block
            key={H}
            H={H}
            band={p.bearAsOf?.[H] ?? null}
            price={p.price}
            actualDip={actualWorstDipPct(prices, X, Number(H))}
            actualTerm={p.returns[H]}
          />
        ))}
      </div>
```

bằng:

```tsx
      <div className="bdo-table-wrap">
        <table className="bdo-table">
          <thead>
            <tr><th>Kỳ hạn</th><th>Đáy điển hình</th><th>Kết cục điển hình</th><th>Thực tế</th><th>Khả năng</th></tr>
          </thead>
          <tbody>
            {HS.map((H) => (
              <Row
                key={H}
                H={H}
                band={p.bearAsOf?.[H] ?? null}
                price={p.price}
                actualDip={actualWorstDipPct(prices, X, Number(H))}
                actualTerm={p.returns[H]}
              />
            ))}
          </tbody>
        </table>
      </div>
```

- [ ] **Step 5: Thay CSS `.bdo-blocks*` bằng `.bdo-table*`**

Trong `src/app/globals.css`, tìm block bắt đầu bằng comment `/* BearDownsideCard v2 — khối kỳ hạn thay bảng (hết scroll ngang mobile) */` và kết thúc ngay trước comment `/* sparkline chọn ngày — pan-y...`:

```css
/* BearDownsideCard v2 — khối kỳ hạn thay bảng (hết scroll ngang mobile) */
.bdo-blocks {
  display: grid;
  gap: 8px;
}
@media (min-width: 720px) {
  .bdo-blocks { grid-template-columns: repeat(3, 1fr); }
}
.bdo-block {
  background: var(--card2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
}
.bdo-block.empty {
  display: flex;
  gap: 8px;
  align-items: baseline;
  color: var(--muted);
  font-size: 0.86rem;
}
.bdo-h {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 4px;
}
.bdo-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
  font-size: 0.92rem;
}
.bdo-label {
  font-size: 0.72rem;
  color: var(--muted);
  margin-bottom: 1px;
}
```

thay toàn bộ block trên bằng:

```css
/* BearDownsideCard v3 — bảng 3 dòng thay khối kỳ hạn (hết scroll ngang mobile, CSS riêng không đụng .bt-table) */
.bdo-table-wrap {
  overflow-x: auto;
}
.bdo-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 0.86rem;
}
.bdo-table th,
.bdo-table td {
  text-align: left;
  padding: 6px 6px;
  border-bottom: 1px solid var(--border);
}
.bdo-table th:first-child,
.bdo-table td:first-child {
  width: 12%;
}
@media (max-width: 480px) {
  .bdo-table {
    font-size: 0.76rem;
  }
  .bdo-table th,
  .bdo-table td {
    padding: 4px 4px;
  }
}
```

(Comment `/* sparkline chọn ngày — pan-y... */` và mọi CSS `.bdo-sparkwrap`/`.bdo-spark`/`.bdo-fab*`/`.bdo-dateband*` phía sau GIỮ NGUYÊN — Task 2 sẽ sửa riêng.)

- [ ] **Step 6: Test + build**

Run: `npm test`
Expected: toàn bộ suite pass (gồm test `bear-downside*.test.ts`). Task này không đổi logic nào có test — fail nghĩa là sửa nhầm file lib.

Run: `npm run build`
Expected: build + static export thành công, không lỗi TypeScript (còn tham chiếu `Block`/`LegacyBlock` hoặc `HLABEL` chưa dùng sẽ fail ở đây).

- [ ] **Step 7: Đọc lại code xác nhận (không có công cụ trình duyệt trong môi trường này)**

Đọc `src/components/BearDownsideCard.tsx` phần vừa sửa, xác nhận: `Row`/`LegacyRow` trả về đúng 5 `<td>` (kể cả nhánh `!band`/`!enoughSamples` dùng `colSpan={4}`), cột "Thực tế" của `Row` render 2 dòng khi `matured`, render "chưa đáo hạn" khi chưa; `.bdo-table` không còn `white-space: nowrap` (kiểm bằng `grep -n "nowrap" src/app/globals.css` — chỉ còn xuất hiện ở `.bt-table` của Dashboard, không ở `.bdo-table`).

- [ ] **Step 8: Commit**

```bash
git add src/components/BearDownsideCard.tsx src/app/globals.css
git commit -m "feat: BearDownsideCard — bảng 3 dòng thay khối kỳ hạn, CSS riêng hết tràn ngang mobile"
```

---

### Task 2: Khung thời gian cuộn theo cửa sổ (6T/1N/3N) thay sparkline toàn lịch sử

**Files:**

- Modify: `src/components/BearDownsideCard.tsx` (thêm hằng số cửa sổ, state `winKey`, `wrapRef`, `scrollToIdx`; sửa `spark` memo + `pickAt`; sửa markup sparkline; sửa 2 chỗ gọi `setIdx` lập trình để gọi kèm `scrollToIdx`)
- Modify: `src/app/globals.css` (sửa `.bdo-sparkwrap`/`.bdo-spark`, xóa `.bdo-fab*`, thêm `.bdo-winbtns`)

**Interfaces:**

- Consumes: state `idx`/`setIdx`, `X`, `points`, `prices`, `isLatest`, `ddPct`, helpers `fmtDate`/`usd`/`fmt1` — tất cả đã có trong component; `Row`/`LegacyRow` từ Task 1 (không đổi).
- Produces: không có consumer sau — task cuối cùng đụng code (Task 3 chỉ xác minh).

- [ ] **Step 1: Hằng số cửa sổ + state + sửa `spark` memo**

Trong `src/components/BearDownsideCard.tsx`, tìm khối (đã có từ v2, ngay sau `const prices = useMemo(...)`):

```tsx
  // sparkline chọn ngày — chọn THÔ có chủ đích (~4.3k phiên trên ~350px ≈ 12 ngày/px);
  // ◀▶ nhích từng phiên, date picker nhảy chính xác. KHÔNG zoom/pan (xem spec).
  const SW = 640, SH = 64;
  const spark = useMemo(() => {
    if (prices.length < 2) return null;
    let min = Infinity, max = -Infinity;
    for (const v of prices) { if (v < min) min = v; if (v > max) max = v; }
    const span = max - min || 1;
    const xAt = (i: number) => (i / (prices.length - 1)) * SW;
    const yAt = (v: number) => SH - 4 - ((v - min) / span) * (SH - 8);
    const step = Math.max(1, Math.floor(prices.length / SW)); // ~1 điểm/px là đủ mượt
    let d = "";
    for (let i = 0; i < prices.length; i += step) d += `${d ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(prices[i]).toFixed(1)}`;
    d += `L${SW} ${yAt(prices[prices.length - 1]).toFixed(1)}`;
    return { d, xAt };
  }, [prices]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef(false);
  const pickAt = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setIdx(Math.round(frac * (points.length - 1)));
  };
```

thay toàn bộ bằng:

```tsx
  // khung thời gian: cửa sổ mật độ px/phiên CỐ ĐỊNH (không nén toàn lịch sử) — cuộn ngang
  // (overflow-x: auto, native) để xem vùng khác, tap để chọn ngày trong vùng đang thấy.
  // KHÔNG zoom (xem spec v3).
  const WINDOW_SESSIONS = { "6T": 126, "1N": 252, "3N": 756 } as const;
  const VIEWPORT_PX = 360;
  const SH = 64;
  const [winKey, setWinKey] = useState<keyof typeof WINDOW_SESSIONS>("6T");
  const pxPerSession = VIEWPORT_PX / WINDOW_SESSIONS[winKey];
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollToIdx = (target: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollTo({ left: Math.min(max, Math.max(0, target * pxPerSession - VIEWPORT_PX / 2)), behavior: "smooth" });
  };
  useEffect(() => { scrollToIdx(X); }, [winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalW = prices.length > 1 ? prices.length * pxPerSession : 0;
  const spark = useMemo(() => {
    if (prices.length < 2) return null;
    let min = Infinity, max = -Infinity;
    for (const v of prices) { if (v < min) min = v; if (v > max) max = v; }
    const span = max - min || 1;
    const yAt = (v: number) => SH - 4 - ((v - min) / span) * (SH - 8);
    let d = "";
    for (let i = 0; i < prices.length; i++) d += `${d ? "L" : "M"}${(i * pxPerSession).toFixed(1)} ${yAt(prices[i]).toFixed(1)}`;
    return { d };
  }, [prices, pxPerSession]);
  const pickAt = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.round((clientX - r.left) / pxPerSession);
    setIdx(Math.min(points.length - 1, Math.max(0, i)));
  };
```

Lưu ý: `X` dùng trong `useEffect(() => { scrollToIdx(X); }, [winKey])` được khai báo VÀI DÒNG SAU trong file hiện tại (`const X = Math.min(idx, points.length - 1);`) — TypeScript/React chấp nhận vì cả hai đều nằm trong cùng thân component (hoisting theo thứ tự thực thi runtime của function component: statement này chỉ THỰC SỰ dùng biến `X` bên trong effect callback, chạy sau khi toàn bộ component function đã chạy xong lượt render đó, nên `X` đã có giá trị). Không cần di chuyển thứ tự khai báo. `dragging` ref đã bị xóa (không còn kéo tay).

- [ ] **Step 2: Sửa 2 chỗ `setIdx` lập trình để cuộn kèm**

Trong `useEffect` đồng bộ `asOfIdx` (đã có sẵn, ngay sau khai báo `idx`):

```tsx
  useEffect(() => {
    if (asOfIdx != null) setIdx(Math.min(asOfIdx, points.length - 1));
    else setIdx(Math.max(0, points.length - 1));
  }, [asOfIdx, points.length]);
```

thay bằng:

```tsx
  useEffect(() => {
    const target = asOfIdx != null ? Math.min(asOfIdx, points.length - 1) : Math.max(0, points.length - 1);
    setIdx(target);
    scrollToIdx(target);
  }, [asOfIdx, points.length]); // eslint-disable-line react-hooks/exhaustive-deps
```

(`scrollToIdx` được định nghĩa lại mỗi render — không thêm vào dependency array vì sẽ gây loop vô ích; đây là pattern đã dùng ở dòng `useEffect` của Step 1. Effect này nằm TRƯỚC chỗ khai báo `scrollToIdx` trong file — hợp lệ vì chỉ gọi bên trong callback chạy sau render, cùng lý do với ghi chú về `X` ở Step 1.)

Trong date picker ở cuối component (`onChange` của `<input type="date">`), thay:

```tsx
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            let lo = 0, hi = points.length - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].date < v) lo = m + 1; else hi = m; }
            setIdx(lo);
          }}
```

bằng:

```tsx
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            let lo = 0, hi = points.length - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].date < v) lo = m + 1; else hi = m; }
            setIdx(lo);
            scrollToIdx(lo);
          }}
```

- [ ] **Step 3: Thay markup khung thời gian**

Thay toàn bộ khối (comment `{/* sparkline chọn ngày: chạm/kéo = thô · ◀▶ = từng phiên · 📅 = chính xác */}` + `div.bdo-sparkwrap` với `svg`/2 nút `.bdo-fab`):

```tsx
      {/* sparkline chọn ngày: chạm/kéo = thô · ◀▶ = từng phiên · 📅 = chính xác */}
      {spark && (
        <div className="bdo-sparkwrap">
          <svg
            ref={svgRef}
            className="bdo-spark"
            viewBox={`0 0 ${SW} ${SH}`}
            preserveAspectRatio="none"
            onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pickAt(e.clientX); }}
            onPointerMove={(e) => { if (dragging.current) pickAt(e.clientX); }}
            onPointerUp={() => { dragging.current = false; }}
            onPointerCancel={() => { dragging.current = false; }}
            aria-label="Biểu đồ giá — chạm/kéo để chọn ngày xem lại"
          >
            <path d={spark.d} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
            <line x1={spark.xAt(X)} y1="0" x2={spark.xAt(X)} y2={SH} stroke="#ece5d8" strokeWidth="1" opacity="0.6" />
          </svg>
          <button className="bdo-fab left" disabled={X <= 0} onClick={() => setIdx(Math.max(0, X - 1))} aria-label="Lùi 1 phiên">◀</button>
          <button className="bdo-fab right" disabled={X >= points.length - 1} onClick={() => setIdx(Math.min(points.length - 1, X + 1))} aria-label="Tới 1 phiên">▶</button>
        </div>
      )}
```

bằng:

```tsx
      {/* khung thời gian: 3 nút cửa sổ · cuộn ngang gốc trình duyệt xem vùng khác · tap chọn ngày */}
      {spark && (
        <>
          <div className="bdo-winbtns">
            {(Object.keys(WINDOW_SESSIONS) as (keyof typeof WINDOW_SESSIONS)[]).map((k) => (
              <button
                key={k}
                className={`iconbtn small-btn${winKey === k ? " active" : ""}`}
                onClick={() => setWinKey(k)}
                aria-pressed={winKey === k}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="bdo-sparkwrap" ref={wrapRef}>
            <svg
              ref={svgRef}
              className="bdo-spark"
              width={totalW}
              height={SH}
              onClick={(e) => pickAt(e.clientX)}
              aria-label="Biểu đồ giá — cuộn ngang xem lịch sử, chạm để chọn ngày"
            >
              <path d={spark.d} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.8" />
              <line x1={X * pxPerSession} y1="0" x2={X * pxPerSession} y2={SH} stroke="#ece5d8" strokeWidth="1" opacity="0.6" />
            </svg>
          </div>
        </>
      )}
```

- [ ] **Step 4: Sửa CSS `.bdo-sparkwrap`/`.bdo-spark`, xóa `.bdo-fab*`, thêm `.bdo-winbtns`**

Trong `src/app/globals.css`, tìm block:

```css
/* sparkline chọn ngày — pan-y để vuốt dọc vẫn cuộn trang (KHÔNG copy touch-action:none của .tm-chart) */
.bdo-sparkwrap {
  position: relative;
  margin: 0.4rem 0 0.3rem;
}
.bdo-spark {
  width: 100%;
  height: 64px;
  display: block;
  background: var(--card2);
  border-radius: 8px;
  touch-action: pan-y;
  user-select: none;
  cursor: crosshair;
}
.bdo-fab {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(21, 19, 15, 0.82);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.bdo-fab.left { left: 4px; }
.bdo-fab.right { right: 4px; }
.bdo-fab:disabled { opacity: 0.3; cursor: default; }
```

thay bằng:

```css
/* khung thời gian — cuộn ngang GỐC TRÌNH DUYỆT (KHÔNG code kéo tay); pan-x để trình duyệt nhận
   kéo ngang trên chính khung này, kéo dọc vẫn nổi lên cuộn trang bình thường. */
.bdo-winbtns {
  display: flex;
  gap: 6px;
  margin: 0.2rem 0;
}
.bdo-sparkwrap {
  margin: 0.2rem 0 0.3rem;
  overflow-x: auto;
  touch-action: pan-x;
  border-radius: 8px;
  background: var(--card2);
}
.bdo-spark {
  display: block;
  user-select: none;
  cursor: pointer;
}
```

- [ ] **Step 5: Test + build**

Run: `npm test`
Expected: toàn bộ suite pass (test `monthAnchors`/`monthPosOf` trong `bear-downside-view.test.ts` vẫn pass vì hàm không bị xóa — chỉ không import ở component).

Run: `npm run build`
Expected: build thành công; lỗi TypeScript về `dragging`/`SW`/`spark.xAt` không tồn tại nghĩa là còn sót tham chiếu code cũ chưa xóa hết ở Step 1 hoặc Step 3.

- [ ] **Step 6: Đọc lại code xác nhận (không có công cụ trình duyệt trong môi trường này)**

Đọc lại toàn bộ `src/components/BearDownsideCard.tsx`, xác nhận:
1. Không còn `onPointerDown`/`onPointerMove`/`onPointerUp`/`onPointerCancel`/`setPointerCapture`/`dragging` trong file (`grep -n "onPointer\|dragging\|setPointerCapture" src/components/BearDownsideCard.tsx` → không kết quả).
2. `pxPerSession` được dùng nhất quán ở `spark` memo, `pickAt`, `scrollToIdx`, và vạch `<line>` — cùng một công thức `VIEWPORT_PX / WINDOW_SESSIONS[winKey]`.
3. `scrollToIdx` được gọi ở đúng 3 nơi lập trình (effect Step 1 theo `winKey`, effect đồng bộ `asOfIdx`, `onChange` date picker) và KHÔNG được gọi trong `pickAt`/`onClick` của svg (tap không tự cuộn).
4. `.bdo-fab` không còn xuất hiện ở CSS lẫn component (`grep -rn "bdo-fab" src/` → không kết quả).

- [ ] **Step 7: Commit**

```bash
git add src/components/BearDownsideCard.tsx src/app/globals.css
git commit -m "feat: BearDownsideCard — khung thời gian cuộn theo cửa sổ 6T/1N/3N thay sparkline toàn lịch sử"
```

---

### Task 3: Xác minh tổng theo spec

**Files:**

- Không sửa code (chỉ chạy kiểm; nếu phát hiện lỗi → sửa tại chỗ + commit `fix:`).

**Interfaces:**

- Consumes: toàn bộ deliverable Task 1–2.
- Produces: xác nhận checklist spec.

- [ ] **Step 1: Chạy suite + build sạch**

Run: `npm test` → tất cả pass. Run: `npm run build` → export tĩnh OK.

- [ ] **Step 2: Đối chiếu spec bằng đọc code (không có công cụ trình duyệt trong môi trường này)**

Mở `docs/superpowers/specs/2026-07-12-bear-downside-card-v3-design.md`, đối chiếu từng mục A/B/C với code thực tế trong `src/components/BearDownsideCard.tsx` + `src/app/globals.css`:

1. **Mục A:** `Row`/`LegacyRow` render `<table className="bdo-table">` 5 cột, cột đầu dùng `HSHORT`; `.bdo-table` có `table-layout: fixed`, KHÔNG có `white-space: nowrap`; `.bt-table` (Dashboard) không bị sửa (`grep -n "bt-table" src/components/Dashboard.tsx` vẫn còn nguyên).
2. **Mục B:** 3 nút `winKey` với `WINDOW_SESSIONS` đúng {126,252,756}; `.bdo-sparkwrap` có `overflow-x: auto` + `touch-action: pan-x`; không còn `.bdo-fab`/pointer-drag; `pickAt` tính `idx` từ `svgRef` (không cộng `scrollLeft` của wrapper — tránh lệch kép, xem ghi chú spec mục B); `scrollToIdx` chỉ gọi ở 3 nơi lập trình, không gọi trong tap.
3. **Mục C:** không đổi `src/lib/bear-downside*.ts`/`types.ts`/JSON; `monthAnchors`/`monthPosOf` vẫn còn trong `bear-downside-view.ts`.

Sai lệch nào → sửa + commit `fix:`; khớp hết → xong.

- [ ] **Step 3: Ghi chú giới hạn xác minh**

Vì môi trường không có công cụ trình duyệt tự động, KHÔNG claim đã xác nhận: cảm giác cuộn ngang mượt/momentum thật trên thiết bị cảm ứng, tap có bắn `click` đúng như kỳ vọng trên mọi trình duyệt di động, hay giao diện 3 nút không đè lên phần tử khác ở màn hình cực hẹp. Ghi rõ những điểm này khi báo cáo cho chủ dự án, đề nghị họ tự kiểm tra trên thiết bị thật trước khi coi là xong hẳn.
