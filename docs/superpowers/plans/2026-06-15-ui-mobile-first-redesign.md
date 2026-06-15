# UI/UX Mobile-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the gold advisor dashboard so opening the app shows one clear action line + prices first, with all deep analysis collapsed into tap-to-open accordions — optimized for mobile.

**Architecture:** Pure presentation refactor of `src/components/Dashboard.tsx` and `src/app/globals.css`. Merge the old verdict block + ActionGuidance into one "hero" card (action sentence is biggest; a condensed `zone · điểm · gần đáy` line replaces the verbose verdict score/backtest/gauge at the top). Move preset buttons up near prices; hide weight sliders inside the ⚙ panel. Wrap the six analysis sections in native `<details>` accordions (no JS state, no new libs). No scoring/guidance/data logic changes.

**Tech Stack:** Next.js (static export), TypeScript, React, plain CSS. Tests: vitest (logic only — no DOM test harness; component changes verified by build + manual check).

---

## Testing note (read first)

There is **no component/DOM test harness** in this repo (vitest runs pure-logic tests in `tests/`; no jsdom, no React Testing Library, and the spec forbids adding libraries). Classic red-green TDD does **not** apply to this presentation refactor. Each task is therefore verified by:

1. `npm test` — existing logic tests must still pass (regression guard; this refactor must not touch any logic they cover).
2. `npm run build` — Next.js static export must compile (catches TS/JSX errors).
3. Manual check at the end (Task 5) — mobile viewport behavior.

Do **not** add jsdom / @testing-library. Do **not** modify any file under `tests/`, `src/lib/`, or `scripts/`.

## File Structure

- **Modify:** `src/app/globals.css` — add hero meta line, accordion (`details`/`summary`) styling, 2-column price grid; keep all existing classes.
- **Modify:** `src/components/ActionGuidance.tsx` — extend into the hero: accept an optional condensed `meta` line and an optional `note` ReactNode, render them inside the card.
- **Modify:** `src/components/Dashboard.tsx` — restructure the `return` JSX: single hero, 4-item price grid, top-level preset row, slimmed settings panel (weights only), six `<details>` accordions. Add two derived display values (`nearBottomLabel`, `metaLine`).
- **Untouched:** `PremiumChart.tsx`, `BottomGauges.tsx`, `TimeMachine.tsx`, `TimelineBrush.tsx`, `src/lib/*`, `tests/*`, `scripts/*`, data JSON.

---

## Task 1: Add CSS for hero meta line, accordions, and 2-column prices

**Files:**
- Modify: `src/app/globals.css` (append new rules + change `.prices` grid)

- [ ] **Step 1: Change the `.prices` grid to 2 columns on mobile**

Find this block in `src/app/globals.css`:

```css
.prices {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}
```

Replace it with (2 columns by default; wider auto-fit on ≥520px screens):

```css
.prices {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

@media (min-width: 520px) {
  .prices {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
}
```

- [ ] **Step 2: Append hero meta line + accordion styles at the end of the file**

Add this to the **end** of `src/app/globals.css`:

```css
/* ── Hero: dòng cô đọng zone · điểm · gần đáy dưới phần gợi ý ── */
.guidance-meta {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: 0.82rem;
  color: var(--muted);
}
.guidance-meta b {
  color: var(--text);
}

/* ── Accordion (details/summary) cho 6 phần phân tích ── */
.acc {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 8px;
  overflow: hidden;
}
.acc[open] {
  border-color: #e6b84c33;
}
.acc-sum {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  min-height: 44px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.acc-sum::-webkit-details-marker {
  display: none;
}
.acc-sum:hover {
  border-color: var(--gold);
}
.acc-sum-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.acc-sum-title {
  font-size: 0.98rem;
  font-weight: 600;
  color: var(--text);
}
.acc-sum-meta {
  font-size: 0.76rem;
  color: var(--muted);
}
.acc-chev {
  color: var(--muted);
  font-size: 0.8rem;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}
.acc[open] .acc-chev {
  transform: rotate(90deg);
}
.acc-body {
  padding: 0 14px 14px;
}
/* Phần chứa một component tự-đóng-khung (.card): làm phẳng để không lồng khung */
.acc-body.flat > .card {
  border: 0;
  background: none;
  padding: 0;
  margin: 0;
}
/* Mục giá phụ (XAU/USD, USD/VND) trong accordion chi tiết điểm số */
.acc-prices {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 10px;
}
```

- [ ] **Step 3: Verify the build still compiles**

Run: `npm run build`
Expected: build completes with no CSS/compile errors (CSS-only change, so this just confirms nothing broke).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "style(ui): thêm CSS hero meta line + accordion + giá 2 cột"
```

---

## Task 2: Extend ActionGuidance into the hero (accept meta line + note)

The hero is the merged verdict + guidance card. `ActionGuidance` already renders the guidance content; extend it to also render a condensed meta line and an optional safety note, so `Dashboard` can drop the separate verdict block.

**Files:**
- Modify: `src/components/ActionGuidance.tsx`

- [ ] **Step 1: Replace the whole file with the extended version**

Replace the entire contents of `src/components/ActionGuidance.tsx` with:

```tsx
"use client";
import type { ReactNode } from "react";
import type { Guidance } from "@/lib/guidance";

const LEVEL_TAG: Record<Guidance["level"], string> = {
  strong: "GOM",
  buy: "GOM",
  dca: "GOM RẢI",
  wait: "QUAN SÁT",
  "premium-wait": "CHỜ CHÊNH HẠ",
  reduce: "BỚT MUA",
};

export default function ActionGuidance({
  guidance,
  meta,
  note,
}: {
  guidance: Guidance;
  /** dòng cô đọng "zone · điểm · gần đáy" hiển thị dưới phần lý do */
  meta?: ReactNode;
  /** cảnh báo an toàn (vùng bán / preset chưa có tín hiệu) — không được giấu */
  note?: ReactNode;
}) {
  return (
    <section className={`card guidance ${guidance.tone}`}>
      <div className="card-head">
        <h2>Gợi ý hành động</h2>
        <span className={`chip ${guidance.tone}`}>{LEVEL_TAG[guidance.level]}</span>
      </div>
      <div className="guidance-when">{guidance.when}</div>
      <div className="guidance-how">{guidance.how}</div>
      <ul className="guidance-reasons">
        {guidance.reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
      {note}
      {meta && <div className="guidance-meta">{meta}</div>}
      <p className="muted small">
        Kết hợp điểm mua + săn đáy + chênh lệch VN. Hỗ trợ quyết định, KHÔNG phải khuyến nghị đầu tư.
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build completes. (`meta`/`note` are optional, so existing usage in Dashboard still type-checks until Task 3 wires them in.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ActionGuidance.tsx
git commit -m "feat(ui): ActionGuidance nhận meta line + note để thành hero"
```

---

## Task 3: Add derived display values in Dashboard

Add two memoized values used by the new hero meta line. Insert them **after** the existing `guidance` `useMemo` block (which ends at line ~152, right before `const setWeight`).

**Files:**
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Add `nearBottomLabel` and `metaLine`**

In `src/components/Dashboard.tsx`, find the line:

```tsx
  const setWeight = (k: CriterionKey, v: number) => {
```

Insert this block **immediately above** that line:

```tsx
  // nhãn xác suất gần đáy cho dòng cô đọng ở hero (khớp ngưỡng gauge 60/35)
  const nearBottomLabel = useMemo(() => {
    const c = cycleVerified ? bottom.cycle.prob : -1;
    const s = swingVerified ? bottom.swing.prob : -1;
    const best = Math.max(c, s);
    if (best < 0) return "chưa đủ dữ liệu";
    return best >= 60 ? "cao" : best >= 35 ? "trung bình" : "thấp";
  }, [cycleVerified, swingVerified, bottom]);

  const heroMeta = (
    <>
      <b>{verdictLabel}</b> · điểm{" "}
      <b>{composite > 0 ? `+${fmtNum(composite)}` : fmtNum(composite)}</b>
      {preset && ` · preset ${preset.label} (ngưỡng mua +${preset.buyThreshold})`}
      {customized && " · trọng số tùy chỉnh"} · xác suất gần đáy {nearBottomLabel}
    </>
  );
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build completes. `useMemo` is already imported (line 3); `verdictLabel`, `composite`, `preset`, `customized`, `fmtNum`, `cycleVerified`, `swingVerified`, `bottom` are all already in scope. `heroMeta` is currently unused — that's fine, Task 4 wires it in.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(ui): thêm nearBottomLabel + heroMeta cho hero"
```

---

## Task 4: Restructure the Dashboard return (hero, prices, presets, accordions)

This is the main change. Replace the entire `return (...)` JSX with the new structure. The new structure reuses every existing variable and sub-block — only the arrangement changes.

**Files:**
- Modify: `src/components/Dashboard.tsx` (the `return (` block, currently lines ~198–490)

- [ ] **Step 1: Replace the full return block**

In `src/components/Dashboard.tsx`, replace everything from `return (` down to the closing `);\n}` at the end of the component with this exact block:

```tsx
  return (
    <main className="wrap">
      <header className="top">
        <h1>
          Vùng<span className="gold">Vàng</span>
        </h1>
        <button className="iconbtn" onClick={() => setShowSettings(!showSettings)}>
          ⚙ Trọng số
        </button>
      </header>

      {analysis.stale && (
        <div className="banner warn">
          ⚠ Dữ liệu giá vàng VN cũ {analysis.staleDays} ngày — nguồn giá đang gián đoạn.
        </div>
      )}
      {analysis.warnings.map((w, i) => (
        <div key={i} className="banner info">
          {w}
        </div>
      ))}
      {presetHealth?.status === "degraded" && (
        <div className="banner warn">
          ⚠ Preset {preset!.label} đang mất phong độ trên dữ liệu mới (kiểm tra tự động mỗi
          cron) — cân nhắc dùng cấu hình mặc định hoặc chờ tuyển lại preset.
        </div>
      )}

      {/* ── HERO: câu chốt 3 giây (gộp verdict + gợi ý hành động) ── */}
      <ActionGuidance
        guidance={guidance}
        meta={heroMeta}
        note={
          <>
            {isSellZone && (
              <div className="verdict-note">
                ⚠ Cảnh báo tham khảo, KHÔNG phải khuyến nghị thoát vị thế: trong backtest 17
                năm, tín hiệu bán chỉ đúng 49% sau 1 tháng và sai tới 75% sau 12 tháng. Ý
                nghĩa thực tế: bớt mua thêm, không phải bán ra.
              </div>
            )}
            {preset && !isBuyZone && (
              <div className="verdict-note muted">
                Preset chỉ kiểm chứng tín hiệu MUA. Tín hiệu chỉ xuất hiện vài đợt mỗi năm —
                im lặng là bình thường. Bán: theo kế hoạch kỳ hạn của bạn hoặc khi chênh VN
                vượt vạch đỏ p80 ở biểu đồ bên dưới.
              </div>
            )}
          </>
        }
      />

      {/* ── GIÁ: 4 ô chính, mở sẵn ── */}
      <section className="prices">
        <div className="price-item">
          <span>SJC mua / bán</span>
          <b>
            {fmtMoney(analysis.prices.sjcBuy)} / {fmtMoney(analysis.prices.sjcSell)}
          </b>
        </div>
        <div className="price-item">
          <span>Nhẫn mua / bán</span>
          <b>
            {fmtMoney(analysis.prices.ringBuy)} / {fmtMoney(analysis.prices.ringSell)}
          </b>
        </div>
        <div className="price-item">
          <span>Thế giới quy đổi</span>
          <b>{fmtMoney(analysis.prices.worldVndPerLuong)}/lượng</b>
        </div>
        <div className="price-item">
          <span>Chênh VN−TG</span>
          <b>
            {fmtNum(analysis.prices.premiumPct)}% ({fmtMoney(analysis.prices.premiumVnd)})
          </b>
        </div>
      </section>

      {/* ── PRESET: hàng chọn chế độ, gần đầu ── */}
      <div className="preset-row">
        <button
          className={`iconbtn ${!preset && !customized ? "active" : ""}`}
          onClick={() => applyPreset(null)}
        >
          Toàn cảnh
        </button>
        {PRESETS.map((p) => {
          const hStatus = health.items.find((i) => i.presetId === p.id)?.status;
          return (
            <button
              key={p.id}
              className={`iconbtn ${preset?.id === p.id ? "active" : ""}`}
              onClick={() => applyPreset(p.id)}
              title={`Đúng ${p.evidence.trainFav}% (2009–2018) / ${p.evidence.testFav}% (2019–2026)`}
            >
              {hStatus === "degraded" ? "⚠ " : ""}
              {p.label}
            </button>
          );
        })}
      </div>

      {/* ── PANEL ⚙: chỉ còn slider trọng số ── */}
      {showSettings && (
        <section className="card settings">
          <h2>Trọng số tiêu chí</h2>
          <p className="muted small">
            <b>Toàn cảnh</b> = radar 4 nhóm tiêu chí (duy nhất có tiêu chí chênh lệch VN
            25% và cảnh báo bán) — dùng để hiểu thị trường. <b>Preset</b> = cò súng MUA
            theo kỳ hạn, tuyển bằng grid search 17 năm, thắng baseline ở cả 2 giai đoạn
            độc lập — dùng để quyết định gom mua. Chi tiết: docs/presets.md.
          </p>
          <p className="muted">
            Điểm tổng hợp tính lại ngay theo trọng số bạn chọn. Lưu trên máy bạn. Kéo
            slider sẽ thoát chế độ preset. Lưu ý: bảng % kiểm chứng tính theo trọng số mặc định.
          </p>
          {analysis.criteria.map((c) => (
            <label key={c.key} className="slider-row">
              <span>
                {c.label} — {Math.round(weights[c.key] * 100)}%
              </span>
              <input
                type="range"
                min={0}
                max={50}
                value={Math.round(weights[c.key] * 100)}
                onChange={(e) => setWeight(c.key, Number(e.target.value) / 100)}
              />
            </label>
          ))}
        </section>
      )}

      {/* ── ACCORDION 1: Chi tiết điểm số (gauge + kiểm chứng + giá phụ + freshness) ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Chi tiết điểm số</span>
            <span className="acc-sum-meta">thước đo · kiểm chứng · giá phụ</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          <div className="gauge">
            <div className="gauge-track">
              <div className="gauge-zero" />
              <div
                className="gauge-needle"
                style={{ left: `${((composite + 100) / 200) * 100}%` }}
              />
            </div>
            <div className="gauge-scale">
              <span>−100 bán</span>
              <span>0</span>
              <span>mua +100</span>
            </div>
          </div>
          {preset ? (
            <div className="verdict-bt">
              Kiểm chứng preset ({preset.horizonDays === 21 ? "1 tháng" : preset.horizonDays === 63 ? "3 tháng" : "6 tháng"}):
              tín hiệu mua đúng <b>{fmtNum(preset.evidence.trainFav)}%</b> giai đoạn 2009–2018 (n={preset.evidence.trainN})
              và <b>{fmtNum(preset.evidence.testFav)}%</b> giai đoạn 2019–2026 (n={preset.evidence.testN}),
              so với mua ngày bất kỳ {fmtNum(preset.evidence.trainBaseline)}% / {fmtNum(preset.evidence.testBaseline)}%.
              {presetHealth?.testFavCi95 && (
                <>
                  {" "}Khoảng tin cậy 95% (bootstrap, đã tính tín hiệu bắn chùm):{" "}
                  <b>
                    {fmtNum(presetHealth.testFavCi95[0])}–{fmtNum(presetHealth.testFavCi95[1])}%
                  </b>
                  .
                </>
              )}
            </div>
          ) : bt63 && bt63.pctFavorable !== null ? (
            <div className="verdict-bt">
              Kiểm chứng lịch sử: tín hiệu &quot;{ZONE_LABELS[zone]}&quot; xuất hiện{" "}
              <b>{bt63.count}</b> lần, <b>{fmtNum(bt63.pctFavorable)}%</b> diễn biến thuận chiều
              sau 3 tháng (trung vị {bt63.medianReturnPct! >= 0 ? "+" : ""}
              {fmtNum(bt63.medianReturnPct)}%).
            </div>
          ) : (
            <div className="verdict-bt muted">
              Vùng trung lập — không có khuyến nghị hành động. Chờ tín hiệu rõ hơn.
            </div>
          )}
          <div className="acc-prices">
            <div className="price-item">
              <span>XAU/USD</span>
              <b>${fmtNum(analysis.prices.xauUsd, 0)}</b>
            </div>
            <div className="price-item">
              <span>USD/VND</span>
              <b>{fmtNum(analysis.prices.usdVnd, 0)}</b>
            </div>
          </div>
          <div className="freshness">
            {mounted ? (
              <>
                <div>Bây giờ: {clock} (giờ VN)</div>
                {st ? (
                  <div className="freshness-sources">
                    Số liệu thế giới (phiên gần nhất):{" "}
                    {worldAge ?? "không có dữ liệu"}
                    {" · "}
                    Giá SJC: ngày {vnDateLabel}
                    {vnGoldAge ? ` (${vnGoldAge})` : ""}
                  </div>
                ) : (
                  <div className="freshness-sources">Cập nhật: {freshnessFallback} (giờ VN)</div>
                )}
              </>
            ) : (
              <div className="freshness-sources">Cập nhật: {freshnessFallback} (giờ VN)</div>
            )}
            {mounted && isGoldMarketClosed(nowMs) && (
              <div className="freshness-note muted">
                Thị trường vàng thế giới nghỉ cuối tuần — đây là phiên gần nhất, không phải dữ liệu cũ.
              </div>
            )}
          </div>
        </div>
      </details>

      {/* ── ACCORDION 2: 4 nhóm tiêu chí ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">4 nhóm tiêu chí</span>
            <span className="acc-sum-meta">kỹ thuật · chênh VN · vĩ mô · thống kê</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          {analysis.criteria.map((c: CriterionResult) => (
            <section key={c.key} className="card">
              <div className="card-head">
                <h2>{c.label}</h2>
                <div className="card-score">
                  {scoreChip(Math.round(c.score * 10) / 10)}
                  <span className="muted"> trọng số {Math.round(weights[c.key] * 100)}%</span>
                </div>
              </div>
              {c.provisional && (
                <div className="banner info small">
                  Đang dùng ngưỡng tham chiếu — dữ liệu chênh lệch tự thu thập mới{" "}
                  {analysis.vnHistoryDays} ngày, cần ≥ 90 ngày để so theo lịch sử thật.
                </div>
              )}
              <ul className="signals">
                {c.signals.map((s) => (
                  <li key={s.id} className={s.available ? "" : "muted"}>
                    {scoreChip(s.score)}
                    <div>
                      <div className="sig-label">{s.label}</div>
                      <div className="sig-expl">{s.explanation}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </details>

      {/* ── ACCORDION 3: Kiểm chứng lịch sử (backtest) ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Kiểm chứng lịch sử</span>
            <span className="acc-sum-meta">backtest đa kỳ hạn</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body">
          <p className="muted small">
            {backtest.note} Giai đoạn {backtest.fromDate} → {backtest.toDate},{" "}
            {backtest.observations.toLocaleString("vi-VN")} quan sát.
          </p>
          <div className="bt-table-wrap">
            <table className="bt-table">
              <thead>
                <tr>
                  <th>Tín hiệu</th>
                  <th>Kỳ hạn</th>
                  <th>Số lần</th>
                  <th>% thuận chiều</th>
                  <th>Trung vị</th>
                </tr>
              </thead>
              <tbody>
                {backtest.buckets
                  .filter((b) => b.count > 0)
                  .map((b) => (
                    <tr
                      key={`${b.zone}-${b.horizonDays}`}
                      className={b.zone === zone ? "hl" : ""}
                    >
                      <td className={zoneClass(b.zone)}>{ZONE_LABELS[b.zone]}</td>
                      <td>{b.horizonDays === 21 ? "1 tháng" : b.horizonDays === 63 ? "3 tháng" : "6 tháng"}</td>
                      <td>{b.count}</td>
                      <td>{b.pctFavorable === null ? "—" : `${fmtNum(b.pctFavorable)}%`}</td>
                      <td>
                        {b.medianReturnPct === null
                          ? "—"
                          : `${b.medianReturnPct >= 0 ? "+" : ""}${fmtNum(b.medianReturnPct)}%`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      {/* ── ACCORDION 4: Chênh lệch VN−Thế giới ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Chênh lệch VN−Thế giới</span>
            <span className="acc-sum-meta">biểu đồ + vạch p80</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <PremiumChart analysis={analysis} />
        </div>
      </details>

      {/* ── ACCORDION 5: Săn đáy ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Săn đáy</span>
            <span className="acc-sum-meta">đáy chu kỳ + đáy sóng</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <BottomGauges bottom={bottom} />
        </div>
      </details>

      {/* ── ACCORDION 6: Máy thời gian ── */}
      <details className="acc">
        <summary className="acc-sum">
          <span className="acc-sum-text">
            <span className="acc-sum-title">Máy thời gian</span>
            <span className="acc-sum-meta">tua lại lịch sử</span>
          </span>
          <span className="acc-chev">▸</span>
        </summary>
        <div className="acc-body flat">
          <TimeMachine timeline={timeline} weights={weights} preset={preset} confirmedBottoms={bottom.confirmedBottoms} />
        </div>
      </details>

      <footer className="disclaimer">
        Công cụ hỗ trợ quyết định dựa trên thống kê quá khứ — không phải khuyến nghị đầu tư,
        không đảm bảo kết quả tương lai. Quyết định và rủi ro thuộc về bạn.
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build completes with no errors. All referenced variables (`guidance`, `heroMeta`, `isSellZone`, `isBuyZone`, `preset`, `analysis`, `customized`, `weights`, `showSettings`, `setShowSettings`, `setWeight`, `applyPreset`, `PRESETS`, `health`, `composite`, `presetHealth`, `bt63`, `zone`, `ZONE_LABELS`, `mounted`, `clock`, `st`, `worldAge`, `vnDateLabel`, `vnGoldAge`, `freshnessFallback`, `nowMs`, `isGoldMarketClosed`, `backtest`, `zoneClass`, `scoreChip`, `fmtNum`, `fmtMoney`, `timeline`) are already declared in the component body and now used.

- [ ] **Step 3: Verify no dead references remain**

Run: `npm run lint`
Expected: no "unused variable" errors. (`verdictLabel` is now used only via `heroMeta`; `rawZone`/`zone`/`isSellZone`/`isBuyZone` all still used. If lint flags `ZONE_LABELS` or any var as unused, that var's usage was dropped — re-check the block above.)

- [ ] **Step 4: Run logic tests (regression)**

Run: `npm test`
Expected: all existing tests pass (no logic touched).

- [ ] **Step 5: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(ui): bố cục mobile-first — hero, giá 4 ô, preset đầu, 6 accordion gập sẵn"
```

---

## Task 5: Manual verification on mobile + desktop

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed URL (usually `http://localhost:3000`).

- [ ] **Step 2: Mobile viewport check**

In browser devtools, set viewport to ~375×667 (iPhone SE). Confirm:
- Hero shows the action sentence (`guidance.when`) as the largest text, the level tag chip, the `how` text, the reasons list, then the condensed `zone · điểm · ... · xác suất gần đáy` meta line.
- The 4-item price grid is exactly 2 columns, no horizontal scroll.
- Preset buttons appear right under prices and switch mode on tap (the meta line's preset label updates).
- All six accordions are **closed** on load. Tapping a summary opens it; the chevron rotates. Each summary tap target is comfortably tappable.
- Opening "Chênh lệch VN−Thế giới", "Săn đáy", "Máy thời gian" renders the charts/SVGs correctly (no zero-width/blank charts). In "Máy thời gian", dragging the brush and clicking the timeline still works.
- Tapping "⚙ Trọng số" shows **only** the weight sliders (no preset buttons inside). Dragging a slider exits preset mode and recomputes the score in the hero meta line.

- [ ] **Step 3: Safety-note check**

Temporarily verify the sell-zone / preset-no-signal notes still appear inside the hero when applicable. If current live data is a buy/neutral zone and you cannot trigger a sell note naturally, confirm by reading the rendered hero: the `note` slot is wired (Task 4) and renders above the meta line. (No data edits — just confirm the markup path exists.)

- [ ] **Step 4: Desktop check**

Resize to ≥760px wide. Confirm the layout is still coherent: prices spread via auto-fit, hero readable, accordions full-width.

- [ ] **Step 5: Stop the dev server**

Stop `npm run dev` (Ctrl+C).

- [ ] **Step 6: Final confirmation commit (if any tweaks were needed)**

If Step 2–4 required CSS/JSX fixes, commit them:

```bash
git add -A
git commit -m "fix(ui): chỉnh sau kiểm tra tay mobile/desktop"
```

If no fixes were needed, skip this step.

---

## Self-Review

**Spec coverage:**
- Mục tiêu A (giảm tải) → hero + accordions closed (Task 4). ✓
- Mục tiêu D (mobile-first) → 2-col prices, 44px tap targets, viewport check (Tasks 1, 4, 5). ✓
- Câu chốt = gợi ý hành động → hero is `ActionGuidance` at top (Task 4). ✓
- Hero gộp verdict + guidance, condensed `zone · điểm · gần đáy`, gauge gập → `heroMeta` + gauge moved to accordion 1 (Tasks 3, 4). ✓
- verdict-note giữ trong hero → `note` prop (Tasks 2, 4). ✓
- Mở sẵn: hero + giá → both outside `<details>` (Task 4). ✓
- Giá 4 ô 2 cột; XAU/USD + USD/VND xuống accordion → main grid 4 items + `.acc-prices` in accordion 1 (Tasks 1, 4). ✓
- Preset gần đầu; slider trong ⚙ → preset-row under prices, settings panel weights-only (Task 4). ✓
- 6 accordion `<details>` gập sẵn, no JS state, no libs → native details (Task 4). ✓
- SVG safe when closed → confirmed in spec; verified in Task 5 Step 2. ✓
- No tab/theme/lib changes → none added. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `ActionGuidance` new props `meta?: ReactNode`, `note?: ReactNode` (Task 2) match usage in Task 4. `heroMeta` (ReactNode) and `nearBottomLabel` (string) defined in Task 3, consumed in Task 4. `fmtNum`/`fmtMoney`/`scoreChip`/`zoneClass` signatures unchanged. ✓
