# Timeline Latest Bar + Sim-Day Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the simulated-history timeline always include the latest trading bar, label the Time Machine's sim-day vs today, and annotate the freshness line when the world gold market is closed for the weekend.

**Architecture:** `scripts/backtest.ts` builds the timeline by stepping every 3 bars; we append the final bar index so the last point matches `analysis.dataDate`. The Time Machine UI gets two small label tweaks. A new pure `isGoldMarketClosed(nowMs)` helper in `src/lib/freshness.ts` drives a weekend note in the Dashboard. All UI hooks already exist; this is additive.

**Tech Stack:** Next.js + TypeScript (static export), Vitest.

Spec: `docs/superpowers/specs/2026-06-14-timeline-latest-bar-design.md`

---

## File Structure

- `scripts/backtest.ts` — include the final bar index in the timeline loop (Part 1)
- `tests/engine.test.ts` — regression assertion: last timeline point = last bar date (Part 1)
- `src/lib/freshness.ts` — new pure `isGoldMarketClosed(nowMs)` helper (Part 3)
- `tests/freshness.test.ts` — unit tests for the helper (Part 3)
- `src/components/TimeMachine.tsx` — "(mới nhất)" label + pointer to live guidance (Part 2)
- `src/components/Dashboard.tsx` — weekend market-closed note (Part 3)

---

## Task 1: Timeline includes the latest bar

**Files:**
- Modify: `scripts/backtest.ts:62` (the observation loop)
- Test: `tests/engine.test.ts:262` (existing `describe("backtest")`)

**Background:** The loop at `scripts/backtest.ts:62` is `for (let i = WARMUP; i < closes.length; i += STEP)` with `STEP = 3`. When the last bar's index is not on the step grid, it is skipped, so the final timeline point is up to 2 trading days stale. We append the final index. The loop body uses monotonically-increasing pointers (`dxyPtr`, `fedPtr`, etc.) that depend only on `date` increasing — appending the final (largest) index keeps `date` monotonic, so those pointers stay correct. The final bar's forward `returns` are all null (the `if (i + h >= closes.length) continue` guard at line 121), so it adds zero entries to the `returns` map and does NOT change any backtest bucket. `observations++` is inside the loop body (line 117), so `timeline.points.length === bt.observations` still holds.

- [ ] **Step 1: Write the failing regression test**

Add this test inside the existing `describe("backtest", () => { ... })` block in `tests/engine.test.ts` (e.g. right after the first `it(...)` that ends at line 294):

```ts
  it("timeline's last point is the final bar even when off the step grid", () => {
    // 1400 bars: with WARMUP=756, STEP=3 the last grid index is 1398, so the
    // true last bar (1399) is off-grid and must be appended.
    const bars = range(1400, (i) => ({
      date: new Date(Date.UTC(2019, 0, 1) + i * 86400000).toISOString().slice(0, 10),
      close: 1500 + 300 * Math.sin(i / 80) + i * 0.1,
    }));
    const { backtest: bt, timeline } = runBacktest(bars, null, null);
    const lastBarDate = bars[bars.length - 1].date;
    expect(timeline.points[timeline.points.length - 1].date).toBe(lastBarDate);
    // appended point has no future data
    expect(timeline.points[timeline.points.length - 1].returns["21"]).toBeNull();
    // points count still tracks observations exactly
    expect(timeline.points.length).toBe(bt.observations);
  });
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `npx vitest run tests/engine.test.ts -t "final bar even when off the step grid"`
Expected: FAIL — `timeline.points[last].date` is `2022-10-30`-ish (index 1398), not the index-1399 date. Confirm the failure is the date mismatch (not a crash).

- [ ] **Step 3: Implement — append the final index**

In `scripts/backtest.ts`, replace the loop header at line 62:

```ts
  for (let i = WARMUP; i < closes.length; i += STEP) {
```

with an explicit index list that appends the final bar, keeping the loop body unchanged:

```ts
  const idxs: number[] = [];
  for (let i = WARMUP; i < closes.length; i += STEP) idxs.push(i);
  if (idxs.length && idxs[idxs.length - 1] !== closes.length - 1) idxs.push(closes.length - 1);
  for (const i of idxs) {
```

(Everything inside the loop body stays exactly as-is. The closing brace of the loop is unchanged.)

- [ ] **Step 4: Run the new test, verify it PASSES**

Run: `npx vitest run tests/engine.test.ts -t "final bar even when off the step grid"`
Expected: PASS.

- [ ] **Step 5: Run the whole engine test file (no regressions)**

Run: `npx vitest run tests/engine.test.ts`
Expected: PASS — all tests, including the existing "runs on synthetic series and produces sane buckets" (which asserts `timeline.points.length === bt.observations` and `lastP.returns["126"]` is null — both still hold) and "includes the macro criterion when DXY is present but Fed is missing".

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/backtest.ts tests/engine.test.ts
git commit -m "fix(backtest): timeline gồm bar giao dịch mới nhất (không rớt do bước-3)"
```

---

## Task 2: Time Machine — label sim-day vs today

**Files:**
- Modify: `src/components/TimeMachine.tsx:405` (sim-day label), `src/components/TimeMachine.tsx:423-426` (history note)

**Background:** `idx` defaults to `points.length - 1` (TimeMachine.tsx:79). After Task 1 that last point is the latest real bar, but we still want to make clear it's the end of the simulated history, not the live "today" signal. `idx` and `points` are both in scope in the render body. No structural change.

- [ ] **Step 1: Add "(mới nhất)" suffix to the sim-day label**

In `src/components/TimeMachine.tsx`, replace line 405:

```tsx
            <div className="muted small">Ngày giả lập</div>
```

with:

```tsx
            <div className="muted small">Ngày giả lập{idx === points.length - 1 ? " (mới nhất)" : ""}</div>
```

- [ ] **Step 2: Point the history-mode note to the live guidance**

In `src/components/TimeMachine.tsx`, replace the paragraph at lines 423-426:

```tsx
        <p className="muted small">
          Ở chế độ lịch sử: chỉ tín hiệu thế giới (điểm mua + nhóm điểm đáy past-only);
          chênh lệch VN không tham gia backtest.
        </p>
```

with:

```tsx
        <p className="muted small">
          Ở chế độ lịch sử: chỉ tín hiệu thế giới (điểm mua + nhóm điểm đáy past-only);
          chênh lệch VN không tham gia backtest. Tín hiệu cho hôm nay xem ở
          <b> Gợi ý hành động</b> đầu trang.
        </p>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/TimeMachine.tsx
git commit -m "feat(ui): nhãn 'ngày giả lập (mới nhất)' + trỏ tới Gợi ý hành động live"
```

---

## Task 3: Weekend market-closed note

**Files:**
- Modify: `src/lib/freshness.ts` (add `isGoldMarketClosed`)
- Test: `tests/freshness.test.ts` (existing file)
- Modify: `src/components/Dashboard.tsx` (import + render note)

**Background:** World gold (GC=F) trades Sunday 22:00 UTC → Friday 21:00 UTC. It is closed all of Saturday and Sunday before 22:00 UTC. During those windows the "Số liệu thế giới (phiên gần nhất)" age is genuinely large (16–60h) and must not read as broken. (Note: the Sunday reopen is 18:00 ET, which is 22:00 UTC during US summer DST and 23:00 UTC in winter; we use 22:00 UTC — a ~1h edge in winter is acceptable for this free PWA, and the dominant case, all of Saturday + Sunday, is exact.)

- [ ] **Step 1: Write the failing test**

Add this block to `tests/freshness.test.ts`. First add the import — the file currently has `import { timeAgo } from "../src/lib/freshness";`; change it to:

```ts
import { timeAgo, isGoldMarketClosed } from "../src/lib/freshness";
```

Then add a new `describe` block (e.g. after the existing `describe("timeAgo", ...)`):

```ts
describe("isGoldMarketClosed", () => {
  it("thứ Bảy → đóng (cả ngày)", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-13T10:00:00Z"))).toBe(true);
  });
  it("Chủ Nhật trước 22:00 UTC → đóng", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-14T21:00:00Z"))).toBe(true);
  });
  it("Chủ Nhật từ 22:00 UTC → đã mở lại", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-14T23:00:00Z"))).toBe(false);
  });
  it("thứ Sáu → mở", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-12T10:00:00Z"))).toBe(false);
  });
  it("thứ Hai → mở", () => {
    expect(isGoldMarketClosed(Date.parse("2026-06-15T10:00:00Z"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `npx vitest run tests/freshness.test.ts`
Expected: FAIL — `isGoldMarketClosed` is not exported (import error / not a function).

- [ ] **Step 3: Implement the helper**

Append to `src/lib/freshness.ts`:

```ts
/** Vàng thế giới (GC=F) đóng cửa: T7 cả ngày + CN trước 22:00 UTC (giờ mở lại). */
export function isGoldMarketClosed(nowMs: number): boolean {
  const d = new Date(nowMs);
  const dow = d.getUTCDay(); // 0=CN, 6=T7
  if (dow === 6) return true;
  if (dow === 0 && d.getUTCHours() < 22) return true;
  return false;
}
```

- [ ] **Step 4: Run the test, verify it PASSES**

Run: `npx vitest run tests/freshness.test.ts`
Expected: PASS (the existing `timeAgo` tests plus the 5 new `isGoldMarketClosed` tests).

- [ ] **Step 5: Wire the note into the Dashboard**

In `src/components/Dashboard.tsx`, update the import at line 9:

```ts
import { timeAgo } from "@/lib/freshness";
```

to:

```ts
import { timeAgo, isGoldMarketClosed } from "@/lib/freshness";
```

Then, in the `<div className="freshness">` block, add the weekend note as the last child INSIDE that div, still gated on `mounted` (so it matches the client-only clock and avoids hydration mismatch). The current block ends like this (around lines 289-308):

```tsx
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
        </div>
```

Add the note right after the closing `)}` of the `mounted ? ... : ...` expression and before the `</div>` that closes `.freshness`:

```tsx
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
            <div className="freshness-note muted small">
              Thị trường vàng thế giới nghỉ cuối tuần — đây là phiên gần nhất, không phải dữ liệu cũ.
            </div>
          )}
        </div>
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && rm -rf out && npm run build`
Expected: PASS, static export succeeds. (If you hit an `EBUSY: ... rmdir 'out'` error, that is an unrelated environment lock from a leftover local file server — confirm the build COMPILED and generated all pages before the rmdir step, and check for a stray `python -m http.server`/`next start` process holding `out/`.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/freshness.ts tests/freshness.test.ts src/components/Dashboard.tsx
git commit -m "feat(freshness): chú thích thị trường vàng nghỉ cuối tuần"
```

---

## Task 4: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS. Test count = previous 108 + 1 (backtest regression) + 5 (isGoldMarketClosed) = 114.

- [ ] **Step 2: Typecheck + build clean**

Run: `npx tsc --noEmit && rm -rf out && npm run build`
Expected: PASS.

- [ ] **Step 3: (Optional) Regenerate data to see the latest bar in timeline**

Run: `npm run collect` (makes live network calls; may fail offline — that's fine, the next cron regenerates).
If it succeeds, verify the timeline's last point matches the analysis dataDate:

```bash
node -e "const t=require('./public/data/timeline.json'); const a=require('./public/data/analysis.json'); const p=t.points; console.log('timeline last:', p[p.length-1].date, '| analysis.dataDate:', a.dataDate);"
```
Expected: the two dates match.

If collect succeeded and regenerated data, commit it:
```bash
git add public/data/
git commit -m "data: tái sinh timeline có bar mới nhất"
```
If collect failed (network), skip this commit; `git checkout public/data/` to discard any partial file.

---

## Self-Review Notes

- **Spec coverage:** Part 1 (timeline latest bar) → Task 1. Part 2 (sim-day labels) → Task 2. Part 3 (`isGoldMarketClosed` + weekend note) → Task 3. Verification → Task 4. All spec sections mapped.
- **No test breakage from Task 1:** `observations++` is inside the loop body, so `points.length === observations` still holds after appending one point; the appended point's `returns` are all null so backtest buckets are unchanged; the existing assertion `lastP.returns["126"]` toBeNull still holds (the appended last bar has null future returns).
- **Type consistency:** `isGoldMarketClosed(nowMs: number): boolean` — same signature in helper, test import, and Dashboard call site. `timeAgo` import extended, not replaced.
- **Pointer safety in Task 1:** the appended index is the largest index (final bar), so `date` stays monotonically increasing across the loop; the `dxyPtr`/`fedPtr`/`yieldPtr`/`vixPtr`/`gprPtr` advance-while-`date`-increases logic remains correct.
- **Hydration safety in Task 3:** the weekend note is gated on `mounted` like the live clock, so server-prerendered HTML (static export) doesn't include time-dependent content.
