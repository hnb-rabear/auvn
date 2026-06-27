# Bear DCA Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay thế AccumulationCard bằng BearDcaCard với engine 2 chế độ (DEPTH khi sụp cấp tính, BOOST khi bình thường) + BH timing.

**Architecture:** Tính toán tại collect-time (scripts/run.ts), ghi bear-dca.json; PWA đọc JSON tĩnh. Engine mới trong src/lib/bear-dca.ts, types trong src/lib/types.ts, component thay AccumulationCard trong Dashboard.

**Tech Stack:** TypeScript, Next.js static export, Vitest.

## Global Constraints

- UI text: tiếng Việt
- Tất cả tính toán tại collect-time, không tại page load
- Không thêm external API hay paid service
- Giữ AccumulationCard cũ và accumulation.json — không xóa, chỉ swap trong Dashboard
- Bear threshold: dd từ rolling ATH ≥ 15%
- Acute threshold: ddChange (21 phiên) > 0.03 (>3pp/tháng)
- DEPTH bậc thang: dd≥40%→×1.5, dd≥25%→×1.0, dd≥15%→×0.75, dd<15%→×0.5
- BOOST bậc thang: pct2y<25%→×1.5, pct2y<50%→×1.0, pct2y<75%→×0.75, pct2y≥75%→×0.5

---

## File Map

| File | Thay đổi |
|---|---|
| `src/lib/types.ts` | Thêm `BearDcaPoint`, `BearDcaAnalysis`, `BearDcaHealth` |
| `src/lib/bear-dca.ts` | Tạo mới — engine + monitor |
| `src/lib/bear-dca.test.ts` | Tạo mới — unit tests |
| `scripts/run.ts` | Gọi `runBearDca`, ghi `bear-dca.json` + `bear-dca-health.json` |
| `public/data/bear-dca.json` | Tạo mới (generated) |
| `public/data/bear-dca-health.json` | Tạo mới (generated) |
| `src/components/BearDcaCard.tsx` | Tạo mới — thay AccumulationCard |
| `src/components/Dashboard.tsx` | Swap import + prop |
| `src/app/page.tsx` | Import 2 JSON mới, pass vào Dashboard |

---

## Task 1: Types

**Files:**
- Modify: `src/lib/types.ts` (cuối file, sau `AccumulationHealth`)

**Interfaces:**
- Produces: `BearDcaPoint`, `BearDcaAnalysis`, `BearDcaHealth` — dùng bởi Task 2 và Task 4

- [ ] **Bước 1: Thêm types vào cuối `src/lib/types.ts`**

```typescript
export interface BearDcaPoint {
  date: string;
  price: number;
  pricePct2y: number | null; // từ accumulation engine (win=504)
  cycleProb: number | null;  // từ timeline
  swingProb: number | null;
}

export type BearDcaMode = "bull" | "normal" | "acute";

export interface BearDcaAnalysis {
  generatedAt: string;
  dataDate: string;
  isBear: boolean;           // ddFromAth >= 0.15
  ddFromAth: number;         // 0..1, rolling ATH
  ddChange: number;          // dd hôm nay - dd 21 phiên trước (pp/tháng)
  isAcute: boolean;          // ddChange > 0.03
  pricePct2y: number | null;
  mult: number;              // ∈ {0.5, 0.75, 1.0, 1.5}
  mode: BearDcaMode;
  bhFiredThisCycle: boolean; // BH bắn trong 21 phiên gần nhất
  note: string;              // giải thích tiếng Việt
}

export interface BearDcaHealth {
  generatedAt: string;
  recentImprPct: number | null; // % cải thiện giá vốn vs BASE trên ~2 năm gần nhất
  status: "ok" | "degraded" | "insufficient";
}
```

- [ ] **Bước 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: không lỗi mới.

- [ ] **Bước 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(bear-dca): add BearDcaPoint/Analysis/Health types"
```

---

## Task 2: Engine

**Files:**
- Create: `src/lib/bear-dca.ts`
- Create: `src/lib/bear-dca.test.ts`

**Interfaces:**
- Consumes: `BearDcaPoint`, `BearDcaAnalysis`, `BearDcaHealth` từ Task 1; `pricePct2y` từ `src/lib/accumulation.ts` (đã có, tái dùng)
- Produces:
  - `depthQty(dd: number): number`
  - `boostQty(pct2y: number): number`
  - `runBearDca(points: BearDcaPoint[]): BearDcaAnalysis`
  - `monitorBearDca(points: BearDcaPoint[]): BearDcaHealth`

- [ ] **Bước 1: Viết failing tests**

Tạo `src/lib/bear-dca.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { depthQty, boostQty, runBearDca } from "./bear-dca";
import type { BearDcaPoint } from "./types";

describe("depthQty", () => {
  it("dd<15% → 0.5", () => expect(depthQty(0.10)).toBe(0.5));
  it("dd=15% → 0.75", () => expect(depthQty(0.15)).toBe(0.75));
  it("dd=25% → 1.0", () => expect(depthQty(0.25)).toBe(1.0));
  it("dd=40% → 1.5", () => expect(depthQty(0.40)).toBe(1.5));
  it("dd=50% → 1.5", () => expect(depthQty(0.50)).toBe(1.5));
});

describe("boostQty", () => {
  it("pct2y<25% → 1.5", () => expect(boostQty(0.10)).toBe(1.5));
  it("pct2y=25% → 1.0", () => expect(boostQty(0.25)).toBe(1.0));
  it("pct2y=50% → 0.75", () => expect(boostQty(0.50)).toBe(0.75));
  it("pct2y=75% → 0.5", () => expect(boostQty(0.75)).toBe(0.5));
  it("pct2y=1.0 → 0.5", () => expect(boostQty(1.0)).toBe(0.5));
});

describe("runBearDca", () => {
  // 600 phiên giá tăng đều từ 1000 → 4000 (bull)
  const bullPts: BearDcaPoint[] = Array.from({ length: 600 }, (_, i) => ({
    date: `2020-01-${String(i % 28 + 1).padStart(2, "0")}`,
    price: 1000 + i * 5,
    pricePct2y: 0.9,
    cycleProb: null,
    swingProb: null,
  }));

  it("bull: isBear=false khi dd<15%", () => {
    const r = runBearDca(bullPts);
    expect(r.isBear).toBe(false);
    expect(r.mode).toBe("bull");
  });

  // 600 phiên: 300 tăng từ 1000→4000, 300 giảm từ 4000→2400 (bear -40%)
  const bearPts: BearDcaPoint[] = [
    ...Array.from({ length: 300 }, (_, i) => ({
      date: `d${String(i).padStart(4, "0")}`,
      price: 1000 + i * 10,
      pricePct2y: 0.8,
      cycleProb: null, swingProb: null,
    })),
    ...Array.from({ length: 300 }, (_, i) => ({
      date: `d${String(300 + i).padStart(4, "0")}`,
      price: 4000 - i * 5.3,
      pricePct2y: 0.7,
      cycleProb: null, swingProb: null,
    })),
  ];

  it("bear: isBear=true khi dd>=15%", () => {
    const r = runBearDca(bearPts);
    expect(r.isBear).toBe(true);
  });

  it("acute: isAcute=true khi sụp nhanh (dùng bearPts ngay đầu sụp)", () => {
    // Tạo 550 phiên: 500 tăng rồi 50 sụp -30% nhanh
    const pts: BearDcaPoint[] = [
      ...Array.from({ length: 500 }, (_, i) => ({
        date: `u${i}`, price: 1000 + i, pricePct2y: 0.5, cycleProb: null, swingProb: null,
      })),
      ...Array.from({ length: 50 }, (_, i) => ({
        date: `d${i}`, price: 1500 - i * 10, pricePct2y: 0.7, cycleProb: null, swingProb: null,
      })),
    ];
    const r = runBearDca(pts);
    // dd trong 21 phiên cuối tăng mạnh
    expect(r.isBear).toBe(true);
    expect(typeof r.ddChange).toBe("number");
  });

  it("bhFiredThisCycle=true khi có cycleProb>=60 trong 21 phiên cuối", () => {
    const pts: BearDcaPoint[] = [
      ...Array.from({ length: 500 }, (_, i) => ({
        date: `u${i}`, price: 1000 + i, pricePct2y: 0.5, cycleProb: null, swingProb: null,
      })),
      ...Array.from({ length: 21 }, (_, i) => ({
        date: `b${i}`, price: 1500 - i * 8, pricePct2y: 0.7,
        cycleProb: i === 10 ? 65 : null, swingProb: null,
      })),
    ];
    const r = runBearDca(pts);
    expect(r.bhFiredThisCycle).toBe(true);
  });
});
```

- [ ] **Bước 2: Chạy tests — xác nhận FAIL**

```bash
npx vitest run src/lib/bear-dca.test.ts
```

Expected: FAIL vì `bear-dca.ts` chưa tồn tại.

- [ ] **Bước 3: Tạo `src/lib/bear-dca.ts`**

```typescript
import type { BearDcaPoint, BearDcaAnalysis, BearDcaHealth, BearDcaMode } from "./types";

const BEAR_DD_THRESHOLD = 0.15;
const ACUTE_DD_CHANGE   = 0.03;
const CYCLE_STEP        = 21;

/** Qty theo drawdown từ ATH (chế độ cấp tính). */
export function depthQty(dd: number): number {
  if (dd >= 0.40) return 1.5;
  if (dd >= 0.25) return 1.0;
  if (dd >= 0.15) return 0.75;
  return 0.5;
}

/** Qty theo percentile giá 2 năm (chế độ bình thường). */
export function boostQty(pct2y: number): number {
  if (pct2y < 0.25) return 1.5;
  if (pct2y < 0.50) return 1.0;
  if (pct2y < 0.75) return 0.75;
  return 0.5;
}

/** Rolling ATH tại mỗi index. */
function rollingAth(prices: number[]): number[] {
  const ath: number[] = [];
  let mx = 0;
  for (const p of prices) { if (p > mx) mx = p; ath.push(mx); }
  return ath;
}

export function runBearDca(points: BearDcaPoint[]): BearDcaAnalysis {
  const prices = points.map(p => p.price);
  const ath = rollingAth(prices);
  const last = points.length - 1;

  const ddNow  = last >= 0 ? (ath[last] - prices[last]) / ath[last] : 0;
  const prevIdx = Math.max(0, last - CYCLE_STEP);
  const ddPrev = (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx];
  const ddChange = ddNow - ddPrev;

  const isBear   = ddNow >= BEAR_DD_THRESHOLD;
  const isAcute  = isBear && ddChange > ACUTE_DD_CHANGE;
  const pct2y    = points[last]?.pricePct2y ?? null;

  let mode: BearDcaMode;
  let mult: number;
  let note: string;

  if (!isBear) {
    mode = "bull";
    mult = 1.0;
    note = "Thị trường không ở vùng Bear — card này không áp dụng.";
  } else if (isAcute) {
    mode = "acute";
    mult = depthQty(ddNow);
    note = `Giá đang sụp cấp tính (−${Math.round(ddChange * 100)}%/tháng). Dùng độ sâu từ đỉnh (${Math.round(ddNow * 100)}%) để tính khối lượng.`;
  } else {
    mode = "normal";
    mult = pct2y !== null ? boostQty(pct2y) : 0.75;
    note = pct2y !== null
      ? `Bear bình thường. Giá ở ${Math.round(pct2y * 100)}% dải 2 năm — dùng vị trí giá để tính khối lượng.`
      : "Chưa đủ dữ liệu pct2y — dùng mức trung bình.";
  }

  // BH bắn trong 21 phiên gần nhất?
  const cycleStart = Math.max(0, last - CYCLE_STEP + 1);
  const bhFiredThisCycle = points.slice(cycleStart).some(
    p => (p.cycleProb ?? -1) >= 60 || (p.swingProb ?? -1) >= 60
  );

  return {
    generatedAt: new Date().toISOString(),
    dataDate: points[last]?.date ?? "",
    isBear, ddFromAth: ddNow, ddChange, isAcute,
    pricePct2y: pct2y, mult, mode, bhFiredThisCycle, note,
  };
}

export function monitorBearDca(points: BearDcaPoint[]): BearDcaHealth {
  const prices  = points.map(p => p.price);
  const ath     = rollingAth(prices);
  const dates   = points.map(p => p.date);
  const lastDate = dates[dates.length - 1] ?? "";
  const cutoff   = lastDate
    ? new Date(new Date(lastDate).getTime() - 730 * 86400000).toISOString().slice(0, 10)
    : "";

  // Monthly indices trong ~2 năm gần nhất
  const recent: number[] = [];
  for (let i = 0; i < points.length; i += CYCLE_STEP) {
    if (dates[i] >= cutoff) recent.push(i);
  }

  if (recent.length < 12) {
    return { generatedAt: new Date().toISOString(), recentImprPct: null, status: "insufficient" };
  }

  // Tính cải thiện giá vốn ADAPTIVE vs BASE
  let bV = 0, bL = 0, cV = 0, cL = 0;
  let prevDd = 0;
  for (const i of recent) {
    const ddNow  = (ath[i] - prices[i]) / ath[i];
    const prevIdx = Math.max(0, i - CYCLE_STEP);
    const ddPrev  = (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx];
    const ddCh    = ddNow - ddPrev;
    const isBear  = ddNow >= BEAR_DD_THRESHOLD;
    const isAcute = isBear && ddCh > ACUTE_DD_CHANGE;
    const pct2y   = points[i].pricePct2y;

    const q = !isBear ? 1.0
      : isAcute ? depthQty(ddNow)
      : pct2y !== null ? boostQty(pct2y) : 0.75;

    bV += 1; bL += 1 / prices[i];
    cV += q; cL += q / prices[i];
    prevDd = ddNow;
    void prevDd;
  }

  const impr = bL > 0 && cL > 0 ? (bV / bL - cV / cL) / (bV / bL) : 0;
  const recentImprPct = Math.round(impr * 1000) / 10;
  return {
    generatedAt: new Date().toISOString(),
    recentImprPct,
    status: impr > 0 ? "ok" : "degraded",
  };
}
```

- [ ] **Bước 4: Chạy tests — xác nhận PASS**

```bash
npx vitest run src/lib/bear-dca.test.ts
```

Expected: tất cả PASS.

- [ ] **Bước 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: không lỗi.

- [ ] **Bước 6: Commit**

```bash
git add src/lib/bear-dca.ts src/lib/bear-dca.test.ts
git commit -m "feat(bear-dca): add engine + monitor + tests"
```

---

## Task 3: Data pipeline (run.ts)

**Files:**
- Modify: `scripts/run.ts`
- Creates (generated): `public/data/bear-dca.json`, `public/data/bear-dca-health.json`

**Interfaces:**
- Consumes: `runBearDca`, `monitorBearDca` từ Task 2; `BearDcaPoint` từ Task 1; `timeline.points` đã có

- [ ] **Bước 1: Thêm imports vào `scripts/run.ts`**

Tìm dòng import `runAccumulation` (khoảng dòng 32), thêm bên dưới:

```typescript
import { runBearDca, monitorBearDca } from "../src/lib/bear-dca";
import type { BearDcaPoint } from "../src/lib/types";
```

- [ ] **Bước 2: Thêm lớp Bear DCA sau khối accumulation**

Tìm dòng `const accumulationHealth = monitorAccumulation(accumPoints);` (khoảng dòng 301), thêm ngay sau:

```typescript
  // --- Lớp Bear DCA Advisor. Hai chế độ: DEPTH (cấp tính) + BOOST (bình thường).
  const bearDcaPoints: BearDcaPoint[] = timeline.points.map((pt) => ({
    date: pt.date,
    price: pt.price,
    pricePct2y: pt.pricePct2y ?? null,
    cycleProb: pt.cycleProb ?? null,
    swingProb: pt.swingProb ?? null,
  }));
  const bearDca = runBearDca(bearDcaPoints);
  const bearDcaHealth = monitorBearDca(bearDcaPoints);
```

- [ ] **Bước 3: Ghi JSON output**

Tìm dòng `writeFileSync(join(DATA_DIR, "accumulation-health.json"), ...)` (khoảng dòng 323), thêm ngay sau:

```typescript
  writeFileSync(join(DATA_DIR, "bear-dca.json"), JSON.stringify(bearDca, null, 1));
  writeFileSync(join(DATA_DIR, "bear-dca-health.json"), JSON.stringify(bearDcaHealth, null, 1));
```

- [ ] **Bước 4: Chạy collect để tạo file JSON**

```bash
npm run collect
```

Expected: exit 0, tạo `public/data/bear-dca.json` và `public/data/bear-dca-health.json`.

- [ ] **Bước 5: Xác nhận JSON hợp lệ**

```bash
node -e "const d=require('./public/data/bear-dca.json'); console.log(d.mode, d.mult, d.isBear, d.ddFromAth)"
```

Expected: in ra 3 giá trị hợp lệ, ví dụ `normal 0.75 true 0.2275`.

- [ ] **Bước 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: không lỗi.

- [ ] **Bước 7: Commit**

```bash
git add scripts/run.ts public/data/bear-dca.json public/data/bear-dca-health.json
git commit -m "feat(bear-dca): wire engine into collect pipeline"
```

---

## Task 4: BearDcaCard component

**Files:**
- Create: `src/components/BearDcaCard.tsx`

**Interfaces:**
- Consumes: `BearDcaAnalysis`, `BearDcaHealth` từ Task 1
- Produces: `export default function BearDcaCard({ bearDca, health }: { bearDca: BearDcaAnalysis; health: BearDcaHealth })`

- [ ] **Bước 1: Tạo `src/components/BearDcaCard.tsx`**

```tsx
"use client";
import { useState } from "react";
import type { BearDcaAnalysis, BearDcaHealth } from "@/lib/types";

const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

export default function BearDcaCard({
  bearDca: a,
  health,
}: {
  bearDca: BearDcaAnalysis;
  health: BearDcaHealth;
}) {
  const [showInfo, setShowInfo] = useState(false);

  // --- Câu hành động theo mult ---
  const actionLabel: Record<string, string> = {
    "1.5": "Tháng này: GOM NHIỀU HƠN (mỗi đợt ≈1.5×)",
    "1":   "Tháng này: GOM ĐỀU NHƯ THƯỜNG",
    "0.75":"Tháng này: GOM ÍT LẠI (mỗi đợt ≈¾)",
    "0.5": "Tháng này: GOM RẤT ÍT (mỗi đợt ≈½)",
  };
  const action = actionLabel[String(a.mult)] ?? "Tháng này: xem gợi ý bên dưới";
  const tone = a.mult >= 1 ? "buy" : a.mult >= 0.75 ? "neutral" : "sell";

  const BEAR_NOTE = (
    <p className="muted small" style={{ marginTop: "0.75rem", borderTop: "1px solid var(--c-line)", paddingTop: "0.5rem" }}>
      ⓘ Chỉ áp dụng khi thị trường ở vùng Bear (giá cách đỉnh ≥15%).
    </p>
  );

  return (
    <section className="card">
      <div className="card-head">
        <h2>Mức mua tháng này</h2>
        <button
          className="iconbtn small-btn"
          aria-label="Giải thích card này"
          aria-expanded={showInfo}
          onClick={() => setShowInfo((v) => !v)}
        >
          {showInfo ? "✕" : "ⓘ"}
        </button>
      </div>

      {/* Popup ⓘ */}
      {showInfo && (
        <div className="banner info accum-info">
          <p><b>Để làm gì?</b><br />Gợi ý mua bao nhiêu mỗi nhịp DCA (~21 ngày) trong bear market. Không bảo mua/bán.</p>
          <p><b>Chế độ Bình thường:</b><br />Dùng vị trí giá so dải 2 năm (rẻ → gom nhiều, đắt → gom ít).</p>
          <p><b>Chế độ Sụp cấp tính</b> (giá rơi &gt;3%/tháng từ đỉnh):<br />Dùng độ sâu từ đỉnh. Vì khi vừa sụp, &quot;đắt/rẻ 2 năm&quot; chưa phản ánh kịp.</p>
          <p><b>Timing:</b> Nếu Săn đáy bắn trong nhịp → ưu tiên mua ngày đó. Nếu không → mua ngay đầu nhịp, không chờ.</p>
          <p className="muted small">Kiểm chứng bear 2013–2019: cấp tính +1.75%, bình thường +1.50% giá vốn rẻ hơn vs gom đều.</p>
        </div>
      )}

      {/* Bull: chỉ hiện cảnh báo */}
      {!a.isBear ? (
        <>
          <div className="banner warn">
            ⚠ Card này chỉ dùng trong vùng Bear. Thị trường hiện không ở vùng Bear
            (giá cách đỉnh {fmtPct(a.ddFromAth)}).
          </div>
          {BEAR_NOTE}
        </>
      ) : (
        <>
          {/* Degraded warning */}
          {health.status === "degraded" && (
            <div className="banner warn">
              ⚠ Lớp này đang mất hiệu quả trên ~2 năm gần nhất ({health.recentImprPct}% ≤ 0) — cân nhắc bỏ qua.
            </div>
          )}

          {/* Chế độ badge */}
          <p className="muted small">
            Chế độ: <b>{a.isAcute ? "Sụp cấp tính" : "Bình thường"}</b>
            {" · "}cách đỉnh {fmtPct(a.ddFromAth)}
            {a.isAcute && ` · tốc độ −${fmtPct(a.ddChange)}/tháng`}
          </p>

          {/* Headline + giải thích */}
          <div className={`bottom-gauge-pct ${tone}`}>{action}</div>
          <p className="accum-why">{a.note}</p>

          {/* Gauge */}
          {a.isAcute ? (
            /* Cấp tính: gauge dd ATH (0=đỉnh, 1=sâu nhất) */
            <>
              <div className="accum-bar-wrap">
                <div className="bottom-gauge-bar">
                  <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${Math.min(a.ddFromAth * 100 * 2, 100)}%` }} />
                </div>
                {/* vạch mốc 25% và 40% dd */}
                <span className="accum-brake-tick" style={{ left: "50%" }} aria-hidden title="dd=25%" />
                <span className="accum-brake-tick" style={{ left: "80%" }} aria-hidden title="dd=40%" />
              </div>
              <div className="gauge-scale"><span>đỉnh</span><span>sâu (−50%)</span></div>
              <p className="muted small">Thanh = độ sâu từ đỉnh. Vạch: 25% (gom đều), 40% (gom nhiều).</p>
            </>
          ) : (
            /* Bình thường: gauge pct2y */
            <>
              <div className="accum-bar-wrap">
                <div className="bottom-gauge-bar">
                  <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${a.pricePct2y !== null ? Math.round(a.pricePct2y * 100) : 50}%` }} />
                </div>
                <span className="accum-brake-tick" style={{ left: "75%" }} aria-hidden />
              </div>
              <div className="gauge-scale"><span>rẻ</span><span>đắt</span></div>
              <p className="muted small">Thanh = vị trí giá trong dải 2 năm. Vạch vàng (75%) là mốc bắt đầu giảm khối lượng.</p>
            </>
          )}

          {/* BH hint */}
          {a.bhFiredThisCycle && (
            <p className="muted small">🎯 Săn đáy bắn trong nhịp này — nếu chưa mua, ưu tiên mua ngay.</p>
          )}

          {BEAR_NOTE}
        </>
      )}
    </section>
  );
}
```

- [ ] **Bước 2: Build để kiểm tra không lỗi**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` (có thể lỗi vì Dashboard chưa import — bỏ qua, sửa ở Task 5).

- [ ] **Bước 3: Commit**

```bash
git add src/components/BearDcaCard.tsx
git commit -m "feat(bear-dca): add BearDcaCard component"
```

---

## Task 5: Wire vào Dashboard + page

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `BearDcaCard` từ Task 4; `BearDcaAnalysis`, `BearDcaHealth` từ Task 1; JSON từ Task 3

- [ ] **Bước 1: Sửa `src/app/page.tsx`**

Tìm các dòng import accumulation (khoảng dòng 8–9), thêm bên dưới:

```typescript
import bearDcaJson from "../../public/data/bear-dca.json";
import bearDcaHealthJson from "../../public/data/bear-dca-health.json";
```

Tìm dòng `const accumulationHealth = accumulationHealthJson as unknown as AccumulationHealth;` (khoảng dòng 20), thêm sau:

```typescript
  const bearDca = bearDcaJson as unknown as BearDcaAnalysis;
  const bearDcaHealth = bearDcaHealthJson as unknown as BearDcaHealth;
```

Thêm `BearDcaAnalysis`, `BearDcaHealth` vào import từ `@/lib/types`.

Thêm props vào `<Dashboard ... />`:

```tsx
bearDca={bearDca} bearDcaHealth={bearDcaHealth}
```

- [ ] **Bước 2: Sửa `src/components/Dashboard.tsx`**

Thêm import (thay `AccumulationCard`):

```typescript
import BearDcaCard from "./BearDcaCard";
```

Thêm vào import types từ `@/lib/types`: `BearDcaAnalysis`, `BearDcaHealth`.

Thêm vào interface props của Dashboard:

```typescript
  bearDca: BearDcaAnalysis;
  bearDcaHealth: BearDcaHealth;
```

Tìm dòng `<AccumulationCard accumulation={accumulation} health={accumulationHealth} />` (khoảng dòng 562), thay bằng:

```tsx
<BearDcaCard bearDca={bearDca} health={bearDcaHealth} />
```

- [ ] **Bước 3: Build**

```bash
npm run build 2>&1 | tail -25
```

Expected: `✓ Compiled successfully` và `✓ Generating static pages (4/4)`.

- [ ] **Bước 4: Chạy test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: accumulation tests (15) + bear-dca tests PASS. Fusion evidence test có thể vẫn fail vì lý do cũ (dữ liệu trôi, không liên quan).

- [ ] **Bước 5: Commit**

```bash
git add src/app/page.tsx src/components/Dashboard.tsx
git commit -m "feat(bear-dca): wire BearDcaCard into Dashboard"
```

- [ ] **Bước 6: Push**

```bash
git pull --rebase && git push
```

---

## Tự review

**Spec coverage:**
- ✅ Engine 2 chế độ (DEPTH/BOOST) — Task 2
- ✅ BH timing gợi ý (`bhFiredThisCycle`) — Task 2, hiển thị Task 4
- ✅ Bear detection (dd≥15%) — Task 2
- ✅ Acute detection (ddChange>3pp) — Task 2
- ✅ 3 trạng thái UI (bull/normal/acute) — Task 4
- ✅ Note chân card luôn hiện — Task 4
- ✅ Monitor (degraded warning) — Task 2 `monitorBearDca`, Task 4 hiển thị
- ✅ Data pipeline — Task 3
- ✅ Accordion label không đổi ("Mức mua tháng này") — Task 4 giữ `<h2>`

**Không có trong plan (đúng ý):**
- Time Machine: không cần cập nhật (spec không yêu cầu)
- AccumulationCard: giữ nguyên file, chỉ không dùng trong Dashboard
- Monitor script riêng: gộp vào `bear-dca.ts` đủ rồi, không cần file riêng
