# BearDownsideCard v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card "Triển vọng 1/3/6 tháng tới" hết scroll ngang mobile (khối kỳ hạn thay bảng 5 cột) + bộ chọn ngày kiểu Máy Thời Gian (sparkline chạm/kéo, tối giản, không zoom).

**Architecture:** Chỉ đổi lớp trình bày trong `src/components/BearDownsideCard.tsx` + CSS mới tiền tố `bdo-` trong `src/app/globals.css`. Engine, `bear-downside-view.ts`, types, JSON không đổi. Spec: `docs/superpowers/specs/2026-07-12-bear-downside-card-v2-design.md`.

**Tech Stack:** Next.js + TypeScript (static export), React client component, SVG sparkline, CSS thuần trong `globals.css`. Không thêm dependency.

## Global Constraints

- UI tiếng Việt; giữ NGUYÊN mọi format chống-ảo-giác: `usdK` (`~$X,Xk`), dải p25→p75, `pUpTenths` bậc 1/10, caveat cuối card, nội dung banner ⓘ (định nghĩa cột + coverage đo được + đuôi p10).
- KHÔNG đụng `.bt-table*` (bảng backtest `Dashboard.tsx:849` còn dùng) và KHÔNG sửa class `.tm-*` (TimeMachine dùng).
- Sparkline phải đặt `touch-action: pan-y` — KHÔNG copy `touch-action: none` của `.tm-chart` (kẹt cuộn trang mobile).
- KHÔNG đổi `src/lib/bear-downside.ts`, `src/lib/bear-downside-view.ts`, `src/lib/types.ts`, dữ liệu JSON. `monthAnchors`/`monthPosOf` hết được import nhưng VẪN GIỮ trong `bear-downside-view.ts` (có test riêng).
- Repo không test React component — kiểm bằng `npm test` (toàn bộ suite hiện có phải pass, gồm 32 test bear-downside) + `npm run build` + xem dev viewport mobile.
- Commit message tiếng Việt kiểu `feat:`/`refactor:` như lịch sử repo.

---

### Task 1: Khối kỳ hạn thay bảng (hết scroll ngang)

**Files:**

- Modify: `src/components/BearDownsideCard.tsx` (thay `Row`/`LegacyRow` + 2 chỗ markup bảng)
- Modify: `src/app/globals.css` (thêm block `bdo-*`, chèn sau block `.tm-edge.to { right: 6px; }` ~dòng 586)

**Interfaces:**

- Consumes: `BearAsOfBand`, `BearHorizonStat` từ `@/lib/types`; helpers sẵn có trong file: `HLABEL`, `HS`, `usdK`, `usd`, `signed`, `signedInt`, `pUpTenths`, `enoughSamples`.
- Produces: component `Block({H, band, price, actualDip, actualTerm})` và `LegacyBlock({s, price})` — Task 2 không đụng tới chúng, chỉ đụng phần chọn thời gian.

- [ ] **Step 1: Thay `Row` bằng `Block`**

Trong `src/components/BearDownsideCard.tsx`, xóa toàn bộ function `Row` (khối comment "Một hàng kỳ hạn…" + function, dòng ~19–71) và thay bằng:

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

- [ ] **Step 2: Thay `LegacyRow` bằng `LegacyBlock`**

Xóa function `LegacyRow` (dòng ~73–92) và thay bằng (giữ nguyên giá trị/format cũ của path legacy: `usd` đầy đủ + `signed` 1 chữ số thập phân, kết cục là 1 điểm `endMedian` vì `BearHorizonStat` không có p25/p75 as-of):

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

- [ ] **Step 3: Thay markup bảng ở path legacy**

Trong nhánh fallback (`if (!hasAsOf || !p)`), thay:

```tsx
        <div className="bt-table-wrap">
          <table className="bt-table">
            <thead>
              <tr><th>Kỳ hạn</th><th>Đáy điển hình</th><th>Kết cục điển hình</th><th>Thực tế</th><th>Cơ hội tăng</th></tr>
            </thead>
            <tbody>
              {bd.shown.map((s) => <LegacyRow key={s.horizonDays} s={s} price={bd.currentPrice} />)}
            </tbody>
          </table>
        </div>
```

bằng:

```tsx
        <div className="bdo-blocks">
          {bd.shown.map((s) => <LegacyBlock key={s.horizonDays} s={s} price={bd.currentPrice} />)}
        </div>
```

- [ ] **Step 4: Thay markup bảng ở path chính (v2)**

Cuối component, thay:

```tsx
      <div className="bt-table-wrap">
        <table className="bt-table">
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

bằng:

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

- [ ] **Step 5: Thêm CSS `bdo-*` (phần khối)**

Trong `src/app/globals.css`, chèn NGAY SAU dòng `.tm-edge.to { right: 6px; }` (~dòng 586):

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

- [ ] **Step 6: Test + build**

Run: `npm test`
Expected: toàn bộ suite pass (gồm 32 test `bear-downside*.test.ts`). Task này không đổi logic nào có test — fail nghĩa là sửa nhầm file lib.

Run: `npm run build`
Expected: build + static export thành công, không lỗi TypeScript (nếu còn tham chiếu `Row`/`LegacyRow` sẽ fail ở đây).

- [ ] **Step 7: Xem nhanh dev (mobile viewport)**

Run: `npm run dev` rồi mở `http://localhost:3000`, DevTools responsive 375px, mở accordion "Triển vọng 1/3/6 tháng tới".
Expected: 3 khối kỳ hạn xếp dọc, KHÔNG có scroll ngang; ngày mới nhất mỗi khối chỉ 3 ô (không có ô "Thực tế"); kéo slider (còn của UI cũ) về quá khứ ≥6 tháng thì ô "Thực tế" xuất hiện. Desktop ≥720px: 3 khối nằm ngang.

- [ ] **Step 8: Commit**

```bash
git add src/components/BearDownsideCard.tsx src/app/globals.css
git commit -m "feat: BearDownsideCard — khối kỳ hạn thay bảng, hết scroll ngang mobile; ô Thực tế chỉ hiện khi đã đáo hạn"
```

---

### Task 2: Sparkline chọn ngày thay slider-tháng

**Files:**

- Modify: `src/components/BearDownsideCard.tsx` (imports, card-head, thay `input.tm-range` + `div.tm-daterange`)
- Modify: `src/app/globals.css` (thêm CSS sparkline/fab/dateband vào block `bdo-*` của Task 1)

**Interfaces:**

- Consumes: state `idx`/`setIdx`, `X`, `points`, `prices`, `isLatest`, `ddPct`, helpers `fmtDate`/`usd`/`fmt1` — tất cả đã có trong component; `Block`/`LegacyBlock` từ Task 1 (không đổi).
- Produces: không có consumer sau — task cuối cùng đụng code.

- [ ] **Step 1: Sửa imports**

Đầu file, đổi:

```tsx
import { useEffect, useMemo, useState } from "react";
import { ddAsOfPct, actualWorstDipPct, monthAnchors, monthPosOf, pUpTenths, coverageStats } from "@/lib/bear-downside-view";
```

thành:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { ddAsOfPct, actualWorstDipPct, pUpTenths, coverageStats } from "@/lib/bear-downside-view";
```

(`monthAnchors`/`monthPosOf` GIỮ NGUYÊN trong `src/lib/bear-downside-view.ts` + test của chúng — chỉ bỏ import.)

- [ ] **Step 2: Bỏ `anchors`, thêm sparkline memo + pointer handlers**

Trong body component, xóa dòng:

```tsx
  const anchors = useMemo(() => monthAnchors(points.map((q) => q.date)), [points]);
```

và thêm vào chỗ đó:

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

- [ ] **Step 3: Gọn card-head path chính**

Trong nhánh v2 (KHÔNG đụng nhánh fallback legacy), thay:

```tsx
      <div className="card-head">
        <h2>Triển vọng 1/3/6 tháng tới</h2>
        <span className="muted">
          {fmtDate(p.date)}{isLatest ? " (mới nhất)" : ""} · {usd(p.price)} · −{fmt1(ddPct)}% dưới đỉnh
        </span>
        <button className="iconbtn small-btn" aria-label="Giải thích ô này" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          {showInfo ? "✕" : "ⓘ"}
        </button>
      </div>
```

bằng:

```tsx
      <div className="card-head">
        <h2>Triển vọng 1/3/6 tháng tới</h2>
        <button className="iconbtn small-btn" aria-label="Giải thích ô này" aria-expanded={showInfo} onClick={() => setShowInfo((v) => !v)}>
          {showInfo ? "✕" : "ⓘ"}
        </button>
      </div>
```

(thông tin ngày · giá · % dưới đỉnh chuyển xuống dòng ngày dưới sparkline ở Step 4).

- [ ] **Step 4: Thay slider + dòng chú thích bằng sparkline + dateband**

Thay toàn bộ khối (comment "thanh thời gian THEO THÁNG…" + `input.tm-range` + `div.tm-daterange` với 2 nút ◀▶, dòng "kéo = tháng · ◀▶ = ngày · hoặc chọn:" và date input):

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
      <div className="bdo-dateband muted small">
        <span>
          {fmtDate(p.date)}{isLatest ? " (mới nhất)" : ""} · {usd(p.price)} · −{fmt1(ddPct)}% dưới đỉnh
        </span>
        <input
          type="date"
          value={p.date}
          min={points[0].date}
          max={points[points.length - 1].date}
          aria-label="Chọn ngày chính xác"
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            let lo = 0, hi = points.length - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (points[m].date < v) lo = m + 1; else hi = m; }
            setIdx(lo);
          }}
        />
      </div>
```

Lưu ý: `isLatest`/`ddPct` ĐÃ được khai báo trước `return` của nhánh v2 (ngay sau khối fallback, dòng ~157–158) — dùng lại nguyên trạng, KHÔNG khai báo thêm.

- [ ] **Step 5: Thêm CSS sparkline/fab/dateband**

Trong `src/app/globals.css`, thêm tiếp vào block `bdo-*` (sau `.bdo-label`):

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
.bdo-dateband {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}
.bdo-dateband input[type="date"] {
  color-scheme: dark;
  background: var(--card2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 0.85rem;
  font-family: inherit;
}
.bdo-dateband input[type="date"]:focus-visible {
  outline: 1px solid var(--gold);
}
```

- [ ] **Step 6: Test + build**

Run: `npm test`
Expected: toàn bộ suite pass (test `monthAnchors`/`monthPosOf` trong `bear-downside-view.test.ts` vẫn pass vì hàm không bị xóa).

Run: `npm run build`
Expected: build thành công; lỗi "unused import" / "cannot find name 'anchors'" nghĩa là Step 1–2 làm thiếu.

- [ ] **Step 7: Commit**

```bash
git add src/components/BearDownsideCard.tsx src/app/globals.css
git commit -m "feat: BearDownsideCard — sparkline chọn ngày kiểu Máy Thời Gian thay slider-tháng (chạm/kéo + ◀▶ phiên + date picker, touch-action pan-y)"
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

- [ ] **Step 2: Checklist hành vi trên dev (viewport 375px + desktop)**

Run: `npm run dev`, mở card "Triển vọng 1/3/6 tháng tới":

1. Mobile 375px: KHÔNG scroll ngang ở bất kỳ trạng thái nào (ngày mới nhất + ngày quá khứ có ô Thực tế).
2. Chạm/kéo sparkline đổi ngày; vạch cursor đi theo; số liệu khối đổi theo ngày.
3. Vuốt DỌC bắt đầu từ trên sparkline vẫn cuộn được trang (pan-y).
4. ◀▶ nhích đúng 1 phiên, disable ở 2 biên.
5. Date picker nhảy đúng ngày (chọn ngày nghỉ → snap phiên kế tiếp).
6. Lùi về ngày cũ hơn ~6 tháng: ô "Thực tế" hiện đáy + kết thực; ngày mới nhất: ô biến mất.
7. Chọn ngày trên PriceChart (sync `asOfIdx`) vẫn đè ngày card như cũ.
8. Banner ⓘ: định nghĩa 4 cột + coverage đo được + đuôi p10 — nội dung như cũ; caveat cuối card như cũ.
9. Desktop ≥720px: 3 khối nằm ngang 1 hàng.

- [ ] **Step 3: Đối chiếu spec lần cuối**

Mở `docs/superpowers/specs/2026-07-12-bear-downside-card-v2-design.md`, đối chiếu từng mục "Thiết kế" 1–4 với hành vi thực tế. Sai lệch nào → sửa + commit `fix:`; khớp hết → xong.
