# Honest Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a live current-time clock plus an honest per-source freshness summary, and bump the cron to hourly.

**Architecture:** Cron schedule → hourly. `scripts/fetch.ts` captures a capture-time per source; `scripts/run.ts` assembles them into a new optional `Analysis.sourceTimes` map. A pure `timeAgo()` helper in `src/lib/freshness.ts` (unit-tested) renders Vietnamese relative ages. `Dashboard.tsx` shows a ticking clock + a summary line built from `sourceTimes` + `dataDate`, with a fallback to the existing `generatedAt` line when `sourceTimes` is absent.

**Tech Stack:** Next.js + TypeScript (static export), Vitest, GitHub Actions cron.

Spec: `docs/superpowers/specs/2026-06-14-honest-freshness-design.md`

---

## File Structure

- `.github/workflows/update-and-deploy.yml` — change cron to hourly (§1)
- `src/lib/types.ts` — add optional `sourceTimes` to `Analysis` (§2)
- `src/lib/freshness.ts` — **new**, pure `timeAgo(iso, nowMs)` helper (§3)
- `tests/freshness.test.ts` — **new**, unit tests for `timeAgo` (§3)
- `scripts/fetch.ts` — `fetchYahoo` returns last bar epoch (`lastTs`); propagate through `fetchXau`/`fetchDxy`/`fetchYield10y` (§2)
- `scripts/run.ts` — build `sourceTimes`, add to `analysis` object (§2)
- `src/components/Dashboard.tsx` — live clock + freshness summary line + fallback (§3)

---

## Task 1: Cron → hourly

**Files:**
- Modify: `.github/workflows/update-and-deploy.yml:6`

- [ ] **Step 1: Edit the cron line**

Replace line 6:

```yaml
    - cron: "23 1,13 * * *"
```

with:

```yaml
    # mỗi giờ, phút :23
    - cron: "23 * * * *"
```

(Delete the now-stale comment on the line above it — line 5 `# 01:23 & 13:23 UTC = 08:23 & 20:23 giờ VN`.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/update-and-deploy.yml
git commit -m "ci: chạy cron hàng giờ thay vì 2 lần/ngày"
```

---

## Task 2: `sourceTimes` data model + fetch capture

### 2a. Type field

**Files:**
- Modify: `src/lib/types.ts:37-53` (interface `Analysis`)

- [ ] **Step 1: Add the field to `Analysis`**

Insert after the `premiumPercentiles` field (currently line 52), before the closing `}`:

```ts
  /** ISO thời điểm chụp theo nguồn; null = nguồn lỗi/không có lần chạy này.
   *  world/dxy/yield10y = epoch bar ngày cuối (≈ cập nhật cuối phiên, KHÔNG phải tick live).
   *  vnGold/usdVnd = giờ fetch của ta (nguồn không có giờ server đáng tin).
   *  fed = date bar FRED cuối. */
  sourceTimes?: {
    world?: string | null;
    dxy?: string | null;
    yield10y?: string | null;
    vnGold?: string | null;
    usdVnd?: string | null;
    fed?: string | null;
  };
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): thêm Analysis.sourceTimes (độ tươi theo nguồn)"
```

### 2b. `fetchYahoo` returns last bar epoch

**Files:**
- Modify: `scripts/fetch.ts:38-75` (`fetchYahoo`, `fetchXau`, `fetchDxy`), `scripts/fetch.ts:105-113` (`fetchYield10y`)

`DailyBar` stays `{date, close}` — do NOT change it. The epoch rides alongside `bars` in the return object.

- [ ] **Step 1: Change `fetchYahoo` to also return `lastTs`**

Replace the body of `fetchYahoo` (lines 38-52) with:

```ts
async function fetchYahoo(symbol: string): Promise<{ bars: DailyBar[]; lastTs: number | null }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=20y&interval=1d`;
  const json = JSON.parse(await get(url));
  const r = json?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const closes: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const out: DailyBar[] = [];
  let lastTs: number | null = null;
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (c != null && Number.isFinite(c)) {
      out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), close: c });
      lastTs = ts[i]; // epoch (giây) của bar hợp lệ cuối
    }
  }
  if (out.length < 500) throw new Error(`yahoo ${symbol}: only ${out.length} rows`);
  return { bars: out, lastTs };
}
```

- [ ] **Step 2: Thread `lastTs` through `fetchXau`**

Replace `fetchXau` (lines 54-60):

```ts
export async function fetchXau(): Promise<{ bars: DailyBar[]; source: string; lastTs: number | null }> {
  try {
    const y = await fetchYahoo("GC=F");
    return { bars: y.bars, source: "yahoo:GC=F", lastTs: y.lastTs };
  } catch {
    return { bars: await fetchStooq("xauusd"), source: "stooq:xauusd", lastTs: null };
  }
}
```

- [ ] **Step 3: Thread `lastTs` through `fetchDxy`**

Replace `fetchDxy` (lines 62-75):

```ts
export async function fetchDxy(): Promise<{ bars: DailyBar[]; source: string; lastTs: number | null } | null> {
  try {
    const y = await fetchYahoo("DX-Y.NYB");
    return { bars: y.bars, source: "yahoo:DX-Y.NYB", lastTs: y.lastTs };
  } catch {
    for (const s of ["dx.f", "^dxy", "usdidx"]) {
      try {
        return { bars: await fetchStooq(s), source: `stooq:${s}`, lastTs: null };
      } catch {
        /* thử symbol kế tiếp */
      }
    }
    return null;
  }
}
```

- [ ] **Step 4: Thread `lastTs` through `fetchYield10y`**

Replace `fetchYield10y` (lines 105-113):

```ts
export async function fetchYield10y(): Promise<{ bars: DailyBar[]; real: boolean; source: string; lastTs: number | null } | null> {
  try {
    const y = await fetchYahoo("^TNX");
    return { bars: y.bars, real: false, source: "yahoo:^TNX", lastTs: y.lastTs };
  } catch {
    const fred = await fetchFredSeries("DFII10", 500);
    if (fred) return { bars: fred, real: true, source: "fred:DFII10", lastTs: null };
    return null;
  }
}
```

- [ ] **Step 5: Fix `fetchVix` (it also calls `fetchYahoo`)**

`fetchVix` (lines 115-121) destructures the old return shape and would break the build. VIX is a rejected signal (CLAUDE.md) but the code must still compile. Replace `fetchVix`:

```ts
export async function fetchVix(): Promise<{ bars: DailyBar[]; source: string } | null> {
  try {
    const y = await fetchYahoo("^VIX");
    return { bars: y.bars, source: "yahoo:^VIX" };
  } catch {
    return null;
  }
}
```

(`fetchGpr` does NOT use `fetchYahoo` — it reads an XLS — so it needs no change. No other caller of `fetchYahoo` exists.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. If `run.ts` errors on the new shape, that's expected — fixed in Task 2c. Confirm errors are ONLY in `run.ts` consuming `.lastTs`/old shape, not in `fetch.ts` itself.

- [ ] **Step 7: Commit**

```bash
git add scripts/fetch.ts
git commit -m "feat(fetch): trả epoch bar cuối (lastTs) cho nguồn Yahoo"
```

### 2c. Assemble `sourceTimes` in run.ts

**Files:**
- Modify: `scripts/run.ts:218-235` (the `analysis` object literal)

`fetchFedFunds()` returns `{date,value}[]` (or null). `yieldRes` now has `lastTs`. VN gold / USD-VND have no server time → use the run's wall clock, but only mark `vnGold` when a fresh VN quote was actually written today.

- [ ] **Step 1: Build a `sourceTimes` object before the `analysis` literal**

Insert immediately before `const analysis: Analysis = {` (currently line 218):

```ts
  const nowIso = new Date().toISOString();
  const tsFromEpoch = (s: number | null | undefined) =>
    s == null ? null : new Date(s * 1000).toISOString();
  const sourceTimes = {
    world: xauRes.lastTs != null ? tsFromEpoch(xauRes.lastTs) : null,
    dxy: dxyRes?.lastTs != null ? tsFromEpoch(dxyRes.lastTs) : null,
    yield10y: yieldRes?.lastTs != null ? tsFromEpoch(yieldRes.lastTs) : null,
    // vnRes ghi vào history với date=today; chỉ coi là "vừa chụp" khi fetch thành công lần này
    vnGold: vnRes && vnRes.sjcSell !== null ? nowIso : null,
    usdVnd: usdVndRes ? nowIso : null,
    fed: fedRes && fedRes.length ? fedRes[fedRes.length - 1].date : null,
  };
```

- [ ] **Step 2: Add `sourceTimes` to the `analysis` literal**

Add a line inside the `const analysis: Analysis = { ... }` object (e.g. after `premiumPercentiles: ...`):

```ts
    sourceTimes,
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Smoke-run the collector locally**

Run: `npm run collect`
Expected: completes; `public/data/analysis.json` now contains a `sourceTimes` object. Verify:

Run: `node -e "const d=require('./public/data/analysis.json'); console.log(JSON.stringify(d.sourceTimes,null,1))"`
Expected: an object with `world` (ISO string, since XAU is required) and the other keys (ISO or null).

- [ ] **Step 5: Commit**

```bash
git add scripts/run.ts public/data/
git commit -m "feat(run): điền sourceTimes vào analysis"
```

---

## Task 3: `timeAgo` helper + tests

**Files:**
- Create: `src/lib/freshness.ts`
- Test: `tests/freshness.test.ts`

`timeAgo` is pure and takes `nowMs` explicitly (no internal `Date.now()`) so tests are deterministic.

- [ ] **Step 1: Write the failing test**

Create `tests/freshness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { timeAgo } from "../src/lib/freshness";

const NOW = Date.parse("2026-06-14T10:00:00Z");

describe("timeAgo", () => {
  it("vừa xong khi dưới 1 phút", () => {
    expect(timeAgo("2026-06-14T09:59:30Z", NOW)).toBe("vừa xong");
  });
  it("phút", () => {
    expect(timeAgo("2026-06-14T09:55:00Z", NOW)).toBe("5 phút trước");
  });
  it("giờ", () => {
    expect(timeAgo("2026-06-14T08:00:00Z", NOW)).toBe("2 giờ trước");
  });
  it("ngày", () => {
    expect(timeAgo("2026-06-11T10:00:00Z", NOW)).toBe("3 ngày trước");
  });
  it("null/không hợp lệ → null", () => {
    expect(timeAgo(null, NOW)).toBeNull();
    expect(timeAgo("không-phải-ngày", NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/freshness.test.ts`
Expected: FAIL — cannot resolve `../src/lib/freshness`.

- [ ] **Step 3: Implement `freshness.ts`**

Create `src/lib/freshness.ts`:

```ts
/** Tuổi tương đối tiếng Việt của một mốc ISO so với nowMs. null nếu thiếu/không hợp lệ. */
export function timeAgo(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const sec = Math.max(0, Math.round((nowMs - t) / 1000));
  if (sec < 60) return "vừa xong";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  return `${day} ngày trước`;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/freshness.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/freshness.ts tests/freshness.test.ts
git commit -m "feat(freshness): timeAgo helper + tests"
```

---

## Task 4: Dashboard live clock + freshness summary

**Files:**
- Modify: `src/components/Dashboard.tsx` (imports ~line 3, freshness calc ~line 159, render ~line 259)

- [ ] **Step 1: Import `timeAgo` and add a ticking clock state**

Add to the React import on line 3 (already imports `useEffect, useMemo, useState` — no change needed there). Add a new import after line 8:

```ts
import { timeAgo } from "@/lib/freshness";
```

Inside the component, near the other hooks, add a clock that updates every second:

```ts
  const [nowMs, setNowMs] = useState(() => Date.parse(analysis.generatedAt));
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
```

(Seeding from `generatedAt` keeps SSR/first paint deterministic; the effect switches to real time on the client, avoiding a hydration mismatch.)

- [ ] **Step 2: Build the clock + freshness strings**

Replace the existing `freshness` block (lines 159-166) with:

```ts
  const clock = new Date(nowMs).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });

  const st = analysis.sourceTimes;
  const worldAge = st ? timeAgo(st.world, nowMs) : null;
  const vnGoldAge = st ? timeAgo(st.vnGold, nowMs) : null;
  // dataDate dạng "YYYY-MM-DD" → "DD/MM"
  const vnDateLabel = (() => {
    const p = analysis.dataDate?.split("-");
    return p && p.length === 3 ? `${p[2]}/${p[1]}` : analysis.dataDate;
  })();

  // dòng tóm tắt; fallback về generatedAt nếu thiếu sourceTimes (file data cũ)
  const freshnessFallback = new Date(analysis.generatedAt).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
```

- [ ] **Step 3: Replace the render line**

Replace line 259 (`<div className="freshness">Cập nhật: {freshness} (giờ VN)</div>`) with:

```tsx
        <div className="freshness">
          <div>Bây giờ: {clock} (giờ VN)</div>
          {st ? (
            <div className="freshness-sources">
              Số liệu thế giới:{" "}
              {worldAge ?? "không có dữ liệu"}
              {" · "}
              Giá SJC: ngày {vnDateLabel}
              {vnGoldAge ? ` (${vnGoldAge})` : ""}
            </div>
          ) : (
            <div className="freshness-sources">Cập nhật: {freshnessFallback} (giờ VN)</div>
          )}
        </div>
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS, static export succeeds.

- [ ] **Step 5: Visual sanity check (manual)**

Run: `npm run dev`, open the app.
Expected: header area near the verdict shows a clock ticking every second; below it "Số liệu thế giới: N phút/giờ trước · Giá SJC: ngày DD/MM (N ngày trước)". The clock seconds advance.

- [ ] **Step 6: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat(ui): đồng hồ live + dòng tóm tắt độ tươi theo nguồn"
```

---

## Task 5: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including the new `tests/freshness.test.ts`.

- [ ] **Step 2: Typecheck + build clean**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 3: Confirm fallback path**

Temporarily verify the old-data fallback: in a node REPL or by inspection, confirm `Dashboard` renders the `freshnessFallback` branch when `analysis.sourceTimes` is `undefined` (the `st ? ... : ...` ternary). No code change — just confirm the branch exists and typechecks. (Old `analysis.json` mid-deploy lacks `sourceTimes`; this must not crash.)

---

## Self-Review Notes

- **Spec coverage:** §1 cron → Task 1. §2 type+fetch+assemble → Task 2a/2b/2c. §3 timeAgo+clock+summary+fallback → Task 3 (helper) + Task 4 (UI). Tests → Task 3 (unit) + Task 5 (suite). All spec sections mapped.
- **No live `Date.now()` in scripts is fine** — the spec confirms the ban is workflow-script-only; `scripts/run.ts` and `fetch.ts` may use it (already do at run.ts:43).
- **Type consistency:** `lastTs` shape consistent across `fetchYahoo`/`fetchXau`/`fetchDxy`/`fetchYield10y`; `sourceTimes` keys (`world/dxy/yield10y/vnGold/usdVnd/fed`) identical in types.ts, run.ts, Dashboard.tsx. `timeAgo(iso, nowMs)` signature identical in helper, test, and Dashboard call sites.
- **Yahoo honesty:** plan states `lastTs` = last daily-bar epoch (≈ session-end), not an intraday tick — matches corrected spec.
