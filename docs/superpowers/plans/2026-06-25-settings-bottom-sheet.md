# Settings Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom preset + trọng số vào một bottom sheet mở bằng FAB nổi đáy-phải, có dải verdict realtime, để trên mobile không phải vuốt lên-xuống giữa nút/panel/verdict.

**Architecture:** Trích phần render preset-row + settings panel khỏi `Dashboard.tsx` vào component mới `SettingsSheet.tsx`. Logic (`weights`, `applyPreset`, `setWeight`, `customized`, `composite`, `zone`, `verdictLabel`) vẫn sống ở Dashboard, truyền xuống làm prop — sheet thuần trình bày, không tính lại. Một helper thuần `fabLabel()` (có unit test) suy nhãn FAB từ mode.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS thường (globals.css), vitest (chỉ test logic thuần — repo chưa có test render React).

## Global Constraints

- UI language: tiếng Việt. Chuỗi hiển thị là tiếng Việt.
- Không đổi: scoring engine, backtest, data pipeline, localStorage schema `au-settings-v2`.
- Không thêm dependency mới (đặc biệt KHÔNG thêm testing-library/jsdom — repo chỉ test hàm thuần bằng vitest).
- CSS vars có sẵn: `--bg #0e0c08`, `--card #181410`, `--card2 #1f1a14`, `--text #ece5d8`, `--muted #9a8f7d`, `--gold #e6b84c`, `--buy #4cc97a`, `--sell #e05c5c`, `--neutral #b0a890`, `--border #2c251c`.
- Reuse class có sẵn: `.iconbtn`, `.iconbtn.active`, `.preset-row`, `.settings .slider-row`, `.settings input[type="range"]`, `<details class="acc">` pattern.
- `npm test` = `vitest run`. `npm run build` = `next build` (typecheck). `npm run lint` = `next lint`.

---

### Task 1: Helper `fabLabel` + `zoneClass` thuần (có test)

Trích logic suy nhãn FAB và class màu zone ra module thuần để unit test, dùng chung cho cả Dashboard và SettingsSheet (DRY).

**Files:**
- Create: `src/lib/settings.ts`
- Create test: `src/lib/settings.test.ts`
- Modify: `src/components/Dashboard.tsx` (xóa `function zoneClass` local ở dòng 46-50, import từ `@/lib/settings`)

**Interfaces:**
- Consumes: `Preset`, `Zone` từ `@/lib/types`.
- Produces:
  - `fabLabel(preset: Preset | null, customized: boolean): string`
  - `zoneClass(zone: Zone): string`

- [ ] **Step 1: Viết test thất bại**

Create `src/lib/settings.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fabLabel, zoneClass } from "./settings";
import { PRESETS } from "./types";

describe("fabLabel", () => {
  it("trả label preset khi có preset", () => {
    const p = PRESETS.find((q) => q.id === "3m")!;
    expect(fabLabel(p, false)).toBe(p.label);
  });
  it("trả 'Tùy chỉnh' khi không preset nhưng đã chỉnh", () => {
    expect(fabLabel(null, true)).toBe("Tùy chỉnh");
  });
  it("trả 'Toàn cảnh' khi mặc định", () => {
    expect(fabLabel(null, false)).toBe("Toàn cảnh");
  });
});

describe("zoneClass", () => {
  it("gộp strong-buy/buy thành 'buy'", () => {
    expect(zoneClass("buy")).toBe("buy");
    expect(zoneClass("strong-buy")).toBe("buy");
  });
  it("gộp strong-sell/sell thành 'sell'", () => {
    expect(zoneClass("sell")).toBe("sell");
    expect(zoneClass("strong-sell")).toBe("sell");
  });
  it("còn lại là 'neutral'", () => {
    expect(zoneClass("neutral")).toBe("neutral");
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `npx vitest run src/lib/settings.test.ts`
Expected: FAIL — "Cannot find module './settings'" / "fabLabel is not a function".

- [ ] **Step 3: Viết implementation tối thiểu**

Create `src/lib/settings.ts`:

```ts
import type { Preset, Zone } from "./types";

/** Nhãn mode hiển thị trên FAB: preset > tùy chỉnh > toàn cảnh. */
export function fabLabel(preset: Preset | null, customized: boolean): string {
  if (preset) return preset.label;
  if (customized) return "Tùy chỉnh";
  return "Toàn cảnh";
}

/** Gộp 5 zone về 3 lớp màu (buy/sell/neutral). */
export function zoneClass(zone: Zone): string {
  if (zone === "buy" || zone === "strong-buy") return "buy";
  if (zone === "sell" || zone === "strong-sell") return "sell";
  return "neutral";
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `npx vitest run src/lib/settings.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Bỏ `zoneClass` local trong Dashboard, import từ lib**

Trong `src/components/Dashboard.tsx`, xóa khối dòng 46-50:

```tsx
function zoneClass(zone: Zone): string {
  if (zone === "buy" || zone === "strong-buy") return "buy";
  if (zone === "sell" || zone === "strong-sell") return "sell";
  return "neutral";
}
```

Thêm import (gộp cùng các import component/lib ở đầu file, sau dòng `import ActionGuidance ...`). Chỉ import `zoneClass` ở task này — `fabLabel` chưa dùng tới Task 3, import sớm sẽ bị lint cảnh báo unused:

```tsx
import { zoneClass } from "@/lib/settings";
```

- [ ] **Step 6: Typecheck + test toàn bộ**

Run: `npm run build`
Expected: build thành công, không lỗi type (xác nhận `zoneClass` vẫn dùng được trong Dashboard).

Run: `npm test`
Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/settings.ts src/lib/settings.test.ts src/components/Dashboard.tsx
git commit -m "feat: add fabLabel + shared zoneClass helper for settings sheet"
```

---

### Task 2: Component `SettingsSheet`

Component trình bày: dải verdict ghim + chip preset + slider trọng số + giải thích thu gọn. Không tính lại composite/zone — nhận làm prop.

**Files:**
- Create: `src/components/SettingsSheet.tsx`

**Interfaces:**
- Consumes (từ Task 1): `fabLabel` không dùng ở đây; `zoneClass` dùng cho badge. Từ `@/lib/types`: `Preset`, `Zone`, `CriterionKey`, `CriterionResult`, `PresetHealthFile`, `PRESETS`.
- Produces: default export `SettingsSheet` với props:

```tsx
interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  criteria: CriterionResult[];
  weights: Record<CriterionKey, number>;
  preset: Preset | null;
  customized: boolean;
  health: PresetHealthFile;
  composite: number;
  zone: Zone;
  verdictLabel: string;
  applyPreset: (id: string | null) => void;
  setWeight: (k: CriterionKey, v: number) => void;
}
```

- [ ] **Step 1: Viết component**

Create `src/components/SettingsSheet.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import {
  PRESETS,
  type Preset,
  type Zone,
  type CriterionKey,
  type CriterionResult,
  type PresetHealthFile,
} from "@/lib/types";
import { zoneClass } from "@/lib/settings";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  criteria: CriterionResult[];
  weights: Record<CriterionKey, number>;
  preset: Preset | null;
  customized: boolean;
  health: PresetHealthFile;
  composite: number;
  zone: Zone;
  verdictLabel: string;
  applyPreset: (id: string | null) => void;
  setWeight: (k: CriterionKey, v: number) => void;
}

const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

export default function SettingsSheet({
  open,
  onClose,
  criteria,
  weights,
  preset,
  customized,
  health,
  composite,
  zone,
  verdictLabel,
  applyPreset,
  setWeight,
}: SettingsSheetProps) {
  // Khóa cuộn body + đóng bằng Esc khi sheet mở.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`sheet-overlay ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`sheet ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Thiết lập preset và trọng số"
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <strong>Thiết lập</strong>
          <button className="sheet-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        {/* Dải verdict ghim — cập nhật realtime theo prop từ Dashboard */}
        <div className="sheet-verdict">
          <span className={`v-zone ${zoneClass(zone)}`}>{verdictLabel}</span>
          <span className="muted">điểm {fmt(composite)}</span>
        </div>

        {/* Chip preset */}
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

        {/* Slider trọng số */}
        <div className="settings">
          {criteria.map((c) => (
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
        </div>

        {/* Giải thích thu gọn — sheet mặc định ngắn, không cuộn */}
        <details className="acc">
          <summary className="acc-sum">
            <span className="acc-sum-text">
              <span className="acc-sum-title">Giải thích</span>
            </span>
            <span className="acc-chev">▸</span>
          </summary>
          <div className="acc-body">
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
          </div>
        </details>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: build thành công. (Component chưa được dùng — Next vẫn typecheck file. Nếu báo "unused", bỏ qua: Task 3 sẽ dùng ngay.)

Nếu lỗi type về `CriterionResult` thiếu `.key`/`.label`: mở `src/lib/types.ts` xác nhận field thật của `CriterionResult` rồi sửa cho khớp (trong code gốc Dashboard dùng `c.key` + `c.label`, dòng 365-367 — nên đúng).

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsSheet.tsx
git commit -m "feat: add SettingsSheet component (verdict strip + presets + sliders)"
```

---

### Task 3: Nối SettingsSheet vào Dashboard, bỏ control cũ

Bỏ nút header + preset-row + settings panel inline. Thêm FAB + render `<SettingsSheet>`. Đổi tên state `showSettings` → `sheetOpen`.

**Files:**
- Modify: `src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `SettingsSheet` (Task 2), `fabLabel` (Task 1).

- [ ] **Step 1: Import SettingsSheet**

Trong `src/components/Dashboard.tsx`, thêm sau dòng `import ActionGuidance from "./ActionGuidance";`:

```tsx
import SettingsSheet from "./SettingsSheet";
```

Và bổ sung `fabLabel` vào import từ Task 1 (đổi dòng `import { zoneClass } from "@/lib/settings";` thành):

```tsx
import { fabLabel, zoneClass } from "@/lib/settings";
```

- [ ] **Step 2: Đổi tên state**

Đổi dòng 99:

```tsx
const [showSettings, setShowSettings] = useState(false);
```

thành:

```tsx
const [sheetOpen, setSheetOpen] = useState(false);
```

- [ ] **Step 3: Thay nút header bằng tiêu đề gọn**

Thay khối header (dòng 236-243):

```tsx
      <header className="top">
        <h1>
          Vùng<span className="gold">Vàng</span>
        </h1>
        <button className="iconbtn" onClick={() => setShowSettings(!showSettings)}>
          ⚙ Trọng số
        </button>
      </header>
```

bằng:

```tsx
      <header className="top">
        <h1>
          Vùng<span className="gold">Vàng</span>
        </h1>
      </header>
```

- [ ] **Step 4: Xóa preset-row giữa trang**

Xóa toàn bộ khối (dòng 326-348):

```tsx
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
```

- [ ] **Step 5: Thay settings panel inline bằng FAB + sheet**

Thay toàn bộ khối `{showSettings && ( ... )}` (dòng 350-379, từ comment `{/* ── PANEL ⚙ ... */}` đến `)}` đóng):

```tsx
      {/* ── PANEL ⚙: chỉ còn slider trọng số ── */}
      {showSettings && (
        <section className="card settings">
          <h2>Trọng số tiêu chí</h2>
          ...
        </section>
      )}
```

bằng:

```tsx
      {/* ── FAB + bottom sheet: preset + trọng số gom 1 chỗ ── */}
      <button
        className="fab"
        onClick={() => setSheetOpen(true)}
        aria-label="Mở thiết lập preset và trọng số"
      >
        ⚙ {fabLabel(preset, customized)}
      </button>
      <SettingsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        criteria={analysis.criteria}
        weights={weights}
        preset={preset}
        customized={customized}
        health={health}
        composite={composite}
        zone={zone}
        verdictLabel={verdictLabel}
        applyPreset={applyPreset}
        setWeight={setWeight}
      />
```

- [ ] **Step 6: Dọn import thừa nếu có**

Nếu `PRESETS` không còn dùng ở Dashboard sau khi xóa preset-row, `npm run lint` sẽ cảnh báo unused. Kiểm tra: `PRESETS` vẫn dùng ở dòng 101 (`PRESETS.find(...)`) → GIỮ import. Không xóa.

- [ ] **Step 7: Typecheck + lint + test**

Run: `npm run build`
Expected: build thành công, không lỗi type.

Run: `npm run lint`
Expected: không error (cảnh báo cũ không liên quan thì bỏ qua).

Run: `npm test`
Expected: tất cả PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: wire SettingsSheet + FAB into Dashboard, remove inline preset row and settings panel"
```

---

### Task 4: CSS cho FAB + bottom sheet

**Files:**
- Modify: `src/app/globals.css` (thêm cuối file)

**Interfaces:**
- Consumes: class do Task 2/3 phát ra — `.fab`, `.sheet-overlay`, `.sheet`, `.sheet-handle`, `.sheet-head`, `.sheet-verdict`, `.v-zone`, `.sheet-close`.

- [ ] **Step 1: Thêm CSS vào cuối `src/app/globals.css`**

```css
/* ── FAB + bottom sheet thiết lập ── */
.fab {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 18px;
  border-radius: 999px;
  border: none;
  background: var(--gold);
  color: #1a1407;
  font-weight: 600;
  font-size: 0.95rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  cursor: pointer;
}

.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}
.sheet-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  background: var(--card);
  border-top: 1px solid var(--border);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  padding: 8px 16px calc(env(safe-area-inset-bottom) + 20px);
  max-height: 92vh;
  overflow-y: auto;
  transform: translateY(100%);
  transition: transform 0.25s ease;
}
.sheet.open {
  transform: translateY(0);
}

.sheet-handle {
  width: 40px;
  height: 4px;
  margin: 6px auto 4px;
  border-radius: 2px;
  background: var(--border);
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sheet-close {
  background: none;
  border: none;
  color: var(--muted);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.sheet-verdict {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 0 12px;
  margin-bottom: 12px;
  background: var(--card);
  border-bottom: 1px solid var(--border);
}
.sheet-verdict .v-zone {
  font-weight: 700;
  font-size: 1.1rem;
}
.sheet-verdict .v-zone.buy {
  color: var(--buy);
}
.sheet-verdict .v-zone.sell {
  color: var(--sell);
}
.sheet-verdict .v-zone.neutral {
  color: var(--neutral);
}

/* Màn rộng: canh sheet vào giữa như modal (tùy chọn, app mobile-first) */
@media (min-width: 760px) {
  .sheet {
    left: 50%;
    right: auto;
    bottom: auto;
    top: 50%;
    width: 480px;
    max-width: 92vw;
    border-radius: 16px;
    border: 1px solid var(--border);
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -42%);
    transition: transform 0.2s ease, opacity 0.2s ease;
  }
  .sheet.open {
    opacity: 1;
    pointer-events: auto;
    transform: translate(-50%, -50%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet,
  .sheet-overlay {
    transition: none;
  }
}
```

- [ ] **Step 2: Build + chạy dev kiểm tra mắt**

Run: `npm run build`
Expected: build thành công.

Run: `npm run dev` (rồi mở http://localhost:3000)
Kiểm tra thủ công (mobile viewport trong devtools):
- FAB nổi góc dưới-phải, nhãn = mode đang dùng (mặc định `⚙ Toàn cảnh`).
- Bấm FAB → sheet trượt lên, overlay mờ.
- Chip preset đổi → nhãn FAB + dải verdict đổi theo.
- Kéo slider → dải verdict (vùng + điểm) đổi realtime; FAB thành `⚙ Tùy chỉnh`; không chip nào sáng.
- Bấm overlay / `✕` / `Esc` → sheet đóng. Body không cuộn nền khi mở.
- `<details>` Giải thích mở/đóng được; sheet mặc định (chưa mở Giải thích) vừa khoảng 1 màn, không cần cuộn.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: add FAB and bottom sheet styles for settings"
```

---

### Task 5: Dọn CSS chết + kiểm tra cuối

`.preset-row` vẫn dùng (trong SettingsSheet). `.settings .slider-row` vẫn dùng. Không xóa. Task này chỉ xác nhận không còn rác và mọi thứ chạy.

**Files:**
- Modify (nếu cần): `src/app/globals.css`

- [ ] **Step 1: Tìm class trở thành rác**

Run: `git grep -n "showSettings"`
Expected: không còn kết quả (đã đổi hết sang `sheetOpen`).

Kiểm tra `.preset-row` còn được dùng: `git grep -n "preset-row"` → phải thấy trong `SettingsSheet.tsx` + `globals.css`. Nếu còn → GIỮ. Không có class CSS nào chỉ-dành-cho khối đã xóa cần gỡ (settings panel cũ dùng chung `.card .settings` còn TimeMachine cũng dùng — không đụng).

- [ ] **Step 2: Kiểm tra toàn bộ**

Run: `npm test`
Expected: tất cả PASS.

Run: `npm run build`
Expected: build thành công.

Run: `npm run lint`
Expected: không error mới.

- [ ] **Step 3: Commit (nếu có thay đổi)**

```bash
git add -A
git commit -m "chore: verify no dead settings code after sheet migration"
```

(Nếu Step 1 không tìm thấy rác và không sửa gì, bỏ qua commit này.)

---

## Self-Review

**Spec coverage:**
- Trang chính bỏ nút header + preset-row → Task 3 (Step 3, 4). ✓
- Giữ hero meta → không đụng dòng 181-188, vẫn nguyên. ✓
- FAB nhãn theo mode → Task 1 (`fabLabel`) + Task 3 (Step 5) + Task 4 (`.fab`). ✓
- Bottom sheet đóng bằng ✕/overlay/Esc → Task 2 (useEffect Esc, onClick overlay/close). ✓
- Dải verdict ghim realtime nhận prop, không tính lại → Task 2 (sheet-verdict dùng prop `composite`/`zone`/`verdictLabel`). ✓
- Chip preset + degraded ⚠ → Task 2. ✓
- 5 slider, kéo → Tùy chỉnh → Task 2 (`setWeight` giữ nguyên logic Dashboard set `presetId: null`). ✓
- Giải thích collapsible → Task 2 (`<details class="acc">`). ✓
- Desktop modal tùy chọn → Task 4 (`@media min-width 760px`). ✓
- Chuyển động + reduced-motion + body lock → Task 4 (transition + media query) + Task 2 (overflow hidden). ✓
- Không vuốt-để-đóng, không focus trap (đã cắt) → không có trong plan. ✓

**Placeholder scan:** Không có TBD/TODO. Mọi step có code/command thật. ✓

**Type consistency:** `fabLabel(preset, customized)` ký hiệu trùng giữa Task 1 định nghĩa và Task 3 gọi. `zoneClass(zone)` trùng. Props `SettingsSheet` (Task 2) khớp lời gọi (Task 3 Step 5): `open/onClose/criteria/weights/preset/customized/health/composite/zone/verdictLabel/applyPreset/setWeight`. ✓
