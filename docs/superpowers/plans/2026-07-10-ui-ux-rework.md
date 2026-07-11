# UI/UX Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chart chính + as-of toàn trang + IA 8 accordion → 4 khối, theo spec `docs/superpowers/specs/2026-07-10-ui-ux-rework-design.md`.

**Architecture:** Strangler — tách lõi as-of của `TimeMachine.tsx` ra `src/lib/as-of.ts` (thuần, không React), thêm `PriceChart` chạy cạnh layout cũ, nối as-of ra cả trang, gộp IA, chỉ xóa TimeMachine ở bước cuối sau khi chủ dự án xác nhận. Mỗi task app chạy được + test/build pass.

**Tech Stack:** Next.js static export, TypeScript, vitest, SVG viewBox thuần (không thư viện chart).

## Global Constraints

- **KHÔNG tự commit/push** — luật user toàn cục. Cuối mỗi task: chạy verify rồi BÁO "sẵn sàng commit" và dừng chờ.
- UI tiếng Việt; không thêm dependency; không font ngoài; free tier only.
- KHÔNG đụng engine/data: `scripts/*`, `src/lib/criteria.ts`, `bottom.ts`, `bear-dca.ts`, `bear-downside.ts`, `fusion.ts`, `guidance.ts`, `consensus.ts`, `types.ts` (trừ chỗ plan chỉ định thêm type export), JSON schema, cron, notify, monitor.
- 7 ràng buộc an toàn trong spec (acute-crash gate, verdict-note bán/sell-timing, chưa-đủ-dữ-liệu, evidence per-preset, headwind = OBSERVE, stale banner, chip high-conf 3T) — kiểm lại ở checklist cuối mỗi task UI.
- Test: `npm test` (vitest run); build: `npm run build`. Cả hai phải pass ở CUỐI MỖI TASK.
- Quy tắc chart ≡ card ≡ monitor: mọi giá trị as-of đi qua `createAsOfEngine` — không tính tay ở component.

## File Structure (khóa quyết định tách file)

| File | Vai trò |
| --- | --- |
| `src/lib/as-of.ts` (mới) | Lõi as-of thuần: composite/kDay/zone/verdict/highConf/dca/prob-gate/guidance/returns cho 1 ngày; marker index cho chart. TÁCH từ TimeMachine — không viết logic mới. |
| `src/lib/as-of.test.ts` (mới) | Unit synthetic + invariant trên timeline.json thật. |
| `src/lib/price-chart.ts` (mới) | Toán chart thuần: window/range, map SJC theo ngày, path/scale 2 trục. |
| `src/lib/price-chart.test.ts` (mới) | Unit toán chart. |
| `src/components/PriceChart.tsx` (mới) | SVG chart 2 đường + chấm tín hiệu + tap-chọn/pan. Dumb component. |
| `src/components/TimeMachine.tsx` | Task 1: refactor dùng as-of.ts (UI y hệt). Task 6 (gated): xóa. |
| `src/components/Dashboard.tsx` | Task 3-5: chart, state `selIdx`, as-of bar, chips, IA 4 khối. |
| `src/components/ActionGuidance.tsx` | Task 5: export `LEVEL_TAG`. |
| `src/components/BearDownsideCard.tsx` | Task 4: prop `asOfIdx?` đồng bộ theo trang. |
| `src/app/page.tsx` | Task 3: import `vn-gold.json` truyền xuống. |
| `src/app/globals.css` | Task 3/5 (class mới `pc-*`, `asof-*`, `answer-chip`), Task 7-8 (token/polish). |

---

### Task 1: Tách lõi as-of ra `src/lib/as-of.ts` + refactor TimeMachine (UI không đổi)

**Files:**
- Create: `src/lib/as-of.ts`
- Create: `src/lib/as-of.test.ts`
- Modify: `src/components/TimeMachine.tsx` (thay khối tính toán nội bộ bằng engine; JSX giữ nguyên)

**Interfaces:**
- Consumes: `presetComposites/composites/idxsAtOrAbove/idxsAtOrBelow/bottomStartIdxs` (`src/lib/timeline.ts`), `bearDcaAt` (`src/lib/bear-dca.ts:73`), `deriveGuidance` (`src/lib/guidance.ts:68`), `highConfidenceBuy3m` (`src/lib/fusion.ts`), `consensusLabel/consensusZone` (`src/lib/consensus.ts`), `PRESETS/zoneOf/ZONE_LABELS` (`src/lib/types.ts`).
- Produces (task 3-5 dùng):
  - `interface AsOfMode { preset: Preset | null; weights: Record<CriterionKey, number>; consensusMode: boolean; fusionDegraded: boolean }`
  - `interface AsOfDay { idx: number; point: TimelinePoint; composite: number; kDay: number; rawZone: Zone; zone: Zone; isBuy: boolean; isSell: boolean; verdictLabel: string; highConf: boolean; dca: { phase: BearPhase; mult: number }; crashDay: boolean; cycleProb: number | null; cycleCi: [number, number] | null; cycleN: number; swingProb: number | null; swingCi: [number, number] | null; swingN: number; guidance: Guidance }`
  - `interface AsOfEngine { comps: number[]; buyKs: number[] | null; signalIdxs: number[]; sellIdxs: number[]; bottomStarts: number[]; day(idx: number): AsOfDay }`
  - `function createAsOfEngine(points: TimelinePoint[], mode: AsOfMode): AsOfEngine`
  - `function verdictFor(zone: Zone, ret: number | null, h: "21" | "63" | "126"): "right" | "wrong" | "n/a" | null` (chuyển từ TimeMachine.tsx:67)

- [ ] **Step 1: Viết test fail** — `src/lib/as-of.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createAsOfEngine, verdictFor } from "./as-of";
import { DEFAULT_WEIGHTS, PRESETS, type TimelinePoint } from "./types";
import { presetComposites, composites } from "./timeline";
import timelineJson from "../../public/data/timeline.json";

const realPoints = (timelineJson as { points: TimelinePoint[] }).points;

/** Điểm synthetic: mọi tiêu chí cùng score s ⇒ composite = s*50 (presetComposite fold macro). */
function mk(date: string, s: number, extra: Partial<TimelinePoint> = {}): TimelinePoint {
  return {
    date,
    price: 2000,
    composite: s * 50,
    zone: "neutral",
    scores: { technical: s, premium: s, macro: s, stats: s, momentum: s },
    returns: { "21": 1.5, "63": -2, "126": null },
    ...extra,
  } as TimelinePoint;
}

const MODE = { preset: null, weights: DEFAULT_WEIGHTS, consensusMode: true, fusionDegraded: false };

describe("createAsOfEngine — đồng thuận", () => {
  it("mọi tiêu chí +2 ⇒ 3/3 preset báo mua, zone strong-buy, guidance buy-side", () => {
    const pts = [mk("2020-01-01", 0), mk("2020-01-02", 2)];
    const d = createAsOfEngine(pts, MODE).day(1);
    expect(d.kDay).toBe(3);
    expect(d.zone).toBe("strong-buy");
    expect(d.verdictLabel).toBe("3/3 PRESET BÁO MUA");
    expect(["buy", "strong"]).toContain(d.guidance.level);
    // as-of luôn tắt premium (world-only)
    expect(d.guidance.reasons[2]).toBe("Chênh VN: chưa có dữ liệu.");
  });

  it("mọi tiêu chí 0 ⇒ k=0, wait", () => {
    const d = createAsOfEngine([mk("2020-01-01", 0)], MODE).day(0);
    expect(d.kDay).toBe(0);
    expect(d.zone).toBe("neutral");
    expect(d.verdictLabel).toBe("CHƯA CÓ TÍN HIỆU MUA");
    expect(d.guidance.level).toBe("wait");
  });

  it("mọi tiêu chí −2 ⇒ radar âm sâu, headwind (OBSERVE — không phải lệnh bán)", () => {
    const d = createAsOfEngine([mk("2020-01-01", -2)], MODE).day(0);
    expect(d.isSell).toBe(true);
    expect(d.zone).toBe("neutral"); // mặc định ẩn vùng bán
    expect(d.guidance.level).toBe("headwind");
    expect(d.guidance.tone).toBe("neutral");
  });

  it("signalIdxs = ngày có k≥1", () => {
    const eng = createAsOfEngine([mk("2020-01-01", 0), mk("2020-01-02", 2)], MODE);
    expect(eng.signalIdxs).toEqual([1]);
  });
});

describe("createAsOfEngine — chế độ preset", () => {
  it("comps = presetComposites, signalIdxs theo ngưỡng preset", () => {
    const p3m = PRESETS.find((p) => p.id === "3m")!;
    const pts = [mk("2020-01-01", 0), mk("2020-01-02", 2)];
    const eng = createAsOfEngine(pts, { ...MODE, consensusMode: false, preset: p3m });
    expect(eng.comps).toEqual(presetComposites(pts, p3m));
    expect(eng.buyKs).toBeNull();
    expect(eng.signalIdxs).toEqual([1]);
  });
});

describe("createAsOfEngine — dữ liệu thật (invariant, data append-only)", () => {
  const eng = createAsOfEngine(realPoints, MODE);

  it("comps khớp composites(DEFAULT_WEIGHTS) — radar ngữ cảnh", () => {
    expect(eng.comps).toEqual(composites(realPoints, DEFAULT_WEIGHTS));
  });

  it("cổng acute-crash: crashDay ⇒ prob hiển thị = bản không trọng số; có ≥1 ngày acute trong lịch sử", () => {
    let acuteSeen = 0;
    for (let i = 0; i < realPoints.length; i += 7) {
      const d = eng.day(i);
      const p = realPoints[i];
      if (d.crashDay) {
        acuteSeen++;
        expect(d.cycleProb).toBe(p.cycleProbUw ?? p.cycleProb ?? null);
        expect(d.cycleCi).toBeNull(); // CI không hiển thị khi crash (khác scheme trọng số)
      } else {
        expect(d.cycleProb).toBe(p.cycleProb ?? null);
      }
    }
    expect(acuteSeen).toBeGreaterThan(0); // 2020-03 v.v. phải tồn tại
  });

  it("dca as-of ≡ bearDcaAt trên cùng series (golden wiring)", async () => {
    const { bearDcaAt } = await import("./bear-dca");
    const prices = realPoints.map((q) => q.price);
    const i = realPoints.length - 1;
    const want = bearDcaAt(prices, i, realPoints[i].pricePct2y ?? null);
    const got = eng.day(i).dca;
    expect(got.phase).toBe(want.phase);
    expect(got.mult).toBe(want.mult);
  });
});

describe("verdictFor", () => {
  it("mua đúng khi giá tăng; bán chỉ chấm 1 tháng", () => {
    expect(verdictFor("buy", 3, "63")).toBe("right");
    expect(verdictFor("buy", -3, "63")).toBe("wrong");
    expect(verdictFor("sell", -3, "21")).toBe("right");
    expect(verdictFor("sell", -3, "63")).toBe("n/a");
    expect(verdictFor("neutral", 3, "21")).toBeNull();
    expect(verdictFor("buy", null, "21")).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy fail** — `npx vitest run src/lib/as-of.test.ts` → FAIL "Cannot find module './as-of'".

- [ ] **Step 3: Viết `src/lib/as-of.ts`** — PORT nguyên logic TimeMachine.tsx:143-357 + 67-72, không sáng tác:

```ts
/**
 * Lõi as-of của cả trang (2026-07-10 UI rework) — TÁCH từ TimeMachine.tsx, thuần không React.
 * Chart ≡ card ≡ monitor: MỌI giá trị lịch-sử/as-of hiển thị phải đi qua đây.
 * Không viết lại logic — mọi công thức trỏ về hàm engine gốc (presetComposites,
 * bearDcaAt, deriveGuidance, highConfidenceBuy3m).
 */
import {
  PRESETS,
  zoneOf,
  type CriterionKey,
  type Preset,
  type TimelinePoint,
  type Zone,
  type BearPhase,
} from "./types";
import { consensusLabel, consensusZone } from "./consensus";
import { deriveGuidance, type Guidance } from "./guidance";
import { highConfidenceBuy3m } from "./fusion";
import { bearDcaAt } from "./bear-dca";
import {
  composites,
  presetComposites,
  idxsAtOrAbove,
  idxsAtOrBelow,
  bottomStartIdxs,
} from "./timeline";

export interface AsOfMode {
  preset: Preset | null;
  weights: Record<CriterionKey, number>;
  consensusMode: boolean;
  fusionDegraded: boolean;
}

export interface AsOfDay {
  idx: number;
  point: TimelinePoint;
  composite: number;
  /** số preset báo mua (0 khi không ở chế độ đồng thuận) */
  kDay: number;
  /** zone thô — bán chỉ tham khảo, caller quyết hiển thị */
  rawZone: Zone;
  /** zone phía mua (bán đã ép neutral — mặc định ẩn vùng bán) */
  zone: Zone;
  isBuy: boolean;
  isSell: boolean;
  verdictLabel: string;
  highConf: boolean;
  dca: { phase: BearPhase; mult: number };
  crashDay: boolean;
  /** prob đã qua cổng acute-crash (crashDay ⇒ bản không trọng số) */
  cycleProb: number | null;
  /** CI chỉ hiển thị khi KHÔNG crash (CI tính theo scheme trọng số) */
  cycleCi: [number, number] | null;
  cycleN: number;
  swingProb: number | null;
  swingCi: [number, number] | null;
  swingN: number;
  guidance: Guidance;
}

export interface AsOfEngine {
  comps: number[];
  buyKs: number[] | null;
  /** ngày tín hiệu mua (chấm ● trên chart) */
  signalIdxs: number[];
  /** ngày composite ≤ −40 (vùng bán tham khảo) */
  sellIdxs: number[];
  /** cạnh lên bin đáy (chấm ▲) */
  bottomStarts: number[];
  day(idx: number): AsOfDay;
}

const fmtNum = (v: number | null, d = 1) =>
  v === null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d });

/**
 * Đúng/sai của quyết định: mua đúng khi giá tăng, bán đúng khi giá giảm.
 * Tín hiệu bán chỉ chấm ở 1 tháng — kỳ hạn dài nó NGƯỢC là chính (docs/sell-zone.md).
 * (chuyển nguyên từ TimeMachine.tsx)
 */
export function verdictFor(
  zone: Zone,
  ret: number | null,
  h: "21" | "63" | "126"
): "right" | "wrong" | "n/a" | null {
  if (ret === null || zone === "neutral") return null;
  const buyish = zone === "buy" || zone === "strong-buy";
  if (!buyish && h !== "21") return "n/a";
  return (buyish ? ret > 0 : ret < 0) ? "right" : "wrong";
}

export function createAsOfEngine(points: TimelinePoint[], mode: AsOfMode): AsOfEngine {
  const { preset, weights, consensusMode, fusionDegraded } = mode;
  const buyThr = preset?.buyThreshold ?? 40;
  // v4: chế độ preset chấm bằng presetComposites (sub-signal vĩ mô trọng số riêng)
  const comps = preset ? presetComposites(points, preset) : composites(points, weights);
  // Đồng thuận: số preset báo mua từng ngày — CÙNG trục với verdict live
  const perPreset = consensusMode ? PRESETS.map((pr) => presetComposites(points, pr)) : null;
  const buyKs = perPreset
    ? points.map((_, i) =>
        PRESETS.reduce((k, pr, j) => k + (perPreset[j][i] >= pr.buyThreshold ? 1 : 0), 0)
      )
    : null;
  const signalIdxs = buyKs
    ? buyKs.reduce<number[]>((acc, k, i) => (k >= 1 ? (acc.push(i), acc) : acc), [])
    : idxsAtOrAbove(comps, buyThr);
  const sellIdxs = idxsAtOrBelow(comps, -40);
  const bottomStarts = bottomStartIdxs(points);
  const allPrices = points.map((q) => q.price);
  const preset3m = PRESETS.find((q) => q.id === "3m")!;

  function day(idx: number): AsOfDay {
    const p = points[idx];
    const composite = comps[idx];
    const kDay = buyKs ? buyKs[idx] : 0;
    const compZone = zoneOf(composite, buyThr);
    const rawZone: Zone = buyKs
      ? kDay >= 1
        ? consensusZone(kDay)
        : compZone === "sell" || compZone === "strong-sell"
          ? compZone
          : "neutral"
      : compZone;
    const isBuy = rawZone === "buy" || rawZone === "strong-buy";
    const isSell = rawZone === "sell" || rawZone === "strong-sell";
    // preset chỉ kiểm chứng phía mua — mặc định ẩn vùng bán (caller có thể tự hiện tham khảo)
    const zone: Zone = isBuy ? rawZone : "neutral";
    // Tầng "MUA độ tin cao" 3m: cycleBin past-only, KHÔNG dùng prob (base-rate look-ahead)
    const is3mBuyDay = consensusMode
      ? presetComposites([p], preset3m)[0] >= preset3m.buyThreshold
      : false;
    const highConf =
      highConfidenceBuy3m(
        consensusMode ? "3m" : (preset?.id ?? null),
        consensusMode ? is3mBuyDay : isBuy,
        p.cycleBin ?? -1,
        p.cycleBin !== undefined
      ) && !fusionDegraded;
    // Mức mua Bear DCA as-of — CÙNG engine với card live (golden: bearDcaAt ≡ runBearDca)
    const dcaAt = bearDcaAt(allPrices, idx, p.pricePct2y ?? null);
    // Cổng acute-crash as-of-ngày — CÙNG chính sách với live
    const crashDay = dcaAt.phase === "acute";
    const cycleProb = crashDay ? (p.cycleProbUw ?? p.cycleProb ?? null) : (p.cycleProb ?? null);
    const swingProb = crashDay ? (p.swingProbUw ?? p.swingProb ?? null) : (p.swingProb ?? null);
    const cycleN = p.cycleN ?? 0;
    const verified = cycleProb !== null && cycleN >= 10;
    const high = verified && cycleProb >= 60;
    const ciStr = !crashDay && p.cycleCi ? ` (CI ${p.cycleCi[0]}–${p.cycleCi[1]}%)` : "";
    const signedC = `${composite > 0 ? "+" : ""}${fmtNum(composite)}`;
    const scoreReason = buyKs
      ? kDay >= 1
        ? `Điểm mua: ${kDay}/3 preset kỳ hạn đang báo MUA — cò súng đã kiểm chứng 2 giai đoạn.`
        : isSell
          ? `Điểm mua: chưa preset nào báo mua; radar âm sâu (${signedC}) — gió ngược ngắn hạn, với người mua tương đương trung tính.`
          : `Điểm mua: chưa preset nào trong vùng mua (radar ${signedC}).`
      : undefined;
    const guidance = deriveGuidance({
      zone: rawZone,
      composite,
      bottom: {
        high,
        verified,
        label: verified
          ? `Săn đáy: xác suất gần đáy ${Math.round(cycleProb!)}%${ciStr}${crashDay ? " (đang sụp cấp tính — ước lượng thận trọng)" : ""}.`
          : "Săn đáy: chưa đủ dữ liệu kiểm chứng.",
      },
      premiumPct: null, // world-only ở as-of — cổng premium tắt (trung thực)
      premiumP80: null,
      scoreReason,
    });
    const verdictLabel = buyKs
      ? kDay >= 1
        ? consensusLabel(kDay)
        : "CHƯA CÓ TÍN HIỆU MUA"
      : preset && !isBuy
        ? "CHƯA CÓ TÍN HIỆU MUA"
        : isBuy
          ? rawZone === "strong-buy"
            ? "VÙNG MUA MẠNH"
            : "VÙNG MUA"
          : "TRUNG LẬP";
    return {
      idx,
      point: p,
      composite,
      kDay,
      rawZone,
      zone,
      isBuy,
      isSell,
      verdictLabel,
      highConf,
      dca: { phase: dcaAt.phase, mult: dcaAt.mult },
      crashDay,
      cycleProb,
      cycleCi: crashDay ? null : (p.cycleCi ?? null),
      cycleN,
      swingProb,
      swingCi: crashDay ? null : (p.swingCi ?? null),
      swingN: p.swingN ?? 0,
      guidance,
    };
  }

  return { comps, buyKs, signalIdxs, sellIdxs, bottomStarts, day };
}
```

Lưu ý khi port: nếu chữ ký `bearDcaAt` trả thêm field, giữ nguyên qua spread thay vì `{phase, mult}` — đọc `src/lib/bear-dca.ts:73` lúc code để khớp. Nếu `BearPhase` không export từ `types.ts` mà từ `bear-dca.ts`, sửa import theo thực tế.

- [ ] **Step 4: Chạy pass** — `npx vitest run src/lib/as-of.test.ts` → PASS toàn bộ.

- [ ] **Step 5: Refactor TimeMachine.tsx dùng engine (UI y hệt)**

Thay khối TimeMachine.tsx:143-184 (`buyThr`…`dcaAt`) + 288-357 (`composite`…`histGuidance`) bằng:

```tsx
import { createAsOfEngine, verdictFor } from "@/lib/as-of";
// XÓA các import không còn dùng trực tiếp: consensusZone, deriveGuidance,
// highConfidenceBuy3m, bearDcaAt, composites, presetComposites (GIỮ idxsAtOrAbove,
// idxsAtOrBelow, bottomStartIdxs? — bottomStarts giờ lấy từ engine, idxsAtOrAbove
// vẫn cần cho expIdxs). consensusLabel GIỮ (dateband). zoneOf bỏ nếu hết chỗ dùng.

const eng = useMemo(
  () => createAsOfEngine(points, { preset, weights, consensusMode, fusionDegraded }),
  [points, preset, weights, consensusMode, fusionDegraded]
);
const comps = eng.comps;
const buyKs = eng.buyKs;
const signalIdxs = eng.signalIdxs;
const sellIdxs = eng.sellIdxs;
const dayAt = useMemo(() => eng.day(idx), [eng, idx]);
```

rồi map biến cũ → mới tại chỗ dùng (KHÔNG đổi JSX):
- `composite` → `dayAt.composite`; `kDay` → `dayAt.kDay`; `rawZone` → `dayAt.rawZone`; `isBuy` → `dayAt.isBuy`; `isSell` → `dayAt.isSell`; `highConfDay` → `dayAt.highConf`; `dcaAt` → `dayAt.dca`; `bottomCrashDay` → `dayAt.crashDay`; `histGuidance` → `dayAt.guidance`.
- `zone` (toggle bán) giữ tại component: `const zone: Zone = dayAt.isBuy ? dayAt.rawZone : dayAt.isSell && showSell ? dayAt.rawZone : "neutral";`
- `bottomStarts` = `showBottomStart ? eng.bottomStarts : []`.
- Hai dòng prob trong `tm-bottom` (TimeMachine.tsx:655-656) đổi sang `dayAt.cycleProb/cycleCi/cycleN/swingProb/swingCi/swingN` (đã gate sẵn — bỏ điều kiện `bottomCrashDay ? … : …` inline).
- `verdictFor` + hằng `HORIZON_LABELS` giữ; xóa định nghĩa `verdictFor` local, import từ as-of.
- expIdxs/expThr/effThr giữ nguyên (dùng `comps`).

- [ ] **Step 6: Verify toàn bộ** — `npm test` PASS (mọi test cũ + mới), `npm run build` PASS. Mở app (`npm run dev`), so bằng mắt Máy thời gian trước/sau refactor trên 3 ngày: mới nhất, một ngày 2020-03 (crash — phải có ⚠ sụp cấp tính), một ngày có tín hiệu mua (◀ tới tín hiệu gần nhất): verdict/prob/DCA/guidance/kết quả 1-3-6T giống hệt.

- [ ] **Step 7: Checkpoint** — báo user: "Task 1 xong, test+build pass, sẵn sàng commit". KHÔNG commit.

---

### Task 2: Toán chart thuần `src/lib/price-chart.ts`

**Files:**
- Create: `src/lib/price-chart.ts`
- Create: `src/lib/price-chart.test.ts`

**Interfaces:**
- Consumes: `TimelinePoint`, `VnGoldEntry` (`src/lib/types.ts:170`).
- Produces (task 3 dùng):
  - `const RANGES: { label: string; months: number | null }[]` — `[{label:"1T",months:1},{label:"3T",months:3},{label:"1N",months:12},{label:"Max",months:null}]`
  - `const POINTS_PER_MONTH = 21`, `const MIN_SPAN = 14`
  - `function windowFor(total: number, months: number | null): { start: number; span: number }` — neo cuối
  - `function sjcMap(rows: VnGoldEntry[]): Map<string, number>` — date → sjcSell (bỏ null)
  - `interface ChartGeom { W: number; H: number; xauPath: string; sjcPath: string | null; x(i: number): number; yXau(v: number): number; xauMin: number; xauMax: number; sjcMin: number | null; sjcMax: number | null; sjcFrom: string | null }`
  - `function buildGeom(points: TimelinePoint[], start: number, span: number, sjc: Map<string, number>, W?: number, H?: number): ChartGeom`

- [ ] **Step 1: Viết test fail** — `src/lib/price-chart.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { windowFor, sjcMap, buildGeom, MIN_SPAN, POINTS_PER_MONTH } from "./price-chart";
import type { TimelinePoint, VnGoldEntry } from "./types";

const mkPt = (date: string, price: number) =>
  ({ date, price, composite: 0, zone: "neutral", scores: {}, returns: { "21": null, "63": null, "126": null } }) as unknown as TimelinePoint;
const mkVn = (date: string, sjcSell: number | null): VnGoldEntry =>
  ({ date, sjcBuy: null, sjcSell, ringBuy: null, ringSell: null, usdVnd: null, xauUsd: null, premiumPct: null });

describe("windowFor", () => {
  it("1 tháng = 21 phiên neo cuối", () => {
    expect(windowFor(100, 1)).toEqual({ start: 100 - POINTS_PER_MONTH, span: POINTS_PER_MONTH });
  });
  it("Max = toàn bộ", () => {
    expect(windowFor(100, null)).toEqual({ start: 0, span: 100 });
  });
  it("kẹp MIN_SPAN và total", () => {
    expect(windowFor(10, 1)).toEqual({ start: 0, span: 10 }); // total < MIN_SPAN ⇒ span=total
    expect(windowFor(100, 0 as unknown as number).span).toBeGreaterThanOrEqual(MIN_SPAN);
  });
});

describe("sjcMap", () => {
  it("bỏ hàng sjcSell null", () => {
    const m = sjcMap([mkVn("2025-02-08", 90_300_000), mkVn("2025-02-09", null)]);
    expect(m.get("2025-02-08")).toBe(90_300_000);
    expect(m.has("2025-02-09")).toBe(false);
  });
});

describe("buildGeom", () => {
  const pts = [mkPt("2025-02-08", 2800), mkPt("2025-02-09", 2900), mkPt("2025-02-10", 2850)];
  it("xauPath phủ cửa sổ, x tăng dần", () => {
    const g = buildGeom(pts, 0, 3, new Map());
    expect(g.xauPath.startsWith("M")).toBe(true);
    expect(g.x(0)).toBeLessThan(g.x(2));
    expect(g.sjcPath).toBeNull();
    expect(g.sjcFrom).toBeNull();
  });
  it("sjcPath chỉ nối ngày có dữ liệu, sjcFrom = ngày SJC đầu trong cửa sổ", () => {
    const sjc = new Map([["2025-02-09", 91_000_000], ["2025-02-10", 92_000_000]]);
    const g = buildGeom(pts, 0, 3, sjc);
    expect(g.sjcPath).not.toBeNull();
    expect(g.sjcFrom).toBe("2025-02-09");
    expect(g.sjcMin).toBe(91_000_000);
    expect(g.sjcMax).toBe(92_000_000);
  });
  it("scale y: giá cao hơn ⇒ y nhỏ hơn (SVG úp trục)", () => {
    const g = buildGeom(pts, 0, 3, new Map());
    expect(g.yXau(2900)).toBeLessThan(g.yXau(2800));
  });
});
```

- [ ] **Step 2: Chạy fail** — `npx vitest run src/lib/price-chart.test.ts` → FAIL module not found.

- [ ] **Step 3: Viết `src/lib/price-chart.ts`:**

```ts
/** Toán chart chính (PriceChart) — thuần, không React. 2 trục giá tuyệt đối:
 *  SJC (VND/lượng, trục trái) + XAU/USD (trục phải). KHÔNG normalize % (spec 2026-07-10). */
import type { TimelinePoint, VnGoldEntry } from "./types";

export const POINTS_PER_MONTH = 21;
export const MIN_SPAN = 14;

export const RANGES: { label: string; months: number | null }[] = [
  { label: "1T", months: 1 },
  { label: "3T", months: 3 },
  { label: "1N", months: 12 },
  { label: "Max", months: null },
];

/** Cửa sổ mặc định neo về phiên mới nhất. */
export function windowFor(total: number, months: number | null): { start: number; span: number } {
  const span =
    months === null ? total : Math.min(total, Math.max(Math.min(MIN_SPAN, total), months * POINTS_PER_MONTH));
  return { start: Math.max(0, total - span), span };
}

/** date → giá SJC bán (bỏ null). */
export function sjcMap(rows: VnGoldEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) if (r.sjcSell !== null) m.set(r.date, r.sjcSell);
  return m;
}

export interface ChartGeom {
  W: number;
  H: number;
  xauPath: string;
  /** null khi cửa sổ không giao lịch sử SJC */
  sjcPath: string | null;
  x(i: number): number;
  yXau(v: number): number;
  xauMin: number;
  xauMax: number;
  sjcMin: number | null;
  sjcMax: number | null;
  /** ngày SJC đầu tiên có trong cửa sổ (chú thích "SJC: từ …") — null nếu SJC phủ từ mép trái hoặc không có */
  sjcFrom: string | null;
}

export function buildGeom(
  points: TimelinePoint[],
  start: number,
  span: number,
  sjc: Map<string, number>,
  W = 700,
  H = 160
): ChartGeom {
  const end = Math.min(points.length, start + span);
  const win = points.slice(start, end);
  const x = (i: number) => ((i - start) / Math.max(1, win.length - 1)) * W;
  const pad = 6;
  const scaleY = (min: number, max: number) => (v: number) =>
    H - ((v - min) / (max - min || 1)) * (H - pad * 2) - pad;

  const xs = win.map((q) => q.price);
  const xauMin = Math.min(...xs);
  const xauMax = Math.max(...xs);
  const yXau = scaleY(xauMin, xauMax);
  const xauPath = win
    .map((q, j) => `${j === 0 ? "M" : "L"}${x(start + j).toFixed(1)},${yXau(q.price).toFixed(1)}`)
    .join("");

  const sjcPts = win
    .map((q, j) => ({ j, v: sjc.get(q.date) }))
    .filter((o): o is { j: number; v: number } => o.v !== undefined);
  let sjcPath: string | null = null;
  let sjcMin: number | null = null;
  let sjcMax: number | null = null;
  let sjcFrom: string | null = null;
  if (sjcPts.length >= 2) {
    sjcMin = Math.min(...sjcPts.map((o) => o.v));
    sjcMax = Math.max(...sjcPts.map((o) => o.v));
    const ySjc = scaleY(sjcMin, sjcMax);
    sjcPath = sjcPts
      .map((o, k) => `${k === 0 ? "M" : "L"}${x(start + o.j).toFixed(1)},${ySjc(o.v).toFixed(1)}`)
      .join("");
    if (sjcPts[0].j > 0) sjcFrom = win[sjcPts[0].j].date;
  }

  return { W, H, xauPath, sjcPath, x, yXau, xauMin, xauMax, sjcMin, sjcMax, sjcFrom };
}
```

Lưu ý test "sjcFrom = 2025-02-09": window bắt đầu 2025-02-08 không có SJC ⇒ `sjcPts[0].j===1>0` ⇒ sjcFrom đúng. Trường hợp SJC phủ từ mép trái ⇒ null (không cần chú thích).

- [ ] **Step 4: Chạy pass** — `npx vitest run src/lib/price-chart.test.ts` → PASS. `npm test` + `npm run build` PASS.

- [ ] **Step 5: Checkpoint** — báo "Task 2 xong, sẵn sàng commit". KHÔNG commit.

---

### Task 3: Component `PriceChart` + gắn vào trang (cạnh layout cũ, chưa lan as-of)

**Files:**
- Create: `src/components/PriceChart.tsx`
- Modify: `src/app/page.tsx` (import vn-gold.json)
- Modify: `src/components/Dashboard.tsx` (props `vnRows`, render chart giữa FAB và accordion 1; state `selIdx` cục bộ — CHƯA nối ra trang)
- Modify: `src/app/globals.css` (class `pc-*`)

**Interfaces:**
- Consumes: task 1 `createAsOfEngine` (chỉ để lấy `signalIdxs`/`bottomStarts` cho chấm), task 2 toàn bộ, `applyBrushDrag` (`src/lib/brush.ts:13`).
- Produces: `PriceChart` props — `{ points: TimelinePoint[]; vnRows: VnGoldEntry[]; selectedIdx: number | null; onSelect: (idx: number) => void; buyDots: number[]; bottomDots: number[] }`. Task 4 tái dùng `selIdx`/`setSelIdx` + `engine` đã khai báo ở task này.

- [ ] **Step 1: Viết `src/components/PriceChart.tsx`:**

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import type { TimelinePoint, VnGoldEntry } from "@/lib/types";
import { applyBrushDrag } from "@/lib/brush";
import { RANGES, MIN_SPAN, windowFor, sjcMap, buildGeom } from "@/lib/price-chart";

/** ngưỡng px phân biệt chạm (chọn ngày) vs kéo (pan) — cùng giá trị TimeMachine */
const TAP_PX = 6;

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
const fmtTr = (v: number) => (v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export default function PriceChart({
  points,
  vnRows,
  selectedIdx,
  onSelect,
  buyDots,
  bottomDots,
}: {
  points: TimelinePoint[];
  vnRows: VnGoldEntry[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
  buyDots: number[];
  bottomDots: number[];
}) {
  const [months, setMonths] = useState<number | null>(1);
  /** null = neo cuối (mặc định); số = đã pan */
  const [panStart, setPanStart] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ pointerId: number; originX: number; anchorStart: number; moved: boolean } | null>(null);

  const def = windowFor(points.length, months);
  const span = def.span;
  const start = Math.max(0, Math.min(panStart ?? def.start, points.length - span));
  const end = start + span;
  const startRef = useRef(start);
  startRef.current = start;

  const sjc = useMemo(() => sjcMap(vnRows), [vnRows]);
  const geom = useMemo(() => buildGeom(points, start, span, sjc), [points, start, span, sjc]);

  const xToIdx = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return start + Math.round(frac * (span - 1));
  };

  // 1 ngón: tap = chọn ngày, kéo ngang = pan (KHÔNG pinch/wheel — range bằng nút, spec)
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, originX: e.clientX, anchorStart: start, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const dxPx = e.clientX - d.originX;
    if (!d.moved && Math.abs(dxPx) < TAP_PX) return;
    d.moved = true;
    const deltaIdx = -Math.round((dxPx / rect.width) * span);
    const next = applyBrushDrag("pan", d.anchorStart, span, deltaIdx, points.length, MIN_SPAN);
    setPanStart(next.start);
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const wasTap = drag.current?.pointerId === e.pointerId && drag.current?.moved === false;
    if (wasTap) {
      const i = xToIdx(e.clientX);
      if (i !== null) onSelect(i);
    }
    svgRef.current?.releasePointerCapture(e.pointerId);
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

  const inWin = (i: number) => i >= start && i < end;
  const dotStyle = (i: number) => ({
    left: `${(geom.x(i) / geom.W) * 100}%`,
    top: `${(geom.yXau(points[i].price) / geom.H) * 100}%`,
  });

  return (
    <section className="card pc">
      <div className="pc-ranges">
        {RANGES.map((r) => (
          <button
            key={r.label}
            className={`iconbtn small-btn ${months === r.months ? "active" : ""}`}
            onClick={() => {
              setMonths(r.months);
              setPanStart(null); // range mới neo về cuối
            }}
          >
            {r.label}
          </button>
        ))}
        <span className="pc-legend muted small">
          <i className="pc-line xau" /> XAU/USD <i className="pc-line sjc" /> SJC
        </span>
      </div>

      <div className="pc-chartwrap">
        <svg
          ref={svgRef}
          className="pc-chart"
          viewBox={`0 0 ${geom.W} ${geom.H}`}
          preserveAspectRatio="none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-label="Biểu đồ giá — chạm để chọn ngày, kéo để trượt thời gian"
        >
          <path d={geom.xauPath} fill="none" stroke="#e6b84c" strokeWidth="1.5" opacity="0.85" />
          {geom.sjcPath && (
            <path d={geom.sjcPath} fill="none" stroke="#7fb1e0" strokeWidth="1.2" opacity="0.8" />
          )}
          {selectedIdx !== null && inWin(selectedIdx) && (
            <line
              x1={geom.x(selectedIdx)}
              y1="0"
              x2={geom.x(selectedIdx)}
              y2={geom.H}
              stroke="#ece5d8"
              strokeWidth="1"
              opacity="0.5"
            />
          )}
        </svg>
        {/* marker overlay HTML — tròn tuyệt đối (SVG preserveAspectRatio=none kéo méo circle) */}
        <div className="tm-markers" aria-hidden>
          {buyDots.filter(inWin).map((i) => (
            <span key={`b${i}`} className="tm-mk buy" style={dotStyle(i)} />
          ))}
          {bottomDots.filter(inWin).map((i) => (
            <span key={`s${i}`} className="tm-mk start" style={dotStyle(i)} />
          ))}
          {selectedIdx !== null && inWin(selectedIdx) && (
            <span className="tm-mk cursor" style={dotStyle(selectedIdx)} />
          )}
        </div>
        {/* nhãn trục 2 bên (tuyệt đối, không normalize) */}
        <span className="pc-axis right top muted small">${Math.round(geom.xauMax)}</span>
        <span className="pc-axis right bottom muted small">${Math.round(geom.xauMin)}</span>
        {geom.sjcMax !== null && (
          <>
            <span className="pc-axis left top muted small">{fmtTr(geom.sjcMax)}tr</span>
            <span className="pc-axis left bottom muted small">{fmtTr(geom.sjcMin!)}tr</span>
          </>
        )}
        <span className="tm-edge from" aria-hidden>{fmtDate(points[start].date)}</span>
        <span className="tm-edge to" aria-hidden>{fmtDate(points[end - 1].date)}</span>
      </div>

      <p className="muted small pc-note">
        ● ngày đồng thuận MUA · ◆ khởi đầu vùng đáy (walk-forward) · chạm chart để xem cả trang
        as-of ngày đó{geom.sjcPath === null && vnRows.length > 0 ? ` · SJC: dữ liệu từ ${fmtDate(vnRows[0].date)}` : ""}
        {geom.sjcFrom ? ` · SJC: từ ${fmtDate(geom.sjcFrom)}` : ""}
      </p>
    </section>
  );
}
```

- [ ] **Step 2: `src/app/page.tsx`** — thêm import + prop:

```tsx
import vnGoldJson from "../../public/data/history/vn-gold.json";
import type { VnGoldEntry } from "@/lib/types";
// trong Home():
const vnRows = vnGoldJson as unknown as VnGoldEntry[];
// truyền <Dashboard … vnRows={vnRows} />
```

- [ ] **Step 3: Dashboard.tsx** — nhận prop `vnRows: VnGoldEntry[]`; thêm dưới FAB/SettingsSheet (sau dòng 466):

```tsx
// Engine as-of của cả trang — cùng nguồn với TimeMachine (task 4 nối ra các khối)
const engine = useMemo(
  () => createAsOfEngine(timeline.points, { preset, weights, consensusMode, fusionDegraded }),
  [timeline.points, preset, weights, consensusMode, fusionDegraded]
);
const [selIdx, setSelIdx] = useState<number | null>(null);
```

(import `createAsOfEngine` từ `@/lib/as-of`, `PriceChart` từ `./PriceChart`.) JSX ngay trên accordion 1:

```tsx
{/* ── CHART CHÍNH — chạm chọn ngày (task 3: mới chỉ crosshair, task 4 nối as-of) ── */}
<PriceChart
  points={timeline.points}
  vnRows={vnRows}
  selectedIdx={selIdx}
  onSelect={setSelIdx}
  buyDots={engine.signalIdxs}
  bottomDots={engine.bottomStarts}
/>
```

- [ ] **Step 4: CSS** — thêm cuối `globals.css`:

```css
/* ── PriceChart ── */
.pc-ranges { display: flex; gap: 0.4rem; align-items: center; margin-bottom: 0.4rem; }
.pc-legend { margin-left: auto; display: flex; gap: 0.5rem; align-items: center; }
.pc-line { display: inline-block; width: 14px; height: 0; border-top: 2px solid #e6b84c; }
.pc-line.sjc { border-top-color: #7fb1e0; }
.pc-chartwrap { position: relative; }
.pc-chart { width: 100%; height: 160px; display: block; touch-action: none; cursor: crosshair; }
.pc-axis { position: absolute; pointer-events: none; }
.pc-axis.right { right: 4px; }
.pc-axis.left { left: 4px; }
.pc-axis.top { top: 2px; }
.pc-axis.bottom { bottom: 16px; }
.pc-note { margin-top: 0.3rem; }
```

(`.tm-markers`/`.tm-mk`/`.tm-edge` tái dùng CSS sẵn có — kiểm tra chúng không selector-scoped vào `.tm-chartwrap`; nếu có, thêm `.pc-chartwrap` vào selector.)

- [ ] **Step 5: Verify** — `npm test` + `npm run build` PASS. Dev: chart hiện 1T mặc định, nút 3T/1N/Max đổi range, SJC xanh hiện ở range giao 2025-02+, kéo ngang pan không cuộn trang, kéo dọc NGOÀI chart cuộn bình thường, chạm hiện crosshair + chấm cursor, chấm ● và ◆ hiện ở range dài. Mobile ≤380px: chart ≤~40% màn.

- [ ] **Step 6: Checkpoint** — báo "Task 3 xong, sẵn sàng commit". KHÔNG commit.

---

### Task 4: Nối as-of ra cả trang (hero + bar + khối; TimeMachine vẫn còn để đối chiếu)

**Files:**
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/components/BearDownsideCard.tsx` (prop `asOfIdx?`)
- Modify: `src/app/globals.css` (`.asof-bar`, viền trang as-of)

**Interfaces:**
- Consumes: `engine`/`selIdx` (task 3), `AsOfDay`, `verdictFor` (task 1).
- Produces: `const asOf: AsOfDay | null` — mọi JSX live đổi theo mẫu `asOf ? asOf.x : liveX`. `BearDownsideCard` prop mới `asOfIdx?: number | null`.

- [ ] **Step 1: Dashboard — tính `asOf` + vn row as-of** (sau `selIdx`):

```tsx
const asOf = useMemo(() => (selIdx === null ? null : engine.day(selIdx)), [engine, selIdx]);
const vnByDate = useMemo(() => new Map(vnRows.map((r) => [r.date, r])), [vnRows]);
const asOfVn = asOf ? (vnByDate.get(asOf.point.date) ?? null) : null;
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
```

- [ ] **Step 2: As-of bar sticky ngay DƯỚI PriceChart:**

```tsx
{asOf && (
  <div className="asof-bar">
    <button className="iconbtn small-btn" onClick={() => setSelIdx(null)}>← Hôm nay</button>
    <b>{fmtDate(asOf.point.date)}</b>
    <span className="muted small">XAU ${fmtNum(asOf.point.price, 0)}</span>
    <span className="asof-rets">
      {(["21", "63", "126"] as const).map((h) => {
        const ret = asOf.point.returns[h];
        const v = verdictFor(asOf.zone, ret, h);
        return (
          <span key={h} className="small">
            {h === "21" ? "1T" : h === "63" ? "3T" : "6T"}:{" "}
            <b className={ret === null ? "muted" : ret >= 0 ? "buy" : "sell"}>
              {ret === null ? "—" : `${ret >= 0 ? "+" : ""}${fmtNum(ret)}%`}
            </b>
            {v === "right" && <span className="buy">✓</span>}
            {v === "wrong" && <span className="sell">✗</span>}
          </span>
        );
      })}
    </span>
  </div>
)}
```

- [ ] **Step 3: Hero as-of** — đổi lời gọi `ActionGuidance` hiện tại (Dashboard.tsx:354):

```tsx
<ActionGuidance
  guidance={asOf ? asOf.guidance : guidance}
  meta={
    asOf ? (
      <>
        <b>{asOf.verdictLabel}</b>
        {asOf.highConf && <b> · đã kiểm chứng (3 tháng)</b>} · radar{" "}
        <b>{asOf.composite > 0 ? `+${fmtNum(asOf.composite)}` : fmtNum(asOf.composite)}</b>
        {" · "}
        <span className="muted">đang xem {fmtDate(asOf.point.date)} — dữ liệu thế giới (chênh VN không áp dụng quá khứ)</span>
      </>
    ) : (
      heroMeta
    )
  }
  note={
    asOf ? (
      <>
        {asOf.isSell && (
          <div className="verdict-note">
            ⓘ Ngày này radar âm sâu — tham khảo NGƯỜI BÁN như live: kết cục 6 tháng phụ thuộc
            regime (sai gần 100% năm bull); trong kỳ hạn ~1 tháng bán muộn/lúc bứt ≥2σ tốt hơn
            bán ngay (docs/sell-zone.md).
          </div>
        )}
        {asOf.crashDay && (
          <div className="verdict-note">
            ⚠ Ngày này giá đang sụp cấp tính — xác suất săn đáy hiển thị bản thận trọng
            (không trọng số).
          </div>
        )}
      </>
    ) : (
      <>{/* GIỮ NGUYÊN toàn bộ note live hiện tại Dashboard.tsx:357-415 */}</>
    )
  }
/>
```

- [ ] **Step 4: Giá as-of** — bọc section prices (Dashboard.tsx:419-442): khi `asOf`, render thay thế:

```tsx
{asOf ? (
  <section className="prices asof">
    <div className="price-item"><span>SJC bán (ngày xem)</span><b>{asOfVn?.sjcSell != null ? fmtMoney(asOfVn.sjcSell) : "—"}</b></div>
    <div className="price-item"><span>Nhẫn bán</span><b>{asOfVn?.ringSell != null ? fmtMoney(asOfVn.ringSell) : "—"}</b></div>
    <div className="price-item"><span>XAU/USD</span><b>${fmtNum(asOf.point.price, 0)}</b></div>
    <div className="price-item"><span>Chênh VN−TG</span><b>{asOfVn?.premiumPct != null ? `${fmtNum(asOfVn.premiumPct)}%` : "chưa có dữ liệu VN"}</b></div>
  </section>
) : (
  /* section prices live giữ nguyên */
)}
```

- [ ] **Step 5: BearDownsideCard đồng bộ** — thêm prop + effect (BearDownsideCard.tsx):

```tsx
export default function BearDownsideCard({ bd, timeline, asOfIdx }: { bd: BearDownsideAnalysis; timeline: Timeline; asOfIdx?: number | null }) {
  …
  const [idx, setIdx] = useState(Math.max(0, points.length - 1));
  useEffect(() => {
    if (asOfIdx != null) setIdx(Math.min(asOfIdx, points.length - 1));
    else setIdx(Math.max(0, points.length - 1));
  }, [asOfIdx, points.length]);
```

(thêm `useEffect` vào import react). Dashboard: `<BearDownsideCard bd={bearDownside} timeline={timeline} asOfIdx={selIdx} />`.

- [ ] **Step 6: Khối Săn đáy + DCA as-of** — trong accordion "Săn đáy" và "Vùng tích lũy": khi `asOf`, thay body bằng tóm tắt as-of (không đủ dữ liệu quá khứ cho card đầy đủ — giới hạn trung thực, như TimeMachine):

```tsx
{/* body accordion Săn đáy */}
{asOf ? (
  <div className="acc-body">
    <div className="tm-bottom">
      {([["Đáy chu kỳ", "≈6 tháng", asOf.cycleProb, asOf.cycleCi, asOf.cycleN],
         ["Đáy sóng", "≈1 tháng", asOf.swingProb, asOf.swingCi, asOf.swingN]] as
         [string, string, number | null, [number, number] | null, number][]).map(([t, sub, prob, ci, n]) => (
        <div key={t} className="tm-bottom-item">
          <span className="muted small">{t} <span className="muted small">{sub}</span></span>
          {prob !== null && n >= 10 ? (
            <span className={`bottom-gauge-pct ${bottomPctClass(prob)}`}>
              {Math.round(prob)}%{ci ? <span className="muted small"> (CI {ci[0]}–{ci[1]}%)</span> : null}
            </span>
          ) : (
            <span className="muted small">Chưa đủ dữ liệu kiểm chứng</span>
          )}
        </div>
      ))}
    </div>
    {asOf.crashDay && <div className="muted small">⚠ Đang sụp cấp tính — ước lượng thận trọng (không trọng số).</div>}
  </div>
) : (
  <div className="acc-body flat"><BottomGauges bottom={bottom} crashMode={bottomCrashMode} /></div>
)}
```

```tsx
{/* body accordion Vùng tích lũy */}
{asOf ? (
  <div className="acc-body">
    <div className="muted small">
      <b className={asOf.dca.mult >= 1 ? "buy" : "sell"}>Mức mua (as-of):</b> pha{" "}
      {DCA_PHASE_LABEL[asOf.dca.phase]} → mỗi đợt ×{asOf.dca.mult}
      {asOf.point.pricePct2y != null && ` · giá percentile ${Math.round(asOf.point.pricePct2y * 100)}% (2 năm)`}
      . Cùng engine với card live (bearDcaAt ≡ runBearDca).
    </div>
  </div>
) : (
  <div className="acc-body flat"><BearDcaCard bearDca={bearDca} health={bearDcaHealth} /></div>
)}
```

(import `bottomPctClass` từ `@/lib/bottom`; thêm hằng `DCA_PHASE_LABEL` — chuyển từ TimeMachine.tsx:35-40 sang `src/lib/as-of.ts` export để 2 nơi dùng chung, TimeMachine import lại.) Accordion "Chênh lệch VN−TG": khi `asOf` thay `<PremiumChart/>` bằng `<p className="muted small">Chênh lệch chỉ có bản live — dữ liệu VN quá khứ từ 2025-02, biểu đồ này không tái hiện as-of.</p>`. Accordion "Chi tiết điểm số"/"4 nhóm tiêu chí": khi `asOf`, gauge dùng `asOf.composite`, phần criteria thay bằng tm-scores (port từ TimeMachine.tsx:708-726, dùng `asOf.point.scores`) + chú thích "as-of chỉ có điểm số, không có chuỗi giải thích".

- [ ] **Step 7: CSS:**

```css
/* ── as-of ── */
.asof-bar { position: sticky; top: 0; z-index: 5; display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; background: var(--card2); border: 1px solid var(--gold); border-radius: 8px; padding: 0.4rem 0.6rem; margin: 0.4rem 0; }
.asof-rets { display: flex; gap: 0.6rem; margin-left: auto; }
main.wrap.asof-mode { outline: 2px solid #3a2c12; outline-offset: -2px; }
```

và `<main className={`wrap${asOf ? " asof-mode" : ""}`}>`.

- [ ] **Step 8: Verify** — `npm test` + `npm run build` PASS. Dev đối chiếu SONG SONG với Máy thời gian (vẫn còn): chọn cùng 1 ngày trên PriceChart và trong TimeMachine → verdict/radar/prob/DCA/returns PHẢI giống hệt (cùng engine). Kiểm 7 ràng buộc an toàn: chọn ngày 2020-03 (crash ⇒ ⚠ + prob thận trọng), ngày composite ≤ −40 (note người bán + tone trung tính), ngày có tín hiệu 3m + bin đáy (chip đã kiểm chứng), premium as-of luôn "không áp dụng". `← Hôm nay` trả mọi thứ về live đúng như trước khi chọn.

- [ ] **Step 9: Checkpoint** — báo "Task 4 xong, đã đối chiếu TimeMachine, sẵn sàng commit". KHÔNG commit.

---

### Task 5: IA 8→4 khối + 2 chip trả lời + thứ tự mới

**Files:**
- Modify: `src/components/Dashboard.tsx` (sắp lại JSX)
- Modify: `src/components/ActionGuidance.tsx` (export `LEVEL_TAG`)
- Modify: `src/app/globals.css` (`.answer-chip`)

**Interfaces:**
- Consumes: mọi thứ task 1-4. `qtyForPhase` (`src/lib/bear-dca.ts`, BearDcaCard.tsx:3 đã dùng), `LEVEL_TAG` (ActionGuidance).
- Produces: bố cục cuối theo spec; id khối: `#khoi-mua`, `#khoi-gom`, `#khoi-trienvong`, `#khoi-chitiet`.

- [ ] **Step 1: Export LEVEL_TAG** — ActionGuidance.tsx: `const LEVEL_TAG` → `export const LEVEL_TAG`.

- [ ] **Step 2: Sắp lại JSX Dashboard theo bố cục spec** (trên→dưới): header → freshness-top → banners → **giá** (section prices, giữ nguyên/đã có nhánh as-of) → **2 chip** (mới, dưới) → **PriceChart + asof-bar** → **hero ActionGuidance** (giữ nguyên vị trí tương đối sau chart để câu chuyện "chip trả lời nhanh → chart → lý do đầy đủ") → **4 khối details** → footer. Chip:

```tsx
const liveMult = qtyForPhase(bearDca.phase, bearDca.ddFromAth, bearDca.pricePct2y);
const chipGuidance = asOf ? asOf.guidance : guidance;
const chipDca = asOf ? asOf.dca : { phase: bearDca.phase, mult: liveMult };
const openBlock = (id: string) => {
  const el = document.getElementById(id) as HTMLDetailsElement | null;
  if (el) {
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};
```

```tsx
{/* ── 2 CHIP TRẢ LỜI TỨC THÌ ── */}
<section className="answer-chips">
  <button className={`answer-chip ${chipGuidance.tone}`} onClick={() => openBlock("khoi-mua")}>
    <span className="q">Mua?</span>
    <b>{LEVEL_TAG[chipGuidance.level]}</b>
    <span className="small">{chipGuidance.when}</span>
  </button>
  <button
    className={`answer-chip ${chipDca.mult >= 1 ? "buy" : chipDca.mult >= 0.75 ? "neutral" : "sell"}`}
    onClick={() => openBlock("khoi-gom")}
  >
    <span className="q">Gom?</span>
    <b>×{chipDca.mult}</b>
    <span className="small">{DCA_PHASE_LABEL[chipDca.phase]}</span>
  </button>
</section>
```

- [ ] **Step 3: Gộp 8 accordion → 4 khối `<details className="acc" id=…>`** — mapping (nội dung CHUYỂN NGUYÊN VĂN, không viết lại):
  1. `#khoi-mua` "Mua bây giờ?" (meta "đồng thuận k/3 · gauge · chênh lệch") — gom theo thứ tự: khối verdict-bt consensus/preset (Dashboard.tsx:492-546 hiện tại) + gauge (478-491) + body accordion "Chênh lệch VN−TG" cũ (686 + nhánh as-of task 4). Preset row nằm trong SettingsSheet — GIỮ nguyên FAB (không chuyển).
  2. `#khoi-gom` "Gom dài hạn?" (meta "mức mua tháng này · % gần đáy") — body accordion "Vùng tích lũy" cũ TRƯỚC, "Săn đáy" cũ SAU (cả 2 đã có nhánh as-of từ task 4).
  3. `#khoi-trienvong` "Triển vọng 1/3/6 tháng" — `<BearDownsideCard bd={bearDownside} timeline={timeline} asOfIdx={selIdx} />` nguyên trạng.
  4. `#khoi-chitiet` "Chi tiết & kiểm chứng" (meta "4 tiêu chí · backtest · nguồn dữ liệu") — 4 thẻ criteria (595-622, + nhánh as-of tm-scores từ task 4) + bảng backtest (636-672, highlight `asOf ? asOf.zone : zone`) + acc-prices XAU/USDVND (547-556, chỉ live) + freshness (557-581) + ghi chú backtest.
  Xóa 8 `<details>` cũ sau khi nội dung đã nằm trong 4 khối mới. Accordion "Máy thời gian" GIỮ NGUYÊN (xóa ở task 6) — đặt cuối, trên footer.

- [ ] **Step 4: CSS:**

```css
/* ── answer chips ── */
.answer-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin: 0.5rem 0; }
.answer-chip { display: flex; flex-direction: column; align-items: flex-start; gap: 0.15rem; padding: 0.55rem 0.7rem; border-radius: 10px; border: 1px solid var(--card2); background: var(--card); color: inherit; text-align: left; cursor: pointer; }
.answer-chip .q { font-size: 0.72rem; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.04em; }
.answer-chip b { font-size: 1.05rem; }
.answer-chip.buy { border-left: 3px solid var(--buy); }
.answer-chip.sell { border-left: 3px solid var(--sell); }
.answer-chip.neutral { border-left: 3px solid var(--muted); }
```

- [ ] **Step 5: Verify** — `npm test` + `npm run build` PASS. Dev checklist: thứ tự giá→chip→chart→hero→4 khối; chạm chip mở + cuộn đúng khối; mọi nội dung cũ tìm được ở khối mới (soát mapping spec: gauge→①, XAU/USDVND+freshness→④, PremiumChart→①, BearDca+Bottom→②, BearDownside→③, backtest→④); verdict-note bán + chip high-conf + banner degraded còn nguyên; as-of vẫn hoạt động ở cả 4 khối; mobile ≤380px giá+chip+chart ~1 màn.

- [ ] **Step 6: Checkpoint** — báo "Task 5 xong — Phase 1 khung hoàn chỉnh, TimeMachine vẫn còn để đối chiếu. Sẵn sàng commit. ĐỀ NGHỊ: dùng thử vài ngày trước khi cho phép task 6 (xóa TimeMachine)."

---

### Task 6 (GATED — chỉ chạy khi user xác nhận đã dùng thử ổn): Xóa TimeMachine

**Files:**
- Delete: `src/components/TimeMachine.tsx`
- Modify: `src/components/Dashboard.tsx` (xóa accordion Máy thời gian + import)
- KHÔNG xóa: `src/lib/brush.ts` (PriceChart dùng `applyBrushDrag`; `centerWindow`/`zoomTo` giữ — BearDownsideCard/tương lai), CSS `.tm-*` (PriceChart + BearDownsideCard tái dùng `tm-markers/tm-mk/tm-edge/tm-range/tm-daterange/tm-bottom`).

- [ ] **Step 1:** Hỏi user xác nhận. Chưa xác nhận ⇒ DỪNG task này.
- [ ] **Step 2:** Xóa `<details>` Máy thời gian (Dashboard) + `import TimeMachine`; xóa file `TimeMachine.tsx`.
- [ ] **Step 3:** `npx tsc --noEmit` (hoặc `npm run build`) bắt import mồ côi; `npm test` PASS (as-of.test giữ mọi logic cũ sống); grep `TimeMachine` = 0 kết quả ngoài docs.
- [ ] **Step 4:** Checkpoint — báo "sẵn sàng commit". KHÔNG commit.

---

### Task 7 (Phase 2): Design token + typography

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1:** Thêm token vào `:root` (GIỮ giá trị hiện có — chỉ đặt tên hệ thống, không đổi màu):

```css
:root {
  /* token 2026-07-10 — surface 3 cấp + chữ 5 bậc + spacing 4/8 */
  --surface-0: var(--bg);
  --surface-1: var(--card);
  --surface-2: var(--card2);
  --fs-xs: 0.72rem; --fs-sm: 0.85rem; --fs-md: 1rem; --fs-lg: 1.25rem; --fs-xl: 1.6rem;
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --radius: 10px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
```

- [ ] **Step 2:** Áp `font-variant-numeric: tabular-nums` cho số to: selector `.price-item b, .answer-chip b, .bottom-gauge-pct, .asof-bar b, .tm-results b { font-variant-numeric: tabular-nums; }`. Đồng nhất card: `.card, .acc, .answer-chip { border-radius: var(--radius); box-shadow: var(--shadow); }` (kiểm tra không phá layout hiện có — nếu `.acc` đã có radius khác thì thay giá trị cũ bằng token).
- [ ] **Step 3:** Verify — `npm run build` PASS; dev soát mắt cả trang light regression (màu KHÔNG đổi, chỉ radius/shadow/số).
- [ ] **Step 4:** Checkpoint — báo "sẵn sàng commit".

---

### Task 8 (Phase 2): Polish chart + chip

**Files:**
- Modify: `src/lib/price-chart.ts` + `src/lib/price-chart.test.ts` (hàm `smoothPath`)
- Modify: `src/components/PriceChart.tsx`, `src/app/globals.css`

- [ ] **Step 1: Test fail** — thêm vào `price-chart.test.ts`:

```ts
import { smoothPath } from "./price-chart";
describe("smoothPath", () => {
  it("giữ điểm đầu/cuối, sinh Q giữa các điểm", () => {
    const d = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 10 }]);
    expect(d.startsWith("M0,10")).toBe(true);
    expect(d).toContain("Q");
    expect(d.endsWith("20,10")).toBe(true);
  });
  it("<3 điểm rớt về đường thẳng", () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe("M0,0L5,5");
  });
});
```

- [ ] **Step 2:** Implement trong `price-chart.ts`:

```ts
/** Path mượt nhẹ (quadratic qua trung điểm) — polish, không đổi dữ liệu. */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const f = (n: number) => +n.toFixed(1);
  if (pts.length === 2) return `M${f(pts[0].x)},${f(pts[0].y)}L${f(pts[1].x)},${f(pts[1].y)}`;
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += `Q${f(pts[i].x)},${f(pts[i].y)} ${f(mx)},${f(my)}`;
  }
  const last = pts[pts.length - 1];
  d += `Q${f(pts[pts.length - 2].x)},${f(pts[pts.length - 2].y)} ${f(last.x)},${f(last.y)}`;
  return d;
}
```

đổi `buildGeom` dựng `xauPath`/`sjcPath` qua `smoothPath` (giữ test cũ: sửa expect `startsWith("M")` vẫn đúng; test đường thẳng 2 điểm giữ nguyên semantics). Cập nhật test cũ nếu format path đổi.

- [ ] **Step 3:** CSS polish: grid mờ ngang (3 line `stroke=#ffffff0d` trong SVG tại 25/50/75% H — thêm vào PriceChart render), halo chấm `.tm-mk.buy { box-shadow: 0 0 6px 1px rgba(76,201,122,.4); }` (scope thêm nếu ảnh hưởng TimeMachine đã xóa thì không sao), tooltip crosshair: hiện `fmtDate + $` trong `.pc-tip` absolute cạnh cursor.
- [ ] **Step 4:** Verify — `npm test` + `npm run build` PASS; dev soát: đường mượt không lệch trục, chấm halo, chip tone nền đúng level.
- [ ] **Step 5:** Checkpoint — báo "Task 8 xong — rework hoàn tất. Sẵn sàng commit."

---

## Self-review đã chạy

- **Spec coverage:** bố cục (T5) ✓, chart 2 trục + dots + gesture (T2/T3) ✓, as-of engine + 7 ràng buộc (T1/T4) ✓, strangler + gate xóa (T6) ✓, polish (T7/T8) ✓, YAGNI (không pinch/zoom, không toggle dots, không zone band) ✓.
- **Type consistency:** `AsOfMode/AsOfDay/AsOfEngine/createAsOfEngine/verdictFor/DCA_PHASE_LABEL` (as-of.ts), `RANGES/windowFor/sjcMap/buildGeom/smoothPath` (price-chart.ts), props `PriceChart`, `asOfIdx` — dùng thống nhất xuyên task.
- **Known risk ghi chú tại chỗ:** chữ ký `bearDcaAt` field phụ (T1 step 3 note), CSS `.tm-*` scope (T3 step 4 note), test synthetic phụ thuộc `presetComposite` fold-macro (đã kiểm: scores có key macro nên fold không kích hoạt — composite = s·50 đúng cho mọi preset).
