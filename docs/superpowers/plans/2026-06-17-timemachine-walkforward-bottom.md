# Time Machine — xác suất đáy walk-forward (quá khứ = hiện tại) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bỏ tam giác "Đáy đã xác nhận" (look-ahead) khỏi UI Time Machine và hiển thị xác suất gần đáy **as-of-ngày** (walk-forward) cho mọi ngày quá khứ — khớp đúng gauge live.

**Architecture:** `runBottom` sinh thêm chuỗi walk-forward thưa (`bottomHistory`, STEP=3): tại mỗi nút lưới, base-rate near-bottom chỉ trên các ngày đã đáo hạn nhãn trước nút đó, cùng bin. `run.ts` forward-fill chuỗi này lên timeline points. Time Machine đọc `p.cycleProb/...` hiển thị gauge giống live; điểm cuối walk-forward == gauge hiện tại (bất biến khoá test). Composite phía mua không đổi.

**Tech Stack:** TypeScript, Vitest (node env), Next.js static export, hàm thuần trong `src/lib`.

Spec nguồn: `docs/superpowers/specs/2026-06-17-timemachine-walkforward-bottom-design.md`.

---

## File Structure

- `src/lib/types.ts` — **Modify.** Thêm `BottomHistoryEntry`, `BottomHistoryRow`; thêm `bottomHistory` vào `BottomAnalysis`; thêm 6 field walk-forward optional vào `TimelinePoint`.
- `src/lib/bottom.ts` — **Modify.** `buildTier` sinh thêm chuỗi walk-forward; `runBottom` gộp thành `bottomHistory`. Thêm hàm thuần `bottomPctClass`.
- `src/lib/timeline.ts` — **Modify.** Thêm hàm thuần `forwardFillBottomHistory(points, history)`.
- `scripts/run.ts` — **Modify.** Gọi `forwardFillBottomHistory` cạnh chỗ merge `cycleBin`.
- `src/components/BottomGauges.tsx` — **Modify.** Dùng `bottomPctClass` (refactor thuần, không đổi giao diện).
- `src/components/TimeMachine.tsx` — **Modify.** Bỏ prop `confirmedBottoms` + tam giác; thêm gauge săn đáy as-of-ngày; đổi `histGuidance` theo prob.
- `src/components/Dashboard.tsx` — **Modify.** Ngừng truyền `confirmedBottoms` vào `<TimeMachine>`.
- `src/app/globals.css` — **Modify.** Thêm `.tm-bottom*`.
- `tests/bottom.test.ts`, `tests/timeline.test.ts` — **Modify.** Thêm test walk-forward + forward-fill; cập nhật test shape.
- `docs/bottom.md` — **Modify.** Thêm mục walk-forward.

---

## Task 1: Engine — chuỗi walk-forward + types + bottomPctClass

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/bottom.ts`
- Test: `tests/bottom.test.ts`

- [ ] **Step 1: Thêm types**

Trong `src/lib/types.ts`, NGAY TRƯỚC `export interface BottomAnalysis {` (hiện ở dòng ~298), thêm:

```ts
/** Một mục xác suất đáy as-of-ngày (walk-forward) cho 1 tầng. prob/ci null khi n<10. */
export interface BottomHistoryEntry {
  bin: number;
  prob: number | null;
  ci: [number, number] | null;
  n: number;
}

/** Hàng walk-forward thưa (STEP grid): xác suất đáy 2 tầng tính chỉ bằng dữ liệu đến ngày này. */
export interface BottomHistoryRow {
  date: string;
  cycle: BottomHistoryEntry;
  swing: BottomHistoryEntry;
}
```

Trong `interface BottomAnalysis`, thêm field (sau `signalHistory`):

```ts
  /** xác suất đáy as-of-ngày (walk-forward, lưới thưa) — Time Machine forward-fill để "quá khứ = hiện tại" */
  bottomHistory: BottomHistoryRow[];
```

Trong `interface TimelinePoint` (sau `swingBin?: number;`, dòng ~118), thêm:

```ts
  /** xác suất gần đáy as-of-ngày (walk-forward, forward-fill từ lưới thưa). null = đã đủ warmup nhưng <10 mẫu; undefined = trước nút đầu. */
  cycleProb?: number | null;
  cycleCi?: [number, number] | null;
  cycleN?: number;
  swingProb?: number | null;
  swingCi?: [number, number] | null;
  swingN?: number;
```

- [ ] **Step 2: Cập nhật test shape hiện có + viết test walk-forward (thất bại)**

Trong `tests/bottom.test.ts`, test `"BottomAnalysis shape compiles"` (dòng ~20) thêm field `bottomHistory: [],` vào object `a` (sau `signalHistory: [],`):

```ts
      signalHistory: [],
      bottomHistory: [],
      note: "x",
```

Thêm vào CUỐI khối `describe("runBottom", ...)` (trước dấu `});` đóng describe, sau test "signalHistory bao phủ bar mới nhất"):

```ts
  it("walk-forward: điểm cuối bottomHistory == prob/n gauge hiện tại", () => {
    const r = runBottom(bars, null, null, {});
    const last = r.bottomHistory[r.bottomHistory.length - 1];
    expect(last.date).toBe(bars[bars.length - 1].date);
    expect(last.cycle.prob).toBe(r.cycle.prob);
    expect(last.cycle.n).toBe(r.cycle.n);
    expect(last.swing.prob).toBe(r.swing.prob);
    expect(last.swing.n).toBe(r.swing.n);
  });

  it("walk-forward: không look-ahead — prob tại nút cũ không đổi khi có thêm dữ liệu sau", () => {
    // nút lưới: WARMUP=756 + k*3. 1200 = 756 + 148*3 ⇒ là nút, < cả 1400 và 1600.
    const D = bars[1200].date;
    const rShort = runBottom(bars.slice(0, 1400), null, null, {});
    const rFull = runBottom(bars, null, null, {});
    const a = rShort.bottomHistory.find((x) => x.date === D)!;
    const b = rFull.bottomHistory.find((x) => x.date === D)!;
    expect(a).toBeDefined();
    expect(b.cycle.prob).toBe(a.cycle.prob);
    expect(b.cycle.n).toBe(a.cycle.n);
  });

  it("walk-forward: nút sớm chưa đủ mẫu ⇒ prob null", () => {
    const r = runBottom(bars, null, null, {});
    expect(r.bottomHistory[0].cycle.prob).toBeNull();
    expect(r.bottomHistory[0].cycle.n).toBeLessThan(10);
  });
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/bottom.test.ts -t walk-forward`
Expected: FAIL — `r.bottomHistory` undefined (chưa sinh).

- [ ] **Step 4: Sinh chuỗi walk-forward trong `buildTier` + gộp trong `runBottom`**

Trong `src/lib/bottom.ts`, hàm `buildTier`: thêm tính `history` SAU khi đã có `statRows` + `ci` (sau dòng `const ci = blockBootstrapCi(...)`, trước phần "Lưới DÀY"):

```ts
  // --- Walk-forward: tại mỗi nút lưới g, base-rate chỉ trên ngày đã ĐÁO HẠN nhãn
  // trước g (e.i + H <= g.i) và cùng bin với g. Điểm cuối == prob/n hiện tại
  // (cùng tập: e.i + H <= last ⇔ label != null). Past-only, không look-ahead.
  const H = cfg.horizonDays;
  const matured = new Map<number, number[]>(); // bin -> nhãn ±1 đã đáo hạn
  let mk = 0;
  const history: { date: string; bin: number; prob: number | null; ci: [number, number] | null; n: number }[] = [];
  for (const g of statRows) {
    while (mk < statRows.length && statRows[mk].i + H <= g.i) {
      const e = statRows[mk];
      if (e.label !== null) {
        const arr = matured.get(e.bin) ?? [];
        arr.push(e.label ? 1 : -1);
        matured.set(e.bin, arr);
      }
      mk++;
    }
    const arr = matured.get(g.bin) ?? [];
    const nn = arr.length;
    if (nn < 10) {
      history.push({ date: g.date, bin: g.bin, prob: null, ci: null, n: nn });
    } else {
      const prob = Math.round((arr.filter((x) => x > 0).length / nn) * 1000) / 10;
      history.push({ date: g.date, bin: g.bin, prob, ci: blockBootstrapCi(arr, Math.max(1, Math.round(H / 3))), n: nn });
    }
  }
```

Đổi `return` của `buildTier` để kèm `history`:

```ts
  return { result: { prob, ci, bin: curBin, n }, rows, currentDrivers: curDrivers, history };
```

Cập nhật kiểu trả về của `buildTier` (chữ ký hàm) — thêm `history` vào object literal type:

```ts
): { result: Omit<BottomTierResult, "drivers">; rows: HistRow[]; currentDrivers: BottomDriver[]; history: { date: string; bin: number; prob: number | null; ci: [number, number] | null; n: number }[] } {
```

Trong `runBottom`, SAU phần dựng `signalHistory` (sau dòng tạo `signalHistory`), thêm:

```ts
  // Gộp walk-forward 2 tầng theo ngày (cycle.history & swing.history cùng lưới/ngày).
  const swingHByDate = new Map(swing.history.map((s) => [s.date, s]));
  const bottomHistory: BottomHistoryRow[] = cycle.history.map((c) => {
    const s = swingHByDate.get(c.date)!;
    return {
      date: c.date,
      cycle: { bin: c.bin, prob: c.prob, ci: c.ci, n: c.n },
      swing: { bin: s.bin, prob: s.prob, ci: s.ci, n: s.n },
    };
  });
```

Thêm `bottomHistory` vào object trả về của `runBottom` (sau `signalHistory,`):

```ts
    signalHistory,
    bottomHistory,
```

Thêm import type: trong dòng import từ `./types` (dòng 5), thêm `BottomHistoryRow`:

```ts
import { BOTTOM_CONFIG, type BottomAnalysis, type BottomTierResult, type ConfirmedBottom, type BottomTierConfig, type BottomSignalRow, type BottomHistoryRow } from "./types";
```

- [ ] **Step 5: Thêm hàm thuần `bottomPctClass`**

Trong `src/lib/bottom.ts`, sau hàm `binOf` (dòng ~163), thêm:

```ts
/** Ngưỡng màu gauge săn đáy: ≥60 mua / ≥35 trung tính / còn lại bán. Dùng chung UI. */
export function bottomPctClass(pct: number): "buy" | "neutral" | "sell" {
  return pct >= 60 ? "buy" : pct >= 35 ? "neutral" : "sell";
}
```

- [ ] **Step 6: Chạy test — PASS + golden không đổi**

Run: `npx vitest run tests/bottom.test.ts`
Expected: tất cả PASS, gồm 3 test walk-forward mới VÀ các golden cũ (`cycle.n=94`, `prob=78.7`, `swing.n=95`, `prob=100`) vẫn nguyên (walk-forward là field mới, không sửa `result`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/bottom.ts tests/bottom.test.ts
git commit -m "feat(bottom): chuỗi xác suất đáy walk-forward (as-of-ngày) + bottomPctClass"
```

---

## Task 2: Forward-fill walk-forward lên timeline

**Files:**
- Modify: `src/lib/timeline.ts`
- Modify: `scripts/run.ts`
- Test: `tests/timeline.test.ts`

- [ ] **Step 1: Viết test forward-fill (thất bại)**

Thêm vào CUỐI `tests/timeline.test.ts`:

```ts
import { forwardFillBottomHistory } from "../src/lib/timeline";
import type { BottomHistoryRow, TimelinePoint } from "../src/lib/types";

describe("forwardFillBottomHistory", () => {
  const mkPt = (date: string): TimelinePoint => ({
    date, price: 1, composite: 0, zone: "neutral", scores: {},
    returns: { "21": null, "63": null, "126": null },
  });
  const hist: BottomHistoryRow[] = [
    { date: "2020-01-03", cycle: { bin: 2, prob: 50, ci: [40, 60], n: 30 }, swing: { bin: 1, prob: 40, ci: null, n: 12 } },
    { date: "2020-01-06", cycle: { bin: 3, prob: 70, ci: [60, 80], n: 40 }, swing: { bin: 2, prob: 55, ci: [45, 65], n: 20 } },
  ];

  it("gán prob từ nút lưới gần nhất ≤ ngày; trước nút đầu để undefined", () => {
    const pts = ["2020-01-02", "2020-01-03", "2020-01-05", "2020-01-06", "2020-01-09"].map(mkPt);
    forwardFillBottomHistory(pts, hist);
    expect(pts[0].cycleProb).toBeUndefined(); // trước nút đầu
    expect(pts[1].cycleProb).toBe(50);        // đúng nút
    expect(pts[2].cycleProb).toBe(50);        // snap về nút 01-03
    expect(pts[3].cycleProb).toBe(70);        // nút 01-06
    expect(pts[4].cycleProb).toBe(70);        // sau nút cuối -> giữ nút cuối
    expect(pts[2].swingN).toBe(12);
    expect(pts[3].swingCi).toEqual([45, 65]);
  });

  it("history rỗng ⇒ không gán gì", () => {
    const pts = [mkPt("2020-01-03")];
    forwardFillBottomHistory(pts, []);
    expect(pts[0].cycleProb).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npx vitest run tests/timeline.test.ts -t forwardFillBottomHistory`
Expected: FAIL — `forwardFillBottomHistory` chưa export.

- [ ] **Step 3: Cài đặt `forwardFillBottomHistory`**

Trong `src/lib/timeline.ts`, thêm ở cuối file (và đảm bảo import type ở đầu file có `TimelinePoint`, `BottomHistoryRow` — nếu file chưa import từ `./types`, thêm `import type { TimelinePoint, BottomHistoryRow } from "./types";`):

```ts
/**
 * Gán xác suất đáy as-of-ngày cho từng điểm timeline: lấy entry lưới thưa gần nhất
 * ≤ ngày (forward-fill). Trước nút đầu ⇒ để undefined. Mutate tại chỗ.
 * points & history đều phải sắp theo date tăng dần.
 */
export function forwardFillBottomHistory(points: TimelinePoint[], history: BottomHistoryRow[]): void {
  if (!history.length) return;
  let h = 0;
  for (const pt of points) {
    while (h + 1 < history.length && history[h + 1].date <= pt.date) h++;
    if (history[h].date <= pt.date) {
      const { cycle: c, swing: s } = history[h];
      pt.cycleProb = c.prob; pt.cycleCi = c.ci; pt.cycleN = c.n;
      pt.swingProb = s.prob; pt.swingCi = s.ci; pt.swingN = s.n;
    }
  }
}
```

- [ ] **Step 4: Chạy test — PASS**

Run: `npx vitest run tests/timeline.test.ts`
Expected: tất cả PASS.

- [ ] **Step 5: Wire vào `scripts/run.ts`**

Thêm import (cùng cụm import từ `../src/lib/timeline` nếu có; nếu chưa có thì thêm dòng mới):

```ts
import { forwardFillBottomHistory } from "../src/lib/timeline";
```

NGAY SAU vòng lặp merge `cycleBin` (sau khối `for (const pt of timeline.points) { ... pt.swingBin = s.swingBin; }`, dòng ~276), thêm:

```ts
  // Forward-fill xác suất đáy as-of-ngày (walk-forward) lên timeline để Time Machine
  // hiển thị đúng read live của từng ngày. Lưới thưa ⇒ snap nút gần nhất ≤ ngày.
  forwardFillBottomHistory(timeline.points, bottom.bottomHistory);
```

- [ ] **Step 6: Build (collect cần mạng — chỉ kiểm type/build)**

Run: `npm run build`
Expected: PASS, không lỗi type (`bottom.bottomHistory` tồn tại nhờ Task 1).

- [ ] **Step 7: Commit**

```bash
git add src/lib/timeline.ts scripts/run.ts tests/timeline.test.ts
git commit -m "feat(timeline): forward-fill xác suất đáy walk-forward lên timeline points"
```

---

## Task 3: UI — bỏ tam giác, thêm gauge as-of-ngày, gợi ý theo prob

**Files:**
- Modify: `src/components/BottomGauges.tsx`
- Modify: `src/components/TimeMachine.tsx`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Refactor `BottomGauges` dùng `bottomPctClass` (không đổi giao diện)**

Trong `src/components/BottomGauges.tsx`:
- Dòng 2 import: đổi thành
```ts
import { BOTTOM_CONFIG, type BottomAnalysis, type BottomTierResult } from "@/lib/types";
import { bottomPctClass } from "@/lib/bottom";
```
- Dòng 9 (`const cls = pct >= 60 ? "buy" : pct >= 35 ? "neutral" : "sell";`) đổi thành:
```ts
  const cls = bottomPctClass(pct);
```

- [ ] **Step 2: `Dashboard` — ngừng truyền `confirmedBottoms`**

Trong `src/components/Dashboard.tsx` dòng ~568, đổi:
```tsx
          <TimeMachine timeline={timeline} weights={weights} preset={preset} confirmedBottoms={bottom.confirmedBottoms} />
```
thành:
```tsx
          <TimeMachine timeline={timeline} weights={weights} preset={preset} />
```

- [ ] **Step 3: `TimeMachine` — bỏ prop + tam giác**

Trong `src/components/TimeMachine.tsx`:

(a) Import: thêm `bottomPctClass`:
```ts
import { deriveGuidance } from "@/lib/guidance";
import { bottomPctClass } from "@/lib/bottom";
```

(b) Props: bỏ `confirmedBottoms` khỏi destructure + type. Khối props (dòng ~68-78) đổi thành:
```ts
export default function TimeMachine({
  timeline,
  weights,
  preset,
}: {
  timeline: Timeline;
  weights: Record<CriterionKey, number>;
  preset: Preset | null;
}) {
```
Bỏ import type `ConfirmedBottom` ở khối import `@/lib/types` (xóa dòng `type ConfirmedBottom,`).

(c) Trong `spark` useMemo: XÓA khối `const bottomMarkers = ...` (dòng ~286-289) và xóa `bottomMarkers,` trong object trả về (dòng ~300). Xóa `confirmedBottoms` và `dates` khỏi dependency array của spark (dòng ~304) — đổi thành:
```ts
  }, [points, idx, p, signalIdxs, sellIdxs, expIdxs, showSell, start, end]);
```

(d) Render overlay: XÓA khối tam giác (dòng ~476-479):
```tsx
            {spark.bottomMarkers.map((m, i) => (
              <span key={`bm${i}`} className={`tm-mk bottom ${m.tier}`}
                style={{ left: `${(m.cx / spark.W) * 100}%`, top: `${(m.cy / spark.H) * 100}%` }}>▲</span>
            ))}
```

- [ ] **Step 4: `TimeMachine` — `histGuidance` theo prob walk-forward**

Thay toàn bộ `const histGuidance = useMemo(...)` (dòng ~247-264) bằng:

```ts
  // Gợi ý hành động lịch sử: world-only (premium tắt) + xác suất đáy as-of-ngày
  // (walk-forward) — ĐÚNG ngưỡng live (prob≥60 & verified), để "quá khứ = hiện tại".
  const histGuidance = useMemo(() => {
    const prob = p?.cycleProb ?? null;
    const n = p?.cycleN ?? 0;
    const verified = prob !== null && n >= 10;
    const high = verified && prob >= 60;
    const ciStr = p?.cycleCi ? ` (CI ${p.cycleCi[0]}–${p.cycleCi[1]}%)` : "";
    return deriveGuidance({
      zone: rawZone,
      composite,
      bottom: {
        high,
        verified,
        label: verified ? `Săn đáy: xác suất gần đáy ${Math.round(prob)}%${ciStr}.` : "Săn đáy: chưa đủ dữ liệu kiểm chứng.",
      },
      premiumPct: null, // world-only ở lịch sử
      premiumP80: null, // ⇒ cổng premium tắt
    });
  }, [rawZone, composite, p]);
```

- [ ] **Step 5: `TimeMachine` — gauge săn đáy as-of-ngày trong panel ngày**

Trong JSX, NGAY SAU khối `<div className="tm-dateband"> ... </div>` (kết thúc dòng ~515) và TRƯỚC `<ActionGuidance ... />`, chèn:

```tsx
      <div className="tm-bottom">
        {(
          [
            ["Đáy chu kỳ", "≈6 tháng", p.cycleProb ?? null, p.cycleCi ?? null, p.cycleN ?? 0],
            ["Đáy sóng", "≈1 tháng", p.swingProb ?? null, p.swingCi ?? null, p.swingN ?? 0],
          ] as [string, string, number | null, [number, number] | null, number][]
        ).map(([title, sub, prob, ci, n]) => {
          const ok = prob !== null && n >= 10;
          return (
            <div key={title} className="tm-bottom-item">
              <span className="muted small">{title} <span className="muted small">{sub}</span></span>
              {ok ? (
                <span className={`bottom-gauge-pct ${bottomPctClass(prob)}`}>
                  {Math.round(prob)}%
                  {ci ? <span className="muted small"> (CI {ci[0]}–{ci[1]}%)</span> : null}
                </span>
              ) : (
                <span className="muted small">Chưa đủ dữ liệu kiểm chứng</span>
              )}
            </div>
          );
        })}
      </div>
```

- [ ] **Step 6: CSS `.tm-bottom`**

Trong `src/app/globals.css`, sau khối `.tm-results ...` (gần dòng ~ nơi `.tm-results .r.hl` kết thúc), thêm:

```css
/* gauge săn đáy as-of-ngày trong Time Machine (mượn màu .bottom-gauge-pct, cỡ nhỏ hơn) */
.tm-bottom {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  margin: 6px 0 10px;
}
.tm-bottom-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.tm-bottom .bottom-gauge-pct {
  font-size: 1.15rem;
}
```

- [ ] **Step 7: Build + test + kiểm tra tay**

Run: `npm run build && npm test`
Expected: build PASS (không còn tham chiếu `confirmedBottoms`/`bottomMarkers`/`ConfirmedBottom` trong TimeMachine; không lỗi unused); test PASS.

> Nếu build báo `indexOnOrAfter` hoặc `dates` unused: KIỂM TRA — `dates` + `indexOnOrAfter`/`indexOnOrBefore` vẫn dùng ở 2 ô ngày trong panel ⚙. Nếu thật sự còn dùng thì giữ; chỉ xóa nếu build báo unused.

Kiểm tra tay (`npm run dev`, mở Máy thời gian — cần data đã collect):
- Không còn tam giác ▲ trên chart.
- Chọn ngày quá khứ: hiện "Đáy chu kỳ / Đáy sóng" với % + CI; ngày rất sớm hiện "Chưa đủ dữ liệu kiểm chứng".
- Ngày mới nhất: % khớp gauge "Săn đáy" ở dashboard.
- "Gom rải" xuất hiện khi cycleProb ≥ 60.

- [ ] **Step 8: Commit**

```bash
git add src/components/BottomGauges.tsx src/components/TimeMachine.tsx src/components/Dashboard.tsx src/app/globals.css
git commit -m "feat(tm): gauge săn đáy as-of-ngày, bỏ tam giác look-ahead, gợi ý theo prob≥60"
```

---

## Task 4: Cập nhật docs/bottom.md

**Files:**
- Modify: `docs/bottom.md`

- [ ] **Step 1: Thêm mục walk-forward**

Trong `docs/bottom.md`, sau mục "## Định nghĩa nhãn 'gần đáy'" (trước "## Phương pháp tuyển chọn"), chèn:

```markdown
## Xác suất as-of-ngày (walk-forward) — cho Time Machine

Gauge live hôm nay là base-rate near-bottom trên mọi ngày lịch sử có nhãn đã hoàn tất (`i+H < hiện tại`), cùng bin với hôm nay. `runBottom` tổng quát hoá thành chuỗi `bottomHistory` (lưới thưa STEP=3): với MỖI nút ngày D, base-rate chỉ tính trên các ngày `e` đã **đáo hạn nhãn trước D** (`e+H ≤ idx_D`) và cùng bin với D. `n<10` ⇒ "chưa đủ dữ liệu".

- **Bất biến:** điểm cuối chuỗi == prob/n của gauge live hiện tại (cùng tập ngày). Không đổi gauge hôm nay.
- **Không look-ahead:** prob tại D chỉ phụ thuộc ngày đã đáo hạn trước D; thêm dữ liệu sau D không đổi prob_D.
- **Hiển thị:** Time Machine forward-fill nút thưa gần nhất ≤ ngày được chọn (lệch ≤2 phiên; ngày cuối luôn được ghim nên hôm nay chính xác). Tam giác "đáy đã xác nhận" (cần ±9 phiên tương lai) KHÔNG còn hiển thị — chỉ giữ trong `confirmedBottoms` cho `bottom-vs-buy-study`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/bottom.md
git commit -m "docs(bottom): mô tả xác suất as-of-ngày (walk-forward)"
```

---

## Self-Review notes (đã kiểm)

- **Spec coverage:** walk-forward prob (Task 1), forward-fill (Task 2), bỏ tam giác + gauge as-of-ngày + gợi ý prob≥60 (Task 3), gate n<10 (Task 1+3), giữ confirmedBottoms trong data (chỉ bỏ UI — Task 3), docs (Task 4). Bất biến ngày-cuối == gauge live (Task 1 test). Thưa-thống-kê/dày-hiển-thị giữ nguyên (walk-forward dùng statRows STEP=3; forward-fill cho hiển thị).
- **Type consistency:** `BottomHistoryEntry`/`BottomHistoryRow` định nghĩa Task 1, dùng Task 1 (runBottom), Task 2 (timeline + test), Task 3 (TimeMachine đọc field timeline). `bottomPctClass` định nghĩa Task 1, dùng Task 3 (BottomGauges + TimeMachine). `forwardFillBottomHistory` định nghĩa Task 2, dùng Task 2 (run.ts). TimelinePoint field tên `cycleProb/cycleCi/cycleN/swingProb/swingCi/swingN` nhất quán Task 1↔2↔3.
- **Không đụng:** composite/zone/returns/buckets phía mua; gauge live; BOTTOM_CONFIG; confirmedBottoms trong data.
- **Test môi trường:** hàm thuần (`runBottom`, `forwardFillBottomHistory`, `bottomPctClass`) test bằng vitest node-env; UI verify build + tay (không có jsdom — không thêm lib).
