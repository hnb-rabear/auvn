# Bear DCA Advisor v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiến hóa BearDcaCard từ mô hình 3-trạng-thái-có-BH sang 4-pha + hybrid override, gỡ bỏ hoàn toàn Bottom Hunter.

**Architecture:** Engine phân loại 4 pha thị trường (bull/acute/recovery/grind) từ dd ATH + ddChange (chỉ quá khứ), mỗi pha một công thức khối lượng. App gợi ý pha; người dùng đè được (client state). Tính tại collect-time, ghi bear-dca.json.

**Tech Stack:** TypeScript, Next.js static export, Vitest.

## Global Constraints

- UI text: tiếng Việt
- Tất cả tính toán pha + mult tại collect-time (engine), trừ override (client state, không vào JSON)
- Gỡ BỎ hoàn toàn BH khỏi bear-dca: bỏ `cycleProb`/`swingProb` khỏi BearDcaPoint, bỏ `bhFiredThisCycle`
- Bear threshold: dd ATH ≥ 0.15
- Phân loại pha: ddChange > +0.03 → acute; < −0.03 → recovery; |ddChange| ≤ 0.03 → grind (khi dd≥0.15)
- DEPTH (acute): dd≥0.40→1.5, dd≥0.25→1.0, dd≥0.15→0.75
- BOOST (grind): pct2y<0.25→1.5, <0.50→1.0, <0.75→0.75, ≥0.75→0.5
- BULL → 1.0 (gom đều); RECOVERY → 1.5 (kèm cờ rủi ro)
- RECOVERY phải có banner cảnh báo rủi ro cố định (n=11, leverage)
- Note chân card mọi pha: "Chỉ áp dụng vùng Bear (≥15%). Vùng Tăng: gom đều."
- Không nhắc BH/Săn đáy trong card

---

## File Map

| File | Thay đổi |
|---|---|
| `src/lib/types.ts` | Sửa BearDcaPoint, BearDcaAnalysis; thêm `BearPhase`; bỏ BearDcaMode |
| `src/lib/bear-dca.ts` | Thêm `classifyPhase`, `qtyForPhase`; viết lại runBearDca + monitorBearDca; bỏ BH |
| `src/lib/bear-dca.test.ts` | Cập nhật + thêm test cho phase/qty/monitor |
| `scripts/run.ts` | bearDcaPoints bỏ cycleProb/swingProb |
| `src/components/BearDcaCard.tsx` | Viết lại: 4 pha + hybrid override + banner rủi ro; bỏ BH hint |

---

## Task 1: Types — 4 pha, bỏ BH

**Files:**
- Modify: `src/lib/types.ts` (khối Bear DCA: `BearDcaPoint`, `BearDcaMode`, `BearDcaAnalysis`)

**Interfaces:**
- Produces: `BearPhase`, `BearDcaPoint` (3 field), `BearDcaAnalysis` (có `phase`, `recoveryRisk`; bỏ `isAcute`/`mode`/`bhFiredThisCycle`)

- [ ] **Bước 1: Thay khối type Bear DCA**

Tìm trong `src/lib/types.ts` khối hiện có (bắt đầu `export interface BearDcaPoint` và `export type BearDcaMode`), thay TOÀN BỘ phần đó bằng:

```typescript
export interface BearDcaPoint {
  date: string;
  price: number;
  pricePct2y: number | null; // từ accumulation engine (win=504)
}

export type BearPhase = "bull" | "acute" | "recovery" | "grind";

export interface BearDcaAnalysis {
  generatedAt: string;
  dataDate: string;
  isBear: boolean;          // phase !== "bull" (dd >= 0.15)
  ddFromAth: number;        // 0..1, rolling ATH
  ddChange: number;         // dd hôm nay - dd 21 phiên trước (pp/tháng)
  phase: BearPhase;         // pha gợi ý tự động
  pricePct2y: number | null;
  mult: number;             // hệ số cho pha tự động ∈ {0.5, 0.75, 1.0, 1.5}
  recoveryRisk: boolean;    // true khi phase === "recovery"
  note: string;             // giải thích tiếng Việt
}
```

Giữ nguyên `BearDcaHealth` (không đổi cấu trúc). Xóa hẳn `BearDcaMode`.

- [ ] **Bước 2: Typecheck (sẽ lỗi ở bear-dca.ts — đúng dự kiến)**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: lỗi tham chiếu `BearDcaMode`/`isAcute`/`bhFiredThisCycle` trong bear-dca.ts (Task 2 sẽ sửa). KHÔNG có lỗi trong types.ts.

- [ ] **Bước 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(bear-dca-v2): 4-phase types, drop BH fields"
```

---

## Task 2: Engine — classifyPhase + qtyForPhase, viết lại runBearDca/monitorBearDca

**Files:**
- Modify: `src/lib/bear-dca.ts` (toàn bộ — viết lại)
- Modify: `src/lib/bear-dca.test.ts` (toàn bộ — viết lại)

**Interfaces:**
- Consumes: `BearDcaPoint`, `BearDcaAnalysis`, `BearDcaHealth`, `BearPhase` từ Task 1
- Produces:
  - `depthQty(dd: number): number` (giữ nguyên)
  - `boostQty(pct2y: number): number` (giữ nguyên)
  - `classifyPhase(dd: number, ddChange: number): BearPhase`
  - `qtyForPhase(phase: BearPhase, dd: number, pct2y: number | null): number`
  - `runBearDca(points: BearDcaPoint[]): BearDcaAnalysis`
  - `monitorBearDca(points: BearDcaPoint[]): BearDcaHealth`

- [ ] **Bước 1: Viết lại test `src/lib/bear-dca.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { depthQty, boostQty, classifyPhase, qtyForPhase, runBearDca, monitorBearDca } from "./bear-dca";
import type { BearDcaPoint } from "./types";

describe("depthQty", () => {
  it("dd<15% → 0.5", () => expect(depthQty(0.10)).toBe(0.5));
  it("dd=15% → 0.75", () => expect(depthQty(0.15)).toBe(0.75));
  it("dd=25% → 1.0", () => expect(depthQty(0.25)).toBe(1.0));
  it("dd=40% → 1.5", () => expect(depthQty(0.40)).toBe(1.5));
});

describe("boostQty", () => {
  it("pct2y<25% → 1.5", () => expect(boostQty(0.10)).toBe(1.5));
  it("pct2y=50% → 0.75", () => expect(boostQty(0.50)).toBe(0.75));
  it("pct2y=75% → 0.5", () => expect(boostQty(0.75)).toBe(0.5));
});

describe("classifyPhase", () => {
  it("dd<15% → bull bất kể ddChange", () => {
    expect(classifyPhase(0.10, 0.10)).toBe("bull");
    expect(classifyPhase(0.14, -0.10)).toBe("bull");
  });
  it("dd≥15% + ddChange>+3pp → acute", () => expect(classifyPhase(0.20, 0.05)).toBe("acute"));
  it("dd≥15% + ddChange<−3pp → recovery", () => expect(classifyPhase(0.20, -0.05)).toBe("recovery"));
  it("dd≥15% + |ddChange|≤3pp → grind", () => {
    expect(classifyPhase(0.20, 0.02)).toBe("grind");
    expect(classifyPhase(0.20, -0.02)).toBe("grind");
  });
});

describe("qtyForPhase", () => {
  it("bull → 1.0", () => expect(qtyForPhase("bull", 0.5, 0.1)).toBe(1.0));
  it("acute → depthQty", () => expect(qtyForPhase("acute", 0.40, 0.9)).toBe(1.5));
  it("grind → boostQty", () => expect(qtyForPhase("grind", 0.20, 0.10)).toBe(1.5));
  it("grind pct2y null → 0.75", () => expect(qtyForPhase("grind", 0.20, null)).toBe(0.75));
  it("recovery → 1.5", () => expect(qtyForPhase("recovery", 0.30, 0.5)).toBe(1.5));
});

describe("runBearDca", () => {
  const mk = (n: number, priceAt: (i: number) => number, pct = 0.5): BearDcaPoint[] =>
    Array.from({ length: n }, (_, i) => ({ date: `d${String(i).padStart(4, "0")}`, price: priceAt(i), pricePct2y: pct }));

  it("bull: dd<15% → phase bull, mult 1.0, isBear false", () => {
    const r = runBearDca(mk(600, (i) => 1000 + i * 5));
    expect(r.phase).toBe("bull");
    expect(r.mult).toBe(1.0);
    expect(r.isBear).toBe(false);
    expect(r.recoveryRisk).toBe(false);
  });

  it("acute: tăng rồi sụp nhanh → phase acute, recoveryRisk false", () => {
    // 500 tăng 1000→1500, 50 sụp 1500→1000 (dd sâu, ddChange dương lớn)
    const pts = [
      ...mk(500, (i) => 1000 + i),
      ...Array.from({ length: 50 }, (_, i) => ({ date: `s${i}`, price: 1500 - i * 10, pricePct2y: 0.7 })),
    ];
    const r = runBearDca(pts);
    expect(r.phase).toBe("acute");
    expect(r.isBear).toBe(true);
    expect(r.recoveryRisk).toBe(false);
  });

  it("recovery: sụp sâu rồi hồi → phase recovery, mult 1.5, recoveryRisk true", () => {
    // 300 tăng 1000→4000, 100 sụp 4000→2000, 50 hồi 2000→2600
    const pts = [
      ...Array.from({ length: 300 }, (_, i) => ({ date: `u${i}`, price: 1000 + i * 10, pricePct2y: 0.8 })),
      ...Array.from({ length: 100 }, (_, i) => ({ date: `d${i}`, price: 4000 - i * 20, pricePct2y: 0.4 })),
      ...Array.from({ length: 50 }, (_, i) => ({ date: `r${i}`, price: 2000 + i * 12, pricePct2y: 0.3 })),
    ];
    const r = runBearDca(pts);
    expect(r.phase).toBe("recovery");
    expect(r.mult).toBe(1.5);
    expect(r.recoveryRisk).toBe(true);
    expect(r.isBear).toBe(true);
  });
});

describe("monitorBearDca", () => {
  const mk = (n: number, priceAt: (i: number) => number, start = "2014-01-01"): BearDcaPoint[] => {
    const out: BearDcaPoint[] = [];
    let t = Date.parse(start + "T00:00:00Z");
    for (let i = 0; i < n; i++) {
      out.push({ date: new Date(t).toISOString().slice(0, 10), price: priceAt(i), pricePct2y: 0.5 });
      t += 86400000;
    }
    return out;
  };
  it("insufficient khi quá ít điểm", () => {
    expect(monitorBearDca(mk(50, (i) => 100 + i)).status).toBe("insufficient");
  });
  it("trả status hợp lệ khi đủ dữ liệu", () => {
    const h = monitorBearDca(mk(1400, (i) => 100 + i));
    expect(["ok", "degraded"]).toContain(h.status);
  });
});
```

- [ ] **Bước 2: Chạy test — xác nhận FAIL**

Run: `npx vitest run src/lib/bear-dca.test.ts`
Expected: FAIL (classifyPhase/qtyForPhase chưa tồn tại; runBearDca trả `mode` cũ).

- [ ] **Bước 3: Viết lại `src/lib/bear-dca.ts`**

```typescript
import type { BearDcaPoint, BearDcaAnalysis, BearDcaHealth, BearPhase } from "./types";

const BEAR_DD_THRESHOLD = 0.15;
const ACUTE_DD_CHANGE   = 0.03;
const CYCLE_STEP        = 21;

/** Qty theo drawdown từ ATH (pha cấp tính). */
export function depthQty(dd: number): number {
  if (dd >= 0.40) return 1.5;
  if (dd >= 0.25) return 1.0;
  if (dd >= 0.15) return 0.75;
  return 0.5;
}

/** Qty theo percentile giá 2 năm (pha rỉ máu). */
export function boostQty(pct2y: number): number {
  if (pct2y < 0.25) return 1.5;
  if (pct2y < 0.50) return 1.0;
  if (pct2y < 0.75) return 0.75;
  return 0.5;
}

/** Phân loại pha — chỉ dùng quá khứ (dd rolling ATH + ddChange 21 phiên). */
export function classifyPhase(dd: number, ddChange: number): BearPhase {
  if (dd < BEAR_DD_THRESHOLD) return "bull";
  if (ddChange > ACUTE_DD_CHANGE) return "acute";
  if (ddChange < -ACUTE_DD_CHANGE) return "recovery";
  return "grind";
}

/** Hệ số khối lượng cho một pha. Pure — UI dùng để tính lại khi người dùng đè pha. */
export function qtyForPhase(phase: BearPhase, dd: number, pct2y: number | null): number {
  switch (phase) {
    case "bull": return 1.0;
    case "acute": return depthQty(dd);
    case "recovery": return 1.5;
    case "grind": return pct2y !== null ? boostQty(pct2y) : 0.75;
  }
}

function noteFor(phase: BearPhase, dd: number, ddChange: number, pct2y: number | null): string {
  const ddP = Math.round(dd * 100);
  const chP = Math.round(ddChange * 100);
  switch (phase) {
    case "bull":
      return "Thị trường không ở vùng Bear — gom đều tay.";
    case "acute":
      return `Giá đang sụp cấp tính (−${chP}%/tháng). Cách đỉnh ${ddP}% — dùng độ sâu để tính khối lượng.`;
    case "recovery":
      return `Giá đang hồi phục (+${Math.abs(chP)}%/tháng từ đáy). Gom mạnh ×1.5 — đây là cược giá tiếp tục lên.`;
    case "grind":
      return pct2y !== null
        ? `Bear rỉ máu. Giá ở ${Math.round(pct2y * 100)}% dải 2 năm — dùng vị trí giá để tính khối lượng.`
        : "Bear rỉ máu. Chưa đủ dữ liệu pct2y — dùng mức trung bình.";
  }
}

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

  const ddNow = last >= 0 ? (ath[last] - prices[last]) / ath[last] : 0;
  const prevIdx = Math.max(0, last - CYCLE_STEP);
  const ddPrev = last >= 0 ? (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx] : 0;
  const ddChange = ddNow - ddPrev;
  const pct2y = points[last]?.pricePct2y ?? null;

  const phase = classifyPhase(ddNow, ddChange);
  const mult = qtyForPhase(phase, ddNow, pct2y);

  return {
    generatedAt: new Date().toISOString(),
    dataDate: points[last]?.date ?? "",
    isBear: phase !== "bull",
    ddFromAth: ddNow,
    ddChange,
    phase,
    pricePct2y: pct2y,
    mult,
    recoveryRisk: phase === "recovery",
    note: noteFor(phase, ddNow, ddChange, pct2y),
  };
}

export function monitorBearDca(points: BearDcaPoint[]): BearDcaHealth {
  const prices = points.map(p => p.price);
  const ath = rollingAth(prices);
  const dates = points.map(p => p.date);
  const lastDate = dates[dates.length - 1] ?? "";
  const cutoff = lastDate
    ? new Date(new Date(lastDate).getTime() - 730 * 86400000).toISOString().slice(0, 10)
    : "";

  const recent: number[] = [];
  for (let i = 0; i < points.length; i += CYCLE_STEP) {
    if (dates[i] >= cutoff) recent.push(i);
  }

  if (recent.length < 12) {
    return { generatedAt: new Date().toISOString(), recentImprPct: null, status: "insufficient" };
  }

  let bV = 0, bL = 0, cV = 0, cL = 0;
  for (const i of recent) {
    const ddNow = (ath[i] - prices[i]) / ath[i];
    const prevIdx = Math.max(0, i - CYCLE_STEP);
    const ddPrev = (ath[prevIdx] - prices[prevIdx]) / ath[prevIdx];
    const phase = classifyPhase(ddNow, ddNow - ddPrev);
    const q = qtyForPhase(phase, ddNow, points[i].pricePct2y);
    bV += 1; bL += 1 / prices[i];
    cV += q; cL += q / prices[i];
  }

  const impr = bL > 0 && cL > 0 ? (bV / bL - cV / cL) / (bV / bL) : 0;
  return {
    generatedAt: new Date().toISOString(),
    recentImprPct: Math.round(impr * 1000) / 10,
    status: impr > 0 ? "ok" : "degraded",
  };
}
```

- [ ] **Bước 4: Chạy test — xác nhận PASS**

Run: `npx vitest run src/lib/bear-dca.test.ts`
Expected: tất cả PASS.

- [ ] **Bước 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: còn lỗi ở run.ts (cycleProb) + BearDcaCard.tsx (isAcute/bhFiredThisCycle) — sửa ở Task 3, 4. KHÔNG lỗi trong bear-dca.ts.

- [ ] **Bước 6: Commit**

```bash
git add src/lib/bear-dca.ts src/lib/bear-dca.test.ts
git commit -m "feat(bear-dca-v2): 4-phase engine + qtyForPhase + monitor, drop BH"
```

---

## Task 3: Pipeline — bỏ BH khỏi bearDcaPoints

**Files:**
- Modify: `scripts/run.ts` (khối `bearDcaPoints`)

**Interfaces:**
- Consumes: `runBearDca`, `monitorBearDca`, `BearDcaPoint` (3 field) từ Task 1, 2

- [ ] **Bước 1: Sửa mapping `bearDcaPoints`**

Tìm trong `scripts/run.ts` khối:

```typescript
  const bearDcaPoints: BearDcaPoint[] = timeline.points.map((pt) => ({
    date: pt.date,
    price: pt.price,
    pricePct2y: pt.pricePct2y ?? null,
    cycleProb: pt.cycleProb ?? null,
    swingProb: pt.swingProb ?? null,
  }));
```

Thay bằng (bỏ 2 dòng cycleProb/swingProb):

```typescript
  const bearDcaPoints: BearDcaPoint[] = timeline.points.map((pt) => ({
    date: pt.date,
    price: pt.price,
    pricePct2y: pt.pricePct2y ?? null,
  }));
```

- [ ] **Bước 2: Chạy collect**

Run: `npm run collect`
Expected: exit 0, ghi lại `public/data/bear-dca.json` + `bear-dca-health.json`.

- [ ] **Bước 3: Xác nhận JSON có field mới**

Run: `node -e "const d=require('./public/data/bear-dca.json'); console.log(d.phase, d.mult, d.recoveryRisk, d.isBear, d.ddFromAth)"`
Expected: in ra phase (chuỗi bull/acute/recovery/grind) + mult + recoveryRisk + isBear + ddFromAth. KHÔNG có `bhFiredThisCycle`.

- [ ] **Bước 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: chỉ còn lỗi ở BearDcaCard.tsx (Task 4).

- [ ] **Bước 5: Commit**

```bash
git add scripts/run.ts public/data/bear-dca.json public/data/bear-dca-health.json
git commit -m "feat(bear-dca-v2): drop BH inputs from pipeline"
```

---

## Task 4: Component — 4 pha + hybrid override + banner rủi ro

**Files:**
- Modify: `src/components/BearDcaCard.tsx` (viết lại toàn bộ)

**Interfaces:**
- Consumes: `BearDcaAnalysis`, `BearDcaHealth`, `BearPhase` từ Task 1; `qtyForPhase` từ Task 2

- [ ] **Bước 1: Viết lại `src/components/BearDcaCard.tsx`**

```tsx
"use client";
import { useState } from "react";
import { qtyForPhase } from "@/lib/bear-dca";
import type { BearDcaAnalysis, BearDcaHealth, BearPhase } from "@/lib/types";

const fmtPct = (x: number) => `${Math.round(x * 100)}%`;

const PHASES: BearPhase[] = ["bull", "acute", "grind", "recovery"];
const PHASE_LABEL: Record<BearPhase, string> = {
  bull: "Tăng",
  acute: "Sụp cấp tính",
  grind: "Rỉ máu",
  recovery: "Hồi phục",
};
const ACTION: Record<string, string> = {
  "1.5": "Tháng này: GOM MẠNH (mỗi đợt ≈1.5×)",
  "1": "Tháng này: GOM ĐỀU NHƯ THƯỜNG",
  "0.75": "Tháng này: GOM ÍT LẠI (mỗi đợt ≈¾)",
  "0.5": "Tháng này: GOM RẤT ÍT (mỗi đợt ≈½)",
};

export default function BearDcaCard({
  bearDca: a,
  health,
}: {
  bearDca: BearDcaAnalysis;
  health: BearDcaHealth;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [override, setOverride] = useState<BearPhase | null>(null);

  const phase = override ?? a.phase;
  const mult = qtyForPhase(phase, a.ddFromAth, a.pricePct2y);
  const action = ACTION[String(mult)] ?? "Tháng này: xem gợi ý bên dưới";
  const tone = mult >= 1 ? "buy" : mult >= 0.75 ? "neutral" : "sell";
  const useDdGauge = phase === "acute" || phase === "recovery";

  const BEAR_NOTE = (
    <p className="muted small" style={{ marginTop: "0.75rem", borderTop: "1px solid var(--c-line)", paddingTop: "0.5rem" }}>
      ⓘ Chỉ áp dụng vùng Bear (giá cách đỉnh ≥15%). Vùng Tăng: gom đều tay.
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

      {showInfo && (
        <div className="banner info accum-info">
          <p><b>Để làm gì?</b><br />Gợi ý mua bao nhiêu mỗi nhịp DCA (~21 ngày) trong bear market. Không bảo mua/bán.</p>
          <p><b>4 pha:</b> Tăng → gom đều; Sụp cấp tính → gom theo độ sâu từ đỉnh; Rỉ máu → gom theo vị trí giá 2 năm; Hồi phục → gom mạnh.</p>
          <p><b>Timing:</b> Mua vào ngày DCA cố định của bạn. Không cần canh ngày trong tháng.</p>
          <p className="muted small">Kiểm chứng bear 2013–2019: cấp tính +3.94% giá vốn, rỉ máu +1.85%/+1.35% (giá vốn/tài sản) vs gom đều.</p>
        </div>
      )}

      {/* Tín hiệu thô + gợi ý pha (luôn hiện để người dùng tự phán đoán) */}
      <p className="muted small">
        Gợi ý: <b>{PHASE_LABEL[a.phase]}</b> · cách đỉnh {fmtPct(a.ddFromAth)} · tốc độ {a.ddChange >= 0 ? "+" : "−"}{fmtPct(Math.abs(a.ddChange))}/tháng
        {a.pricePct2y !== null && ` · giá ${fmtPct(a.pricePct2y)} dải 2 năm`}
      </p>

      {/* Hybrid override: chọn pha */}
      <div className="phase-picker" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
        {PHASES.map((p) => (
          <button
            key={p}
            className={`chip ${p === phase ? (p === a.phase ? "buy" : "neutral") : ""}`}
            aria-pressed={p === phase}
            onClick={() => setOverride(p === a.phase ? null : p)}
          >
            {PHASE_LABEL[p]}{p === a.phase ? " (gợi ý)" : ""}
          </button>
        ))}
      </div>

      {/* Degraded warning (chỉ khi đang ở bear theo gợi ý) */}
      {a.isBear && health.status === "degraded" && (
        <div className="banner warn">
          ⚠ Lớp này đang mất hiệu quả trên ~2 năm gần nhất ({health.recentImprPct}% ≤ 0) — cân nhắc bỏ qua.
        </div>
      )}

      {/* Cảnh báo rủi ro RECOVERY (cố định khi pha đang dùng = recovery) */}
      {phase === "recovery" && (
        <div className="banner warn">
          ⚠ Gom mạnh khi hồi phục là cú cược giá tiếp tục lên. Nếu &quot;hồi giả&quot; rồi sụp tiếp, bạn sẽ lỗ.
          Bằng chứng mỏng (n=11 nhịp) — cân nhắc theo khẩu vị rủi ro.
        </div>
      )}

      {/* Headline + giải thích */}
      <div className={`bottom-gauge-pct ${tone}`}>{action}</div>
      <p className="accum-why">{phase === a.phase ? a.note : `Bạn đang xem pha "${PHASE_LABEL[phase]}" (đè gợi ý).`}</p>

      {/* Gauge */}
      {useDdGauge ? (
        <>
          <div className="accum-bar-wrap">
            <div className="bottom-gauge-bar">
              <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${Math.min(a.ddFromAth * 100 * 2, 100)}%` }} />
            </div>
            <span className="accum-brake-tick" style={{ left: "50%" }} aria-hidden title="dd=25%" />
            <span className="accum-brake-tick" style={{ left: "80%" }} aria-hidden title="dd=40%" />
          </div>
          <div className="gauge-scale"><span>đỉnh</span><span>sâu (−50%)</span></div>
          <p className="muted small">Thanh = độ sâu từ đỉnh. Vạch: 25% (gom đều), 40% (gom nhiều).</p>
        </>
      ) : (
        <>
          <div className="accum-bar-wrap">
            <div className="bottom-gauge-bar">
              <div className={`bottom-gauge-fill ${tone}`} style={{ width: `${a.pricePct2y !== null ? Math.round(a.pricePct2y * 100) : 50}%` }} />
            </div>
            <span className="accum-brake-tick" style={{ left: "75%" }} aria-hidden />
          </div>
          <div className="gauge-scale"><span>rẻ</span><span>đắt</span></div>
          <p className="muted small">Thanh = vị trí giá trong dải 2 năm. Vạch vàng (75%) là mốc giảm khối lượng.</p>
        </>
      )}

      {BEAR_NOTE}
    </section>
  );
}
```

- [ ] **Bước 2: Build**

Run: `npm run build 2>&1 | tail -25`
Expected: `✓ Compiled successfully` và `✓ Generating static pages (4/4)`.

- [ ] **Bước 3: Chạy toàn bộ test**

Run: `npx vitest run 2>&1 | tail -10`
Expected: bear-dca tests PASS. Fusion evidence test có thể vẫn fail (dữ liệu trôi, không liên quan).

- [ ] **Bước 4: Commit + push**

```bash
git add src/components/BearDcaCard.tsx
git commit -m "feat(bear-dca-v2): 4-phase card + hybrid override + recovery risk banner"
git pull --rebase && git push
```

---

## Tự review

**Spec coverage:**
- ✅ 4 pha (bull/acute/recovery/grind) — Task 1 (type) + Task 2 (classifyPhase)
- ✅ Khối lượng mỗi pha (FLAT/DEPTH/BOOST/×1.5) — Task 2 `qtyForPhase`
- ✅ Bỏ BH hoàn toàn — Task 1 (bỏ field), Task 2 (bỏ logic), Task 3 (bỏ input), Task 4 (bỏ hint)
- ✅ Hybrid override (client state, không vào JSON) — Task 4 `useState override`
- ✅ Banner rủi ro RECOVERY cố định — Task 4
- ✅ Note chân card mọi pha — Task 4 `BEAR_NOTE`
- ✅ Timing "mua ngày DCA cố định", không nhắc BH — Task 4 popup
- ✅ monitor cập nhật theo 4 pha — Task 2 `monitorBearDca` dùng classifyPhase + qtyForPhase
- ✅ Tín hiệu thô hiển thị cho hybrid — Task 4 dòng "Gợi ý:..."

**Type consistency:** `BearPhase`, `qtyForPhase(phase, dd, pct2y)`, `classifyPhase(dd, ddChange)`, `BearDcaAnalysis.phase/recoveryRisk` dùng nhất quán Task 1→2→4.

**Không có (đúng YAGNI):**
- Không lưu override vào JSON (client state)
- Không thêm script/test cho UI override (logic nằm trong qtyForPhase đã test ở Task 2)
- AccumulationCard.tsx giữ nguyên trên disk (không xóa)
